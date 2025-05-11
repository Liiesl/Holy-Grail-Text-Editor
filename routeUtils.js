// --- START OF FILE routeUtils.js ---
const crypto = require('crypto');
const DiffMatchPatch = require('diff-match-patch'); // 1. Import DiffMatchPatch

const dmp = new DiffMatchPatch(); // 2. Create an instance

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
                type: 'page', // Or determine type dynamically if needed
                children: children,
            });
        });
    return tree;
}

// duplicatePageRecursiveDb is currently in server.js and announcementAdminRoutes.js.
// If you decide to centralize it here, you'd need to pass the dbClient.
// For example:
// async function duplicatePageRecursiveDb(originalPageId, newProjectId, newParentId, displayOrder, dbClient, duplicatedIdMap = {}) { ... }

module.exports = {
    calculateHash,
    buildTree,
    dmp, // 3. Export the dmp instance
    // duplicatePageRecursiveDb, // if you move it
};
// --- END OF FILE routeUtils.js ---