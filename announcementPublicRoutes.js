const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth'); // All users can view published announcements
const { buildTree } = require('./routeUtils'); // We'll create this file

const router = express.Router();

// --- List all PUBLISHED announcement projects ---
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Only list 'published' announcements to general users
        const result = await db.query(
            "SELECT id, name, updated_at FROM projects WHERE type = 'announcement' AND status = 'published' ORDER BY updated_at DESC"
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error listing published announcements:', error);
        res.status(500).json({ error: 'Failed to list announcements.' });
    }
});

// --- Get page tree for a PUBLISHED announcement ---
router.get('/:projectId/tree', authenticateToken, async (req, res) => {
    const { projectId } = req.params;
    try {
        // Verify it's a published announcement
        const projectRes = await db.query(
            "SELECT id, name FROM projects WHERE id = $1 AND type = 'announcement' AND status = 'published'",
            [projectId]
        );
        if (projectRes.rows.length === 0) {
            return res.status(404).json({ error: 'Published announcement not found or access denied.' });
        }

        const pagesRes = await db.query(
            'SELECT id, title, parent_id, display_order FROM pages WHERE project_id = $1 ORDER BY display_order ASC, title ASC',
            [projectId]
        );
        const allPages = pagesRes.rows;
        const rootPageInfo = allPages.find(page => page.parent_id === null);

        if (!rootPageInfo) {
             return res.json({ rootPageId: null, rootPageTitle: "Announcement Empty or Root Missing", tree: [] });
        }
        const pageTreeForProject = buildTree(allPages, rootPageInfo.id); // Use imported buildTree
        res.json({
            rootPageId: rootPageInfo.id,
            rootPageTitle: rootPageInfo.title,
            tree: pageTreeForProject
        });
    } catch (error) {
        console.error(`Error getting tree for published announcement ${projectId}:`, error);
        res.status(500).json({ error: `Failed to get announcement page tree: ${error.message}` });
    }
});

// --- Get page content for a PUBLISHED announcement (read-only) ---
router.get('/:projectId/page/:pageId', authenticateToken, async (req, res) => {
    const { projectId, pageId } = req.params;
    try {
        // Verify it's a published announcement and the page belongs to it
        const pageRes = await db.query(
            `SELECT p.id, p.title, p.markdown_content
             FROM pages p JOIN projects pr ON p.project_id = pr.id
             WHERE p.id = $1 AND pr.id = $2 AND pr.type = 'announcement' AND pr.status = 'published'`,
            [pageId, projectId]
        );

        if (pageRes.rows.length === 0) {
            return res.status(404).json({ error: 'Page not found in published announcement or access denied.' });
        }
        const pageInfo = pageRes.rows[0];
        // const versionHash = calculateHash(pageInfo.markdown_content); // If needed
        res.json({
            id: pageInfo.id,
            title: pageInfo.title,
            markdown: pageInfo.markdown_content,
            // versionHash: versionHash,
        });
    } catch (error) {
        console.error(`Error reading page ${pageId} in published announcement ${projectId}:`, error);
        res.status(500).json({ error: `Failed to read page: ${error.message}` });
    }
});

module.exports = router;