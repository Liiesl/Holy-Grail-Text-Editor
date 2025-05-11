// --- START OF FILE routeUtils.js ---
const crypto = require('crypto');

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

// duplicatePageRecursiveDb can also be moved here if it's generic enough
// For now, it's in server.js, but ensure it's exported and imported if used elsewhere
// Or, pass dbClient as an argument if moved here.

module.exports = {
    calculateHash,
    buildTree,
    // duplicatePageRecursiveDb, // if you move it
};
// --- END OF FILE routeUtils.js ---