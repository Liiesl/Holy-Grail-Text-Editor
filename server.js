const express = require('express');
const path = require('path');
const showdown = require('showdown');
const crypto = require('crypto');
const DiffMatchPatch = require('diff-match-patch');
const fssync = require('fs');

const db = require('./db');
require('dotenv').config(); // Configures .env for the whole application

// Auth related functionalities are now imported from auth.js
const { authRouter, authenticateToken } = require('./auth'); 
// initializeDefaultProject is used within auth.js, so no need to import here directly if not used elsewhere in server.js

const dmp = new DiffMatchPatch();
const app = express();
const port = process.env.PORT || 3133;
const PUBLIC_DIR = path.join(__dirname, 'public');
const converter = new showdown.Converter();

app.use(express.json({ limit: '5mb' }));
app.use(express.static(PUBLIC_DIR));

// Register auth routes from auth.js
app.use('/api/auth', authRouter);

function calculateHash(text) {
    if (text === null || typeof text === 'undefined') return null;
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function buildTree(pages, parentId = null) {
    const tree = [];
    pages
        .filter(page => page.parent_id === parentId)
        .sort((a, b) => a.display_order - b.display_order)
        .forEach(page => {
            const children = buildTree(pages, page.id);
            tree.push({
                id: page.id,
                title: page.title,
                type: 'page',
                children: children,
            });
        });
    return tree;
}

async function duplicatePageRecursiveDb(originalPageId, newProjectId, newParentIdForDuplicatedPage, displayOrder, dbClient, duplicatedIdMap = {}) {
    const pageRes = await dbClient.query('SELECT * FROM pages WHERE id = $1', [originalPageId]);
    if (pageRes.rows.length === 0) return null;
    const originalPageInfo = pageRes.rows[0];
    const newPageTitle = `${originalPageInfo.title} (Copy)`;
    
    const newPageInsertRes = await dbClient.query(
        `INSERT INTO pages (project_id, title, markdown_content, parent_id, display_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id`,
        [newProjectId, newPageTitle, originalPageInfo.markdown_content, newParentIdForDuplicatedPage, displayOrder]
    );
    const newPageId = newPageInsertRes.rows[0].id;
    duplicatedIdMap[originalPageId] = newPageId;

    const childrenRes = await dbClient.query(
        'SELECT id FROM pages WHERE parent_id = $1 ORDER BY display_order ASC',
        [originalPageId]
    );
    
    let childDisplayOrder = 0;
    for (const child of childrenRes.rows) {
        await duplicatePageRecursiveDb(child.id, newProjectId, newPageId, childDisplayOrder++, dbClient, duplicatedIdMap);
    }
    
    let currentMarkdownForNewPage = originalPageInfo.markdown_content; 
    if (currentMarkdownForNewPage) {
        let finalMarkdownForNewPage = currentMarkdownForNewPage;
        for (const [oId, nId] of Object.entries(duplicatedIdMap)) {
             const linkRegexSafe = oId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
             const linkRegex = new RegExp(`(page:\\/\\/)${linkRegexSafe}`, 'g');
             finalMarkdownForNewPage = finalMarkdownForNewPage.replace(linkRegex, `$1${nId}`);
        }
        if (finalMarkdownForNewPage !== currentMarkdownForNewPage) {
            await dbClient.query('UPDATE pages SET markdown_content = $1 WHERE id = $2', [finalMarkdownForNewPage, newPageId]);
        }
    }
    return newPageId;
}

// --- Auth API Endpoints ---
// MOVED to auth.js

// --- Project API Endpoints (Protected) ---
// authenticateToken is now imported from ./auth
app.post('/api/projects', authenticateToken, async (req, res) => {
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
        const existingProject = await client.query('SELECT id FROM projects WHERE name = $1 AND user_id = $2', [trimmedProjectName, userId]);
        if (existingProject.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Project "${trimmedProjectName}" already exists for this user.` });
        }

        const projectRes = await client.query(
            'INSERT INTO projects (name, user_id) VALUES ($1, $2) RETURNING id',
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

app.get('/api/projects', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await db.query('SELECT name FROM projects WHERE user_id = $1 ORDER BY name ASC', [userId]);
        res.json(result.rows.map(row => row.name));
    } catch (error) {
        console.error(`Error listing projects for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to list projects' });
    }
});

app.get('/api/project/:projectName/tree', authenticateToken, async (req, res) => {
    const { projectName } = req.params;
    const userId = req.user.id;
    try {
        const projectRes = await db.query('SELECT id FROM projects WHERE name = $1 AND user_id = $2', [projectName, userId]);
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

app.get('/api/project/:projectName/page/:pageId', authenticateToken, async (req, res) => {
    const { projectName, pageId } = req.params;
    const userId = req.user.id;
    try {
        const pageRes = await db.query(
            `SELECT p.id, p.title, p.markdown_content
             FROM pages p JOIN projects pr ON p.project_id = pr.id
             WHERE p.id = $1 AND pr.name = $2 AND pr.user_id = $3`,
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

app.post('/api/project/:projectName/page/:pageId', authenticateToken, async (req, res) => {
    const { projectName, pageId } = req.params;
    const { markdown, patch_text, base_version_hash } = req.body;
    const userId = req.user.id;
    let finalMarkdownContent;

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const pageQuery = `
            SELECT p.id, p.title, p.markdown_content 
            FROM pages p
            JOIN projects pr ON p.project_id = pr.id
            WHERE p.id = $1 AND pr.name = $2 AND pr.user_id = $3 FOR UPDATE`;
        const pageRes = await client.query(pageQuery, [pageId, projectName, userId]);

        if (pageRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Page not found in project for this user. Cannot save.' });
        }
        let currentPageData = pageRes.rows[0];

        if (patch_text && typeof base_version_hash === 'string') {
            const currentServerMarkdown = currentPageData.markdown_content;
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
                return res.status(500).json({ error: 'Failed to apply patch to server content.' });
            }
            finalMarkdownContent = patchedMarkdown;
        } else if (typeof markdown === 'string') {
            finalMarkdownContent = markdown;
        } else {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Invalid save request.' });
        }
        
        const h1Match = finalMarkdownContent.match(/^#\s+(.*?)(\r?\n|$)/m);
        let newTitleFromContent = currentPageData.title;
        if (h1Match && h1Match[1]) newTitleFromContent = h1Match[1].trim();
        else if (finalMarkdownContent.trim() === "") newTitleFromContent = "Untitled";
        
        await client.query(
            'UPDATE pages SET markdown_content = $1, title = $2 WHERE id = $3',
            [finalMarkdownContent, newTitleFromContent, pageId]
        );
        await client.query('COMMIT');
        const newVersionHash = calculateHash(finalMarkdownContent);
        res.json({
            message: 'Page saved successfully',
            id: pageId,
            newTitle: newTitleFromContent,
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

app.post('/api/project/:projectName/pages', authenticateToken, async (req, res) => {
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
        const projectRes = await client.query('SELECT id FROM projects WHERE name = $1 AND user_id = $2', [projectName, userId]);
        if (projectRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Project "${projectName}" not found for this user.` });
        }
        const projectId = projectRes.rows[0].id;

        let actualParentId = parentId;
        if (!actualParentId) { 
            const rootPageRes = await client.query(
                'SELECT id FROM pages WHERE project_id = $1 AND parent_id IS NULL', [projectId]
            );
            if (rootPageRes.rows.length === 0) { 
                await client.query('ROLLBACK');
                return res.status(500).json({ error: 'Root page for project not found.' });
            }
            actualParentId = rootPageRes.rows[0].id;
        } else {
            const parentPageRes = await client.query(
                'SELECT id FROM pages WHERE id = $1 AND project_id = $2', [actualParentId, projectId]
            );
            if (parentPageRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Parent page ID '${actualParentId}' not found in this project.` });
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

        let linkAddedToParentMarkdown = false;
        const rootPageCheck = await client.query('SELECT id FROM pages WHERE project_id = $1 AND parent_id IS NULL AND id = $2', [projectId, actualParentId]);
        const isParentTheRoot = rootPageCheck.rows.length > 0;

        if (actualParentId && !isParentTheRoot) {
            const parentPageInfoRes = await client.query(
                'SELECT markdown_content FROM pages WHERE id = $1 FOR UPDATE', [actualParentId]
            );
            if (parentPageInfoRes.rows.length > 0) {
                let parentContent = parentPageInfoRes.rows[0].markdown_content || "";
                if (parentContent.length > 0 && !parentContent.endsWith('\n\n')) {
                    parentContent += parentContent.endsWith('\n') ? '\n' : '\n\n';
                }
                parentContent += `[${trimmedTitle}](page://${newPageId})\n`;
                await client.query(
                    'UPDATE pages SET markdown_content = $1 WHERE id = $2', [parentContent, actualParentId]
                );
                linkAddedToParentMarkdown = true;
            }
        }
        
        await client.query('COMMIT');
        res.status(201).json({
            message: 'Page created successfully', newPageId, title: trimmedTitle, parentId: actualParentId, linkAddedToParentMarkdown
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error creating page in ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to create page: ${error.message}` });
    } finally {
        client.release();
    }
});

app.delete('/api/project/:projectName', authenticateToken, async (req, res) => {
    const { projectName } = req.params;
    const userId = req.user.id;
    try {
        const result = await db.query('DELETE FROM projects WHERE name = $1 AND user_id = $2 RETURNING id', [projectName, userId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: `Project "${projectName}" not found for this user.` });
        }
        res.json({ message: `Project "${projectName}" deleted successfully.` });
    } catch (error) {
        console.error(`Error deleting project ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to delete project: ${error.message}` });
    }
});

app.put('/api/project/:projectName/rename', authenticateToken, async (req, res) => {
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
        const oldProjectRes = await client.query('SELECT id FROM projects WHERE name = $1 AND user_id = $2', [oldProjectName, userId]);
        if (oldProjectRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Project "${oldProjectName}" not found for this user.` });
        }
        const projectId = oldProjectRes.rows[0].id;

        const newProjectCheckRes = await client.query('SELECT id FROM projects WHERE name = $1 AND user_id = $2', [trimmedNewName, userId]);
        if (newProjectCheckRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Project "${trimmedNewName}" already exists for this user.` });
        }

        await client.query(
            'UPDATE projects SET name = $1 WHERE id = $2 AND user_id = $3',
            [trimmedNewName, projectId, userId]
        );
        
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
            const safeOldProjectName = oldProjectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            rootContent = rootContent.replace(new RegExp(`^# Welcome to ${safeOldProjectName}`, 'm'), `# Welcome to ${trimmedNewName}`);
            
            await client.query(
                'UPDATE pages SET title = $1, markdown_content = $2 WHERE id = $3',
                [newRootTitle, rootContent, rootPage.id]
            );
        }

        await client.query('COMMIT');
        res.json({ message: `Project "${oldProjectName}" renamed to "${trimmedNewName}".`, newProjectName: trimmedNewName });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error renaming project ${oldProjectName} for user ${userId}:`, error);
        if (error.code === '23505' && error.constraint === 'projects_user_id_name_key') { 
            return res.status(409).json({ error: `Project name "${trimmedNewName}" is already taken by you.` });
        }
        res.status(500).json({ error: `Failed to rename project: ${error.message}` });
    } finally {
        client.release();
    }
});

app.post('/api/project/:projectName/duplicate', authenticateToken, async (req, res) => {
    const { projectName: originalProjectName } = req.params;
    let { newProjectName } = req.body;
    const userId = req.user.id;

    const trimmedNewName = (newProjectName || `${originalProjectName} (Copy)`).trim();
     if (trimmedNewName.includes('/') || trimmedNewName.includes('\\') || trimmedNewName.startsWith('.')) {
        return res.status(400).json({ error: 'Invalid characters in new project name.' });
    }
    if (originalProjectName === trimmedNewName) {
        return res.status(400).json({ error: 'New project name cannot be the same as the original if specified.'})
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const originalProjectRes = await client.query('SELECT id FROM projects WHERE name = $1 AND user_id = $2', [originalProjectName, userId]);
        if (originalProjectRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Project "${originalProjectName}" not found for this user.` });
        }
        const originalProjectId = originalProjectRes.rows[0].id;

        const newProjectCheckRes = await client.query('SELECT id FROM projects WHERE name = $1 AND user_id = $2', [trimmedNewName, userId]);
        if (newProjectCheckRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `A project named "${trimmedNewName}" already exists for this user.` });
        }

        const newProjectRes = await client.query(
            'INSERT INTO projects (name, user_id) VALUES ($1, $2) RETURNING id',
            [trimmedNewName, userId]
        );
        const newProjectId = newProjectRes.rows[0].id;

        const originalRootPageRes = await client.query(
            'SELECT id FROM pages WHERE project_id = $1 AND parent_id IS NULL', [originalProjectId]
        );
        if (originalRootPageRes.rows.length === 0) {
            await client.query('COMMIT'); // Commit project creation even if root page missing
            return res.status(201).json({ message: `Project duplicated as "${trimmedNewName}", but original had no root page.`, newProjectName: trimmedNewName });
        }
        const originalRootPageId = originalRootPageRes.rows[0].id;
        const duplicatedIdMap = {}; 
        await duplicatePageRecursiveDb(originalRootPageId, newProjectId, null, 0, client, duplicatedIdMap);
        
        const newRootPageToUpdateRes = await client.query(
            `SELECT id, title, markdown_content FROM pages WHERE project_id = $1 AND parent_id IS NULL FOR UPDATE`,
            [newProjectId]
        );

        if (newRootPageToUpdateRes.rows.length > 0) {
            const newRootPage = newRootPageToUpdateRes.rows[0];
            const expectedCopiedTitle = `Welcome to ${originalProjectName} (Copy)`; 
            // This title adjustment logic assumes the root page of the original project was "Welcome to <OriginalProjectName>"
            // and duplicatePageRecursiveDb appends " (Copy)" to titles.
            // If the duplicated root page title is "Welcome to OriginalProjectName (Copy) (Copy)", this logic needs adjustment.
            // The current duplicatePageRecursiveDb makes titles like "OriginalTitle (Copy)".
            // If original root page title was "Welcome to OriginalProject", duplicated is "Welcome to OriginalProject (Copy)"
            if (newRootPage.title.startsWith(`Welcome to ${originalProjectName}`) && newRootPage.title.endsWith('(Copy)')) {
                const finalNewRootPageTitle = `Welcome to ${trimmedNewName}`;
                let rootContent = newRootPage.markdown_content;
                // Regex to replace "# Welcome to OriginalProjectName (Copy)" with "# Welcome to NewDuplicatedProjectName"
                const titleInMarkdownRegex = new RegExp(`^# ${newRootPage.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
                rootContent = rootContent.replace(titleInMarkdownRegex, `# ${finalNewRootPageTitle}`);
                
                await client.query(
                    'UPDATE pages SET title = $1, markdown_content = $2 WHERE id = $3',
                    [finalNewRootPageTitle, rootContent, newRootPage.id]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: `Project "${originalProjectName}" duplicated as "${trimmedNewName}".`, newProjectName: trimmedNewName });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error duplicating project ${originalProjectName} for user ${userId}:`, error);
        if (error.code === '23505' && error.constraint === 'projects_user_id_name_key') {
            return res.status(409).json({ error: `A project named "${trimmedNewName}" already exists for this user.` });
        }
        res.status(500).json({ error: `Failed to duplicate project: ${error.message}` });
    } finally {
        client.release();
    }
});

app.delete('/api/project/:projectName/page/:pageId', authenticateToken, async (req, res) => {
    const { projectName, pageId } = req.params;
    const userId = req.user.id;
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const projectRes = await client.query('SELECT id FROM projects WHERE name = $1 AND user_id = $2', [projectName, userId]);
        if (projectRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: `Project "${projectName}" not found for this user.` });
        }
        const projectId = projectRes.rows[0].id;

        const pageInfoRes = await client.query(
            'SELECT parent_id FROM pages WHERE id = $1 AND project_id = $2', [pageId, projectId]
        );
        if (pageInfoRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Page not found in this project.' });
        }
        if (pageInfoRes.rows[0].parent_id === null) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot delete the root page. Delete the project instead.' });
        }

        const deleteRes = await client.query('DELETE FROM pages WHERE id = $1 AND project_id = $2', [pageId, projectId]);
        if (deleteRes.rowCount === 0) { 
             await client.query('ROLLBACK');
             return res.status(404).json({ error: 'Page not found or already deleted.' });
        }
        await client.query('COMMIT');
        res.json({ message: 'Page and its subpages deleted successfully.' }); // Note: subpages are deleted due to ON DELETE CASCADE in DB schema
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error deleting page ${pageId} in ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to delete page: ${error.message}` });
    } finally {
        client.release();
    }
});

app.put('/api/project/:projectName/page/:pageId/rename', authenticateToken, async (req, res) => {
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
        const pageRes = await client.query(
            `SELECT p.id, p.markdown_content FROM pages p
             JOIN projects pr ON p.project_id = pr.id
             WHERE p.id = $1 AND pr.name = $2 AND pr.user_id = $3 FOR UPDATE`,
            [pageId, projectName, userId]
        );

        if (pageRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Page not found in this project for this user.' });
        }
        const pageInfo = pageRes.rows[0];
        
        let content = pageInfo.markdown_content || "";
        const h1Regex = /^#\s+(.*?)(\r?\n|$)/m;
        const safeTrimmedNewTitle = trimmedNewTitle.replace(/\$/g, '$$$$'); // Escape $ for string replacement

        if (h1Regex.test(content)) {
            content = content.replace(h1Regex, `# ${safeTrimmedNewTitle}$2`);
        } else {
            content = `# ${safeTrimmedNewTitle}\n\n${content}`;
        }

        await client.query(
            'UPDATE pages SET title = $1, markdown_content = $2 WHERE id = $3',
            [trimmedNewTitle, content, pageId]
        );
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

app.post('/api/project/:projectName/page/:pageId/duplicate', authenticateToken, async (req, res) => {
    const { projectName, pageId: originalPageId } = req.params;
    const userId = req.user.id;
    const client = await db.getClient();

    try {
        await client.query('BEGIN');
        const originalPageQuery = await client.query(
            `SELECT p.id, p.project_id, p.parent_id, p.display_order 
             FROM pages p
             JOIN projects pr ON p.project_id = pr.id
             WHERE p.id = $1 AND pr.name = $2 AND pr.user_id = $3`,
            [originalPageId, projectName, userId]
        );

        if (originalPageQuery.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Original page not found in this project for this user.' });
        }
        const { project_id: projectId, parent_id: originalParentId, display_order: originalDisplayOrder } = originalPageQuery.rows[0];

        if (originalParentId === null) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot duplicate the root page. Duplicate the project instead.' });
        }
        
        // Make space for the new duplicated page(s)
        await client.query(
            `UPDATE pages SET display_order = display_order + 1 
             WHERE project_id = $1 AND parent_id = $2 AND display_order > $3`,
            [projectId, originalParentId, originalDisplayOrder]
        );
        const newDisplayOrder = originalDisplayOrder + 1;
        
        const duplicatedIdMap = {};
        const newTopLevelPageId = await duplicatePageRecursiveDb(originalPageId, projectId, originalParentId, newDisplayOrder, client, duplicatedIdMap);

        if (!newTopLevelPageId) {
            await client.query('ROLLBACK'); 
            throw new Error("Duplication process failed to return a new page ID.");
        }
        
        const newPageDetails = await client.query('SELECT title FROM pages WHERE id = $1', [newTopLevelPageId]);
        const newTitle = newPageDetails.rows.length > 0 ? newPageDetails.rows[0].title : "Untitled (Copy)";

        await client.query('COMMIT');
        res.status(201).json({
            message: 'Page duplicated successfully.',
            newRootPageId: newTopLevelPageId, 
            newTitle: newTitle // Title will be "Original Title (Copy)"
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error duplicating page ${originalPageId} in ${projectName}, user ${userId}:`, error);
        res.status(500).json({ error: `Failed to duplicate page: ${error.message}` });
    } finally {
        client.release();
    }
});

// Catch-all for SPA
app.get(('/'), (req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: `API endpoint ${req.path} not found.` });
    }
    if (/\.(css|js|map|ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/i.test(req.path)) {
        // Let express.static handle it if it's a static file request
        return next(); 
    }
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
        if (err) {
            console.error("Error sending index.html:", err);
            res.status(500).send("Error serving application.");
        }
    });
});

async function startServer() {
    try {
        await db.initializeSchema(); 
        // The default project is now initialized per user upon registration (in auth.js),
        // so no global initialization is needed here.
        
        app.listen(port, '0.0.0.0', () => {
            console.log(`Server listening at http://localhost:${port}`);
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