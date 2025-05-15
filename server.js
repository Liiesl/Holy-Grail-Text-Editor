const express = require('express');
const path = require('path');
const showdown = require('showdown');
const crypto = require('crypto');
const DiffMatchPatch = require('diff-match-patch');
const fssync = require('fs');

const db = require('./db');
require('dotenv').config(); // Configures .env for the whole application

// Auth related functionalities are now imported from auth.js
const { authRouter, authenticateToken, authorizeRole } = require('./auth');
const adminRoutes = require('./adminRoutes');
const announcementAdminRoutes = require('./announcementAdminRoutes');
const announcementPublicRoutes = require('./announcementPublicRoutes');
const userSettingsRoutes = require('./userSettingsRoutes'); // *** Import user settings routes ***

const {calculateHash, buildTree, dmp} = require('./routeUtils');
const app = express();
const port = process.env.PORT;
const PUBLIC_DIR = path.join(__dirname, 'public');
const converter = new showdown.Converter();

app.use(express.json({ limit: '5mb' }));
app.use(express.static(PUBLIC_DIR));

// Register auth routes
app.use('/api/auth', authRouter);
// Register admin routes
app.use('/api/admin', adminRoutes);
// Register admin routes for managing announcements
app.use('/api/admin/announcements', announcementAdminRoutes);
// Register public routes for viewing announcements
app.use('/api/announcements', announcementPublicRoutes);
// *** Register user settings routes ***
app.use('/api/settings', userSettingsRoutes);


// --- Project and Page Routes (Remain unchanged from previous version) ---

// POST /api/projects
app.post('/api/projects', authenticateToken, async (req, res) => {
    // ... (implementation as before)
    const { projectName } = req.body;
    const userId = req.user.id;

    if (!projectName || typeof projectName !== 'string' || projectName.trim() === '') {
        return res.status(400).json({ error: 'Valid project name is required.' });
    }
    const trimmedProjectName = projectName.trim();
    if (trimmedProjectName.includes('/') || trimmedProjectName.includes('\\') || trimmedProjectName.startsWith('.')) {
        return res.status(400).json({ error: 'Invalid characters in project name.' });
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        // Ensure type is 'user_project' for this route
        const existingProject = await client.query(
            "SELECT id FROM projects WHERE name = $1 AND user_id = $2 AND type = 'user_project'",
            [trimmedProjectName, userId]
        );
        if (existingProject.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Project "${trimmedProjectName}" already exists for this user.` });
        }

        const projectRes = await client.query(
            // Explicitly set type='user_project', though DB default also handles this
            "INSERT INTO projects (name, user_id, type) VALUES ($1, $2, 'user_project') RETURNING id",
            [trimmedProjectName, userId]
        );
        const projectId = projectRes.rows[0].id;

        const rootPageTitle = `Welcome to ${trimmedProjectName}`;
        const rootPageContent = `# ${rootPageTitle}\n\nStart building your project!`;
        await client.query(
            `INSERT INTO pages (project_id, title, markdown_content, parent_id, display_order)
             VALUES ($1, $2, $3, NULL, 0)`,
            [projectId, rootPageTitle, rootPageContent]
        );

        await client.query('COMMIT');
        res.status(201).json({ message: `Project "${trimmedProjectName}" created successfully.`, projectName: trimmedProjectName });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error creating project ${trimmedProjectName} for user ${userId}:`, error);
        if (error.code === '23505' && error.constraint === 'projects_user_id_name_key') {
             return res.status(409).json({ error: `Project "${trimmedProjectName}" already exists for this user.` });
        }
        res.status(500).json({ error: `Failed to create project: ${error.message}` });
    } finally {
        client.release();
    }
});

// GET /api/projects
app.get('/api/projects', authenticateToken, async (req, res) => {
    // ... (implementation as before)
    const userId = req.user.id;
    try {
        // Ensure we only list 'user_project' type here
        const result = await db.query(
            "SELECT name FROM projects WHERE user_id = $1 AND type = 'user_project' ORDER BY name ASC",
            [userId]
        );
        res.json(result.rows.map(row => row.name));
    } catch (error) {
        console.error(`Error listing projects for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to list projects' });
    }
});

// GET /api/project/:projectName/tree
app.get('/api/project/:projectName/tree', authenticateToken, async (req, res) => {
    // ... (implementation as before)
    const { projectName } = req.params;
    const userId = req.user.id;
    try {
        const projectRes = await db.query("SELECT id FROM projects WHERE name = $1 AND user_id = $2 AND type = 'user_project'", [projectName, userId]);
        if (projectRes.rows.length === 0) {
            return res.status(404).json({ error: `Project "${projectName}" not found for this user.` });
        }
        const projectId = projectRes.rows[0].id;

        const pagesRes = await db.query(
            'SELECT id, title, parent_id, display_order FROM pages WHERE project_id = $1 ORDER BY display_order ASC, title ASC',
            [projectId]
        );
        const allPages = pagesRes.rows;
        const rootPageInfo = allPages.find(page => page.parent_id === null);

        if (!rootPageInfo) {
             return res.json({
                rootPageId: null,
                rootPageTitle: "Project Empty or Root Missing",
                tree: []
            });
        }
        const pageTreeForProject = buildTree(allPages, rootPageInfo.id);
        res.json({
            rootPageId: rootPageInfo.id,
            rootPageTitle: rootPageInfo.title,
            tree: pageTreeForProject
        });
    } catch (error) {
        console.error(`Error getting tree for ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to get project page tree: ${error.message}` });
    }
});

// GET /api/project/:projectName/page/:pageId
app.get('/api/project/:projectName/page/:pageId', authenticateToken, async (req, res) => {
    // ... (implementation as before)
    const { projectName, pageId } = req.params;
    const userId = req.user.id;
    try {
        const pageRes = await db.query(
            `SELECT p.id, p.title, p.markdown_content
             FROM pages p JOIN projects pr ON p.project_id = pr.id
             WHERE p.id = $1 AND pr.name = $2 AND pr.user_id = $3 AND pr.type = 'user_project'`, // Ensure user project type
            [pageId, projectName, userId]
        );

        if (pageRes.rows.length === 0) {
            return res.status(404).json({ error: 'Page not found in this project for this user.' });
        }
        const pageInfo = pageRes.rows[0];
        const versionHash = calculateHash(pageInfo.markdown_content);
        res.json({
            id: pageInfo.id,
            title: pageInfo.title,
            markdown: pageInfo.markdown_content,
            versionHash: versionHash,
            path: pageInfo.id
        });
    } catch (error) {
        console.error(`Error reading page ${pageId} in ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to read page: ${error.message}` });
    }
});

// POST /api/project/:projectName/page/:pageId
app.post('/api/project/:projectName/page/:pageId', authenticateToken, async (req, res) => {
    // ... (implementation as before - includes FOR UPDATE)
     const { projectName, pageId } = req.params;
    const { markdown, patch_text, base_version_hash } = req.body;
    const userId = req.user.id;
    let finalMarkdownContent;

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        // Check project access and lock the page row
        const pageQuery = `
            SELECT p.id, p.title, p.markdown_content
            FROM pages p
            JOIN projects pr ON p.project_id = pr.id
            WHERE p.id = $1 AND pr.name = $2 AND pr.user_id = $3 AND pr.type = 'user_project'
            FOR UPDATE OF p`; // Lock the specific page row
        const pageRes = await client.query(pageQuery, [pageId, projectName, userId]);

        if (pageRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Page not found in project for this user. Cannot save.' });
        }
        let currentPageData = pageRes.rows[0];

        // Apply patch or full markdown
        if (patch_text && typeof base_version_hash === 'string') {
            const currentServerMarkdown = currentPageData.markdown_content || ""; // Handle null case
            const currentServerHash = calculateHash(currentServerMarkdown);
            if (currentServerHash !== base_version_hash) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error: 'Conflict: Page has been modified since last load. Please reload.',
                    server_hash: currentServerHash
                });
            }
            const patches = dmp.patch_fromText(patch_text);
            const [patchedMarkdown, results] = dmp.patch_apply(patches, currentServerMarkdown);
            if (!results.every(applied => applied === true)) {
                await client.query('ROLLBACK');
                console.error('Patch application failed. Results:', results);
                // Optionally send back which patches failed if possible/useful
                return res.status(500).json({ error: 'Failed to apply patch to server content. Some changes might not have been applicable.' });
            }
            finalMarkdownContent = patchedMarkdown;
        } else if (typeof markdown === 'string') {
            finalMarkdownContent = markdown;
        } else {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Invalid save request. Requires either "markdown" or "patch_text" and "base_version_hash".' });
        }

        // Update title based on H1
        const h1Match = finalMarkdownContent.match(/^#\s+(.*?)(\r?\n|$)/m);
        let newTitleFromContent = currentPageData.title; // Keep old title if no H1
        if (h1Match && h1Match[1] && h1Match[1].trim()) {
            newTitleFromContent = h1Match[1].trim();
        } else if (finalMarkdownContent.trim() === "") {
            newTitleFromContent = "Untitled"; // Handle empty content case
        } else if (!finalMarkdownContent.trim().startsWith("#")) {
            // If content exists but doesn't start with H1, maybe keep the old title?
            // Or set to "Untitled"? Let's keep the old title for now.
            // newTitleFromContent = "Untitled";
        }


        await client.query(
            'UPDATE pages SET markdown_content = $1, title = $2, updated_at = NOW() WHERE id = $3',
            [finalMarkdownContent, newTitleFromContent, pageId]
        );
        await client.query('COMMIT');

        const newVersionHash = calculateHash(finalMarkdownContent);
        res.json({
            message: 'Page saved successfully',
            id: pageId,
            newTitle: newTitleFromContent,
            // Sending back the full markdown might be excessive if patching worked,
            // but simplifies client logic. Could optimize later.
            newMarkdown: finalMarkdownContent,
            newVersionHash: newVersionHash
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error saving page ${pageId} in ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to save page: ${error.message}` });
    } finally {
        client.release();
    }
});

// POST /api/project/:projectName/pages
app.post('/api/project/:projectName/pages', authenticateToken, async (req, res) => {
    // ... (implementation as before)
    const { projectName } = req.params;
    let { title, parentId } = req.body;
    const userId = req.user.id;

    if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'Valid title is required.' });
    }
    const trimmedTitle = title.trim();

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        // Ensure project exists and belongs to user
        const projectRes = await client.query("SELECT id FROM projects WHERE name = $1 AND user_id = $2 AND type = 'user_project'", [projectName, userId]);
        if (projectRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Project "${projectName}" not found for this user.` });
        }
        const projectId = projectRes.rows[0].id;

        let actualParentId = parentId;
        // Validate or find parent page
        if (!actualParentId) { // If no parentId provided, assume root page of project
            const rootPageRes = await client.query(
                'SELECT id FROM pages WHERE project_id = $1 AND parent_id IS NULL', [projectId]
            );
            if (rootPageRes.rows.length === 0) {
                await client.query('ROLLBACK');
                // This indicates an inconsistent state - project exists but has no root page
                return res.status(500).json({ error: 'Project root page not found. Cannot create child page.' });
            }
            actualParentId = rootPageRes.rows[0].id;
        } else {
            // Validate provided parentId exists within the project
            const parentPageRes = await client.query(
                'SELECT id FROM pages WHERE id = $1 AND project_id = $2', [actualParentId, projectId]
            );
            if (parentPageRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Parent page ID '${actualParentId}' not found in this project.` });
            }
            // actualParentId is now validated
        }

        // Determine display order
        const displayOrderRes = await client.query(
            'SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM pages WHERE parent_id = $1 AND project_id = $2',
            [actualParentId, projectId] // Ensure we check within the correct project
        );
        const displayOrder = displayOrderRes.rows[0].next_order;

        // Create the new page
        const initialContent = `# ${trimmedTitle}\n\nStart writing here...`;
        const newPageRes = await client.query(
            `INSERT INTO pages (project_id, title, markdown_content, parent_id, display_order)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [projectId, trimmedTitle, initialContent, actualParentId, displayOrder]
        );
        const newPageId = newPageRes.rows[0].id;

        // Optional: Add link to parent page (unless parent is the project root)
        let linkAddedToParentMarkdown = false;
        const rootPageCheck = await client.query('SELECT id FROM pages WHERE project_id = $1 AND parent_id IS NULL AND id = $2', [projectId, actualParentId]);
        const isParentTheRoot = rootPageCheck.rows.length > 0;

        if (!isParentTheRoot) { // Don't auto-add links to the actual root page of the project
            const parentPageInfoRes = await client.query(
                'SELECT markdown_content FROM pages WHERE id = $1 FOR UPDATE', [actualParentId] // Lock parent for update
            );
            if (parentPageInfoRes.rows.length > 0) {
                let parentContent = parentPageInfoRes.rows[0].markdown_content || "";
                // Add link neatly
                if (parentContent.length > 0 && !parentContent.endsWith('\n\n')) {
                    parentContent += parentContent.endsWith('\n') ? '\n' : '\n\n';
                }
                parentContent += `[${trimmedTitle}](page://${newPageId})\n`;
                await client.query(
                    'UPDATE pages SET markdown_content = $1, updated_at = NOW() WHERE id = $2', [parentContent, actualParentId]
                );
                linkAddedToParentMarkdown = true;
            } else {
                // This shouldn't happen if parent validation passed, but log if it does
                 console.warn(`Could not find parent page ${actualParentId} content to add link, though it was previously validated.`);
            }
        }

        await client.query('COMMIT');
        res.status(201).json({
            message: 'Page created successfully',
            newPageId,
            title: trimmedTitle,
            parentId: actualParentId, // Return the actual parent ID used
            displayOrder: displayOrder, // Return the assigned display order
            linkAddedToParentMarkdown
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error creating page in ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to create page: ${error.message}` });
    } finally {
        client.release();
    }
});

// GET /api/project/:projectName/page-info/:pageId
app.get('/api/project/:projectName/page-info/:pageId', authenticateToken, async (req, res) => {
    // ... (implementation as before)
    const { projectName, pageId } = req.params;
    const userId = req.user.id;

    try {
        const pageInfoRes = await db.query(
            `SELECT p.id, p.title
             FROM pages p
             JOIN projects pr ON p.project_id = pr.id
             WHERE p.id = $1 AND pr.name = $2 AND pr.user_id = $3 AND pr.type = 'user_project'`,
            [pageId, projectName, userId]
        );

        if (pageInfoRes.rows.length === 0) {
            return res.status(404).json({ error: 'Page not found or access denied.' });
        }

        const pageData = pageInfoRes.rows[0];
        res.json({
            id: pageData.id,
            title: pageData.title
        });

    } catch (error) {
        console.error(`Error fetching page info for page ${pageId} in project ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to fetch page info: ${error.message}` });
    }
});

// DELETE /api/project/:projectName
app.delete('/api/project/:projectName', authenticateToken, async (req, res) => {
    // ... (implementation as before)
    const { projectName } = req.params;
    const userId = req.user.id;
    try {
        // Ensure deleting only user_project type
        const result = await db.query(
            "DELETE FROM projects WHERE name = $1 AND user_id = $2 AND type = 'user_project' RETURNING id",
            [projectName, userId]
            );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: `Project "${projectName}" not found for this user.` });
        }
        res.json({ message: `Project "${projectName}" deleted successfully.` });
    } catch (error) {
        console.error(`Error deleting project ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to delete project: ${error.message}` });
    }
});

// PUT /api/project/:projectName/rename
app.put('/api/project/:projectName/rename', authenticateToken, async (req, res) => {
    // ... (implementation as before)
    const { projectName: oldProjectName } = req.params;
    const { newProjectName } = req.body;
    const userId = req.user.id;

    if (!newProjectName || typeof newProjectName !== 'string' || newProjectName.trim() === '') {
        return res.status(400).json({ error: 'New project name is required.' });
    }
    const trimmedNewName = newProjectName.trim();
    if (trimmedNewName.includes('/') || trimmedNewName.includes('\\') || trimmedNewName.startsWith('.')) {
        return res.status(400).json({ error: 'Invalid characters in new project name.' });
    }
    if (oldProjectName === trimmedNewName) {
        return res.status(400).json({ error: 'New project name is the same as the old one.' });
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        // Find the project ensuring it's a user_project
        const oldProjectRes = await client.query(
            "SELECT id FROM projects WHERE name = $1 AND user_id = $2 AND type = 'user_project'",
            [oldProjectName, userId]
            );
        if (oldProjectRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Project "${oldProjectName}" not found for this user.` });
        }
        const projectId = oldProjectRes.rows[0].id;

        // Check if new name is already taken by the same user for a user_project
        const newProjectCheckRes = await client.query(
            "SELECT id FROM projects WHERE name = $1 AND user_id = $2 AND type = 'user_project'",
            [trimmedNewName, userId]
            );
        if (newProjectCheckRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Project "${trimmedNewName}" already exists for this user.` });
        }

        // Update the project name
        await client.query(
            'UPDATE projects SET name = $1, updated_at = NOW() WHERE id = $2', // No need for user_id check here as projectId is specific
            [trimmedNewName, projectId]
        );

        // Optional: Update root page title and content if it follows the "Welcome to..." pattern
        const oldWelcomeTitle = `Welcome to ${oldProjectName}`;
        const rootPageRes = await client.query(
            `SELECT id, title, markdown_content FROM pages
             WHERE project_id = $1 AND parent_id IS NULL AND title = $2 FOR UPDATE`,
            [projectId, oldWelcomeTitle]
        );

        if (rootPageRes.rows.length > 0) {
            const rootPage = rootPageRes.rows[0];
            const newRootTitle = `Welcome to ${trimmedNewName}`;
            let rootContent = rootPage.markdown_content;
            // Regex to replace H1, escaping potential special characters in old name
            const safeOldProjectName = oldProjectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const h1Regex = new RegExp(`^#\\s*Welcome to ${safeOldProjectName}\\s*(\\r?\\n|$)`, 'im');
            if (h1Regex.test(rootContent)) {
                rootContent = rootContent.replace(h1Regex, `# ${newRootTitle}$1`);
            } else {
                 console.warn(`Root page for project ${projectId} had title "${oldWelcomeTitle}" but content did not match expected H1 pattern.`);
            }

            await client.query(
                'UPDATE pages SET title = $1, markdown_content = $2, updated_at = NOW() WHERE id = $3',
                [newRootTitle, rootContent, rootPage.id]
            );
        }

        await client.query('COMMIT');
        res.json({ message: `Project "${oldProjectName}" renamed to "${trimmedNewName}".`, newProjectName: trimmedNewName });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error renaming project ${oldProjectName} for user ${userId}:`, error);
        // Check for unique constraint violation on the project name
        if (error.code === '23505' && error.constraint === 'projects_user_id_name_key') {
            return res.status(409).json({ error: `Project name "${trimmedNewName}" is already taken by you.` });
        }
        res.status(500).json({ error: `Failed to rename project: ${error.message}` });
    } finally {
        client.release();
    }
});

// POST /api/project/:projectName/duplicate
app.post('/api/project/:projectName/duplicate', authenticateToken, async (req, res) => {
    // ... (implementation as before - includes recursive duplication)
     const { projectName: originalProjectName } = req.params;
    let { newProjectName } = req.body;
    const userId = req.user.id;

    // Determine default new name if not provided
    const finalNewProjectName = (newProjectName || `${originalProjectName} (Copy)`).trim();
     if (finalNewProjectName.includes('/') || finalNewProjectName.includes('\\') || finalNewProjectName.startsWith('.')) {
        return res.status(400).json({ error: 'Invalid characters in new project name.' });
    }
    // Prevent explicit duplication with the same name
    if (originalProjectName === finalNewProjectName && newProjectName) {
        return res.status(400).json({ error: 'New project name cannot be the same as the original if specified.'});
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        // Find the original project (must be user_project)
        const originalProjectRes = await client.query(
            "SELECT id FROM projects WHERE name = $1 AND user_id = $2 AND type = 'user_project'",
            [originalProjectName, userId]
            );
        if (originalProjectRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Project "${originalProjectName}" not found for this user.` });
        }
        const originalProjectId = originalProjectRes.rows[0].id;

        // Check if the target name is already taken (for user_project)
        const newProjectCheckRes = await client.query(
            "SELECT id FROM projects WHERE name = $1 AND user_id = $2 AND type = 'user_project'",
            [finalNewProjectName, userId]
            );
        if (newProjectCheckRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `A project named "${finalNewProjectName}" already exists for this user.` });
        }

        // Create the new project (defaults to user_project type)
        const newProjectRes = await client.query(
            'INSERT INTO projects (name, user_id, type) VALUES ($1, $2, $3) RETURNING id',
            [finalNewProjectName, userId, 'user_project'] // Explicitly set type
        );
        const newProjectId = newProjectRes.rows[0].id;

        // Find the root page of the original project
        const originalRootPageRes = await client.query(
            'SELECT id FROM pages WHERE project_id = $1 AND parent_id IS NULL', [originalProjectId]
        );

        if (originalRootPageRes.rows.length === 0) {
            // If original project has no pages, commit the new empty project
            await client.query('COMMIT');
            console.log(`Duplicated project ${originalProjectName} as ${finalNewProjectName} (user ${userId}), but original had no pages.`);
            return res.status(201).json({ message: `Project duplicated as "${finalNewProjectName}", but the original project was empty.`, newProjectName: finalNewProjectName });
        }
        const originalRootPageId = originalRootPageRes.rows[0].id;

        // Recursively duplicate pages
        const duplicatedIdMap = {}; // To store mapping from old page ID to new page ID for link fixing
        const newRootPageId = await duplicatePageRecursiveDb(originalRootPageId, newProjectId, null, 0, client, duplicatedIdMap);

        if (!newRootPageId) {
             await client.query('ROLLBACK');
             throw new Error("Recursive page duplication failed to return the new root page ID.");
        }

        // Update the title and H1 of the *new* root page if it followed the pattern
         const newRootPageToUpdateRes = await client.query(
            `SELECT id, title, markdown_content FROM pages WHERE id = $1 FOR UPDATE`, // Already know the ID
            [newRootPageId]
        );

        if (newRootPageToUpdateRes.rows.length > 0) {
            const newRootPage = newRootPageToUpdateRes.rows[0];
            const expectedCopiedTitle = `Welcome to ${originalProjectName} (Copy)`; // Title generated by duplicatePageRecursiveDb

            if (newRootPage.title === expectedCopiedTitle) {
                const finalNewRootPageTitle = `Welcome to ${finalNewProjectName}`;
                let rootContent = newRootPage.markdown_content;
                // Regex to replace the copied H1
                const safeCopiedTitle = expectedCopiedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const h1Regex = new RegExp(`^#\\s*${safeCopiedTitle}\\s*(\\r?\\n|$)`, 'im');
                if (h1Regex.test(rootContent)) {
                     rootContent = rootContent.replace(h1Regex, `# ${finalNewRootPageTitle}$1`);
                } else {
                     console.warn(`New root page ${newRootPageId} had title "${expectedCopiedTitle}" but content did not match expected H1 pattern.`);
                }

                await client.query(
                    'UPDATE pages SET title = $1, markdown_content = $2, updated_at = NOW() WHERE id = $3',
                    [finalNewRootPageTitle, rootContent, newRootPage.id]
                );
            } else {
                // If the title wasn't the expected "Welcome to... (Copy)", leave it as is (e.g., "Some Other Title (Copy)")
                console.log(`New root page ${newRootPageId} title "${newRootPage.title}" did not match expected pattern, leaving as is.`);
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: `Project "${originalProjectName}" duplicated successfully as "${finalNewProjectName}".`, newProjectName: finalNewProjectName });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error duplicating project ${originalProjectName} for user ${userId}:`, error);
        if (error.code === '23505' && error.constraint === 'projects_user_id_name_key') {
            return res.status(409).json({ error: `A project named "${finalNewProjectName}" already exists for this user.` });
        }
        res.status(500).json({ error: `Failed to duplicate project: ${error.message}` });
    } finally {
        client.release();
    }
});

// DELETE /api/project/:projectName/page/:pageId
app.delete('/api/project/:projectName/page/:pageId', authenticateToken, async (req, res) => {
    // ... (implementation as before)
    const { projectName, pageId } = req.params;
    const userId = req.user.id;
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        // Verify project ownership and type
        const projectRes = await client.query(
            "SELECT id FROM projects WHERE name = $1 AND user_id = $2 AND type = 'user_project'",
            [projectName, userId]
            );
        if (projectRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Project "${projectName}" not found for this user.` });
        }
        const projectId = projectRes.rows[0].id;

        // Find the page to ensure it exists and get its parent_id
        const pageInfoRes = await client.query(
            'SELECT parent_id FROM pages WHERE id = $1 AND project_id = $2', [pageId, projectId]
        );
        if (pageInfoRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Page not found in this project.' });
        }
        // Prevent deleting the root page
        if (pageInfoRes.rows[0].parent_id === null) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot delete the root page. Delete the project instead.' });
        }

        // Delete the page (and subpages via ON DELETE CASCADE)
        const deleteRes = await client.query('DELETE FROM pages WHERE id = $1', [pageId]); // No need for project_id check, pageId is unique
        if (deleteRes.rowCount === 0) {
             // Should not happen if pageInfoRes found it, but check defensively
             await client.query('ROLLBACK');
             return res.status(404).json({ error: 'Page not found or already deleted.' });
        }

        // Optional: Re-order siblings? Not strictly necessary unless display_order needs to be contiguous.

        await client.query('COMMIT');
        res.json({ message: 'Page and its subpages deleted successfully.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error deleting page ${pageId} in ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to delete page: ${error.message}` });
    } finally {
        client.release();
    }
});

// PUT /api/project/:projectName/page/:pageId/rename
app.put('/api/project/:projectName/page/:pageId/rename', authenticateToken, async (req, res) => {
    // ... (implementation as before)
    const { projectName, pageId } = req.params;
    const { newTitle } = req.body;
    const userId = req.user.id;

    if (!newTitle || typeof newTitle !== 'string' || newTitle.trim() === '') {
        return res.status(400).json({ error: 'New title is required.' });
    }
    const trimmedNewTitle = newTitle.trim();

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        // Find the page, ensuring project ownership and type, and lock the row
        const pageRes = await client.query(
            `SELECT p.id, p.markdown_content, p.parent_id
             FROM pages p
             JOIN projects pr ON p.project_id = pr.id
             WHERE p.id = $1 AND pr.name = $2 AND pr.user_id = $3 AND pr.type = 'user_project'
             FOR UPDATE OF p`,
            [pageId, projectName, userId]
        );

        if (pageRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Page not found in this project for this user.' });
        }
        const pageInfo = pageRes.rows[0];

        // Prevent renaming the root page if needed (consistency check)
        // if (pageInfo.parent_id === null) {
        //     await client.query('ROLLBACK');
        //     return res.status(400).json({ error: 'Cannot rename the root page directly via this endpoint. Consider project rename.' });
        // }

        // Update markdown content to reflect the new title in H1
        let content = pageInfo.markdown_content || "";
        const h1Regex = /^#\s+(.*?)(\r?\n|$)/m;
        const safeTrimmedNewTitle = trimmedNewTitle.replace(/\$/g, '$$$$'); // Escape $ for replacement string

        if (h1Regex.test(content)) {
            // Replace existing H1
            content = content.replace(h1Regex, `# ${safeTrimmedNewTitle}$2`);
        } else {
            // Prepend H1 if none exists
            content = `# ${safeTrimmedNewTitle}\n\n${content}`;
        }

        // Update the page title and content
        await client.query(
            'UPDATE pages SET title = $1, markdown_content = $2, updated_at = NOW() WHERE id = $3',
            [trimmedNewTitle, content, pageId]
        );

        // Optional: Update link in parent page if it exists
        if (pageInfo.parent_id) {
             const parentPageRes = await client.query(
                'SELECT markdown_content FROM pages WHERE id = $1 FOR UPDATE',
                [pageInfo.parent_id]
            );
            if (parentPageRes.rows.length > 0) {
                 let parentContent = parentPageRes.rows[0].markdown_content || "";
                 // Regex to find the link to the old page ID and update its text
                 const linkRegexSafe = pageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                 const linkRegex = new RegExp(`\\[([^\\]]+)\\]\\(page:\\/\\/${linkRegexSafe}\\)`, 'g');
                 let linkUpdated = false;
                 parentContent = parentContent.replace(linkRegex, (match, oldLinkText) => {
                    linkUpdated = true;
                    // Only update if the link text needs changing (it likely does)
                    return `[${trimmedNewTitle}](page://${pageId})`;
                 });

                 if (linkUpdated) {
                    await client.query(
                        'UPDATE pages SET markdown_content = $1, updated_at = NOW() WHERE id = $2',
                        [parentContent, pageInfo.parent_id]
                    );
                 }
            }
        }


        await client.query('COMMIT');
        res.json({ message: 'Page renamed successfully.', newTitle: trimmedNewTitle, pageId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error renaming page ${pageId} in ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to rename page: ${error.message}` });
    } finally {
        client.release();
    }
});

// POST /api/project/:projectName/page/:pageId/duplicate
app.post('/api/project/:projectName/page/:pageId/duplicate', authenticateToken, async (req, res) => {
    // ... (implementation as before - includes recursive duplication)
    const { projectName, pageId: originalPageId } = req.params;
    const userId = req.user.id;
    const client = await db.getClient();

    try {
        await client.query('BEGIN');
        // Verify original page exists, belongs to user/project, and get details
        const originalPageQuery = await client.query(
            `SELECT p.id, p.project_id, p.parent_id, p.display_order, p.title
             FROM pages p
             JOIN projects pr ON p.project_id = pr.id
             WHERE p.id = $1 AND pr.name = $2 AND pr.user_id = $3 AND pr.type = 'user_project'`,
            [originalPageId, projectName, userId]
        );

        if (originalPageQuery.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Original page not found in this project for this user.' });
        }
        const { project_id: projectId, parent_id: originalParentId, display_order: originalDisplayOrder } = originalPageQuery.rows[0];
        const originalTitle = originalPageQuery.rows[0].title;

        // Prevent duplicating the root page
        if (originalParentId === null) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot duplicate the root page. Duplicate the project instead.' });
        }

        // Make space for the duplicated page(s) by incrementing display_order of subsequent siblings
        await client.query(
            `UPDATE pages SET display_order = display_order + 1
             WHERE project_id = $1 AND parent_id = $2 AND display_order > $3`,
            [projectId, originalParentId, originalDisplayOrder]
        );
        const newDisplayOrder = originalDisplayOrder + 1; // Place the duplicate right after the original

        // Perform the recursive duplication
        const duplicatedIdMap = {}; // Map old IDs to new IDs for link fixing
        const newTopLevelPageId = await duplicatePageRecursiveDb(originalPageId, projectId, originalParentId, newDisplayOrder, client, duplicatedIdMap);

        if (!newTopLevelPageId) {
            await client.query('ROLLBACK');
            throw new Error("Duplication process failed to return a new page ID.");
        }

        // Fetch the title of the newly created top-level duplicate page
        const newPageDetails = await client.query('SELECT title FROM pages WHERE id = $1', [newTopLevelPageId]);
        // The title would have been set to "Original Title (Copy)" by duplicatePageRecursiveDb
        const newTitle = newPageDetails.rows.length > 0 ? newPageDetails.rows[0].title : `${originalTitle} (Copy)`; // Fallback title

        // Optional: Add link to the *new* duplicated page in the parent page's markdown
        if (originalParentId) { // Should always be true here due to root page check earlier
             const parentPageRes = await client.query(
                'SELECT markdown_content FROM pages WHERE id = $1 FOR UPDATE',
                [originalParentId]
            );
             if (parentPageRes.rows.length > 0) {
                 let parentContent = parentPageRes.rows[0].markdown_content || "";
                 if (parentContent.length > 0 && !parentContent.endsWith('\n\n')) {
                     parentContent += parentContent.endsWith('\n') ? '\n' : '\n\n';
                 }
                 parentContent += `[${newTitle}](page://${newTopLevelPageId})\n`; // Link to the new page
                 await client.query(
                     'UPDATE pages SET markdown_content = $1, updated_at = NOW() WHERE id = $2',
                     [parentContent, originalParentId]
                 );
             }
        }


        await client.query('COMMIT');
        res.status(201).json({
            message: 'Page duplicated successfully.',
            newRootPageId: newTopLevelPageId, // ID of the top-level duplicated page
            newTitle: newTitle,              // Title of the top-level duplicated page
            parentId: originalParentId,      // Parent ID where the duplicate was placed
            displayOrder: newDisplayOrder    // Display order of the duplicate
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error duplicating page ${originalPageId} in ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to duplicate page: ${error.message}` });
    } finally {
        client.release();
    }
});


// Catch-all for SPA and 404s
app.get(('/'), (req, res, next) => {
    // Exclude API routes from SPA handling
    if (req.path.startsWith('/api/')) {
        // If no API route matched, send 404
        return res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
    }
    // Exclude requests that look like static file requests handled by express.static
    if (/\.[^/]+$/.test(req.path) && !req.path.endsWith('.html')) { // Match dot in last segment, ignore .html
        // Let express.static handle it or 404 if not found by static handler
        return next();
    }
    // Serve index.html for SPA routes
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
        if (err) {
            console.error("Error sending index.html:", err);
            // Avoid sending multiple responses if headers are already sent
            if (!res.headersSent) {
                 res.status(err.status || 500).send("Error serving application.");
            }
        }
    });
});

// --- Helper Functions (duplicatePageRecursiveDb, calculateHash, buildTree, dmp) ---
// Ensure these are defined either in this file or imported correctly from routeUtils.js
async function duplicatePageRecursiveDb(originalPageId, newProjectId, newParentIdForDuplicatedPage, displayOrder, dbClient, duplicatedIdMap = {}) {
    const pageRes = await dbClient.query('SELECT * FROM pages WHERE id = $1', [originalPageId]);
    if (pageRes.rows.length === 0) return null;
    const originalPageInfo = pageRes.rows[0];
    // Append "(Copy)" to the title for the duplicated page
    const newPageTitle = `${originalPageInfo.title} (Copy)`;

    // Insert the duplicated page
    const newPageInsertRes = await dbClient.query(
        `INSERT INTO pages (project_id, title, markdown_content, parent_id, display_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id, markdown_content`, // Return markdown_content too
        [newProjectId, newPageTitle, originalPageInfo.markdown_content, newParentIdForDuplicatedPage, displayOrder]
    );
    const newPageId = newPageInsertRes.rows[0].id;
    let currentMarkdownForNewPage = newPageInsertRes.rows[0].markdown_content || ""; // Get the inserted markdown

    // Store the mapping from old ID to new ID BEFORE recursing for children
    duplicatedIdMap[originalPageId] = newPageId;

    // Find and duplicate children recursively
    const childrenRes = await dbClient.query(
        'SELECT id FROM pages WHERE parent_id = $1 ORDER BY display_order ASC',
        [originalPageId]
    );

    let childDisplayOrder = 0;
    for (const child of childrenRes.rows) {
        // Pass the same duplicatedIdMap down so it accumulates all mappings
        await duplicatePageRecursiveDb(child.id, newProjectId, newPageId, childDisplayOrder++, dbClient, duplicatedIdMap);
    }

    // After all children are duplicated and their IDs are in duplicatedIdMap,
    // fix the internal links within the *current* duplicated page's markdown.
    if (currentMarkdownForNewPage) {
        let finalMarkdownForNewPage = currentMarkdownForNewPage;
        // Iterate through the *complete* map of old->new IDs
        for (const [oId, nId] of Object.entries(duplicatedIdMap)) {
             // Regex to find links like [Text](page://OLD_UUID)
             const linkRegexSafe = oId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape UUID for regex
             const linkRegex = new RegExp(`(\\[[^\\]]+\\]\\(page:\\/\\/)${linkRegexSafe}(\\))`, 'g');
             finalMarkdownForNewPage = finalMarkdownForNewPage.replace(linkRegex, `$1${nId}$2`);
        }

        // Update the page's markdown content only if links were changed
        if (finalMarkdownForNewPage !== currentMarkdownForNewPage) {
            await dbClient.query(
                'UPDATE pages SET markdown_content = $1, updated_at = NOW() WHERE id = $2',
                [finalMarkdownForNewPage, newPageId]
                );
        }
    }
    return newPageId; // Return the ID of the page just duplicated
}
// ... other helper functions (calculateHash, buildTree, dmp instance from routeUtils)


async function startServer() {
    try {
        await db.initializeSchema();

        app.listen(port, '0.0.0.0', () => {
            console.log(`Server listening at http://0.0.0.0:${port}`);
            console.log(`Public directory: ${PUBLIC_DIR}`);
            if (!fssync.existsSync(PUBLIC_DIR) || !fssync.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
                console.warn("Warning: Public directory or index.html not found. SPA might not serve correctly.");
            }
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();