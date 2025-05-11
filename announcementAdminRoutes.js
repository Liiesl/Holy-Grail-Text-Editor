const express = require('express');
const db = require('./db');
const { authenticateToken, authorizeRole } = require('./auth');
const { buildTree, duplicatePageRecursiveDb } = require('./routeUtils'); // We'll create this file

const router = express.Router();
const ADMIN_ROLES = ['owner', 'admin'];

// --- Helper: Get Project (announcement type) by ID and check admin access ---
async function getAnnouncementProjectForAdmin(client, projectId, adminUserId) {
    const projectRes = await client.query(
        'SELECT id, name, user_id, status FROM projects WHERE id = $1 AND type = \'announcement\'',
        [projectId]
    );
    if (projectRes.rows.length === 0) {
        return { error: 'Announcement project not found.', status: 404 };
    }
    // While any admin can manage announcements, good to have user_id if needed for audit
    return { project: projectRes.rows[0] };
}


// --- Create a new announcement project ---
router.post('/', authenticateToken, authorizeRole(ADMIN_ROLES), async (req, res) => {
    const { name } = req.body;
    const creatorUserId = req.user.id; // Admin/Owner creating this

    if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'Announcement name is required.' });
    }
    const trimmedName = name.trim();

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        // Check for unique announcement name (DB constraint will also catch this)
        const existingAnnRes = await client.query(
            "SELECT id FROM projects WHERE name = $1 AND type = 'announcement'",
            [trimmedName]
        );
        if (existingAnnRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `An announcement named "${trimmedName}" already exists.` });
        }

        const projectRes = await client.query(
            "INSERT INTO projects (name, user_id, type, status) VALUES ($1, $2, 'announcement', 'draft') RETURNING id, name, status, created_at",
            [trimmedName, creatorUserId]
        );
        const newAnnouncement = projectRes.rows[0];
        const projectId = newAnnouncement.id;

        // Create a default root page
        const rootPageTitle = `Welcome to ${trimmedName}`;
        const rootPageContent = `# ${rootPageTitle}\n\nThis is an official announcement.`;
        await client.query(
            `INSERT INTO pages (project_id, title, markdown_content, parent_id, display_order)
             VALUES ($1, $2, $3, NULL, 0)`,
            [projectId, rootPageTitle, rootPageContent]
        );

        await client.query('COMMIT');
        res.status(201).json({ message: 'Announcement created successfully in draft mode.', announcement: newAnnouncement });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error creating announcement "${trimmedName}" by user ${creatorUserId}:`, error);
        if (error.code === '23505' && error.constraint === 'projects_announcement_name_key') {
            return res.status(409).json({ error: `An announcement named "${trimmedName}" already exists.` });
        }
        res.status(500).json({ error: 'Failed to create announcement.' });
    } finally {
        client.release();
    }
});

// --- List all announcement projects (for admins) ---
router.get('/', authenticateToken, authorizeRole(ADMIN_ROLES), async (req, res) => {
    try {
        const result = await db.query(
            "SELECT id, name, user_id, status, created_at, updated_at FROM projects WHERE type = 'announcement' ORDER BY created_at DESC"
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error listing announcements for admin:', error);
        res.status(500).json({ error: 'Failed to list announcements.' });
    }
});

// --- Get a specific announcement project's details (for admins) ---
router.get('/:projectId', authenticateToken, authorizeRole(ADMIN_ROLES), async (req, res) => {
    const { projectId } = req.params;
    const adminUserId = req.user.id;
    const client = await db.getClient();
    try {
        const { project, error, status } = await getAnnouncementProjectForAdmin(client, projectId, adminUserId);
        if (error) return res.status(status).json({ error });
        res.json(project);
    } catch (err) {
        console.error(`Error fetching announcement ${projectId} for admin:`, err);
        res.status(500).json({ error: 'Failed to fetch announcement details.' });
    } finally {
        client.release();
    }
});

// --- Update an announcement project (name, status) ---
router.put('/:projectId', authenticateToken, authorizeRole(ADMIN_ROLES), async (req, res) => {
    const { projectId } = req.params;
    const { name, status: newStatus } = req.body;
    const adminUserId = req.user.id;

    if (!name && !newStatus) {
        return res.status(400).json({ error: 'No update information provided (name or status).' });
    }
    if (newStatus && !['draft', 'published', 'archived'].includes(newStatus)) {
        return res.status(400).json({ error: 'Invalid status. Must be draft, published, or archived.' });
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { project: currentProject, error, status: fetchStatus } = await getAnnouncementProjectForAdmin(client, projectId, adminUserId);
        if (error) {
            await client.query('ROLLBACK');
            return res.status(fetchStatus).json({ error });
        }

        let updatedName = currentProject.name;
        if (name && typeof name === 'string' && name.trim() !== '' && name.trim() !== currentProject.name) {
            updatedName = name.trim();
            // Check if new name conflicts with another announcement
            const existingNameRes = await client.query(
                "SELECT id FROM projects WHERE name = $1 AND type = 'announcement' AND id != $2",
                [updatedName, projectId]
            );
            if (existingNameRes.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: `Another announcement named "${updatedName}" already exists.` });
            }
        }

        const updateRes = await client.query(
            "UPDATE projects SET name = $1, status = $2, updated_at = NOW() WHERE id = $3 AND type = 'announcement' RETURNING id, name, status, updated_at",
            [updatedName, newStatus || currentProject.status, projectId]
        );

        if (updatedName !== currentProject.name) {
            // If name changed, update the root page title/content if it was the default "Welcome to..."
            const oldWelcomeTitle = `Welcome to ${currentProject.name}`;
            const rootPageRes = await client.query(
                `SELECT id, title, markdown_content FROM pages 
                 WHERE project_id = $1 AND parent_id IS NULL AND title = $2 FOR UPDATE`,
                [projectId, oldWelcomeTitle]
            );
            if (rootPageRes.rows.length > 0) {
                const rootPage = rootPageRes.rows[0];
                const newRootTitle = `Welcome to ${updatedName}`;
                let rootContent = rootPage.markdown_content;
                const safeOldProjectName = currentProject.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                rootContent = rootContent.replace(new RegExp(`^# Welcome to ${safeOldProjectName}`, 'm'), `# Welcome to ${updatedName}`);
                await client.query(
                    'UPDATE pages SET title = $1, markdown_content = $2, updated_at = NOW() WHERE id = $3',
                    [newRootTitle, rootContent, rootPage.id]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Announcement updated successfully.', announcement: updateRes.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error updating announcement ${projectId} by admin ${adminUserId}:`, error);
        if (error.code === '23505' && error.constraint === 'projects_announcement_name_key') {
            return res.status(409).json({ error: `An announcement named "${name.trim()}" already exists.` });
        }
        res.status(500).json({ error: 'Failed to update announcement.' });
    } finally {
        client.release();
    }
});

// --- Delete an announcement project ---
router.delete('/:projectId', authenticateToken, authorizeRole(ADMIN_ROLES), async (req, res) => {
    const { projectId } = req.params;
    const adminUserId = req.user.id;

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { project, error, status } = await getAnnouncementProjectForAdmin(client, projectId, adminUserId);
        if (error) {
            await client.query('ROLLBACK');
            return res.status(status).json({ error });
        }

        // Deleting project will cascade to its pages due to FOREIGN KEY ON DELETE CASCADE
        const deleteRes = await client.query("DELETE FROM projects WHERE id = $1 AND type = 'announcement'", [projectId]);
        if (deleteRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Announcement not found or already deleted.' });
        }

        await client.query('COMMIT');
        res.json({ message: `Announcement "${project.name}" deleted successfully.` });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error deleting announcement ${projectId} by admin ${adminUserId}:`, error);
        res.status(500).json({ error: 'Failed to delete announcement.' });
    } finally {
        client.release();
    }
});


// --- Page Management for Announcements (Admins Only) ---
// These mirror existing page routes but are scoped to announcements and admin roles.
// They operate on project IDs directly.

// Get page tree for an announcement
router.get('/:projectId/tree', authenticateToken, authorizeRole(ADMIN_ROLES), async (req, res) => {
    const { projectId } = req.params;
    const client = await db.getClient();
    try {
        const { project, error, status } = await getAnnouncementProjectForAdmin(client, projectId, req.user.id);
        if (error) return res.status(status).json({ error });

        const pagesRes = await db.query(
            'SELECT id, title, parent_id, display_order FROM pages WHERE project_id = $1 ORDER BY display_order ASC, title ASC',
            [projectId]
        );
        const allPages = pagesRes.rows;
        const rootPageInfo = allPages.find(page => page.parent_id === null);

        if (!rootPageInfo) {
             return res.json({ rootPageId: null, rootPageTitle: "Announcement Empty or Root Missing", tree: [] });
        }
        // Use the imported buildTree function
        const pageTreeForProject = buildTree(allPages, rootPageInfo.id); 
        res.json({
            rootPageId: rootPageInfo.id,
            rootPageTitle: rootPageInfo.title,
            tree: pageTreeForProject
        });
    } catch (error) {
        console.error(`Error getting tree for announcement ${projectId}:`, error);
        res.status(500).json({ error: `Failed to get announcement page tree: ${error.message}` });
    } finally {
        client.release();
    }
});

// Get page content for an announcement (for editing by admin)
router.get('/:projectId/page/:pageId', authenticateToken, authorizeRole(ADMIN_ROLES), async (req, res) => {
    const { projectId, pageId } = req.params;
    const client = await db.getClient();
    try {
        const { project, error, status } = await getAnnouncementProjectForAdmin(client, projectId, req.user.id);
        if (error) return res.status(status).json({ error });

        const pageRes = await db.query(
            `SELECT id, title, markdown_content FROM pages WHERE id = $1 AND project_id = $2`,
            [pageId, projectId]
        );
        if (pageRes.rows.length === 0) {
            return res.status(404).json({ error: 'Page not found in this announcement.' });
        }
        const pageInfo = pageRes.rows[0];
        // const versionHash = calculateHash(pageInfo.markdown_content); // calculateHash needs to be imported/defined
        res.json({
            id: pageInfo.id,
            title: pageInfo.title,
            markdown: pageInfo.markdown_content,
            // versionHash: versionHash, 
        });
    } catch (error) {
        console.error(`Error reading page ${pageId} in announcement ${projectId}:`, error);
        res.status(500).json({ error: `Failed to read page: ${error.message}` });
    } finally {
        client.release();
    }
});


// Save page content for an announcement (PATCH/Diff can be added if needed, for now full save)
router.post('/:projectId/page/:pageId', authenticateToken, authorizeRole(ADMIN_ROLES), async (req, res) => {
    const { projectId, pageId } = req.params;
    const { markdown } = req.body; // Simplified: assuming full markdown. Add patch logic if needed.
    
    if (typeof markdown !== 'string') {
        return res.status(400).json({ error: 'Markdown content is required.' });
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { project, error, status } = await getAnnouncementProjectForAdmin(client, projectId, req.user.id);
        if (error) {
            await client.query('ROLLBACK');
            return res.status(status).json({ error });
        }

        const pageCheckRes = await client.query("SELECT title, markdown_content FROM pages WHERE id = $1 AND project_id = $2 FOR UPDATE", [pageId, projectId]);
        if (pageCheckRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Page not found in this announcement.' });
        }
        let currentPageData = pageCheckRes.rows[0];


        const h1Match = markdown.match(/^#\s+(.*?)(\r?\n|$)/m);
        let newTitleFromContent = currentPageData.title;
        if (h1Match && h1Match[1]) newTitleFromContent = h1Match[1].trim();
        else if (markdown.trim() === "") newTitleFromContent = "Untitled";
        
        await client.query(
            'UPDATE pages SET markdown_content = $1, title = $2, updated_at = NOW() WHERE id = $3',
            [markdown, newTitleFromContent, pageId]
        );
        await client.query('COMMIT');
        // const newVersionHash = calculateHash(markdown);
        res.json({
            message: 'Page saved successfully for announcement.',
            id: pageId,
            newTitle: newTitleFromContent,
            // newVersionHash: newVersionHash
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error saving page ${pageId} in announcement ${projectId}:`, error);
        res.status(500).json({ error: `Failed to save page: ${error.message}` });
    } finally {
        client.release();
    }
});

// Create a new page within an announcement
router.post('/:projectId/pages', authenticateToken, authorizeRole(ADMIN_ROLES), async (req, res) => {
    const { projectId } = req.params;
    let { title, parentId } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'Valid title is required.' });
    }
    const trimmedTitle = title.trim();

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { project, error, status } = await getAnnouncementProjectForAdmin(client, projectId, req.user.id);
        if (error) {
            await client.query('ROLLBACK');
            return res.status(status).json({ error });
        }
        
        let actualParentId = parentId;
        if (!actualParentId) { 
            const rootPageRes = await client.query(
                'SELECT id FROM pages WHERE project_id = $1 AND parent_id IS NULL', [projectId]
            );
            if (rootPageRes.rows.length === 0) { 
                await client.query('ROLLBACK');
                return res.status(500).json({ error: 'Root page for announcement not found.' });
            }
            actualParentId = rootPageRes.rows[0].id;
        } else {
            const parentPageRes = await client.query(
                'SELECT id FROM pages WHERE id = $1 AND project_id = $2', [actualParentId, projectId]
            );
            if (parentPageRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Parent page ID '${actualParentId}' not found in this announcement.` });
            }
        }

        const displayOrderRes = await client.query(
            'SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM pages WHERE parent_id = $1 AND project_id = $2',
            [actualParentId, projectId]
        );
        const displayOrder = displayOrderRes.rows[0].next_order;
        const initialContent = `# ${trimmedTitle}\n\nStart writing here...`;
        
        const newPageRes = await client.query(
            `INSERT INTO pages (project_id, title, markdown_content, parent_id, display_order)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [projectId, trimmedTitle, initialContent, actualParentId, displayOrder]
        );
        const newPageId = newPageRes.rows[0].id;
        // Auto-linking to parent can be added here if desired, similar to regular projects

        await client.query('COMMIT');
        res.status(201).json({
            message: 'Page created successfully in announcement', newPageId, title: trimmedTitle, parentId: actualParentId
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error creating page in announcement ${projectId}:`, error);
        res.status(500).json({ error: `Failed to create page: ${error.message}` });
    } finally {
        client.release();
    }
});

// --- START OF MODIFICATION ---
// Delete a page within an announcement
router.delete('/:projectId/page/:pageId', authenticateToken, authorizeRole(ADMIN_ROLES), async (req, res) => {
    const { projectId, pageId } = req.params;
    const adminUserId = req.user.id;

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { project, error: projectError, status: projectStatus } = await getAnnouncementProjectForAdmin(client, projectId, adminUserId);
        if (projectError) {
            await client.query('ROLLBACK');
            return res.status(projectStatus).json({ error: projectError });
        }

        const pageInfoRes = await client.query(
            'SELECT parent_id FROM pages WHERE id = $1 AND project_id = $2', [pageId, projectId]
        );
        if (pageInfoRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Page not found in this announcement.' });
        }
        if (pageInfoRes.rows[0].parent_id === null) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot delete the root page of an announcement. Delete the entire announcement instead.' });
        }

        // ON DELETE CASCADE in DB schema for parent_id will handle children
        const deleteRes = await client.query('DELETE FROM pages WHERE id = $1 AND project_id = $2', [pageId, projectId]);
        if (deleteRes.rowCount === 0) {
            // Should not happen if previous check passed, but as a safeguard
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Page not found or already deleted.' });
        }
        await client.query('COMMIT');
        res.json({ message: 'Page and its subpages deleted successfully from announcement.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error deleting page ${pageId} in announcement ${projectId} by admin ${adminUserId}:`, error);
        res.status(500).json({ error: 'Failed to delete page from announcement.' });
    } finally {
        client.release();
    }
});
// --- END OF MODIFICATION ---

// Other page management routes (rename, duplicate) would follow a similar pattern:
// 1. Authenticate, authorize admin.
// 2. Verify projectId is a valid 'announcement' project.
// 3. Perform the page operation, ensuring it's within that projectId.
// For brevity, I'll omit their full implementation here but they would mirror the logic in server.js,
// adapted for `projectId` and admin authorization. Make sure to use `duplicatePageRecursiveDb` correctly.

module.exports = router;