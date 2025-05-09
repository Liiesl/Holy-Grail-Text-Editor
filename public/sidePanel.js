// sidePanel.js
export function initSidePanel(appContext) {
    const {
        pageTreeContainer,
        actionsModal, 
        showStatus,
        userProfileAreaContainer, 
    } = appContext;

    const projectsHeadingContainer = document.getElementById('projects-heading-container');

    // --- Render User Profile Area ---
    function renderUserProfileArea() {
        if (!userProfileAreaContainer) {
            console.warn("User profile area container not found in DOM.");
            return;
        }

        userProfileAreaContainer.innerHTML = ''; // Clear previous content

        if (!appContext.currentUser) {
            // Optionally, display something like "Not logged in" or leave it blank
            // For now, clearing is sufficient as the login screen will take over.
            return;
        }

        const profileAreaDiv = document.createElement('div');
        profileAreaDiv.classList.add('user-profile-area');

        const profileIcon = document.createElement('div');
        profileIcon.classList.add('profile-icon');
        profileIcon.textContent = appContext.currentUser.username ? appContext.currentUser.username.charAt(0).toUpperCase() : '?';
        profileAreaDiv.appendChild(profileIcon);

        const usernameDisplay = document.createElement('span');
        usernameDisplay.classList.add('username-display');
        usernameDisplay.textContent = appContext.currentUser.username || 'User';
        profileAreaDiv.appendChild(usernameDisplay);

        const settingsBtn = document.createElement('button');
        settingsBtn.classList.add('user-settings-btn');
        settingsBtn.title = 'User Settings';
        const settingsIcon = document.createElement('i');
        settingsIcon.classList.add('fas', 'fa-cog');
        settingsBtn.appendChild(settingsIcon);
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent any other sidebar click events
            if (appContext.openUserSettingsModal) {
                appContext.openUserSettingsModal();
            }
        });
        profileAreaDiv.appendChild(settingsBtn);

        userProfileAreaContainer.appendChild(profileAreaDiv);
    }
    appContext.renderUserProfile = renderUserProfileArea; // Expose for auth_client


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
        if (!projectsHeadingContainer) {
            console.warn("Projects heading container not found.");
            return;
        }
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


    appContext.openActionsModal = (event, targetType, targetId, targetName) => {
        if (!actionsModal) return;
        const actionsList = actionsModal.querySelector('#actions-modal-list');
        if (!actionsList) return;

        actionsList.innerHTML = ''; 

        let actions = [];
        if (targetType === 'projects-list') {
            actions = [
                { label: 'Sort Projects A-Z', icon: 'fa-sort-alpha-down', handler: () => { console.log('Sort Projects A-Z (NYI)'); showStatus('Sort Projects A-Z (Not Yet Implemented)', 'info'); } },
            ];
        } else if (targetType === 'project') {
            actions = [
                { label: `Rename Project "${targetName}"`, icon: 'fa-edit', handler: () => appContext.renameProject(targetId, targetName) },
                { label: `Duplicate Project "${targetName}"`, icon: 'fa-copy', handler: () => appContext.duplicateProject(targetId, targetName) },
                { label: `Delete Project "${targetName}"`, icon: 'fa-trash-alt', handler: () => appContext.deleteProject(targetId, targetName) },
                { label: `Sort Pages A-Z`, icon: 'fa-sort-alpha-down', handler: () => { console.log(`Sort Pages A-Z for ${targetName} (NYI)`); showStatus('Sort Pages A-Z (Not Yet Implemented)', 'info');} },
            ];
        } else if (targetType === 'page') {
             actions = [
                { label: `Rename Page "${targetName}"`, icon: 'fa-edit', handler: () => appContext.renamePage(appContext.currentProject, targetId, targetName) },
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
        renderUserProfileArea(); // Ensure user profile is up-to-date

        if (!appContext.currentUser) { 
            if (appContext.pageTreeContainer) appContext.pageTreeContainer.innerHTML = '<p style="padding: 0 10px; font-size: 0.9em; color: var(--text-secondary);">Please log in to see projects.</p>';
            if (projectsHeadingContainer) projectsHeadingContainer.innerHTML = '';
            return;
        }
        renderProjectsHeading(); 
        try {
            const response = await appContext.fetchWithAuth('/api/projects');
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const projects = await response.json();

             if (appContext.pageTreeContainer) { 
                appContext.pageTreeContainer.innerHTML = ''; 
                const projectListUl = document.createElement('ul');
                projectListUl.classList.add('project-list');

                if (projects.length === 0) {
                    appContext.pageTreeContainer.innerHTML = '<p style="padding: 0 10px; font-size: 0.9em; color: var(--text-secondary);">No projects. Click "+" above to create one.</p>';
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
                                } else if (appContext.clearEditor && appContext.currentPageState) { 
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
                appContext.pageTreeContainer.appendChild(projectListUl);
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error('Error fetching projects:', error);
                if (appContext.pageTreeContainer) appContext.pageTreeContainer.innerHTML = '<p>Error loading projects.</p>';
                showStatus('Failed to load projects.', 'error');
            } else if (error.message) { 
                console.warn(`Auth error during fetchProjects: ${error.message}`);
            }
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
                } else if (appContext.currentPageState?.id !== node.id && appContext.clearEditor && appContext.currentPageState) { 
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
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/tree`);
             if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                if (response.status === 404 && errData.error && errData.error.toLowerCase().includes("root page") && errData.error.toLowerCase().includes("not found")) {
                     if (projectItem) {
                        delete projectItem.dataset.rootPageId;
                        delete projectItem.dataset.rootPageTitle;
                    }
                    targetElement.innerHTML = '<li class="no-subpages-message" style="padding-left:10px; color: var(--text-secondary); font-style:italic;">Project is empty.</li>';
                    return null; 
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
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error fetching page tree for ${projectName}:`, error);
                targetElement.innerHTML = `<li style="padding-left:10px; color: var(--text-error); font-style:italic;">Error: ${error.message}</li>`;
                showStatus(`Failed to load tree for ${projectName}: ${error.message}`, 'error');
            } else if (error.message) { 
                console.warn(`Auth error during fetchPageTree for ${projectName}: ${error.message}`);
            }
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
            const response = await appContext.fetchWithAuth('/api/projects', {
                method: 'POST',
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
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error('Error creating project:', error);
                showStatus(`Failed to create project: ${error.message}`, 'error');
            } else if (error.message) { 
                console.warn(`Auth error during createNewProject: ${error.message}`);
            }
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
        } else if (appContext.clearEditor && appContext.currentPageState) { 
            appContext.clearEditor(false);
        }

        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/pages`, {
                method: 'POST',
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
             if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error('Error creating subpage:', error);
                showStatus(`Failed to create subpage: ${error.message}`, 'error');
            } else if (error.message) { 
                console.warn(`Auth error during createNewSubpage: ${error.message}`);
            }
        }
    };

    appContext.deleteProject = async (projectName) => {
        if (!confirm(`Are you sure you want to delete the project "${projectName}"? This action cannot be undone.`)) {
            return;
        }
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}`, { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            showStatus(result.message, 'success');
            await appContext.fetchProjects(); 
            if (appContext.currentProject === projectName) {
                if (appContext.clearEditor) appContext.clearEditor(true);
                appContext.currentProject = null;
                appContext.currentPageState = null;
                if (appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = 'No page selected';
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error deleting project ${projectName}:`, error);
                showStatus(`Failed to delete project: ${error.message}`, 'error');
            } else if (error.message) { 
                 console.warn(`Auth error during deleteProject for ${projectName}: ${error.message}`);
            }
        }
    };

    appContext.renameProject = async (currentProjectName) => {
        const newProjectNamePrompt = prompt(`Enter new name for project "${currentProjectName}":`, currentProjectName);
        if (!newProjectNamePrompt || newProjectNamePrompt.trim() === "" || newProjectNamePrompt.trim() === currentProjectName) {
            if (newProjectNamePrompt !== null && newProjectNamePrompt.trim() !== currentProjectName) showStatus('Project name cannot be empty or unchanged.', 'warn');
            return;
        }
        const newProjectName = newProjectNamePrompt.trim();
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${currentProjectName}/rename`, {
                method: 'PUT', body: JSON.stringify({ newProjectName: newProjectName })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);

            showStatus(result.message, 'success');
            const previousCurrentProject = appContext.currentProject;
            
            await appContext.fetchProjects(); 

            if (previousCurrentProject === currentProjectName) {
                const newProjectItem = Array.from(pageTreeContainer.querySelectorAll('.project-item'))
                    .find(item => item.dataset.projectName === newProjectName); 
                if (newProjectItem) {
                    appContext.currentProject = newProjectName; 
                    const projectHeader = newProjectItem.querySelector('.project-header');
                    if (projectHeader) {
                        projectHeader.click();
                    }
                } else {
                     if (appContext.clearEditor) appContext.clearEditor(true);
                     appContext.currentProject = null;
                }
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error renaming project ${currentProjectName}:`, error);
                showStatus(`Failed to rename project: ${error.message}`, 'error');
            } else if (error.message) { 
                console.warn(`Auth error during renameProject for ${currentProjectName}: ${error.message}`);
            }
        }
    };

    appContext.duplicateProject = async (projectName) => {
        const newProjectNamePrompt = prompt(`Enter name for the duplicated project (from "${projectName}"):`, `${projectName} (Copy)`);
        if (!newProjectNamePrompt || newProjectNamePrompt.trim() === "") {
            if (newProjectNamePrompt !== null) showStatus('New project name cannot be empty.', 'warn');
            return;
        }
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/duplicate`, {
                method: 'POST', body: JSON.stringify({ newProjectName: newProjectNamePrompt.trim() })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            showStatus(result.message, 'success');
            await appContext.fetchProjects(); 
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error duplicating project ${projectName}:`, error);
                showStatus(`Failed to duplicate project: ${error.message}`, 'error');
            } else if (error.message) { 
                 console.warn(`Auth error during duplicateProject for ${projectName}: ${error.message}`);
            }
        }
    };

    appContext.deletePage = async (projectName, pageId, pageTitle) => {
        if (!confirm(`Are you sure you want to delete the page "${pageTitle}" and all its subpages? This action cannot be undone.`)) {
            return;
        }
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/page/${pageId}`, { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            showStatus(result.message, 'success');
            
            let shouldLoadRoot = false;
            if (appContext.currentPageState && appContext.currentPageState.id === pageId) {
                if (appContext.clearEditor) appContext.clearEditor(true); 
                appContext.currentPageState = null;
                 if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = 'No page selected';
                shouldLoadRoot = true;
            }
            
            const newRootId = await appContext.fetchPageTree(projectName, shouldLoadRoot ? null : appContext.currentPageState?.id);
            
            if (shouldLoadRoot) {
                if (newRootId && appContext.loadPageContent) {
                    await appContext.loadPageContent(projectName, newRootId);
                } else if (!newRootId) { 
                    showStatus('Project is now empty.', 'info');
                     if(appContext.clearEditor) appContext.clearEditor(true); 
                }
            }

        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error deleting page ${pageTitle}:`, error);
                showStatus(`Failed to delete page: ${error.message}`, 'error');
            } else if (error.message) { 
                 console.warn(`Auth error during deletePage for ${pageTitle}: ${error.message}`);
            }
        }
    };

    appContext.renamePage = async (projectName, pageId, currentTitle) => {
        const newTitlePrompt = prompt(`Enter new title for page "${currentTitle}":`, currentTitle);
        if (!newTitlePrompt || newTitlePrompt.trim() === "" || newTitlePrompt.trim() === currentTitle) {
            if (newTitlePrompt !== null && newTitlePrompt.trim() !== currentTitle) showStatus('Page title cannot be empty or unchanged.', 'warn');
            return;
        }
        const newTitle = newTitlePrompt.trim();
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/page/${pageId}/rename`, {
                method: 'PUT', body: JSON.stringify({ newTitle: newTitle })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            showStatus(result.message, 'success');
            await appContext.fetchPageTree(projectName, pageId); 

            if (appContext.currentPageState && appContext.currentPageState.id === pageId) {
                appContext.currentPageState.title = result.newTitle; 
                if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `${projectName} / ${result.newTitle}`;
                if (appContext.loadPageContent) {
                    await appContext.loadPageContent(projectName, pageId);
                }
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error renaming page ${currentTitle}:`, error);
                showStatus(`Failed to rename page: ${error.message}`, 'error');
            } else if (error.message) { 
                console.warn(`Auth error during renamePage for ${currentTitle}: ${error.message}`);
            }
        }
    };

    appContext.duplicatePage = async (projectName, pageId, pageTitle) => {
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/page/${pageId}/duplicate`, { method: 'POST' });
            const result = await response.json(); 
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            showStatus(result.message, 'success');
            
            const newDuplicatedPageId = result.newPageId || result.newRootPageId; 

            if (appContext.hasUnsavedChanges) {
                if (!confirm('You have unsaved changes. Load duplicated page and discard current changes?')) {
                    await appContext.fetchPageTree(projectName, appContext.currentPageState?.id); 
                    return;
                }
                if(appContext.clearEditor) appContext.clearEditor(true); 
            } else if (appContext.clearEditor && appContext.currentPageState) {
                appContext.clearEditor(false);
            }

            await appContext.fetchPageTree(projectName, newDuplicatedPageId); 
            if (appContext.loadPageContent && newDuplicatedPageId) {
                await appContext.loadPageContent(projectName, newDuplicatedPageId);
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error duplicating page ${pageTitle}:`, error);
                showStatus(`Failed to duplicate page: ${error.message}`, 'error');
            } else if (error.message) { 
                 console.warn(`Auth error during duplicatePage for ${pageTitle}: ${error.message}`);
            }
        }
    };

    // Initial render of user profile area, in case user is already logged in
    // (e.g. from a previous session restored by checkAuthStatus)
    renderUserProfileArea();
}