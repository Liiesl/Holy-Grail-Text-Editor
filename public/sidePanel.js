// sidePanel.js
export function initSidePanel(appContext) {
    const {
        pageTreeContainer,
        actionsModal, 
        showStatus,
    } = appContext;

    const projectsHeadingContainer = document.getElementById('projects-heading-container');

    // --- Action Button Creation Helper ---
    function createActionButton(iconClass, title, clickHandler) {
        const button = document.createElement('button');
        button.classList.add('sidebar-action-btn');
        button.title = title;
        const icon = document.createElement('i');
        icon.classList.add('fas', iconClass);
        button.appendChild(icon);
        button.addEventListener('click', (e) => {
            e.stopPropagation(); 
            clickHandler(e);
        });
        return button;
    }

    // --- Render Projects H2 with Actions ---
    function renderProjectsHeading() {
        projectsHeadingContainer.innerHTML = ''; 
        const wrapper = document.createElement('div');
        wrapper.classList.add('projects-h2-wrapper');

        const h2 = document.createElement('h2');
        const h2Icon = document.createElement('i');
        h2Icon.classList.add('fas', 'fa-stream'); 
        h2.appendChild(h2Icon);
        h2.appendChild(document.createTextNode('Projects'));
        wrapper.appendChild(h2);

        const actionsGroup = document.createElement('div');
        actionsGroup.classList.add('sidebar-actions-group');

        const moreProjectActionsBtn = createActionButton('fa-ellipsis-h', 'More Project Actions', (event) => {
            if (appContext.openActionsModal) {
                appContext.openActionsModal(event, 'projects-list', null, 'All Projects');
            }
        });
        const addProjectBtn = createActionButton('fa-plus', 'Create New Project', () => {
            if (appContext.createNewProject) appContext.createNewProject();
        });

        actionsGroup.appendChild(moreProjectActionsBtn);
        actionsGroup.appendChild(addProjectBtn);
        wrapper.appendChild(actionsGroup);
        projectsHeadingContainer.appendChild(wrapper);
    }


    // --- Action Modal Logic ---
    appContext.openActionsModal = (event, targetType, targetId, targetName) => {
        if (!actionsModal) return;
        const actionsList = actionsModal.querySelector('#actions-modal-list');
        if (!actionsList) return;

        actionsList.innerHTML = ''; 

        let actions = [];
        if (targetType === 'projects-list') { // Global project actions
            actions = [
                { label: 'Sort Projects A-Z', icon: 'fa-sort-alpha-down', handler: () => { console.log('Sort Projects A-Z (NYI)'); showStatus('Sort Projects A-Z (Not Yet Implemented)', 'info'); } },
            ];
        } else if (targetType === 'project') { // Actions for a specific project item
            actions = [
                { label: `Rename Project "${targetName}"`, icon: 'fa-edit', handler: () => appContext.renameProject(targetId, targetName) }, // targetId is projectName
                { label: `Duplicate Project "${targetName}"`, icon: 'fa-copy', handler: () => appContext.duplicateProject(targetId, targetName) },
                { label: `Delete Project "${targetName}"`, icon: 'fa-trash-alt', handler: () => appContext.deleteProject(targetId, targetName) },
                { label: `Sort Pages A-Z`, icon: 'fa-sort-alpha-down', handler: () => { console.log(`Sort Pages A-Z for ${targetName} (NYI)`); showStatus('Sort Pages A-Z (Not Yet Implemented)', 'info');} },
            ];
        } else if (targetType === 'page') { // Actions for a page item (sub-page or root page treated as a page)
             actions = [
                { label: `Rename Page "${targetName}"`, icon: 'fa-edit', handler: () => appContext.renamePage(appContext.currentProject, targetId, targetName) }, // targetId is pageId
                { label: `Duplicate Page "${targetName}"`, icon: 'fa-copy', handler: () => appContext.duplicatePage(appContext.currentProject, targetId, targetName) },
                { label: `Delete Page "${targetName}"`, icon: 'fa-trash-alt', handler: () => appContext.deletePage(appContext.currentProject, targetId, targetName) },
                { label: `Sort Subpages A-Z`, icon: 'fa-sort-alpha-down', handler: () => { console.log(`Sort Subpages A-Z for ${targetName} (NYI)`); showStatus('Sort Subpages A-Z (Not Yet Implemented)', 'info'); } },
            ];
        }

        if (actions.length === 0) { 
             const li = document.createElement('li');
             li.textContent = "No actions available.";
             li.style.cursor = "default";
             li.style.textAlign = "center";
             li.style.color = "var(--text-secondary)";
             actionsList.appendChild(li);
        } else {
            actions.forEach(action => {
                const li = document.createElement('li');
                const iconEl = document.createElement('i');
                iconEl.classList.add('fas', action.icon || 'fa-cog');
                li.appendChild(iconEl);
                li.appendChild(document.createTextNode(action.label));
                li.addEventListener('click', () => {
                    action.handler();
                    actionsModal.style.display = 'none'; 
                });
                actionsList.appendChild(li);
            });
        }
        actionsModal.style.display = 'block';
    };


    appContext.fetchProjects = async () => {
        renderProjectsHeading(); 
        try {
            const response = await fetch('/api/projects');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const projects = await response.json();

            pageTreeContainer.innerHTML = '';
            const projectListUl = document.createElement('ul');
            projectListUl.classList.add('project-list');

            if (projects.length === 0) {
                pageTreeContainer.innerHTML = '<p style="padding: 0 10px; font-size: 0.9em; color: var(--text-secondary);">No projects. Click "+" above to create one.</p>';
                return;
            }

            projects.forEach(projectName => {
                const projectLi = document.createElement('li');
                projectLi.classList.add('project-item');
                projectLi.dataset.projectName = projectName;

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
                const moreProjectItemActionsBtn = createActionButton('fa-ellipsis-h', 'More Project Actions', (event) => {
                    // For 'project' type, targetId is projectName, targetName is also projectName
                    if (appContext.openActionsModal) appContext.openActionsModal(event, 'project', projectName, projectName);
               });
                const addPageToProjectBtn = createActionButton('fa-plus', 'Add Page to Project', () => {
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

                projectHeaderDiv.addEventListener('click', async (e) => {
                    if (e.target.closest('.sidebar-action-btn')) return;

                    const isCurrentlyActiveProject = projectLi.classList.contains('active-project');
                    const isExpanded = projectLi.classList.contains('expanded');
                    
                    if (!isCurrentlyActiveProject && appContext.currentProject !== projectName && appContext.hasUnsavedChanges && appContext.currentPageState) {
                        if (!confirm('You have unsaved changes. Are you sure you want to switch projects? Your changes will be lost.')) {
                            return;
                        }
                        if(appContext.clearEditor) appContext.clearEditor(true);
                    }

                    if (!isCurrentlyActiveProject) {
                        const activeProjectItem = pageTreeContainer.querySelector('.project-item.active-project');
                        if (activeProjectItem) {
                            activeProjectItem.classList.remove('active-project', 'expanded');
                            activeProjectItem.querySelector('.project-pages-container').style.display = 'none';
                            const otherChevron = activeProjectItem.querySelector('.project-expand-icon');
                            if (otherChevron) otherChevron.classList.replace('fa-chevron-down', 'fa-chevron-right');
                        }
                        const allActivePageLis = pageTreeContainer.querySelectorAll('.project-pages-container li.active-page');
                        allActivePageLis.forEach(li => li.classList.remove('active-page'));

                        projectLi.classList.add('active-project', 'expanded');
                        projectPagesDiv.style.display = 'block';
                        chevronIcon.classList.replace('fa-chevron-right', 'fa-chevron-down');
                        
                        appContext.currentProject = projectName;

                        if (appContext.fetchPageTree) {
                            const fetchedRootPageId = await appContext.fetchPageTree(projectName, null, projectPagesDiv);
                            if (fetchedRootPageId && appContext.loadPageContent) {
                                if(appContext.clearEditor && (appContext.currentPageState?.id !== fetchedRootPageId || appContext.currentProject !== projectName)) {
                                     appContext.clearEditor(true);
                                }
                                await appContext.loadPageContent(projectName, fetchedRootPageId);
                            } else if (!fetchedRootPageId) {
                                console.warn(`Project ${projectName} might be empty or rootPageId not found.`);
                                if(appContext.clearEditor) appContext.clearEditor(true);
                            }
                        }
                    } else { 
                        const rootPageIdFromDataset = projectLi.dataset.rootPageId;
                        const rootPageId = (rootPageIdFromDataset && rootPageIdFromDataset !== 'null' && rootPageIdFromDataset !== 'undefined') ? rootPageIdFromDataset : null;

                        if (!rootPageId && appContext.fetchPageTree) {
                            console.warn(`Root page ID not found for active project ${projectName}, attempting to refetch tree.`);
                            const fetchedRootPageId = await appContext.fetchPageTree(projectName, null, projectPagesDiv);
                            if (fetchedRootPageId) projectLi.dataset.rootPageId = fetchedRootPageId;
                        }
                        
                        const isCurrentlyOnRootPage = rootPageId && appContext.currentPageState?.id === rootPageId && appContext.currentProject === projectName;

                        if (rootPageId && !isCurrentlyOnRootPage) {
                            if (appContext.hasUnsavedChanges && appContext.currentPageState) {
                                if (!confirm('You have unsaved changes. Are you sure you want to load the project root page? Your changes will be lost.')) {
                                    return;
                                }
                                if(appContext.clearEditor) appContext.clearEditor(true);
                            } else if (appContext.clearEditor) {
                                appContext.clearEditor(false); 
                            }

                            if (appContext.loadPageContent) {
                                await appContext.loadPageContent(projectName, rootPageId);
                                const activeSubPageLi = projectPagesDiv.querySelector('li.active-page');
                                if (activeSubPageLi) activeSubPageLi.classList.remove('active-page');
                            }
                            
                            if (!isExpanded) {
                                projectLi.classList.add('expanded');
                                projectPagesDiv.style.display = 'block';
                                chevronIcon.classList.replace('fa-chevron-right', 'fa-chevron-down');
                                if (!projectPagesDiv.hasChildNodes() && appContext.fetchPageTree) {
                                    await appContext.fetchPageTree(projectName, null, projectPagesDiv);
                                }
                            }
                        } else {
                            if (isExpanded) {
                                projectLi.classList.remove('expanded');
                                projectPagesDiv.style.display = 'none';
                                chevronIcon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                            } else { 
                                projectLi.classList.add('expanded');
                                projectPagesDiv.style.display = 'block';
                                chevronIcon.classList.replace('fa-chevron-right', 'fa-chevron-down');
                                if (!projectPagesDiv.hasChildNodes() && appContext.fetchPageTree) {
                                    await appContext.fetchPageTree(projectName, null, projectPagesDiv);
                                }
                            }
                        }
                    }
                });
                projectListUl.appendChild(projectLi);
            });
            pageTreeContainer.appendChild(projectListUl);

        } catch (error) {
            console.error('Error fetching projects:', error);
            pageTreeContainer.innerHTML = '<p>Error loading projects.</p>';
            showStatus('Failed to load projects.', 'error');
        }
    };

    const renderPageTreeInternal = (nodes, parentElement, currentProjectName) => {
        parentElement.innerHTML = '';
        if (!nodes || nodes.length === 0) {
            return;
        }
        const ul = document.createElement('ul');
        nodes.forEach(node => {
            const li = document.createElement('li');
            li.dataset.pageId = node.id;
            li.classList.add('page'); 

            const itemContentWrapper = document.createElement('div');
            itemContentWrapper.classList.add('page-item-content');

            const icon = document.createElement('i');
            icon.classList.add('fas', 'fa-file-lines');
            itemContentWrapper.appendChild(icon);

            const titleSpan = document.createElement('span');
            titleSpan.textContent = node.title;
            titleSpan.classList.add('page-title-text');
            itemContentWrapper.appendChild(titleSpan);

            const actionsGroup = document.createElement('div');
            actionsGroup.classList.add('sidebar-actions-group');
            const morePageActionsBtn = createActionButton('fa-ellipsis-h', 'More Page Actions', (event) => {
                // For 'page' type, targetId is pageId, targetName is page title
                if (appContext.openActionsModal) appContext.openActionsModal(event, 'page', node.id, node.title);
            });
            const addSubpageBtn = createActionButton('fa-plus', 'Add Subpage Here', () => {
                 if (appContext.createNewSubpage) appContext.createNewSubpage(currentProjectName, node.id, node.title);
            });
            actionsGroup.appendChild(morePageActionsBtn);
            actionsGroup.appendChild(addSubpageBtn);
            itemContentWrapper.appendChild(actionsGroup); 

            li.appendChild(itemContentWrapper);

            itemContentWrapper.addEventListener('click', async (e) => {
                if (e.target.closest('.sidebar-action-btn')) return; 

                if (appContext.hasUnsavedChanges && appContext.currentPageState && appContext.currentPageState.id !== node.id) {
                    if (!confirm('You have unsaved changes. Are you sure you want to load a new page? Your changes will be lost.')) return;
                    if(appContext.clearEditor) appContext.clearEditor(true); 
                } else if (appContext.currentPageState?.id !== node.id && appContext.clearEditor) {
                    appContext.clearEditor(false);
                }
                
                const allActivePageLis = pageTreeContainer.querySelectorAll('.project-pages-container li.active-page');
                allActivePageLis.forEach(activeLi => activeLi.classList.remove('active-page'));
                
                li.classList.add('active-page'); 

                if (appContext.loadPageContent) {
                    await appContext.loadPageContent(currentProjectName, node.id);
                } else {
                    console.error("loadPageContent not available on appContext");
                }
            });

            if (node.children && node.children.length > 0) {
                const childrenUl = document.createElement('ul');
                renderPageTreeInternal(node.children, childrenUl, currentProjectName); 
                li.appendChild(childrenUl);
            }
            ul.appendChild(li);
        });
        parentElement.appendChild(ul);
    };

    appContext.fetchPageTree = async (projectName, activePageIdToRetain = null, targetElement = null) => {
        if (!targetElement) {
            const projectItemForTree = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
            if (projectItemForTree) targetElement = projectItemForTree.querySelector('.project-pages-container');
            if (!targetElement) {
                console.error("fetchPageTree: Critical - could not find targetElement for project:", projectName);
                showStatus(`Failed to find UI container for ${projectName}`, 'error');
                return null;
            }
        }
        
        const projectItem = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);

        targetElement.innerHTML = '<li style="padding-left:10px; color: var(--text-secondary); font-style:italic;">Loading pages...</li>';
        try {
            const response = await fetch(`/api/project/${projectName}/tree`);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                // If project genuinely empty (e.g. rootPageId is null from server)
                if (response.status === 404 && errData.error && errData.error.toLowerCase().includes("root page") && errData.error.toLowerCase().includes("not found")) {
                     if (projectItem) {
                        delete projectItem.dataset.rootPageId;
                        delete projectItem.dataset.rootPageTitle;
                    }
                    targetElement.innerHTML = '<li class="no-subpages-message" style="padding-left:10px; color: var(--text-secondary); font-style:italic;">Project is empty.</li>';
                    return null; // No root page ID
                }
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const treeData = await response.json(); 
            
            if (projectItem && treeData.rootPageId) { 
                projectItem.dataset.rootPageId = treeData.rootPageId;
                projectItem.dataset.rootPageTitle = treeData.rootPageTitle;
            } else if (projectItem) {
                delete projectItem.dataset.rootPageId;
                delete projectItem.dataset.rootPageTitle;
                 if (!treeData.rootPageId && (!treeData.tree || treeData.tree.length === 0)) {
                    targetElement.innerHTML = '<li class="no-subpages-message" style="padding-left:10px; color: var(--text-secondary); font-style:italic;">Project is empty or has no pages.</li>';
                    return null;
                 }
            }


            renderPageTreeInternal(treeData.tree, targetElement, projectName);

            let pageIdToMakeActiveInTree = null;
            if (activePageIdToRetain && treeData.rootPageId && activePageIdToRetain !== treeData.rootPageId) {
                pageIdToMakeActiveInTree = activePageIdToRetain;
            } 
            else if (appContext.currentPageState?.id && treeData.rootPageId &&
                     appContext.currentPageState.id !== treeData.rootPageId && 
                     appContext.currentProject === projectName) {
                pageIdToMakeActiveInTree = appContext.currentPageState.id;
            }

            const currentActiveLiInTree = targetElement.querySelector('li.active-page');
            if(currentActiveLiInTree) currentActiveLiInTree.classList.remove('active-page');

            if (pageIdToMakeActiveInTree) {
                const activeLi = targetElement.querySelector(`li[data-page-id="${CSS.escape(pageIdToMakeActiveInTree)}"]`);
                if (activeLi) {
                    activeLi.classList.add('active-page');
                    if (targetElement.contains(activeLi)) {
                       activeLi.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                    }
                }
            }
            return treeData.rootPageId || null;
        } catch (error) {
            console.error(`Error fetching page tree for ${projectName}:`, error);
            targetElement.innerHTML = `<li style="padding-left:10px; color: var(--text-error); font-style:italic;">Error loading pages: ${error.message}</li>`;
            showStatus(`Failed to load tree for ${projectName}: ${error.message}`, 'error');
            return null; 
        }
    };

    appContext.createNewProject = async () => {
        const projectName = prompt("Enter new project name:");
        if (!projectName || projectName.trim() === "") {
            if (projectName !== null) showStatus('Project name cannot be empty.', 'warn');
            return;
        }

        try {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName: projectName.trim() })
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }
            showStatus(`Project "${result.projectName}" created successfully!`, 'success');
            await appContext.fetchProjects(); 

            const newProjectItem = Array.from(pageTreeContainer.querySelectorAll('.project-item'))
                .find(item => item.dataset.projectName === result.projectName);
            if (newProjectItem) {
                const projectHeader = newProjectItem.querySelector('.project-header');
                if (projectHeader) {
                    projectHeader.click(); 
                }
            }

        } catch (error) {
            console.error('Error creating project:', error);
            showStatus(`Failed to create project: ${error.message}`, 'error');
        }
    };

    appContext.createNewSubpage = async (projectName, parentPageId, parentNameForPrompt = 'this item') => {
        if (!projectName) {
            showStatus('Cannot create subpage: No project context.', 'error');
            return;
        }
        const promptText = parentPageId ? `Enter title for new subpage under "${parentNameForPrompt}":` : `Enter title for new page in project "${projectName}":`;
        const title = prompt(promptText);

        if (!title || title.trim() === '') {
            if (title !== null) showStatus('Page title cannot be empty.', 'warn');
            return;
        }

        if (appContext.hasUnsavedChanges) {
            if (!confirm('You have unsaved changes. Create new page and discard current changes?')) {
                return;
            }
            if(appContext.clearEditor) appContext.clearEditor(true); 
        } else if (appContext.clearEditor) {
            appContext.clearEditor(false);
        }


        try {
            const response = await fetch(`/api/project/${projectName}/pages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim(), parentId: parentPageId }) 
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }
            showStatus(`Page "${result.title}" created successfully!`, 'success');

            const currentProjectItem = pageTreeContainer.querySelector(`.project-item.active-project[data-project-name="${CSS.escape(projectName)}"]`);
            let projectPagesDiv = null;
            if (currentProjectItem) {
                projectPagesDiv = currentProjectItem.querySelector('.project-pages-container');
            } else {
                console.warn("Could not find active project item to refresh its tree after subpage creation. Performing broad refresh.");
                await appContext.fetchProjects(); 
                 const refreshedProjectItem = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
                 if(refreshedProjectItem) {
                    const header = refreshedProjectItem.querySelector('.project-header');
                    if (header) header.click();
                 }
                if (appContext.loadPageContent && result.newPageId) {
                    await appContext.loadPageContent(projectName, result.newPageId);
                }
                return;
            }
            
             if (currentProjectItem && !currentProjectItem.classList.contains('expanded')) {
                currentProjectItem.classList.add('expanded');
                if(projectPagesDiv) projectPagesDiv.style.display = 'block';
                const chevron = currentProjectItem.querySelector('.project-expand-icon');
                if (chevron) chevron.classList.replace('fa-chevron-right', 'fa-chevron-down');
            }

            await appContext.fetchPageTree(projectName, result.newPageId, projectPagesDiv);

            if (appContext.loadPageContent && result.newPageId) {
                await appContext.loadPageContent(projectName, result.newPageId);
            }
        } catch (error) {
            console.error('Error creating subpage:', error);
            showStatus(`Failed to create subpage: ${error.message}`, 'error');
        }
    };

    // --- Action Implementations ---
    appContext.deleteProject = async (projectName) => {
        if (!confirm(`Are you sure you want to delete the project "${projectName}"? This action cannot be undone.`)) {
            return;
        }
        try {
            const response = await fetch(`/api/project/${projectName}`, { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            showStatus(result.message, 'success');
            await appContext.fetchProjects(); // Refresh project list
            if (appContext.currentProject === projectName) {
                if (appContext.clearEditor) appContext.clearEditor(true);
                appContext.currentProject = null;
                appContext.currentPageState = null;
                if (appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = 'No page selected';
            }
        } catch (error) {
            console.error(`Error deleting project ${projectName}:`, error);
            showStatus(`Failed to delete project: ${error.message}`, 'error');
        }
    };

    appContext.renameProject = async (currentProjectName) => {
        const newProjectName = prompt(`Enter new name for project "${currentProjectName}":`, currentProjectName);
        if (!newProjectName || newProjectName.trim() === "" || newProjectName.trim() === currentProjectName) {
            if (newProjectName !== null && newProjectName.trim() !== currentProjectName) showStatus('Project name cannot be empty.', 'warn');
            return;
        }
        try {
            const response = await fetch(`/api/project/${currentProjectName}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newProjectName: newProjectName.trim() })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);

            showStatus(result.message, 'success');
            const previousCurrentProject = appContext.currentProject;
            const previousCurrentPageId = appContext.currentPageState?.id;
            
            await appContext.fetchProjects(); // Refresh project list

            if (previousCurrentProject === currentProjectName) {
                appContext.currentProject = result.newProjectName; // Update current project context
                // Try to re-select the same project (now under new name) and its previously open page
                const newProjectItem = Array.from(pageTreeContainer.querySelectorAll('.project-item'))
                    .find(item => item.dataset.projectName === result.newProjectName);
                if (newProjectItem) {
                    const projectHeader = newProjectItem.querySelector('.project-header');
                    if (projectHeader) {
                        // Simulate click to expand and load root, then if a subpage was open, load it
                        projectHeader.click(); // This will also set appContext.currentProject correctly
                        // If a specific page was open within this project, it will be reloaded by the click->fetchPageTree->loadPageContent chain,
                        // or if it was the root, that will be loaded.
                        // If the click handler in fetchProjects doesn't automatically re-load the previousCurrentPageId, we might need to do it here.
                        // However, the existing logic for project click should handle loading root or retaining active page.
                    }
                }
            }
        } catch (error) {
            console.error(`Error renaming project ${currentProjectName}:`, error);
            showStatus(`Failed to rename project: ${error.message}`, 'error');
        }
    };

    appContext.duplicateProject = async (projectName) => {
        const newProjectName = prompt(`Enter name for the duplicated project (from "${projectName}"):`, `${projectName} (Copy)`);
        if (!newProjectName || newProjectName.trim() === "") {
            if (newProjectName !== null) showStatus('New project name cannot be empty.', 'warn');
            return;
        }
        try {
            const response = await fetch(`/api/project/${projectName}/duplicate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newProjectName: newProjectName.trim() })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            showStatus(result.message, 'success');
            await appContext.fetchProjects(); // Refresh project list
        } catch (error) {
            console.error(`Error duplicating project ${projectName}:`, error);
            showStatus(`Failed to duplicate project: ${error.message}`, 'error');
        }
    };

    appContext.deletePage = async (projectName, pageId, pageTitle) => {
        if (!confirm(`Are you sure you want to delete the page "${pageTitle}" and all its subpages? This action cannot be undone.`)) {
            return;
        }
        try {
            const response = await fetch(`/api/project/${projectName}/page/${pageId}`, { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            showStatus(result.message, 'success');
            
            if (appContext.currentPageState && appContext.currentPageState.id === pageId) {
                if (appContext.clearEditor) appContext.clearEditor(true); // Full clear
                appContext.currentPageState = null;
                 if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = 'No page selected';

                // After deleting current page, try to load project's root page
                const projectItem = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
                if (projectItem) {
                    const rootId = projectItem.dataset.rootPageId;
                    // Fetch tree first, then load root if it exists.
                    // fetchPageTree will return the rootId if it exists
                    const newRootId = await appContext.fetchPageTree(projectName, null);
                    if (newRootId && appContext.loadPageContent) {
                        await appContext.loadPageContent(projectName, newRootId);
                    } else if (!newRootId) { // Project became empty
                        showStatus('Project is now empty.', 'info');
                    }
                } else {
                     await appContext.fetchPageTree(projectName, null); // just refresh tree
                }
            } else {
                 // Refresh tree, keeping current page active if it wasn't the one deleted
                await appContext.fetchPageTree(projectName, appContext.currentPageState?.id);
            }

        } catch (error) {
            console.error(`Error deleting page ${pageTitle}:`, error);
            showStatus(`Failed to delete page: ${error.message}`, 'error');
        }
    };

    appContext.renamePage = async (projectName, pageId, currentTitle) => {
        const newTitle = prompt(`Enter new title for page "${currentTitle}":`, currentTitle);
        if (!newTitle || newTitle.trim() === "" || newTitle.trim() === currentTitle) {
            if (newTitle !== null && newTitle.trim() !== currentTitle) showStatus('Page title cannot be empty.', 'warn');
            return;
        }
        try {
            const response = await fetch(`/api/project/${projectName}/page/${pageId}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newTitle: newTitle.trim() })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            showStatus(result.message, 'success');
            // Refresh the page tree for the current project. Pass the renamed pageId to keep it active.
            await appContext.fetchPageTree(projectName, pageId); 

            if (appContext.currentPageState && appContext.currentPageState.id === pageId) {
                // If the currently loaded page was renamed, update its state and display
                appContext.currentPageState.title = result.newTitle;
                if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = result.newTitle;
                // The server updated the H1 in the markdown, so to see change in editor, reload content
                if (appContext.loadPageContent) {
                    await appContext.loadPageContent(projectName, pageId, true); // forceReload = true
                }
            }
        } catch (error) {
            console.error(`Error renaming page ${currentTitle}:`, error);
            showStatus(`Failed to rename page: ${error.message}`, 'error');
        }
    };

    appContext.duplicatePage = async (projectName, pageId, pageTitle) => {
        try {
            const response = await fetch(`/api/project/${projectName}/page/${pageId}/duplicate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            showStatus(result.message, 'success');
            // Refresh tree, and make the new duplicated page active and load it.
            await appContext.fetchPageTree(projectName, result.newRootPageId); 
            if (appContext.loadPageContent && result.newRootPageId) {
                 if (appContext.hasUnsavedChanges) {
                    if (!confirm('You have unsaved changes. Load duplicated page and discard current changes?')) {
                        // User cancelled, but tree is refreshed.
                        return;
                    }
                    if(appContext.clearEditor) appContext.clearEditor(true); 
                } else if (appContext.clearEditor) {
                    appContext.clearEditor(false);
                }
                await appContext.loadPageContent(projectName, result.newRootPageId);
            }
        } catch (error) {
            console.error(`Error duplicating page ${pageTitle}:`, error);
            showStatus(`Failed to duplicate page: ${error.message}`, 'error');
        }
    };

}