// --- START OF FILE script.js ---

document.addEventListener('DOMContentLoaded', () => {
    const projectSelector = document.getElementById('project-selector');
    const pageTreeContainer = document.getElementById('page-tree');
    const markdownInput = document.getElementById('markdown-input');
    const htmlPreview = document.getElementById('html-preview');
    const savePageBtn = document.getElementById('save-page-btn');
    const currentPageDisplay = document.getElementById('current-page-display');
    const statusMessage = document.getElementById('status-message');
    const newPageTitleInput = document.getElementById('new-page-title-input');
    const createPageBtn = document.getElementById('create-page-btn');
    const slashCommandModal = document.getElementById('slash-command-modal');

    let currentProject = null;
    let currentPageState = null; // Stores { id: 'page-uuid', title: 'Page Title', originalContent: '...' }
    let hasUnsavedChanges = false;

    const clientConverter = new showdown.Converter();

    // --- Slash Command State ---
    let slashCommandActive = false;
    let slashCommandCursorPos = 0;

    // --- Utility Functions ---
    function showStatus(message, type = 'info', duration = 3000) {
        statusMessage.textContent = message;
        statusMessage.className = type;
        if (duration) {
            setTimeout(() => statusMessage.textContent = '', duration);
        }
    }

    function updateSaveButtonState() {
        savePageBtn.disabled = !hasUnsavedChanges || !currentPageState;
    }

    function clearEditor() {
        markdownInput.value = '';
        htmlPreview.innerHTML = '';
        currentPageDisplay.textContent = 'No page selected';
        if (currentProject) {
             currentPageDisplay.textContent = `Project: ${currentProject} - No page selected`;
        }
        currentPageState = null;
        hasUnsavedChanges = false;
        updateSaveButtonState();
    }

    // --- API Fetch Functions ---
    async function fetchProjects() {
        try {
            const response = await fetch('/api/projects');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const projects = await response.json();
            projectSelector.innerHTML = '<option value="">-- Select Project --</option>';
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project;
                option.textContent = project;
                projectSelector.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching projects:', error);
            showStatus('Failed to load projects.', 'error');
        }
    }

    async function fetchPageTree(projectName) {
        currentProject = projectName;
        pageTreeContainer.innerHTML = 'Loading tree...';
        clearEditor(); // Clear editor when project changes

        if (!projectName) {
            pageTreeContainer.innerHTML = '';
            return;
        }
        try {
            const response = await fetch(`/api/project/${projectName}/tree`);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const treeData = await response.json();
            renderPageTree(treeData, pageTreeContainer);
            // If project root is a page, load it by default (optional, user can click)
            // Example: if (treeData.length > 0 && treeData[0].isProjectRootPage) {
            //     loadPageContent(projectName, treeData[0].id);
            // }
        } catch (error) {
            console.error('Error fetching page tree:', error);
            pageTreeContainer.innerHTML = 'Error loading tree.';
            showStatus(`Failed to load tree for ${projectName}: ${error.message}`, 'error');
        }
    }

    function renderPageTree(nodes, parentElement) {
        parentElement.innerHTML = ''; // Clear previous tree
        const ul = document.createElement('ul');
        nodes.forEach(node => {
            const li = document.createElement('li');
            li.textContent = node.title; // Use title from metadata
            li.dataset.pageId = node.id; // Store page ID
            li.classList.add(node.type); // 'page'

            if (node.isProjectRootPage) {
                li.classList.add('project-root-page');
            }

            li.addEventListener('click', (e) => {
                e.stopPropagation();
                if (hasUnsavedChanges && currentPageState) {
                    if (!confirm('You have unsaved changes. Are you sure you want to load a new page?')) {
                        return;
                    }
                }
                loadPageContent(currentProject, node.id);
            });

            if (node.children && node.children.length > 0) {
                const childrenUl = document.createElement('ul');
                renderPageTree(node.children, childrenUl);
                li.appendChild(childrenUl);
            }
            ul.appendChild(li);
        });
        parentElement.appendChild(ul);
    }

    async function loadPageContent(projectName, pageId) {
        try {
            const response = await fetch(`/api/project/${projectName}/page/${pageId}`);
            if (!response.ok) {
                 const errData = await response.json();
                 throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json(); // data: { id, title, markdown, html, path (which is id) }
            currentPageState = { id: data.id, originalContent: data.markdown, title: data.title };
            markdownInput.value = data.markdown;
            htmlPreview.innerHTML = data.html;
            currentPageDisplay.textContent = `${projectName} / ${data.title || data.id}`;
            hasUnsavedChanges = false;
            updateSaveButtonState();
            showStatus(`Loaded page: ${data.title || data.id}`, 'info', 1500);

            // Highlight active page in tree
            document.querySelectorAll('#page-tree .active-page').forEach(el => el.classList.remove('active-page'));
            const activeLi = pageTreeContainer.querySelector(`li[data-page-id="${CSS.escape(pageId)}"]`);
            if (activeLi) {
                activeLi.classList.add('active-page');
            }

        } catch (error) {
            console.error('Error loading page content:', error);
            showStatus(`Failed to load page: ${pageId}. ${error.message}`, 'error');
            clearEditor();
            if (projectName) currentPageDisplay.textContent = `Project: ${projectName} - Error loading page.`;
        }
    }

    async function savePage() {
        if (!currentPageState || !currentProject) {
            showStatus('No page selected or project loaded.', 'error');
            return;
        }
        if (!hasUnsavedChanges) {
            showStatus('No changes to save.', 'info');
            return;
        }

        const content = markdownInput.value;
        try {
            const response = await fetch(`/api/project/${currentProject}/page/${currentPageState.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markdown: content })
            });
            if (!response.ok)  {
                 const errData = await response.json();
                 throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json(); // { message, id, newTitle }
            showStatus(result.message || 'Page saved!', 'success');
            currentPageState.originalContent = content;
            if (result.newTitle && result.newTitle !== currentPageState.title) {
                currentPageState.title = result.newTitle;
                currentPageDisplay.textContent = `${currentProject} / ${result.newTitle}`;
                // Refresh tree to reflect title change
                await fetchPageTree(currentProject);
                // Re-highlight active page after tree refresh
                const activeLi = pageTreeContainer.querySelector(`li[data-page-id="${CSS.escape(currentPageState.id)}"]`);
                if (activeLi) activeLi.classList.add('active-page');
            }
            hasUnsavedChanges = false;
            updateSaveButtonState();
        } catch (error) {
            console.error('Error saving page:', error);
            showStatus(`Failed to save page. ${error.message}`, 'error');
        }
    }

    async function createNewTopLevelPage() {
        if (!currentProject) {
            showStatus('Please select a project first.', 'error');
            return;
        }
        const title = newPageTitleInput.value.trim();
        if (!title) {
            showStatus('Please enter a page title.', 'error');
            return;
        }

        try {
            // parentId: null means it's a child of the project's rootPageId (handled by server)
            const response = await fetch(`/api/project/${currentProject}/pages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title, parentId: null })
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json(); // { message, newPageId, title, parentId, linkAddedToParentMarkdown }
            showStatus(`Page "${result.title}" created successfully!`, 'success');
            newPageTitleInput.value = '';
            await fetchPageTree(currentProject); // Refresh tree
            loadPageContent(currentProject, result.newPageId); // Load the new page
        } catch (error) {
            console.error('Error creating top-level page:', error);
            showStatus(`Failed to create page: ${error.message}`, 'error');
        }
    }

    async function createNewSubpage(subpageTitle) {
        if (!currentProject || !currentPageState) {
            showStatus('Cannot create subpage: No parent page loaded.', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/project/${currentProject}/pages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: subpageTitle,
                    parentId: currentPageState.id // Current page's ID is the parent ID
                })
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json(); // { message, newPageId, title, parentId, linkAddedToParentMarkdown }
            showStatus(`Subpage "${result.title}" created!`, 'success');

            // If a link was added to parent markdown, reload the parent page.
            if (result.linkAddedToParentMarkdown) {
                await loadPageContent(currentProject, currentPageState.id);
            }
            await fetchPageTree(currentProject); // Refresh tree to show new subpage

            // Optional: automatically navigate to the new subpage
            // loadPageContent(currentProject, result.newPageId);

        } catch (error) {
            console.error('Error creating subpage:', error);
            showStatus(`Failed to create subpage: ${error.message}`, 'error');
        }
    }


    // --- Event Listeners ---
    projectSelector.addEventListener('change', (e) => {
        if (hasUnsavedChanges && currentPageState) {
            if (!confirm('You have unsaved changes. Are you sure you want to switch projects?')) {
                projectSelector.value = currentProject || "";
                return;
            }
        }
        fetchPageTree(e.target.value);
    });

    markdownInput.addEventListener('input', (e) => {
        if (currentPageState) {
            const currentText = markdownInput.value;
            htmlPreview.innerHTML = clientConverter.makeHtml(currentText);
            hasUnsavedChanges = (currentText !== currentPageState.originalContent);
            updateSaveButtonState();
        }

        // Slash command logic
        const text = markdownInput.value;
        const cursorPos = markdownInput.selectionStart;

        if (slashCommandActive) { // Hide if '/' is removed or cursor moved
            if (cursorPos < slashCommandCursorPos || text[slashCommandCursorPos - 1] !== '/') {
                slashCommandModal.style.display = 'none';
                slashCommandActive = false;
            }
        }
        
        if (e.data === '/') { // Check if the last input character was '/'
            const charBefore = text.substring(cursorPos - 2, cursorPos - 1);
            // Trigger if '/' is at start of line or after a space/newline, or if it's the very first char
            if (charBefore === '' || charBefore === ' ' || charBefore === '\n' || (cursorPos === 1 && text.length === 1)) {
                const textareaRect = markdownInput.getBoundingClientRect();
                // Simplified positioning for modal (you might need a library for perfect caret-based positioning)
                const cursorCoords = getCursorXY(markdownInput, cursorPos);
                slashCommandModal.style.top = (textareaRect.top + cursorCoords.y + 20) + 'px'; // 20px offset for visibility
                slashCommandModal.style.left = (textareaRect.left + cursorCoords.x) + 'px';
                slashCommandModal.style.display = 'block';
                slashCommandActive = true;
                slashCommandCursorPos = cursorPos;
            }
        }
    });
    
    // Helper to get cursor X, Y relative to textarea (simplified)
    function getCursorXY(input, selectionPoint) {
        const { offsetLeft, offsetTop, scrollLeft, scrollTop, value, clientHeight, clientWidth } = input;
        const div = document.createElement('div');
        const copyStyle = getComputedStyle(input);
        for (const prop of copyStyle) {
            div.style[prop] = copyStyle[prop];
        }
        div.style.whiteSpace = 'pre-wrap'; // Important
        div.style.wordWrap = 'break-word'; // Important
        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.overflow = 'hidden'; // So scrollbars don't appear
        div.style.width = clientWidth + 'px'; // Match textarea width
        div.style.height = 'auto'; // Allow to grow

        document.body.appendChild(div);
        div.textContent = value.substring(0, selectionPoint);
        
        const span = document.createElement('span');
        span.textContent = value.substring(selectionPoint) || '.'; // Needs content to measure
        div.appendChild(span);
        
        const x = span.offsetLeft - scrollLeft;
        const y = span.offsetTop - scrollTop;
        
        document.body.removeChild(div);
        return { x, y };
    }


    slashCommandModal.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            const command = e.target.dataset.command;
            slashCommandModal.style.display = 'none';
            slashCommandActive = false;

            const text = markdownInput.value; // Remove the '/'
            markdownInput.value = text.substring(0, slashCommandCursorPos - 1) + text.substring(slashCommandCursorPos);
            markdownInput.selectionStart = markdownInput.selectionEnd = slashCommandCursorPos - 1; // Adjust cursor
            markdownInput.focus(); // Refocus textarea

            if (command === 'create-subpage') {
                if (!currentPageState) {
                    showStatus('Please load a page first to create a subpage under it.', 'error');
                    return;
                }
                const subpageTitle = prompt('Enter title for the new subpage:');
                if (subpageTitle && subpageTitle.trim() !== '') {
                    createNewSubpage(subpageTitle.trim());
                }
            }
            // Add other commands here if needed
        }
    });
    
    document.addEventListener('click', (e) => {
        if (slashCommandActive && !slashCommandModal.contains(e.target) && e.target !== markdownInput) {
            slashCommandModal.style.display = 'none';
            slashCommandActive = false;
        }
    });
    markdownInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && slashCommandActive) {
            slashCommandModal.style.display = 'none';
            slashCommandActive = false;
            e.preventDefault();
        }
    });


    savePageBtn.addEventListener('click', savePage);
    createPageBtn.addEventListener('click', createNewTopLevelPage);

    htmlPreview.addEventListener('click', async (event) => {
        const target = event.target.closest('a');
        if (target && target.hasAttribute('href') && currentProject) {
            const href = target.getAttribute('href');
            
            if (href.startsWith('page://')) {
                event.preventDefault(); // Prevent default for our special links
                if (hasUnsavedChanges && currentPageState) {
                    if (!confirm('You have unsaved changes. Are you sure you want to navigate?')) {
                        return;
                    }
                }
                const pageIdToLoad = href.substring('page://'.length);
                if (pageIdToLoad) {
                    await loadPageContent(currentProject, pageIdToLoad);
                }
            }
            // For external links, default behavior (opening in new tab or same tab) will occur
            // if event.preventDefault() is not called.
        }
    });

    window.addEventListener('beforeunload', (event) => {
        if (hasUnsavedChanges) {
            event.preventDefault();
            event.returnValue = ''; // Standard for most browsers
            return 'You have unsaved changes. Are you sure you want to leave?'; // For older browsers
        }
    });

    // --- Initialization ---
    fetchProjects();
});
// --- END OF FILE script.js ---