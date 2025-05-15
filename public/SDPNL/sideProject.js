// sideProject.js
// No changes were requested for sideProject.js, so it remains the same.
// Ensure that `setActiveSidebarItem` and `clearSidebarActiveStates` usage in sideProject.js
// is compatible with the (now more comprehensive) versions in sidePanel.js.
// The click handler for a project page LI in `renderPageTreeInternal` typically does:
// 1. Unsaved changes prompt.
// 2. `appContext.clearEditor(false)` if switching page.
// 3. `appContext.setActiveSidebarItem(li)` (which internally calls `clearSidebarActiveStates`, then sets `active-page` and parent `active-project`).
// 4. `appContext.loadPageContent(...)`.
// This flow is consistent with how `setActiveSidebarItem` is now defined (it clears all states first).

export function initSideProjectFunctions(appContext) {
    const {
        showStatus,
        projectsSectionHeader, 
        projectsContentArea, // This should be the DOM element with id="pageTreeContainer"
    } = appContext;

    function renderProjectsSectionHeader() {
        if (!projectsSectionHeader) {
            console.warn("Projects section header container not found.");
            return;
        }
        projectsSectionHeader.innerHTML = ''; 
        if (!appContext.currentUser) {
            projectsSectionHeader.style.display = 'none';
            // projectsContentArea content for no user handled in fetchProjects
            return;
        }
        projectsSectionHeader.style.display = 'block'; 

        const wrapper = document.createElement('div');
        wrapper.classList.add('projects-h2-wrapper'); 
        const h2 = document.createElement('h2');
        const h2Icon = document.createElement('i');
        h2Icon.classList.add('fas', 'fa-stream');
        h2.appendChild(h2Icon);
        h2.appendChild(document.createTextNode(' Projects'));
        wrapper.appendChild(h2);

        const actionsGroup = document.createElement('div');
        actionsGroup.classList.add('sidebar-actions-group');
        const moreProjectActionsBtn = appContext.createActionButton('fa-ellipsis-h', 'More Project Actions', (event) => {
            if (appContext.openActionsModal) {
                appContext.openActionsModal(event, 'projects-list', null, 'All Projects');
            }
        });
        const addProjectBtn = appContext.createActionButton('fa-plus', 'Create New Project', () => {
            if (appContext.createNewProject) appContext.createNewProject();
        });
        actionsGroup.appendChild(moreProjectActionsBtn);
        actionsGroup.appendChild(addProjectBtn);
        wrapper.appendChild(actionsGroup);
        projectsSectionHeader.appendChild(wrapper);
    }
    appContext.renderProjectsSectionHeader = renderProjectsSectionHeader;

    async function selectProjectHandler(projectName, projectLiElement) {
        if (!projectLiElement) { 
            console.error(`selectProjectHandler: projectLiElement for project "${projectName}" is missing.`);
            if (showStatus) showStatus(`Could not find project "${projectName}" in sidebar.`, 'error');
            return;
        }
        if (!projectsContentArea) { 
            console.error("Projects content area (pageTreeContainer) not found for selectProjectHandler");
            return;
        }
        const projectPagesDiv = projectLiElement.querySelector('.project-pages-container');
        if (!projectPagesDiv) {
            console.error(`selectProjectHandler: projectPagesDiv not found for project "${projectName}".`);
            return;
        }


        // If switching from an announcement view
        if (appContext.currentAnnouncementContext) {
            appContext.currentAnnouncementContext = null;
            // If editor was showing announcement, clear it. Don't go to homepage.
            if (appContext.currentPageState && appContext.currentPageState.type === 'announcement' && appContext.clearEditor) {
                appContext.clearEditor(false); 
            }
        }
        // Unsaved changes in a DIFFERENT project or if current page is an announcement
        if (appContext.hasUnsavedChanges && appContext.currentPageState && 
            (appContext.currentPageState.type === 'announcement' || 
             (appContext.currentPageState.type !== 'announcement' && appContext.currentProject !== projectName) 
            )
        ) {
            if (!confirm('You have unsaved changes. Are you sure you want to switch? Your changes will be lost.')) return;
            appContext.hasUnsavedChanges = false; 
            if(appContext.updateSaveButtonState) appContext.updateSaveButtonState();
            if (appContext.clearEditor && (appContext.currentPageState.type === 'announcement' || appContext.currentProject !== projectName)) {
                appContext.clearEditor(false); // Clear if switching context
            }
        }
        
        appContext.currentView = 'project_detail'; 
        if (appContext.liveEditor) appContext.liveEditor.contentEditable = 'true';

        // Set active project in sidebar
        if(appContext.setActiveSidebarItem) appContext.setActiveSidebarItem(projectLiElement); 
        else { // Fallback
            if(appContext.clearSidebarActiveStates) appContext.clearSidebarActiveStates();
            projectLiElement.classList.add('active-project');
            appContext.currentProject = projectName; // appContext.setActiveSidebarItem also sets this
        }

        // Ensure project is visually expanded
        if (!projectLiElement.classList.contains('expanded')) {
            projectLiElement.classList.add('expanded');
            const chevron = projectLiElement.querySelector('.project-expand-icon');
            if(chevron) {
                chevron.classList.remove('fa-chevron-right');
                chevron.classList.add('fa-chevron-down');
            }
            projectPagesDiv.style.display = 'block';
        }
        
        // Load tree and root page content
        // fetchPageTree will call loadPageContent internally if a root page exists.
        if (appContext.fetchPageTree) {
            const fetchedRootPageId = await appContext.fetchPageTree(projectName, null, projectPagesDiv, true); // true = load root page
            if (fetchedRootPageId) {
                projectLiElement.dataset.rootPageId = fetchedRootPageId; // Ensure dataset is updated
            } else if (!fetchedRootPageId && appContext.currentProject === projectName) { 
                // Project is empty, fetchPageTree should handle editor state
                if(appContext.liveEditor) { 
                    appContext.liveEditor.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 20px;">Project "${projectName}" is empty.</p>`;
                    appContext.liveEditor.contentEditable = 'false'; 
                }
                if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `Project: ${projectName} - Empty`;
                appContext.currentPageState = null; 
                appContext.hasUnsavedChanges = false;
                if(appContext.updateSaveButtonState) appContext.updateSaveButtonState();
            }
        } else { 
            console.error("selectProjectHandler: fetchPageTree not available.");
            if (showStatus) showStatus("Error: Cannot fetch project pages.", "error");
        }
    }
    appContext.selectProject = selectProjectHandler;

    appContext.fetchProjects = async () => {
        if (!projectsContentArea) {
            console.error("Projects content area (pageTreeContainer) not found for fetchProjects");
            return null;
        }
        if (!appContext.currentUser) {
            projectsContentArea.innerHTML = '<p style="padding: 0 10px; font-size: 0.9em; color: var(--text-secondary);">Please log in to see projects.</p>';
            if (appContext.renderProjectsSectionHeader) appContext.renderProjectsSectionHeader(); // Handles header visibility
            return null;
        }

        if (appContext.renderProjectsSectionHeader) appContext.renderProjectsSectionHeader();
        
        projectsContentArea.innerHTML = ''; // Clear existing content
        const projectListUl = document.createElement('ul');
        projectListUl.classList.add('project-list');
        projectsContentArea.appendChild(projectListUl);

        let fetchedProjectsData = null; // Variable to store fetched data

        try {
            if (showStatus) showStatus("Loading projects...", "info", 0);
            const response = await appContext.fetchWithAuth('/api/projects');
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            fetchedProjectsData = await response.json(); // Store the fetched data
            if (showStatus) showStatus("", "info", 0);

            if (!fetchedProjectsData || fetchedProjectsData.length === 0) {
                projectListUl.innerHTML = '<li class="no-items-message" style="padding-left:10px;">No projects. Click "+" in header to create one.</li>';
            } else {
                // DOM Manipulation Logic (keep this to update the sidebar visually)
                fetchedProjectsData.forEach(projectData => {
                    const projectName = typeof projectData === 'string' ? projectData : projectData.name;
                    const rootPageId = typeof projectData === 'string' ? null : projectData.rootPageId;

                    const projectLi = document.createElement('li');
                    projectLi.classList.add('project-item');
                    projectLi.dataset.projectName = projectName;
                    if (rootPageId) projectLi.dataset.rootPageId = rootPageId;

                    const projectHeaderDiv = document.createElement('div');
                    projectHeaderDiv.classList.add('project-header');

                    const chevronIcon = document.createElement('i');
                    chevronIcon.classList.add('fas', 'fa-chevron-right', 'project-expand-icon');
                    projectHeaderDiv.appendChild(chevronIcon);

                    const projectTypeIcon = document.createElement('i');
                    projectTypeIcon.classList.add('fas', 'fa-book');
                    projectHeaderDiv.appendChild(projectTypeIcon);

                    const projectNameSpan = document.createElement('span');
                    projectNameSpan.textContent = projectName;
                    projectNameSpan.classList.add('project-name-text');
                    projectHeaderDiv.appendChild(projectNameSpan);

                    const actionsGroup = document.createElement('div');
                    actionsGroup.classList.add('sidebar-actions-group');
                    const moreProjectItemActionsBtn = appContext.createActionButton('fa-ellipsis-h', 'More Project Actions', (event) => {
                        if (appContext.openActionsModal) appContext.openActionsModal(event, 'project', projectName, projectName, projectName);
                    });
                    const addPageToProjectBtn = appContext.createActionButton('fa-plus', 'Add Page to Project', () => {
                        if (appContext.createNewSubpage) appContext.createNewSubpage(projectName, null, projectName);
                    });
                    actionsGroup.appendChild(moreProjectItemActionsBtn);
                    actionsGroup.appendChild(addPageToProjectBtn);
                    projectHeaderDiv.appendChild(actionsGroup);
                    projectLi.appendChild(projectHeaderDiv);

                    const projectPagesDiv = document.createElement('div');
                    projectPagesDiv.classList.add('project-pages-container');
                    projectPagesDiv.style.display = 'none';
                    projectLi.appendChild(projectPagesDiv);

                    chevronIcon.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const isExpanded = projectLi.classList.toggle('expanded');
                        chevronIcon.classList.toggle('fa-chevron-right', !isExpanded);
                        chevronIcon.classList.toggle('fa-chevron-down', isExpanded);
                        projectPagesDiv.style.display = isExpanded ? 'block' : 'none';

                        if (isExpanded && (projectPagesDiv.children.length === 0 || projectPagesDiv.querySelector('.no-subpages-message'))) {
                            if (appContext.fetchPageTree) {
                                await appContext.fetchPageTree(projectName, null, projectPagesDiv, false);
                            }
                        }
                    });

                    projectHeaderDiv.addEventListener('click', async (e) => {
                        if (e.target.closest('.sidebar-action-btn') || e.target.closest('.project-expand-icon')) return;
                        if (appContext.selectProject) {
                            await appContext.selectProject(projectName, projectLi);
                        }
                    });
                    // ... (end of LI creation)
                    projectListUl.appendChild(projectLi);
                });
            }
            // Return the fetched data regardless of whether it was empty or not
            return fetchedProjectsData;
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error('Error fetching projects:', error);
                // Display error in the sidebar list
                projectListUl.innerHTML = '<li class="error-message">Error loading projects.</li>';
                if (showStatus) showStatus('Failed to load projects.', 'error');
            } else if (error.message) {
                console.warn(`Auth error during fetchProjects: ${error.message}`);
            }
            return null; // Return null on error
        }
    };

    const renderPageTreeInternal = (nodes, parentUlElement, currentProjectName) => {
        parentUlElement.innerHTML = ''; 
        if (!nodes || nodes.length === 0) {
            // Only show "No pages in this project" if it's the direct container within project-pages-container
            if (parentUlElement.parentElement && parentUlElement.parentElement.classList.contains('project-pages-container')) {
                 parentUlElement.innerHTML = '<li class="no-subpages-message" style="padding-left:10px; color: var(--text-secondary); font-style:italic;">No pages in this project.</li>';
            } // For nested children (sub-pages of a page), an empty UL is fine.
            return;
        }

        nodes.forEach(node => {
            const li = document.createElement('li');
            li.dataset.pageId = node.id;
            li.classList.add('page'); 
            const hasChildren = node.children && node.children.length > 0;
            if (hasChildren) li.classList.add('has-children');

            const pageItemHeaderDiv = document.createElement('div');
            pageItemHeaderDiv.classList.add('page-item-header');
            const pageChevronIcon = document.createElement('i');
            pageChevronIcon.classList.add('fas', 'fa-chevron-right', 'page-expand-icon');
            if (!hasChildren) pageChevronIcon.style.visibility = 'hidden';
            pageItemHeaderDiv.appendChild(pageChevronIcon);
            const icon = document.createElement('i');
            icon.classList.add('fas', 'fa-file-lines', 'page-type-icon');
            pageItemHeaderDiv.appendChild(icon);
            const titleSpan = document.createElement('span');
            titleSpan.textContent = node.title;
            titleSpan.classList.add('page-title-text');
            pageItemHeaderDiv.appendChild(titleSpan);
            const actionsGroup = document.createElement('div');
            actionsGroup.classList.add('sidebar-actions-group');
            const morePageActionsBtn = appContext.createActionButton('fa-ellipsis-h', 'More Page Actions', (event) => {
                if (appContext.openActionsModal) appContext.openActionsModal(event, 'page', node.id, node.title, currentProjectName);
            });
            const addSubpageBtn = appContext.createActionButton('fa-plus', 'Add Subpage Here', () => {
                 if (appContext.createNewSubpage) appContext.createNewSubpage(currentProjectName, node.id, node.title);
            });
            actionsGroup.appendChild(morePageActionsBtn);
            actionsGroup.appendChild(addSubpageBtn);
            pageItemHeaderDiv.appendChild(actionsGroup);
            li.appendChild(pageItemHeaderDiv);
            const childrenUl = document.createElement('ul');
            childrenUl.classList.add('page-children-container');
            childrenUl.style.display = 'none';
            li.appendChild(childrenUl);

            if (hasChildren) {
                pageChevronIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isExpanded = li.classList.toggle('expanded');
                    pageChevronIcon.classList.toggle('fa-chevron-right', !isExpanded);
                    pageChevronIcon.classList.toggle('fa-chevron-down', isExpanded);
                    childrenUl.style.display = isExpanded ? 'block' : 'none';
                    if (isExpanded && childrenUl.children.length === 0) { 
                        renderPageTreeInternal(node.children, childrenUl, currentProjectName);
                    }
                });
            }
            pageItemHeaderDiv.addEventListener('click', async (e) => {
                if (e.target.closest('.sidebar-action-btn') || e.target.closest('.page-expand-icon')) return;
                if (appContext.currentPageState?.id === node.id && appContext.currentProject === currentProjectName && appContext.currentPageState?.type !== 'announcement') return; 
                
                if (appContext.hasUnsavedChanges && appContext.currentPageState && appContext.currentPageState.type !== 'announcement') {
                    if (!confirm('You have unsaved changes. Are you sure you want to load a new page? Your changes will be lost.')) return;
                    appContext.hasUnsavedChanges = false; 
                    if(appContext.updateSaveButtonState) appContext.updateSaveButtonState();
                }
                
                // If current page is from a different project, or an announcement page, or a different page in the same project, clear editor.
                if (appContext.currentPageState && 
                    (appContext.currentProject !== currentProjectName || 
                     appContext.currentPageState.id !== node.id || 
                     appContext.currentPageState.type === 'announcement') && 
                    appContext.clearEditor) {
                    appContext.clearEditor(false); 
                }
                
                // Explicitly set active states for this page and its parent project
                if (appContext.clearSidebarActiveStates) appContext.clearSidebarActiveStates();
                li.classList.add('active-page');
                const parentProjectItem = li.closest('.project-item');
                if (parentProjectItem) parentProjectItem.classList.add('active-project');
                else console.warn("Could not find parent project item to mark active");
                
                appContext.currentProject = currentProjectName; // Ensure context is set
                
                if (appContext.loadPageContent) await appContext.loadPageContent(currentProjectName, node.id); 
                else console.error("loadPageContent not available on appContext");
            });
            parentUlElement.appendChild(li);
        });
    };
    
    // Modified fetchPageTree to accept `loadRootPageContent` flag
    appContext.fetchPageTree = async (projectName, pageIdToMakeActiveInitially = null, projectPagesDivElement = null, loadRootPageContent = true) => {
        if (!projectPagesDivElement) { 
            console.error("fetchPageTree: Critical - no projectPagesDivElement provided for page tree for project:", projectName);
            if (showStatus) showStatus(`UI error for project ${projectName}`, 'error');
            return null;
        }
        
        const projectLiElement = projectPagesDivElement.closest('.project-item'); 
        if (!projectLiElement) {
            console.error("fetchPageTree: Could not find parent project item for page tree", projectName);
            return null;
        }
        
        projectPagesDivElement.innerHTML = '<ul><li style="padding-left:10px; color: var(--text-secondary); font-style:italic;">Loading pages...</li></ul>';
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/tree`);
             if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                if (response.status === 404 && errData.error && errData.error.toLowerCase().includes("root page") && errData.error.toLowerCase().includes("not found")) {
                    if (projectLiElement) { 
                        delete projectLiElement.dataset.rootPageId;
                        delete projectLiElement.dataset.rootPageTitle;
                    }
                    projectPagesDivElement.innerHTML = '<ul><li class="no-subpages-message" style="padding-left:10px; color: var(--text-secondary); font-style:italic;">Project is empty.</li></ul>';
                    if (appContext.currentProject === projectName && loadRootPageContent) { // Update editor if this is the active project
                        if(appContext.liveEditor) { appContext.liveEditor.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 20px;">Project "${projectName}" is empty.</p>`; appContext.liveEditor.contentEditable = 'false';}
                        if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `Project: ${projectName} - Empty`;
                        appContext.currentPageState = null;
                    }
                    return null; // No root page ID
                }
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const treeData = await response.json();
            
            projectPagesDivElement.innerHTML = ''; 
            const rootUl = document.createElement('ul');
            projectPagesDivElement.appendChild(rootUl); 

            if (projectLiElement && treeData.rootPageId) { 
                projectLiElement.dataset.rootPageId = treeData.rootPageId;
                projectLiElement.dataset.rootPageTitle = treeData.rootPageTitle;
            } else if (projectLiElement) {
                delete projectLiElement.dataset.rootPageId;
                delete projectLiElement.dataset.rootPageTitle;
                 if (!treeData.rootPageId && (!treeData.tree || treeData.tree.length === 0)) {
                    rootUl.innerHTML = '<li class="no-subpages-message" style="padding-left:10px; color: var(--text-secondary); font-style:italic;">Project is empty.</li>';
                     if (appContext.currentProject === projectName && loadRootPageContent) { // Update editor if this is the active project
                        if(appContext.liveEditor) { appContext.liveEditor.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 20px;">Project "${projectName}" is empty.</p>`; appContext.liveEditor.contentEditable = 'false';}
                        if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `Project: ${projectName} - Empty`;
                        appContext.currentPageState = null;
                    }
                    return null; // No root page ID
                 }
            }

            renderPageTreeInternal(treeData.tree, rootUl, projectName); 
            
            const pageToLoad = pageIdToMakeActiveInitially || (loadRootPageContent ? treeData.rootPageId : null);

            if (pageToLoad && appContext.loadPageContent) {
                await appContext.loadPageContent(projectName, pageToLoad); // loadPageContent handles active states
            } else if (pageIdToMakeActiveInitially) { // pageIdToMakeActiveInitially was given but not loaded (e.g. loadRootPageContent = false)
                 const liToActivate = rootUl.querySelector(`li.page[data-page-id="${CSS.escape(pageIdToMakeActiveInitially)}"]`);
                 if (liToActivate) {
                    if (appContext.clearSidebarActiveStates) appContext.clearSidebarActiveStates();
                    liToActivate.classList.add('active-page');
                    if (projectLiElement) projectLiElement.classList.add('active-project');
                    appContext.currentProject = projectName; // Ensure context
                    if (rootUl.contains(liToActivate)) liToActivate.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                 }
            }
            return treeData.rootPageId || null; 
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error fetching page tree for ${projectName}:`, error);
                projectPagesDivElement.innerHTML = `<ul><li style="padding-left:10px; color: var(--text-error); font-style:italic;">Error: ${error.message}</li></ul>`;
                if (showStatus) showStatus(`Failed to load tree for ${projectName}: ${error.message}`, 'error');
            } else if (error.message) console.warn(`Auth error during fetchPageTree for ${projectName}: ${error.message}`);
             if (appContext.currentProject === projectName) appContext.currentPageState = null;
            return null;
        }
    };

    appContext.createNewProject = async () => {
        const projectNameStr = prompt("Enter new project name:");
        if (!projectNameStr || projectNameStr.trim() === "") {
            if (projectNameStr !== null && showStatus) showStatus('Project name cannot be empty.', 'warn');
            return;
        }
        const newProjectName = projectNameStr.trim();
        try {
            const response = await appContext.fetchWithAuth('/api/projects', { method: 'POST', body: JSON.stringify({ projectName: newProjectName }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(`Project "${result.projectName}" created successfully!`, 'success');
            
            await appContext.fetchProjects(); 
            
            const newProjectItem = projectsContentArea.querySelector(`.project-item[data-project-name="${CSS.escape(result.projectName)}"]`);
            if (newProjectItem) {
                if (appContext.selectProject) {
                     await appContext.selectProject(result.projectName, newProjectItem);
                }
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) { console.error('Error creating project:', error); if (showStatus) showStatus(`Failed to create project: ${error.message}`, 'error');
            } else if (error.message) console.warn(`Auth error during createNewProject: ${error.message}`);
        }
    };

    appContext.createNewSubpage = async (projectName, parentPageId, parentNameForPrompt = 'this item') => {
        if (!projectName) { if (showStatus) showStatus('Cannot create subpage: No project context.', 'error'); return; }
        const promptText = parentPageId ? `Enter title for new subpage under "${parentNameForPrompt}":` : `Enter title for new page in project "${projectName}":`;
        const titleStr = prompt(promptText);
        if (!titleStr || titleStr.trim() === '') { if (titleStr !== null && showStatus) showStatus('Page title cannot be empty.', 'warn'); return; }
        const newPageTitle = titleStr.trim();
        
        if (appContext.hasUnsavedChanges && appContext.currentPageState && appContext.currentPageState.type !== 'announcement') {
            if (!confirm('You have unsaved changes. Create new page and discard current changes?')) return;
            appContext.hasUnsavedChanges = false;
            if(appContext.updateSaveButtonState) appContext.updateSaveButtonState();
        }
        
        // If currently viewing an announcement, or a different project, or even a different page in the same project,
        // we need to clear the editor before creating and loading the new page.
        if (appContext.currentPageState && (appContext.currentProject !== projectName || appContext.currentPageState.type === 'announcement') && appContext.clearEditor) {
             appContext.clearEditor(false);
        } else if (appContext.clearEditor && appContext.currentPageState && appContext.currentPageState.id !== parentPageId) { // if on a different page in same project
             appContext.clearEditor(false);
        }
        
        appContext.currentView = 'project_detail'; 
        appContext.currentAnnouncementContext = null;
        appContext.currentProject = projectName; 
        if (appContext.liveEditor) appContext.liveEditor.contentEditable = 'true';

        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/pages`, { method: 'POST', body: JSON.stringify({ title: newPageTitle, parentId: parentPageId }) });
            const result = await response.json(); 
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(`Page "${result.title}" created successfully!`, 'success');

            const projectItemLi = projectsContentArea.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
            if (!projectItemLi) {
                console.error("Cannot find project item to refresh tree for new subpage.");
                await appContext.fetchProjects(); 
                return;
            }
            const projectPagesDiv = projectItemLi.querySelector('.project-pages-container');
            if (!projectPagesDiv) {
                console.error("Cannot find project pages container for new subpage.");
                return;
            }

            // Ensure project is active and expanded
            if (!projectItemLi.classList.contains('active-project')) {
                 if(appContext.setActiveSidebarItem) appContext.setActiveSidebarItem(projectItemLi);
                 else projectItemLi.classList.add('active-project'); // Fallback
            }
            if (!projectItemLi.classList.contains('expanded')) {
                projectItemLi.classList.add('expanded');
                const chevron = projectItemLi.querySelector('.project-expand-icon');
                if (chevron) { 
                    chevron.classList.remove('fa-chevron-right');
                    chevron.classList.add('fa-chevron-down');
                }
                projectPagesDiv.style.display = 'block';
            }
            // Refresh tree. fetchPageTree will load the new page (result.newPageId) if specified
            await appContext.fetchPageTree(projectName, result.newPageId, projectPagesDiv, true); // true to load the new page
            
            // Expand parent if creating a sub-subpage and parent was collapsed
            if (parentPageId) {
                const parentPageLi = projectPagesDiv.querySelector(`li.page[data-page-id="${CSS.escape(parentPageId)}"]`);
                if (parentPageLi && parentPageLi.classList.contains('has-children') && !parentPageLi.classList.contains('expanded')) {
                    parentPageLi.classList.add('expanded');
                    const parentPageChevron = parentPageLi.querySelector('.page-item-header .page-expand-icon');
                    if (parentPageChevron) {
                        parentPageChevron.classList.remove('fa-chevron-right');
                        parentPageChevron.classList.add('fa-chevron-down');
                    }
                    const childrenContainer = parentPageLi.querySelector('.page-children-container');
                    if(childrenContainer) childrenContainer.style.display = 'block';
                      // If children of parent were not rendered, render them now
                    if (childrenContainer && childrenContainer.children.length === 0) {
                        const parentNodeData = findNodeRecursive(appContext.lastFetchedTreeDataForProject?.[projectName], parentPageId); // Requires storing tree data or re-fetching portion
                        if (parentNodeData && parentNodeData.children) {
                             renderPageTreeInternal(parentNodeData.children, childrenContainer, projectName);
                        }
                    }
                }
            }
            
            // loadPageContent is now called by fetchPageTree if result.newPageId is passed and loadRootPageContent=true

        } catch (error) {
             if (error.message && !error.message.toLowerCase().startsWith('auth error')) { console.error('Error creating subpage:', error); if (showStatus) showStatus(`Failed to create subpage: ${error.message}`, 'error');}
             else if (error.message) console.warn(`Auth error during createNewSubpage: ${error.message}`);
        }
    };

    appContext.deleteProject = async (projectName) => {
        if (!confirm(`Are you sure you want to delete the project "${projectName}"? This action cannot be undone.`)) return;
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}`, { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message, 'success');
            
            const wasCurrentProjectEditor = appContext.currentProject === projectName && appContext.currentPageState?.type !== 'announcement';
            if (wasCurrentProjectEditor) {
                if (appContext.clearEditor) appContext.clearEditor(true); 
            }
            await appContext.fetchProjects(); 
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) { console.error(`Error deleting project ${projectName}:`, error); if (showStatus) showStatus(`Failed to delete project: ${error.message}`, 'error');}
            else if (error.message) console.warn(`Auth error during deleteProject for ${projectName}: ${error.message}`);
        }
    };

    appContext.renameProject = async (currentProjectName) => {
        const newProjectNamePrompt = prompt(`Enter new name for project "${currentProjectName}":`, currentProjectName);
        if (!newProjectNamePrompt || newProjectNamePrompt.trim() === "" || newProjectNamePrompt.trim() === currentProjectName) {
            if (newProjectNamePrompt !== null && newProjectNamePrompt.trim() !== currentProjectName && showStatus) showStatus('Project name cannot be empty or unchanged.', 'warn');
            return;
        }
        const newProjectName = newProjectNamePrompt.trim();
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${currentProjectName}/rename`, { method: 'PUT', body: JSON.stringify({ newProjectName: newProjectName }) });
            const result = await response.json(); 
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message, 'success');
            
            const wasCurrentProjectEditor = appContext.currentProject === currentProjectName && appContext.currentPageState?.type !== 'announcement';
            const currentPageIdIfActive = wasCurrentProjectEditor ? appContext.currentPageState?.id : null;

            await appContext.fetchProjects(); 
            
            if (wasCurrentProjectEditor) {
                appContext.currentProject = result.newProjectName; 
                const newProjectItem = projectsContentArea.querySelector(`.project-item[data-project-name="${CSS.escape(result.newProjectName)}"]`);
                if (newProjectItem) {
                    if (appContext.selectProject) {
                        // selectProject will handle loading the root page or an empty state.
                        // If a specific page was open, we need to reload it *after* selectProject completes.
                        await appContext.selectProject(result.newProjectName, newProjectItem);
                        if (currentPageIdIfActive && appContext.loadPageContent &&
                            (!appContext.currentPageState || appContext.currentPageState.id !== currentPageIdIfActive)) {
                           await appContext.loadPageContent(result.newProjectName, currentPageIdIfActive);
                        }
                    }
                } else { 
                     if (appContext.clearEditor) appContext.clearEditor(true); 
                }
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) { console.error(`Error renaming project ${currentProjectName}:`, error); if (showStatus) showStatus(`Failed to rename project: ${error.message}`, 'error');}
            else if (error.message) console.warn(`Auth error during renameProject for ${currentProjectName}: ${error.message}`);
        }
    };

    appContext.duplicateProject = async (projectName) => {
        const newProjectNamePrompt = prompt(`Enter name for the duplicated project (from "${projectName}"):`, `${projectName} (Copy)`);
        if (!newProjectNamePrompt || newProjectNamePrompt.trim() === "") { if (newProjectNamePrompt !== null && showStatus) showStatus('New project name cannot be empty.', 'warn'); return; }
        const newDuplicatedProjectName = newProjectNamePrompt.trim();
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/duplicate`, { method: 'POST', body: JSON.stringify({ newProjectName: newDuplicatedProjectName }) });
            const result = await response.json(); 
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message, 'success');
            
            await appContext.fetchProjects(); 
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) { console.error(`Error duplicating project ${projectName}:`, error); if (showStatus) showStatus(`Failed to duplicate project: ${error.message}`, 'error');}
            else if (error.message) console.warn(`Auth error during duplicateProject for ${projectName}: ${error.message}`);
        }
    };

    appContext.deletePage = async (projectName, pageId, pageTitle) => {
        if (!confirm(`Are you sure you want to delete the page "${pageTitle}" and all its subpages? This action cannot be undone.`)) return;
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/page/${pageId}`, { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message, 'success');

            let editorNeedsUpdate = false;
            if (appContext.currentPageState && appContext.currentPageState.id === pageId && appContext.currentProject === projectName && appContext.currentPageState.type !== 'announcement') {
                editorNeedsUpdate = true;
            }
            
            const projectItemLi = projectsContentArea.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
            const projectPagesDiv = projectItemLi ? projectItemLi.querySelector('.project-pages-container') : null;

            if (projectPagesDiv && projectItemLi.classList.contains('expanded')) { 
                // Refresh tree. fetchPageTree will return new root ID and load it if current root was deleted.
                // Pass null for pageIdToMakeActiveInitially so fetchPageTree defaults to loading root if any.
                const newRootIdAfterDelete = await appContext.fetchPageTree(projectName, null, projectPagesDiv, true); 
                
                if (editorNeedsUpdate && (!newRootIdAfterDelete || appContext.currentPageState?.id !== newRootIdAfterDelete)) { 
                    // If the deleted page was in editor and is not the new root, or no new root.
                    // fetchPageTree should have handled editor for empty/new root.
                    // If somehow current page state is still the deleted one, clear it.
                    if (appContext.currentPageState?.id === pageId) {
                         if(appContext.clearEditor) appContext.clearEditor(false); // Clear editor, project context remains
                         appContext.currentPageState = null;
                         // if project became empty, fetchPageTree should have set editor to "empty project"
                         // if project has new root, fetchPageTree should have loaded it
                    }
                }
            } else if (projectItemLi) { 
                if (projectItemLi.dataset.rootPageId === pageId) { 
                    delete projectItemLi.dataset.rootPageId;
                    delete projectLiElement.dataset.rootPageTitle;
                     if (editorNeedsUpdate) { 
                         if (appContext.clearEditor) appContext.clearEditor(true); 
                    }
                }
            } else {
                 await appContext.fetchProjects(); 
            }

        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) { console.error(`Error deleting page ${pageTitle}:`, error); if (showStatus) showStatus(`Failed to delete page: ${error.message}`, 'error');}
            else if (error.message) console.warn(`Auth error during deletePage for ${pageTitle}: ${error.message}`);
        }
    };

    appContext.renamePage = async (projectName, pageId, currentTitle) => {
        const newTitlePrompt = prompt(`Enter new title for page "${currentTitle}":`, currentTitle);
        if (!newTitlePrompt || newTitlePrompt.trim() === "" || newTitlePrompt.trim() === currentTitle) {
            if (newTitlePrompt !== null && newTitlePrompt.trim() !== currentTitle && showStatus) showStatus('Page title cannot be empty or unchanged.', 'warn');
            return;
        }
        const newTitle = newTitlePrompt.trim();
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/page/${pageId}/rename`, { method: 'PUT', body: JSON.stringify({ newTitle: newTitle }) });
            const result = await response.json(); 
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message, 'success');
            
            const projectItemLi = projectsContentArea.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
            const projectPagesDiv = projectItemLi ? projectItemLi.querySelector('.project-pages-container') : null;

            if (projectPagesDiv && projectItemLi.classList.contains('expanded')) {
                 await appContext.fetchPageTree(projectName, pageId, projectPagesDiv, false); // false = don't reload content, just refresh tree and keep current page active
            }
            if (projectItemLi && projectItemLi.dataset.rootPageId === pageId) { 
                projectItemLi.dataset.rootPageTitle = result.newTitle;
            }
            
            if (appContext.currentPageState && appContext.currentPageState.id === pageId && appContext.currentProject === projectName && appContext.currentPageState.type !== 'announcement') {
                appContext.currentPageState.title = result.newTitle; 
                if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `${projectName} / ${result.newTitle}`;
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) { console.error(`Error renaming page ${currentTitle}:`, error); if (showStatus) showStatus(`Failed to rename page: ${error.message}`, 'error');}
            else if (error.message) console.warn(`Auth error during renamePage for ${currentTitle}: ${error.message}`);
        }
    };

    appContext.duplicatePage = async (projectName, pageId, pageTitle) => {
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/page/${pageId}/duplicate`, { method: 'POST' });
            const result = await response.json(); 
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message, 'success');
            
            const newDuplicatedPageId = result.newPageId || result.newRootPageId; 
            
            if (appContext.hasUnsavedChanges && appContext.currentPageState && appContext.currentPageState.type !== 'announcement') {
                if (!confirm('You have unsaved changes. Load duplicated page and discard current changes?')) {
                    // Just refresh tree if user cancels loading duplicated page
                    const projectItemForRefresh = projectsContentArea.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
                    const projectPagesDivForRefresh = projectItemForRefresh ? projectItemForRefresh.querySelector('.project-pages-container') : null;
                    if (projectPagesDivForRefresh && projectItemForRefresh.classList.contains('expanded')) {
                        // Refresh tree, keep current page active if possible
                        await appContext.fetchPageTree(projectName, appContext.currentPageState?.id, projectPagesDivForRefresh, false);
                    }
                    return;
                }
                appContext.hasUnsavedChanges = false;
                if(appContext.updateSaveButtonState) appContext.updateSaveButtonState();
            }
            
            // Clear editor if it's showing an announcement or a different project page
            if (appContext.currentPageState && (appContext.currentProject !== projectName || appContext.currentPageState.type === 'announcement') && appContext.clearEditor) {
                 appContext.clearEditor(false); 
            } else if (appContext.clearEditor && appContext.currentPageState && appContext.currentPageState.id !== newDuplicatedPageId) {
                 appContext.clearEditor(false);
            }
            
            appContext.currentView = 'project_detail'; appContext.currentAnnouncementContext = null;
            appContext.currentProject = projectName;
            if (appContext.liveEditor) appContext.liveEditor.contentEditable = 'true';
            
            const projectItemLi = projectsContentArea.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
            const projectPagesDiv = projectItemLi ? projectItemLi.querySelector('.project-pages-container') : null;

            if (projectPagesDiv && projectItemLi) { 
                if (!projectItemLi.classList.contains('expanded')) { 
                    projectItemLi.classList.add('expanded');
                    const chevron = projectItemLi.querySelector('.project-expand-icon');
                    if (chevron) { chevron.classList.remove('fa-chevron-right'); chevron.classList.add('fa-chevron-down'); }
                    projectPagesDiv.style.display = 'block';
                }
                // Refresh tree and mark new duplicated page active
                await appContext.fetchPageTree(projectName, newDuplicatedPageId, projectPagesDiv, true); 
            } else {
                await appContext.fetchProjects(); // Fallback
                 // Then select the new duplicated page after projects are fetched
                const refreshedProjectItem = projectsContentArea.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
                if (refreshedProjectItem && newDuplicatedPageId) {
                    const refreshedPagesDiv = refreshedProjectItem.querySelector('.project-pages-container');
                    if (refreshedPagesDiv) {
                        await appContext.fetchPageTree(projectName, newDuplicatedPageId, refreshedPagesDiv, true);
                    }
                }
            }
            // loadPageContent is now called by fetchPageTree
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) { console.error(`Error duplicating page ${pageTitle}:`, error); if (showStatus) showStatus(`Failed to duplicate page: ${error.message}`, 'error');}
            else if (error.message) console.warn(`Auth error during duplicatePage for ${pageTitle}: ${error.message}`);
        }
    };
}