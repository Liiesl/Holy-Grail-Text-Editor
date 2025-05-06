const express = require('express');
const fs = require('fs').promises;
const fssync = require('fs'); // For some sync operations
const path = require('path');
const showdown = require('showdown');
const { v4: uuidv4 } = require('uuid'); // For generating unique page IDs
const crypto = require('crypto');
const DiffMatchPatch = require('diff-match-patch');

const { initializeDefaultProject } = require('./defaultProjectInitializer'); // Import the function

const dmp = new DiffMatchPatch();

const app = express();
const port = 3133;
const PROJECTS_DIR = path.join(__dirname, 'projects');
const PUBLIC_DIR = path.join(__dirname, 'public');

const META_FILE_NAME = '_project_meta.json';
const PAGES_DIR_NAME = '_pages';

const converter = new showdown.Converter();

// Middleware
app.use(express.json({ limit: '5mb' })); // Increased limit for potentially larger patches/content
app.use(express.static(PUBLIC_DIR));

// --- Helper Functions ---
function calculateHash(text) {
    if (text === null || typeof text === 'undefined') return null;
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

async function readProjectMeta(projectPath) {
    const metaFilePath = path.join(projectPath, META_FILE_NAME);
    try {
        const data = await fs.readFile(metaFilePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`Meta file not found for project: ${projectPath}.`);
            throw new Error(`Project metadata not found for ${path.basename(projectPath)}.`);
        }
        console.error(`Error reading or parsing meta file ${metaFilePath}:`, error);
        throw error;
    }
}

async function writeProjectMeta(projectPath, metaData) {
    const metaFilePath = path.join(projectPath, META_FILE_NAME);
    await fs.writeFile(metaFilePath, JSON.stringify(metaData, null, 2), 'utf-8');
}

function buildTreeFromMeta(meta, parentId = null) {
    const tree = [];
    const parentPage = meta.pages[parentId];
    if (!parentPage || !parentPage.childrenIds) {
        return tree;
    }
    parentPage.childrenIds.forEach(childId => {
        const page = meta.pages[childId];
        if (page && page.parentId === parentId) {
            const children = buildTreeFromMeta(meta, page.id);
            tree.push({
                id: page.id,
                title: page.title,
                type: 'page',
                children: children,
            });
        }
    });
    return tree;
}

async function deletePageRecursive(meta, pageIdToDelete, projectPagesPath) {
    const pageInfoToDelete = meta.pages[pageIdToDelete];
    if (!pageInfoToDelete) return; // Already deleted or never existed

    // Recursively delete children
    if (pageInfoToDelete.childrenIds && pageInfoToDelete.childrenIds.length > 0) {
        // Create a copy of childrenIds array because it might be modified during recursion
        const childrenToDelete = [...pageInfoToDelete.childrenIds];
        for (const childId of childrenToDelete) {
            await deletePageRecursive(meta, childId, projectPagesPath);
        }
    }

    // Delete content file
    const contentFilePath = path.join(projectPagesPath, pageInfoToDelete.contentFile);
    try {
        await fs.unlink(contentFilePath);
        console.log(`Deleted content file: ${contentFilePath}`);
    } catch (err) {
        if (err.code !== 'ENOENT') { // Ignore if file already not found
            console.error(`Error deleting content file ${contentFilePath}:`, err);
            throw err; // Rethrow if it's a more serious error
        }
    }

    // Remove from parent's childrenIds
    const parentId = pageInfoToDelete.parentId;
    if (parentId && meta.pages[parentId] && meta.pages[parentId].childrenIds) {
        meta.pages[parentId].childrenIds = meta.pages[parentId].childrenIds.filter(id => id !== pageIdToDelete);
    }
    
    // Delete from meta
    delete meta.pages[pageIdToDelete];
    console.log(`Deleted page ${pageIdToDelete} from meta.`);
}


async function duplicatePageRecursive(meta, originalPageId, newParentIdForDuplicatedPage, projectPagesPath, allNewPageMetas, duplicatedIdMap, now) {
    const originalPageInfo = meta.pages[originalPageId];
    if (!originalPageInfo) return null;

    const newPageId = uuidv4();
    duplicatedIdMap[originalPageId] = newPageId;

    const newPageContentFileName = `${newPageId}.md`;
    const newPageInfo = {
        ...originalPageInfo, // Copy most fields
        id: newPageId,
        title: `${originalPageInfo.title} (Copy)`,
        contentFile: newPageContentFileName,
        parentId: newParentIdForDuplicatedPage,
        childrenIds: [], // Will be populated by recursive calls
        createdAt: now,
        updatedAt: now,
    };
    allNewPageMetas[newPageId] = newPageInfo;

    // Copy content file
    const originalContentPath = path.join(projectPagesPath, originalPageInfo.contentFile);
    const newContentPath = path.join(projectPagesPath, newPageContentFileName);
    await fs.copyFile(originalContentPath, newContentPath);

    // Recursively duplicate children
    if (originalPageInfo.childrenIds && originalPageInfo.childrenIds.length > 0) {
        for (const originalChildId of originalPageInfo.childrenIds) {
            const newChildId = await duplicatePageRecursive(meta, originalChildId, newPageId, projectPagesPath, allNewPageMetas, duplicatedIdMap, now);
            if (newChildId) {
                newPageInfo.childrenIds.push(newChildId);
            }
        }
    }
    return newPageId;
}


// --- API Endpoints ---

app.post('/api/projects', async (req, res) => {
    const { projectName } = req.body;
    if (!projectName || typeof projectName !== 'string' || projectName.trim() === '') {
        return res.status(400).json({ error: 'Valid project name is required.' });
    }
    const trimmedProjectName = projectName.trim();
    if (trimmedProjectName.includes('/') || trimmedProjectName.includes('\\') || trimmedProjectName.startsWith('.')) {
        return res.status(400).json({ error: 'Invalid characters in project name.' });
    }

    const projectPath = path.join(PROJECTS_DIR, trimmedProjectName);

    try {
        if (fssync.existsSync(projectPath)) {
            return res.status(409).json({ error: `Project "${trimmedProjectName}" already exists.` });
        }
        fssync.mkdirSync(projectPath, { recursive: true });
        await initializeNewProject(projectPath, trimmedProjectName);
        res.status(201).json({ message: `Project "${trimmedProjectName}" created successfully.`, projectName: trimmedProjectName });
    } catch (error) {
        console.error(`Error creating project ${trimmedProjectName}:`, error);
        res.status(500).json({ error: `Failed to create project: ${error.message}` });
    }
});


app.get('/api/projects', async (req, res) => {
    try {
        const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
        const projectNames = entries
            .filter(dirent => {
                if (!dirent.isDirectory()) return false;
                const metaFilePath = path.join(PROJECTS_DIR, dirent.name, META_FILE_NAME);
                return fssync.existsSync(metaFilePath);
            })
            .map(dirent => dirent.name);
        res.json(projectNames);
    } catch (error) {
        console.error('Error listing projects:', error);
        res.status(500).json({ error: 'Failed to list projects' });
    }
});

app.get('/api/project/:projectName/tree', async (req, res) => {
    const { projectName } = req.params;
    const projectPath = path.join(PROJECTS_DIR, projectName);
    try {
        const meta = await readProjectMeta(projectPath);
        const rootPageInfo = meta.pages[meta.rootPageId];

        if (!rootPageInfo) {
             // If project exists but root page is somehow missing, this is an issue
            if (Object.keys(meta.pages).length === 0) { // Project is truly empty
                 return res.json({
                    rootPageId: null, // Or meta.rootPageId which might be dangling
                    rootPageTitle: "Project Empty", 
                    tree: []
                });
            }
            return res.status(404).json({ error: 'Root page defined in metadata not found.' });
        }

        const pageTreeForProject = buildTreeFromMeta(meta, meta.rootPageId);

        res.json({
            rootPageId: meta.rootPageId,
            rootPageTitle: rootPageInfo.title,
            tree: pageTreeForProject
        });
    } catch (error) {
        console.error(`Error getting tree for ${projectName}:`, error);
        res.status(500).json({ error: `Failed to get project page tree: ${error.message}` });
    }
});

app.get('/api/project/:projectName/page/:pageId', async (req, res) => {
    const { projectName, pageId } = req.params;
    const projectPath = path.join(PROJECTS_DIR, projectName);
    const pagesContentPath = path.join(projectPath, PAGES_DIR_NAME);
    try {
        const meta = await readProjectMeta(projectPath);
        const pageInfo = meta.pages[pageId];
        if (!pageInfo) {
            return res.status(404).json({ error: 'Page not found in project metadata.' });
        }
        const pageFilePath = path.join(pagesContentPath, pageInfo.contentFile);
        const markdownContent = await fs.readFile(pageFilePath, 'utf-8');
        const versionHash = calculateHash(markdownContent);

        res.json({
            id: pageInfo.id,
            title: pageInfo.title,
            markdown: markdownContent,
            versionHash: versionHash,
            path: pageInfo.id
        });
    } catch (error) {
        console.error(`Error reading page ${pageId} in ${projectName}:`, error);
        if (error.code === 'ENOENT') {
            return res.status(404).json({ error: 'Page content file not found.' });
        }
        res.status(500).json({ error: `Failed to read page: ${error.message}` });
    }
});

app.post('/api/project/:projectName/page/:pageId', async (req, res) => {
    const { projectName, pageId } = req.params;
    const { markdown, patch_text, base_version_hash } = req.body;

    const projectPath = path.join(PROJECTS_DIR, projectName);
    const pagesContentPath = path.join(projectPath, PAGES_DIR_NAME);
    let finalMarkdownContent;

    try {
        let meta = await readProjectMeta(projectPath);
        const pageInfo = meta.pages[pageId];

        if (!pageInfo) {
            return res.status(404).json({ error: 'Page not found in project metadata. Cannot save.' });
        }

        const pageFilePath = path.join(pagesContentPath, pageInfo.contentFile);

        if (patch_text && typeof base_version_hash === 'string') {
            console.log(`Server: Received PATCH for ${pageId}. Base hash: ${base_version_hash}`);
            const currentServerMarkdown = await fs.readFile(pageFilePath, 'utf-8');
            const currentServerHash = calculateHash(currentServerMarkdown);

            if (currentServerHash !== base_version_hash) {
                console.warn(`Server: Conflict for ${pageId}. Client base hash: ${base_version_hash}, Server hash: ${currentServerHash}`);
                return res.status(409).json({
                    error: 'Conflict: Page has been modified since last load. Please reload.',
                    server_hash: currentServerHash
                });
            }

            const patches = dmp.patch_fromText(patch_text);
            const [patchedMarkdown, results] = dmp.patch_apply(patches, currentServerMarkdown);

            const allPatchesApplied = results.every(applied => applied === true);
            if (!allPatchesApplied) {
                console.error(`Server: Patch application failed for ${pageId}. Results: ${results}`);
                return res.status(500).json({ error: 'Failed to apply patch to server content.' });
            }
            finalMarkdownContent = patchedMarkdown;
            console.log(`Server: Patch applied successfully for ${pageId}.`);

        } else if (typeof markdown === 'string') {
            console.log(`Server: Received FULL content for ${pageId}.`);
            finalMarkdownContent = markdown;
        } else {
            return res.status(400).json({ error: 'Invalid save request: Requires markdown or patch_text with base_version_hash.' });
        }

        await fs.writeFile(pageFilePath, finalMarkdownContent, 'utf-8');
        pageInfo.updatedAt = new Date().toISOString();

        const h1Match = finalMarkdownContent.match(/^#\s+(.*?)(\r?\n|$)/m);
        let newTitleFromContent = pageInfo.title;
        if (h1Match && h1Match[1]) {
            newTitleFromContent = h1Match[1].trim();
        } else {
            if (finalMarkdownContent.trim() === "") newTitleFromContent = "Untitled";
        }

        if (newTitleFromContent !== pageInfo.title) {
           pageInfo.title = newTitleFromContent;
        }
        meta.pages[pageId] = pageInfo;
        await writeProjectMeta(projectPath, meta);

        const newVersionHash = calculateHash(finalMarkdownContent);

        res.json({
            message: 'Page saved successfully',
            id: pageId,
            newTitle: pageInfo.title,
            newMarkdown: finalMarkdownContent,
            newVersionHash: newVersionHash
        });

    } catch (error) {
        console.error(`Error saving page ${pageId} in ${projectName}:`, error);
        if (error.message.includes('Project metadata not found') || (error.code === 'ENOENT' && !error.path.includes(PAGES_DIR_NAME))) {
            return res.status(404).json({ error: `Project or essential project file not found: ${error.message}`});
        }
        res.status(500).json({ error: `Failed to save page: ${error.message}` });
    }
});

app.post('/api/project/:projectName/pages', async (req, res) => {
    const { projectName } = req.params;
    const { title, parentId } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'Valid title is required.' });
    }

    const projectPath = path.join(PROJECTS_DIR, projectName);
    const pagesContentPath = path.join(projectPath, PAGES_DIR_NAME);

    try {
        const meta = await readProjectMeta(projectPath);
        const actualParentId = parentId || meta.rootPageId;

        if (!meta.pages[actualParentId]) {
            if (actualParentId === meta.rootPageId && meta.rootPageId && !meta.pages[meta.rootPageId]) {
                 return res.status(400).json({ error: `Project root page (ID: ${actualParentId}) appears to be missing from metadata, though defined. Cannot create subpage. Project might be corrupted.` });
            } else if (!meta.pages[actualParentId]) {
                 return res.status(400).json({ error: `Parent page ID '${actualParentId}' not found.` });
            }
        }


        const newPageId = uuidv4();
        const newPageContentFileName = `${newPageId}.md`;
        const now = new Date().toISOString();
        const trimmedTitle = title.trim();

        const newPageData = {
            id: newPageId,
            title: trimmedTitle,
            contentFile: newPageContentFileName,
            parentId: actualParentId,
            childrenIds: [],
            createdAt: now,
            updatedAt: now,
        };
        meta.pages[newPageId] = newPageData;

        if (meta.pages[actualParentId]) { // Ensure parent exists before trying to push to its childrenIds
            if (!meta.pages[actualParentId].childrenIds) {
                 meta.pages[actualParentId].childrenIds = [];
            }
            meta.pages[actualParentId].childrenIds.push(newPageId);
        }


        const initialContent = `# ${trimmedTitle}\n\nStart writing here...`;
        const newPageFilePath = path.join(pagesContentPath, newPageContentFileName);
        await fs.writeFile(newPageFilePath, initialContent, 'utf-8');

        let linkAddedToParentMarkdown = false;
        if (parentId && parentId !== meta.rootPageId && meta.pages[parentId]) {
            const parentPageInfo = meta.pages[parentId];
            const parentFilePath = path.join(pagesContentPath, parentPageInfo.contentFile);
            try {
                let parentContent = await fs.readFile(parentFilePath, 'utf-8');
                if (parentContent.length > 0 && !parentContent.endsWith('\n\n')) {
                    parentContent += parentContent.endsWith('\n') ? '\n' : '\n\n';
                }
                parentContent += `[${trimmedTitle}](page://${newPageId})\n`;
                await fs.writeFile(parentFilePath, parentContent, 'utf-8');
                parentPageInfo.updatedAt = now;
                linkAddedToParentMarkdown = true;
            } catch (linkError) {
                console.warn(`Could not automatically link subpage in parent ${parentId}: ${linkError.message}`);
            }
        }

        await writeProjectMeta(projectPath, meta);

        res.status(201).json({
            message: 'Page created successfully',
            newPageId: newPageId,
            title: newPageData.title,
            parentId: newPageData.parentId,
            linkAddedToParentMarkdown
        });

    } catch (error) {
        console.error(`Error creating page in ${projectName}:`, error);
        res.status(500).json({ error: `Failed to create page: ${error.message}` });
    }
});

// --- Project Actions ---
app.delete('/api/project/:projectName', async (req, res) => {
    const { projectName } = req.params;
    const projectPath = path.join(PROJECTS_DIR, projectName);
    try {
        if (!fssync.existsSync(projectPath)) {
            return res.status(404).json({ error: `Project "${projectName}" not found.` });
        }
        await fs.rm(projectPath, { recursive: true, force: true });
        res.json({ message: `Project "${projectName}" deleted successfully.` });
    } catch (error) {
        console.error(`Error deleting project ${projectName}:`, error);
        res.status(500).json({ error: `Failed to delete project: ${error.message}` });
    }
});

app.put('/api/project/:projectName/rename', async (req, res) => {
    const { projectName: oldProjectName } = req.params;
    const { newProjectName } = req.body;

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

    const oldProjectPath = path.join(PROJECTS_DIR, oldProjectName);
    const newProjectPath = path.join(PROJECTS_DIR, trimmedNewName);

    try {
        if (!fssync.existsSync(oldProjectPath)) {
            return res.status(404).json({ error: `Project "${oldProjectName}" not found.` });
        }
        if (fssync.existsSync(newProjectPath)) {
            return res.status(409).json({ error: `Project "${trimmedNewName}" already exists.` });
        }

        await fs.rename(oldProjectPath, newProjectPath);
        const meta = await readProjectMeta(newProjectPath); // Read from new path
        meta.projectName = trimmedNewName; // Update meta
        // Optionally, update root page title if it was "Welcome to OldProjectName"
        if (meta.pages[meta.rootPageId] && meta.pages[meta.rootPageId].title === `Welcome to ${oldProjectName}`) {
            meta.pages[meta.rootPageId].title = `Welcome to ${trimmedNewName}`;
            // Also update the H1 in the root page file
            const rootPageInfo = meta.pages[meta.rootPageId];
            const rootPagePath = path.join(newProjectPath, PAGES_DIR_NAME, rootPageInfo.contentFile);
            let rootContent = await fs.readFile(rootPagePath, 'utf-8');
            rootContent = rootContent.replace(new RegExp(`^# Welcome to ${oldProjectName}`, 'm'), `# Welcome to ${trimmedNewName}`);
            await fs.writeFile(rootPagePath, rootContent, 'utf-8');
        }
        await writeProjectMeta(newProjectPath, meta); // Write to new path

        res.json({ message: `Project "${oldProjectName}" renamed to "${trimmedNewName}".`, newProjectName: trimmedNewName });
    } catch (error) {
        console.error(`Error renaming project ${oldProjectName}:`, error);
        res.status(500).json({ error: `Failed to rename project: ${error.message}` });
    }
});

app.post('/api/project/:projectName/duplicate', async (req, res) => {
    const { projectName: originalProjectName } = req.params;
    let { newProjectName } = req.body;

    if (!newProjectName || typeof newProjectName !== 'string' || newProjectName.trim() === '') {
        newProjectName = `${originalProjectName} (Copy)`;
    }
    const trimmedNewName = newProjectName.trim();

    if (trimmedNewName.includes('/') || trimmedNewName.includes('\\') || trimmedNewName.startsWith('.')) {
        return res.status(400).json({ error: 'Invalid characters in new project name.' });
    }

    const originalProjectPath = path.join(PROJECTS_DIR, originalProjectName);
    const newProjectPath = path.join(PROJECTS_DIR, trimmedNewName);

    try {
        if (!fssync.existsSync(originalProjectPath)) {
            return res.status(404).json({ error: `Project "${originalProjectName}" not found.` });
        }
        if (fssync.existsSync(newProjectPath)) {
            return res.status(409).json({ error: `A project named "${trimmedNewName}" already exists.` });
        }

        // Use fs-extra for easy directory copy, or implement manually
        // Manual copy:
        fssync.mkdirSync(newProjectPath, { recursive: true });
        const entries = await fs.readdir(originalProjectPath, { withFileTypes: true });
        for (let entry of entries) {
            const srcPath = path.join(originalProjectPath, entry.name);
            const destPath = path.join(newProjectPath, entry.name);
            if (entry.isDirectory()) {
                // For simplicity, assuming PAGES_DIR_NAME is the only subdir with content.
                // A full recursive copy utility would be better for more complex structures.
                if (entry.name === PAGES_DIR_NAME) {
                    fssync.mkdirSync(destPath, { recursive: true });
                    const pageFiles = await fs.readdir(srcPath);
                    for (const pageFile of pageFiles) {
                        await fs.copyFile(path.join(srcPath, pageFile), path.join(destPath, pageFile));
                    }
                }
            } else {
                await fs.copyFile(srcPath, destPath);
            }
        }
        
        // Update meta in the new project
        const meta = await readProjectMeta(newProjectPath);
        meta.projectName = trimmedNewName;
        // If root page title was "Welcome to OriginalProjectName", update it
        if (meta.pages[meta.rootPageId] && meta.pages[meta.rootPageId].title === `Welcome to ${originalProjectName}`) {
           meta.pages[meta.rootPageId].title = `Welcome to ${trimmedNewName}`;
           // Also update the H1 in the root page file
           const rootPageInfo = meta.pages[meta.rootPageId];
           const rootPagePath = path.join(newProjectPath, PAGES_DIR_NAME, rootPageInfo.contentFile);
           let rootContent = await fs.readFile(rootPagePath, 'utf-8');
           rootContent = rootContent.replace(new RegExp(`^# Welcome to ${originalProjectName}`, 'm'), `# Welcome to ${trimmedNewName}`);
           await fs.writeFile(rootPagePath, rootContent, 'utf-8');
        }
        await writeProjectMeta(newProjectPath, meta);

        res.status(201).json({ message: `Project "${originalProjectName}" duplicated as "${trimmedNewName}".`, newProjectName: trimmedNewName });
    } catch (error) {
        console.error(`Error duplicating project ${originalProjectName}:`, error);
        // Clean up partially created new project directory if duplication failed mid-way
        if (fssync.existsSync(newProjectPath)) {
            await fs.rm(newProjectPath, { recursive: true, force: true }).catch(err => console.error("Cleanup failed:", err));
        }
        res.status(500).json({ error: `Failed to duplicate project: ${error.message}` });
    }
});


// --- Page Actions ---
app.delete('/api/project/:projectName/page/:pageId', async (req, res) => {
    const { projectName, pageId } = req.params;
    const projectPath = path.join(PROJECTS_DIR, projectName);
    const pagesContentPath = path.join(projectPath, PAGES_DIR_NAME);

    try {
        const meta = await readProjectMeta(projectPath);
        if (pageId === meta.rootPageId) {
            return res.status(400).json({ error: 'Cannot delete the root page of a project directly. Use "Delete Project" instead.' });
        }
        if (!meta.pages[pageId]) {
            return res.status(404).json({ error: 'Page not found.' });
        }

        await deletePageRecursive(meta, pageId, pagesContentPath);
        await writeProjectMeta(projectPath, meta);

        res.json({ message: 'Page and its subpages deleted successfully.' });
    } catch (error) {
        console.error(`Error deleting page ${pageId} in ${projectName}:`, error);
        res.status(500).json({ error: `Failed to delete page: ${error.message}` });
    }
});

app.put('/api/project/:projectName/page/:pageId/rename', async (req, res) => {
    const { projectName, pageId } = req.params;
    const { newTitle } = req.body;

    if (!newTitle || typeof newTitle !== 'string' || newTitle.trim() === '') {
        return res.status(400).json({ error: 'New title is required.' });
    }
    const trimmedNewTitle = newTitle.trim();
    const projectPath = path.join(PROJECTS_DIR, projectName);
    const pagesContentPath = path.join(projectPath, PAGES_DIR_NAME);

    try {
        const meta = await readProjectMeta(projectPath);
        const pageInfo = meta.pages[pageId];
        if (!pageInfo) {
            return res.status(404).json({ error: 'Page not found.' });
        }

        pageInfo.title = trimmedNewTitle;
        pageInfo.updatedAt = new Date().toISOString();

        // Update H1 in markdown file
        const pageFilePath = path.join(pagesContentPath, pageInfo.contentFile);
        let content = await fs.readFile(pageFilePath, 'utf-8');
        const h1Regex = /^#\s+(.*?)(\r?\n|$)/m;
        if (h1Regex.test(content)) {
            content = content.replace(h1Regex, `# ${trimmedNewTitle}$2`);
        } else {
            content = `# ${trimmedNewTitle}\n\n${content}`;
        }
        await fs.writeFile(pageFilePath, content, 'utf-8');
        await writeProjectMeta(projectPath, meta);

        res.json({ message: 'Page renamed successfully.', newTitle: trimmedNewTitle, pageId });
    } catch (error) {
        console.error(`Error renaming page ${pageId} in ${projectName}:`, error);
        res.status(500).json({ error: `Failed to rename page: ${error.message}` });
    }
});

app.post('/api/project/:projectName/page/:pageId/duplicate', async (req, res) => {
    const { projectName, pageId: originalPageId } = req.params;
    const projectPath = path.join(PROJECTS_DIR, projectName);
    const pagesContentPath = path.join(projectPath, PAGES_DIR_NAME);
    const now = new Date().toISOString();

    try {
        const meta = await readProjectMeta(projectPath);
        const originalPageInfo = meta.pages[originalPageId];

        if (!originalPageInfo) {
            return res.status(404).json({ error: 'Original page not found.' });
        }
        if (originalPageId === meta.rootPageId) {
            return res.status(400).json({ error: 'Cannot duplicate the root page. Duplicate the project instead.' });
        }
        
        const parentOfOriginal = meta.pages[originalPageInfo.parentId];
        if (!parentOfOriginal) {
             return res.status(500).json({ error: 'Parent of original page not found in metadata. Cannot determine where to place duplicate.' });
        }

        const allNewPageMetas = {}; // To collect all new page metas before adding to main meta
        const duplicatedIdMap = {};   // To map original IDs to new IDs if needed (e.g. for links - not implemented here)

        const newTopLevelPageId = await duplicatePageRecursive(meta, originalPageId, originalPageInfo.parentId, pagesContentPath, allNewPageMetas, duplicatedIdMap, now);

        if (!newTopLevelPageId) {
            throw new Error("Duplication process failed to return a new page ID.");
        }

        // Add all newly created page metas to the main meta object
        for (const id in allNewPageMetas) {
            meta.pages[id] = allNewPageMetas[id];
        }
        
        // Add the new top-level duplicated page to its parent's childrenIds
        if (parentOfOriginal.childrenIds) {
            const originalIndex = parentOfOriginal.childrenIds.indexOf(originalPageId);
            if (originalIndex !== -1) {
                parentOfOriginal.childrenIds.splice(originalIndex + 1, 0, newTopLevelPageId);
            } else {
                parentOfOriginal.childrenIds.push(newTopLevelPageId); // Fallback
            }
        } else {
            parentOfOriginal.childrenIds = [newTopLevelPageId];
        }
        parentOfOriginal.updatedAt = now;

        await writeProjectMeta(projectPath, meta);

        res.status(201).json({
            message: 'Page duplicated successfully.',
            newRootPageId: newTopLevelPageId, // The ID of the top-most page that was duplicated
            newTitle: allNewPageMetas[newTopLevelPageId].title
        });
    } catch (error) {
        console.error(`Error duplicating page ${originalPageId} in ${projectName}:`, error);
        res.status(500).json({ error: `Failed to duplicate page: ${error.message}` });
    }
});


app.get(['/'], (req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: `API endpoint ${req.path} not found.` });
    }
    if (req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.map')) {
        return next();
    }
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});


async function initializeNewProject(projectPath, projectName) { // Used for user-created projects
    const pagesDir = path.join(projectPath, PAGES_DIR_NAME);
    if (!fssync.existsSync(pagesDir)) {
        fssync.mkdirSync(pagesDir, { recursive: true });
    }

    const rootPageId = uuidv4();
    const now = new Date().toISOString();

    const initialMeta = {
        projectName: projectName,
        rootPageId: rootPageId,
        pages: {
            [rootPageId]: {
                id: rootPageId,
                title: `Welcome to ${projectName}`, 
                contentFile: `${rootPageId}.md`,
                parentId: null,
                childrenIds: [], 
                createdAt: now,
                updatedAt: now,
            }
        }
    };
    const rootPageContent = `# Welcome to ${projectName}\n\nStart building your project!`;
    await fs.writeFile(path.join(pagesDir, `${rootPageId}.md`), rootPageContent, 'utf-8');
    await writeProjectMeta(projectPath, initialMeta);
    console.log(`Initialized new project "${projectName}".`);
}


app.listen(port, async () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log(`Projects directory: ${PROJECTS_DIR}`);
    console.log(`Public directory: ${PUBLIC_DIR}`);

    if (!fssync.existsSync(PUBLIC_DIR)) {
        fssync.mkdirSync(PUBLIC_DIR, { recursive: true });
        console.log(`Created public directory: ${PUBLIC_DIR}.`);
    }
     if (!fssync.existsSync(path.join(__dirname, 'index.html')) && !fssync.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
        console.warn("Warning: index.html not found in the root or public directory. Ensure your HTML file is correctly placed and served.");
    }

    if (!fssync.existsSync(PROJECTS_DIR)) {
        fssync.mkdirSync(PROJECTS_DIR, { recursive: true });
        console.log(`Created projects directory: ${PROJECTS_DIR}`);
    }

    const sampleProjectName = 'welcome';
    const sampleProjectPath = path.join(PROJECTS_DIR, sampleProjectName);

    if (!fssync.existsSync(path.join(sampleProjectPath, META_FILE_NAME))) {
        if (!fssync.existsSync(sampleProjectPath)) {
            fssync.mkdirSync(sampleProjectPath, { recursive: true });
        }
        // Call the imported function, passing necessary configs/helpers from server.js scope
        await initializeDefaultProject(sampleProjectPath, sampleProjectName, {
            PAGES_DIR_NAME,
            writeProjectMeta
        });
    } else {
        console.log(`Sample project "${sampleProjectName}" already exists.`);
    }
});