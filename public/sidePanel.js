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


    // --- START OF MODIFIED CODE: Render Home Button ---
    function renderHomeButton() {
        // Remove existing home button container if any to prevent duplicates
        let homeButtonContainer = document.getElementById('home-button-container');
        if (homeButtonContainer) {
            homeButtonContainer.remove();
        }

        if (!appContext.currentUser) { // Only render if user is logged in
            return;
        }

        homeButtonContainer = document.createElement('div');
        homeButtonContainer.id = 'home-button-container';
        homeButtonContainer.classList.add('home-button-section'); // For styling (e.g., padding/margin)

        const homeButton = document.createElement('button');
        homeButton.classList.add('sidebar-home-btn', 'sidebar-nav-item'); // Classes for styling
        homeButton.id = 'nav-home-btn';

        const homeIcon = document.createElement('i');
        homeIcon.classList.add('fas', 'fa-home');
        homeButton.appendChild(homeIcon);
        homeButton.appendChild(document.createTextNode(' Home'));

        // Helper to clear active visual states in the sidebar
        const clearSidebarActiveStates = () => {
            if (appContext.pageTreeContainer) {
                const currentActivePageItem = appContext.pageTreeContainer.querySelector('li.page.active-page');
                if (currentActivePageItem) {
                    currentActivePageItem.classList.remove('active-page');
                }
                const currentActiveProjectItem = appContext.pageTreeContainer.querySelector('.project-item.active-project');
                if (currentActiveProjectItem) {
                    currentActiveProjectItem.classList.remove('active-project');
                }
            }
        };

        homeButton.addEventListener('click', () => {
            // Check if already on homepage effectively (content and state)
            const isAlreadyHome = appContext.liveEditor &&
                                  appContext.liveEditor.querySelector('#homepage-content') &&
                                  appContext.currentPageDisplay &&
                                  appContext.currentPageDisplay.textContent === 'Homepage' &&
                                  appContext.currentPageState === null &&
                                  appContext.currentProject === null;

            if (isAlreadyHome) {
                if(appContext.showStatus) appContext.showStatus("Already on the Homepage.", "info", 1500);
                return;
            }

            if (appContext.hasUnsavedChanges && appContext.currentPageState) {
                if (!confirm('You have unsaved changes. Are you sure you want to navigate to the homepage? Your current work will be lost.')) {
                    return; // User cancelled
                }
                // If confirmed, unsaved changes will be implicitly discarded by navigating.
                // The state cleanup below will handle hasUnsavedChanges flag.
            }

            // Proceed to navigate to Home
            if (appContext.clearEditor) {
                // clearEditor(false) clears current page, sets currentPageState = null,
                // and then calls displayHomepage() if user is logged in.
                // It does NOT nullify currentProject.
                appContext.clearEditor(false);
                appContext.currentProject = null; // Explicitly nullify project context for homepage
            } else if (appContext.displayHomepage) {
                // Fallback if clearEditor is not available
                appContext.displayHomepage();
                appContext.currentPageState = null;
                appContext.currentProject = null;
            } else {
                console.error("Cannot navigate to homepage: Required functions (clearEditor or displayHomepage) not available on appContext.");
                if (appContext.showStatus) appContext.showStatus("Critical error: Cannot navigate to homepage.", "error");
                return;
            }

            // Common state cleanup for being on homepage
            appContext.hasUnsavedChanges = false;
            if (appContext.updateSaveButtonState) {
                appContext.updateSaveButtonState();
            }
            if (appContext.autosaveTimeoutId) {
                clearTimeout(appContext.autosaveTimeoutId);
                appContext.autosaveTimeoutId = null;
            }

            clearSidebarActiveStates(); // Clear visual selection in sidebar
        });

        homeButtonContainer.appendChild(homeButton);

        // Insert after the user profile area container
        if (userProfileAreaContainer && userProfileAreaContainer.parentNode) {
            userProfileAreaContainer.insertAdjacentElement('afterend', homeButtonContainer);
        } else {
            console.warn("User profile area container not found or has no parent. Home button placement might be incorrect.");
            // Fallback: try to insert before projectsHeadingContainer
            if (projectsHeadingContainer && projectsHeadingContainer.parentNode) {
                 projectsHeadingContainer.parentNode.insertBefore(homeButtonContainer, projectsHeadingContainer);
            } else {
                console.error("Could not find a suitable place to insert the Home button in the sidebar.");
            }
        }
    }
    // --- END OF MODIFIED CODE: Render Home Button ---


    // --- Action Button Creation Helper ---
    function createActionButton(iconClass, title, clickHandler) {
        // ... (existing code - no changes)
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
        // ... (existing code - no changes)
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


    appContext.openActionsModal = (event, targetType, targetId, targetName, projectContextName = null) => {
        if (!actionsModal) return;
        const actionsList = actionsModal.querySelector('#actions-modal-list');
        const modalContentElement = actionsModal.querySelector('.modal-content') || actionsModal;
        if (!actionsList) return;

        actionsList.innerHTML = '';

        let actions = [];
        
        if (targetType === 'projects-list') {
            actions = [
                { label: 'Sort Projects A-Z', icon: 'fa-sort-alpha-down', handler: () => { console.log('Sort Projects A-Z (NYI)'); showStatus('Sort Projects A-Z (Not Yet Implemented)', 'info'); } },
            ];
        } else if (targetType === 'project') {
            // targetId is projectName, projectContextName is also projectName
            const projectNameForPeek = targetId;
            actions = [
                { label: `Rename Project "${targetName}"`, icon: 'fa-edit', handler: () => appContext.renameProject(targetId, targetName) },
                { label: `Duplicate Project "${targetName}"`, icon: 'fa-copy', handler: () => appContext.duplicateProject(targetId, targetName) },
                { label: `Delete Project "${targetName}"`, icon: 'fa-trash-alt', handler: () => appContext.deleteProject(targetId, targetName) },
                { label: `Sort Pages A-Z`, icon: 'fa-sort-alpha-down', handler: () => { console.log(`Sort Pages A-Z for ${targetName} (NYI)`); showStatus('Sort Pages A-Z (Not Yet Implemented)', 'info');} },
                { 
                    label: `Peek Root Page of "${targetName}"`, 
                    icon: 'fa-eye', 
                    handler: async () => {
                        const projectItem = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectNameForPeek)}"]`);
                        if (!projectItem) {
                            showStatus(`Project item for "${projectNameForPeek}" not found.`, 'error');
                            return;
                        }
                        let rootPageId = projectItem.dataset.rootPageId;

                        if (!rootPageId || rootPageId === 'null' || rootPageId === 'undefined') {
                            if (appContext.fetchPageTree) {
                                console.log(`Root page ID for ${projectNameForPeek} not in dataset, attempting to fetch tree.`);
                                rootPageId = await appContext.fetchPageTree(projectNameForPeek); // Fetches tree and returns rootPageId
                            } else {
                                showStatus('Cannot determine root page: fetchPageTree not available.', 'warn');
                                return;
                            }
                        }

                        if (rootPageId && rootPageId !== 'null' && rootPageId !== 'undefined') {
                            if (appContext.currentPageState && appContext.currentPageState.id === rootPageId && appContext.currentProject === projectNameForPeek) {
                                showStatus('Cannot peek the currently active page. Open another page first.', 'info');
                                return;
                            }
                            if (appContext.openPageInPeekMode) {
                                appContext.openPageInPeekMode(rootPageId, projectNameForPeek);
                            } else {
                                console.warn('openPageInPeekMode function not available on appContext.');
                                showStatus('Peek feature not available.', 'error');
                            }
                        } else {
                            showStatus(`Project "${projectNameForPeek}" has no root page or is empty.`, 'info');
                        }
                    } 
                },
            ];
        } else if (targetType === 'page') {
            // targetId is pageId, projectContextName is the project this page belongs to
            actions = [
                { label: `Rename Page "${targetName}"`, icon: 'fa-edit', handler: () => appContext.renamePage(projectContextName, targetId, targetName) },
                { label: `Duplicate Page "${targetName}"`, icon: 'fa-copy', handler: () => appContext.duplicatePage(projectContextName, targetId, targetName) },
                { label: `Delete Page "${targetName}"`, icon: 'fa-trash-alt', handler: () => appContext.deletePage(projectContextName, targetId, targetName) },
                { label: `Sort Subpages A-Z`, icon: 'fa-sort-alpha-down', handler: () => { console.log(`Sort Subpages A-Z for ${targetName} (NYI)`); showStatus('Sort Subpages A-Z (Not Yet Implemented)', 'info'); } },
                { 
                    label: `Peek Page "${targetName}"`, 
                    icon: 'fa-eye', 
                    handler: () => {
                        if (appContext.currentPageState && appContext.currentPageState.id === targetId && appContext.currentProject === projectContextName) {
                            showStatus('Cannot peek the currently active page. Open another page first.', 'info');
                            return;
                        }
                        if (appContext.openPageInPeekMode) {
                            appContext.openPageInPeekMode(targetId, projectContextName);
                        } else {
                            console.warn('openPageInPeekMode function not available on appContext.');
                            showStatus('Peek feature not available.', 'error');
                        }
                    }
                },
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
                    // Clean up the global click listener
                    if (appContext.closeActionsModalOnClickOutside) {
                        window.removeEventListener('click', appContext.closeActionsModalOnClickOutside, true);
                        delete appContext.closeActionsModalOnClickOutside;
                    }
                });
                actionsList.appendChild(li);
            });
        }

        // Positioning logic
        const button = event.currentTarget; // The button that was clicked
        const buttonRect = button.getBoundingClientRect();

        // Temporarily display to measure, but keep invisible
        actionsModal.style.visibility = 'hidden';
        actionsModal.style.display = 'block';

        let modalTop = buttonRect.bottom + 2; // 2px offset below button
        let modalLeft = buttonRect.left;

        // Adjust vertical position if it overflows viewport bottom
        if (modalTop + actionsModal.offsetHeight > window.innerHeight - 10) { // 10px margin from viewport edge
            modalTop = buttonRect.top - actionsModal.offsetHeight - 2; // Position above button
        }
        // Ensure it's not off-screen at the top
        if (modalTop < 10) {
            modalTop = 10;
        }
        actionsModal.style.top = `${modalTop}px`;

        // Adjust horizontal position if it overflows viewport right
        if (modalLeft + actionsModal.offsetWidth > window.innerWidth - 10) {
            modalLeft = window.innerWidth - actionsModal.offsetWidth - 10; // Keep 10px from right edge
        }
        // Ensure it's not off-screen at the left
        if (modalLeft < 10) {
            modalLeft = 10;
        }
        actionsModal.style.left = `${modalLeft}px`;
        
        // Make it visible now that it's positioned
        actionsModal.style.visibility = 'visible';


        // Add a one-time click listener to the window to close the modal if clicked outside
        // If there's an old listener, remove it first (defensive)
        if (appContext.closeActionsModalOnClickOutside) {
            window.removeEventListener('click', appContext.closeActionsModalOnClickOutside, true);
        }

        appContext.closeActionsModalOnClickOutside = (e) => {
            // Use modalContentElement for contains check, as actionsModal itself might be larger due to box model details.
            if (!modalContentElement.contains(e.target)) {
                actionsModal.style.display = 'none';
                window.removeEventListener('click', appContext.closeActionsModalOnClickOutside, true);
                delete appContext.closeActionsModalOnClickOutside; // Clean up the stored function
            }
        };

        // Use a timeout to prevent the same click that opened the modal from immediately closing it
        setTimeout(() => {
            window.addEventListener('click', appContext.closeActionsModalOnClickOutside, true); // Use capture phase
        }, 0);
    };
    
    // --- Helper to manage active state in sidebar ---
    function setActiveSidebarItem(itemElement) {
        if (!pageTreeContainer || !itemElement) return;

        // Deselect any currently active project item
        const currentActiveProjectItem = pageTreeContainer.querySelector('.project-item.active-project');
        if (currentActiveProjectItem) {
            currentActiveProjectItem.classList.remove('active-project');
        }

        // Deselect any currently active page item
        const currentActivePageItem = pageTreeContainer.querySelector('li.page.active-page');
        if (currentActivePageItem) {
            currentActivePageItem.classList.remove('active-page');
        }

        if (itemElement.classList.contains('project-item')) {
            itemElement.classList.add('active-project');
            appContext.currentProject = itemElement.dataset.projectName;
        } else if (itemElement.classList.contains('page')) {
            itemElement.classList.add('active-page');
            const parentProjectItem = itemElement.closest('.project-item');
            if (parentProjectItem) {
                parentProjectItem.classList.add('active-project'); // Ensure parent project is also visually active
                appContext.currentProject = parentProjectItem.dataset.projectName;
            } else {
                console.warn("Active page is not inside a project item container. Cannot set current project from page's parent.");
            }
        }
    }

    // --- Select Project Handler ---
    async function selectProjectHandler(projectName, projectLiElement) {
        if (!projectLiElement) {
            console.error(`selectProjectHandler: projectLiElement for project "${projectName}" is missing.`);
            if (showStatus) showStatus(`Could not find project "${projectName}" in the sidebar.`, 'error');
            return;
        }

        const isProjectAlreadyActive = appContext.currentProject === projectName;
        const rootPageIdFromDataset = projectLiElement.dataset.rootPageId;
        const rootPageId = (rootPageIdFromDataset && rootPageIdFromDataset !== 'null' && rootPageIdFromDataset !== 'undefined') ? rootPageIdFromDataset : null;
        // Check if the currently displayed page (if any) is the root page of the project being selected
        const isCurrentlyOnThisProjectsRootPage = isProjectAlreadyActive && rootPageId && appContext.currentPageState?.id === rootPageId;

        if (isProjectAlreadyActive && isCurrentlyOnThisProjectsRootPage) {
            if (showStatus) showStatus(`Project ${projectName} is already active and its main page is displayed.`, 'info');
            return; 
        }

        if (appContext.hasUnsavedChanges && appContext.currentPageState) {
            if (!confirm('You have unsaved changes. Are you sure you want to switch context? Your changes will be lost.')) {
                return;
            }
            if (appContext.clearEditor) appContext.clearEditor(true); // true for fullClear will reset project, then displayHomepage if logged in
        } else if (appContext.currentPageState && appContext.clearEditor) { 
            // If no unsaved changes but a page is loaded, clear it before loading another project's page.
            // clearEditor(false) clears current page, then calls displayHomepage if user is logged in.
            // This might not be desired if we are immediately loading another page.
            // However, setActiveSidebarItem and loadPageContent will handle the new state.
             appContext.clearEditor(false); // Clears current page, sets currentPageState to null.
        }
        
        setActiveSidebarItem(projectLiElement); // Sets appContext.currentProject and active visual state

        // Load Root Page Content or fetch tree if root ID is unknown
        if (rootPageId) {
            if (appContext.loadPageContent) {
                await appContext.loadPageContent(projectName, rootPageId);
            } else {
                 console.error("selectProjectHandler: loadPageContent not available on appContext");
                 if (showStatus) showStatus("Error: Cannot load page content.", "error");
            }
        } else {
            const projectPagesDiv = projectLiElement.querySelector('.project-pages-container');
            if (!projectPagesDiv) {
                console.error(`selectProjectHandler: projectPagesDiv not found for project "${projectName}".`);
                if (showStatus) showStatus(`UI error for project "${projectName}".`, 'error');
                return;
            }

            if (appContext.fetchPageTree) {
                // Fetch tree (which populates projectPagesDiv and dataset.rootPageId) and get the rootPageId
                const fetchedRootPageId = await appContext.fetchPageTree(projectName, null, projectPagesDiv);
                if (fetchedRootPageId && appContext.loadPageContent) {
                    await appContext.loadPageContent(projectName, fetchedRootPageId);
                } else if (!fetchedRootPageId) {
                    // Project is empty or error fetching tree
                    console.warn(`Project ${projectName} is empty or rootPageId not found after fetchPageTree.`);
                    // appContext.clearEditor(false) would clear editor and display homepage.
                    // Since we are in a project context, maybe just show "Project is empty".
                    if(appContext.liveEditor) { // Ensure liveEditor exists
                        appContext.liveEditor.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 20px;">Project "${projectName}" is empty.</p>`;
                        appContext.liveEditor.contentEditable = 'false';
                        appContext.liveEditor.classList.remove('is-empty');
                        appContext.liveEditor.removeAttribute('data-placeholder');
                    }
                    if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `Project: ${projectName} - Empty`;
                    appContext.currentPageState = null; // Explicitly clear current page state
                    appContext.hasUnsavedChanges = false;
                    if(appContext.updateSaveButtonState) appContext.updateSaveButtonState();

                } else if (fetchedRootPageId && !appContext.loadPageContent) {
                     console.error("selectProjectHandler: loadPageContent not available after fetching tree.");
                     if (showStatus) showStatus("Error: Cannot load page content after fetching tree.", "error");
                }
            } else {
                 console.error("selectProjectHandler: fetchPageTree not available on appContext");
                 if (showStatus) showStatus("Error: Cannot fetch project pages.", "error");
            }
        }
    }
    appContext.selectProject = selectProjectHandler; // Expose the handler


    appContext.fetchProjects = async () => {
        renderUserProfileArea(); // Render user profile (or clear if not logged in)
        renderHomeButton();      // MODIFIED: Render home button (or clear if not logged in)

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
                    // No return here, as fetchProjects might still need to do other things.
                    // But for the project list itself, this is the end.
                } else { // Only iterate if projects exist
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
                            if (appContext.openActionsModal) appContext.openActionsModal(event, 'project', projectName, projectName, projectName);
                       });
                        const addPageToProjectBtn = createActionButton('fa-plus', 'Add Page to Project', () => {
                            if (appContext.createNewSubpage) appContext.createNewSubpage(projectName, null, projectName);
                        });
                        actionsGroup.appendChild(moreProjectItemActionsBtn);
                        actionsGroup.appendChild(addPageToProjectBtn);
                        projectHeaderDiv.appendChild(actionsGroup);

                        projectLi.appendChild(projectHeaderDiv);

                        const projectPagesDiv = document.createElement('div'); // This is the container for the UL of pages
                        projectPagesDiv.classList.add('project-pages-container');
                        projectPagesDiv.style.display = 'none'; // Collapsed by default
                        projectLi.appendChild(projectPagesDiv);

                        // Project Chevron Click Listener (handles expansion/collapse)
                        chevronIcon.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            const isExpanded = projectLi.classList.toggle('expanded');
                            chevronIcon.classList.toggle('fa-chevron-right', !isExpanded);
                            chevronIcon.classList.toggle('fa-chevron-down', isExpanded);
                            projectPagesDiv.style.display = isExpanded ? 'block' : 'none';

                            if (isExpanded && projectPagesDiv.children.length === 0) { // Only fetch if not already populated
                                await appContext.fetchPageTree(projectName, null, projectPagesDiv);
                            }
                        });

                        // Project Header Click Listener (handles selection and loading root page)
                        projectHeaderDiv.addEventListener('click', async (e) => {
                            if (e.target.closest('.sidebar-action-btn') || e.target.closest('.project-expand-icon')) return;
                            // Use the new selectProjectHandler
                            if (appContext.selectProject) {
                                await appContext.selectProject(projectName, projectLi);
                            } else {
                                console.error("Project header click: appContext.selectProject not defined.");
                                if(showStatus) showStatus("Critical error: Cannot switch projects.", "error");
                            }
                        });
                        projectListUl.appendChild(projectLi);
                    });
                appContext.pageTreeContainer.appendChild(projectListUl);
                }
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error('Error fetching projects:', error);
                if (appContext.pageTreeContainer) appContext.pageTreeContainer.innerHTML = '<p>Error loading projects.</p>';
                if (showStatus) showStatus('Failed to load projects.', 'error');
            } else if (error.message) {
                console.warn(`Auth error during fetchProjects: ${error.message}`);
            }
        }
    };

    const renderPageTreeInternal = (nodes, parentUlElement, currentProjectName) => {
        parentUlElement.innerHTML = ''; // Clear previous content of the UL
        if (!nodes || nodes.length === 0) {
            return;
        }

        nodes.forEach(node => {
            const li = document.createElement('li');
            li.dataset.pageId = node.id;
            li.classList.add('page');
            const hasChildren = node.children && node.children.length > 0;
            if (hasChildren) {
                li.classList.add('has-children');
            }

            const pageItemHeaderDiv = document.createElement('div');
            pageItemHeaderDiv.classList.add('page-item-header');

            const pageChevronIcon = document.createElement('i');
            pageChevronIcon.classList.add('fas', 'fa-chevron-right', 'page-expand-icon');
            if (!hasChildren) {
                pageChevronIcon.style.visibility = 'hidden'; // Keep space for alignment or hide completely
            }
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
            const morePageActionsBtn = createActionButton('fa-ellipsis-h', 'More Page Actions', (event) => {
                if (appContext.openActionsModal) appContext.openActionsModal(event, 'page', node.id, node.title, currentProjectName);
            });
            const addSubpageBtn = createActionButton('fa-plus', 'Add Subpage Here', () => {
                 if (appContext.createNewSubpage) appContext.createNewSubpage(currentProjectName, node.id, node.title);
            });
            actionsGroup.appendChild(morePageActionsBtn);
            actionsGroup.appendChild(addSubpageBtn);
            pageItemHeaderDiv.appendChild(actionsGroup);

            li.appendChild(pageItemHeaderDiv);

            const childrenUl = document.createElement('ul');
            childrenUl.classList.add('page-children-container');
            childrenUl.style.display = 'none'; // Collapsed by default
            li.appendChild(childrenUl);

            // Page Chevron Click Listener (handles expansion/collapse of subpages)
            if (hasChildren) {
                pageChevronIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isExpanded = li.classList.toggle('expanded');
                    pageChevronIcon.classList.toggle('fa-chevron-right', !isExpanded);
                    pageChevronIcon.classList.toggle('fa-chevron-down', isExpanded);
                    childrenUl.style.display = isExpanded ? 'block' : 'none';
                    if (isExpanded && childrenUl.children.length === 0) { // Only render if not already rendered
                        renderPageTreeInternal(node.children, childrenUl, currentProjectName);
                    }
                });
            }

            // Page Header Click Listener (for selection and loading content)
            pageItemHeaderDiv.addEventListener('click', async (e) => {
                if (e.target.closest('.sidebar-action-btn') || e.target.closest('.page-expand-icon')) return;

                if (appContext.currentPageState?.id === node.id && appContext.currentProject === currentProjectName) {
                    return; // Clicking already active page, do nothing for content load
                }

                if (appContext.hasUnsavedChanges && appContext.currentPageState) {
                    if (!confirm('You have unsaved changes. Are you sure you want to load a new page? Your changes will be lost.')) return;
                    if(appContext.clearEditor) appContext.clearEditor(false); // Clear current page, then displayHomepage (will be overridden by loadPageContent)
                } else if (appContext.currentPageState && appContext.clearEditor) { // No unsaved changes, but a page is loaded
                    appContext.clearEditor(false); // Clear current page
                }


                setActiveSidebarItem(li); // Sets active visual state and appContext.currentProject

                if (appContext.loadPageContent) {
                    await appContext.loadPageContent(appContext.currentProject, node.id); // currentProject is set by setActiveSidebarItem
                } else {
                    console.error("loadPageContent not available on appContext");
                }
            });
            parentUlElement.appendChild(li);
        });
    };

    appContext.fetchPageTree = async (projectName, pageIdToScrollTo = null, projectPagesDivElement = null) => {
        let containerForTreeUl = projectPagesDivElement; // This is the DIV (e.g., .project-pages-container)
        if (!containerForTreeUl) {
            const projectItemForTree = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
            if (projectItemForTree) containerForTreeUl = projectItemForTree.querySelector('.project-pages-container');
            if (!containerForTreeUl) {
                console.error("fetchPageTree: Critical - could not find container for page tree for project:", projectName);
                if (showStatus) showStatus(`Failed to find UI container for ${projectName}`, 'error');
                return null;
            }
        }
        
        const projectItem = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
        
        // Display loading message inside the container, will be replaced by the UL or error
        containerForTreeUl.innerHTML = '<ul><li style="padding-left:10px; color: var(--text-secondary); font-style:italic;">Loading pages...</li></ul>';
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/tree`);
             if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                if (response.status === 404 && errData.error && errData.error.toLowerCase().includes("root page") && errData.error.toLowerCase().includes("not found")) {
                     if (projectItem) {
                        delete projectItem.dataset.rootPageId;
                        delete projectItem.dataset.rootPageTitle;
                    }
                    containerForTreeUl.innerHTML = '<ul><li class="no-subpages-message" style="padding-left:10px; color: var(--text-secondary); font-style:italic;">Project is empty.</li></ul>';
                    return null;
                }
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const treeData = await response.json();
            
            containerForTreeUl.innerHTML = ''; // Clear loading message
            const rootUl = document.createElement('ul');
            // rootUl.classList.add('project-root-page-list'); // Optional: if specific styling for the first UL is needed
            containerForTreeUl.appendChild(rootUl); // Add the UL to the container DIV

            if (projectItem && treeData.rootPageId) {
                projectItem.dataset.rootPageId = treeData.rootPageId;
                projectItem.dataset.rootPageTitle = treeData.rootPageTitle;
            } else if (projectItem) {
                delete projectItem.dataset.rootPageId;
                delete projectItem.dataset.rootPageTitle;
                 if (!treeData.rootPageId && (!treeData.tree || treeData.tree.length === 0)) {
                    rootUl.innerHTML = '<li class="no-subpages-message" style="padding-left:10px; color: var(--text-secondary); font-style:italic;">Project is empty or has no pages.</li>';
                    return null;
                 }
            }

            renderPageTreeInternal(treeData.tree, rootUl, projectName); // Pass the new rootUl

            // Scroll the specified page into view if requested
            if (pageIdToScrollTo) {
                const liToScroll = rootUl.querySelector(`li.page[data-page-id="${CSS.escape(pageIdToScrollTo)}"]`);
                if (liToScroll && rootUl.contains(liToScroll)) { // Ensure element is within this UL
                   liToScroll.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                }
            }
            return treeData.rootPageId || null;
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error fetching page tree for ${projectName}:`, error);
                containerForTreeUl.innerHTML = `<ul><li style="padding-left:10px; color: var(--text-error); font-style:italic;">Error: ${error.message}</li></ul>`;
                if (showStatus) showStatus(`Failed to load tree for ${projectName}: ${error.message}`, 'error');
            } else if (error.message) {
                console.warn(`Auth error during fetchPageTree for ${projectName}: ${error.message}`);
            }
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
            const response = await appContext.fetchWithAuth('/api/projects', {
                method: 'POST',
                body: JSON.stringify({ projectName: newProjectName })
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }
            
            if (showStatus) showStatus(`Project "${result.projectName}" created successfully!`, 'success');
            await appContext.fetchProjects(); // Refresh the entire project list

            // Find and click the new project's header to select it and load its (empty) root.
            const newProjectItem = Array.from(pageTreeContainer.querySelectorAll('.project-item'))
                .find(item => item.dataset.projectName === result.projectName);
            if (newProjectItem && appContext.selectProject) {
                 await appContext.selectProject(result.projectName, newProjectItem);
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error('Error creating project:', error);
                if (showStatus) showStatus(`Failed to create project: ${error.message}`, 'error');
            } else if (error.message) {
                console.warn(`Auth error during createNewProject: ${error.message}`);
            }
        }
    };

    appContext.createNewSubpage = async (projectName, parentPageId, parentNameForPrompt = 'this item') => {
        if (!projectName) {
            if (showStatus) showStatus('Cannot create subpage: No project context.', 'error');
            return;
        }
        const promptText = parentPageId ? `Enter title for new subpage under "${parentNameForPrompt}":` : `Enter title for new page in project "${projectName}":`;
        const titleStr = prompt(promptText);

        if (!titleStr || titleStr.trim() === '') {
            if (titleStr !== null && showStatus) showStatus('Page title cannot be empty.', 'warn');
            return;
        }
        const newPageTitle = titleStr.trim();

        if (appContext.hasUnsavedChanges && appContext.currentPageState) {
            if (!confirm('You have unsaved changes. Create new page and discard current changes?')) {
                return;
            }
            if(appContext.clearEditor) appContext.clearEditor(false); // Clear current page, then displayHomepage (will be overridden by loadPageContent)
        } else if (appContext.currentPageState && appContext.clearEditor) { // No unsaved changes, but a page is loaded
            appContext.clearEditor(false); // Clear current page
        }


        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/pages`, {
                method: 'POST',
                body: JSON.stringify({ title: newPageTitle, parentId: parentPageId })
            });
            const result = await response.json(); // Expects { newPageId, title }
            if (!response.ok) {
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }
            if (showStatus) showStatus(`Page "${result.title}" created successfully!`, 'success');

            const projectItem = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
            let projectPagesDiv = projectItem ? projectItem.querySelector('.project-pages-container') : null;

            if (!projectItem || !projectPagesDiv) {
                console.warn("Could not find project item or pages container to refresh after subpage creation. Performing broad refresh.");
                await appContext.fetchProjects(); // Full refresh
                // After full refresh, try to find the project item again and click its header to activate
                const refreshedProjectItem = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
                if (refreshedProjectItem) {
                    if (appContext.selectProject) await appContext.selectProject(projectName, refreshedProjectItem); // Activate project
                    projectPagesDiv = refreshedProjectItem.querySelector('.project-pages-container'); // Update projectPagesDiv
                }
            } else {
                 // Step 1: Ensure project is expanded. Click its chevron if not.
                if (!projectItem.classList.contains('expanded')) {
                    const projectChevron = projectItem.querySelector('.project-expand-icon');
                    if (projectChevron) {
                        // Manually trigger expansion logic which includes fetchPageTree
                        projectItem.classList.add('expanded');
                        projectChevron.classList.remove('fa-chevron-right');
                        projectChevron.classList.add('fa-chevron-down');
                        projectPagesDiv.style.display = 'block';
                        await appContext.fetchPageTree(projectName, result.newPageId, projectPagesDiv); // Fetch tree for expanded project
                    }
                } else {
                    // Project already expanded, just refresh its tree
                    await appContext.fetchPageTree(projectName, result.newPageId, projectPagesDiv);
                }
            }
            
            // Step 2: If the new page has a parent page, ensure that parent page is expanded.
            if (parentPageId && projectPagesDiv) {
                const parentPageLi = projectPagesDiv.querySelector(`li.page[data-page-id="${CSS.escape(parentPageId)}"]`);
                if (parentPageLi && parentPageLi.classList.contains('has-children') && !parentPageLi.classList.contains('expanded')) {
                    const parentPageChevron = parentPageLi.querySelector('.page-item-header .page-expand-icon');
                    if (parentPageChevron) {
                        parentPageLi.classList.add('expanded');
                        parentPageChevron.classList.remove('fa-chevron-right');
                        parentPageChevron.classList.add('fa-chevron-down');
                        const childrenContainer = parentPageLi.querySelector('.page-children-container');
                        if(childrenContainer) childrenContainer.style.display = 'block';
                    }
                }
            }

            // Step 3: Load the new page content and set it as active in the sidebar.
            if (appContext.loadPageContent && result.newPageId) {
                await appContext.loadPageContent(projectName, result.newPageId);
                // setActiveSidebarItem will be called by loadPageContent's UI update for active page in tree
            }
        } catch (error) {
             if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error('Error creating subpage:', error);
                if (showStatus) showStatus(`Failed to create subpage: ${error.message}`, 'error');
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
            
            if (showStatus) showStatus(result.message, 'success');
            const wasCurrentProject = appContext.currentProject === projectName;
            
            if (wasCurrentProject) {
                // If current project is deleted, clear editor and go to homepage
                if (appContext.clearEditor) appContext.clearEditor(true); // true for full clear, sets project to null
                appContext.currentProject = null; // Ensure it's null
                appContext.currentPageState = null;
                // clearEditor(true) calls displayHomepage if user logged in.
                // No need to explicitly set currentPageDisplay here.
                const homeButton = document.getElementById('nav-home-btn');
                if(homeButton) homeButton.click(); // Simulate click on home to clear sidebar states
            }
            await appContext.fetchProjects(); // Refresh project list

        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error deleting project ${projectName}:`, error);
                if (showStatus) showStatus(`Failed to delete project: ${error.message}`, 'error');
            } else if (error.message) {
                 console.warn(`Auth error during deleteProject for ${projectName}: ${error.message}`);
            }
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
            const response = await appContext.fetchWithAuth(`/api/project/${currentProjectName}/rename`, {
                method: 'PUT', body: JSON.stringify({ newProjectName: newProjectName })
            });
            const result = await response.json(); 
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);

            if (showStatus) showStatus(result.message, 'success');
            const wasCurrentProject = appContext.currentProject === currentProjectName;
            const currentPageIdIfActive = wasCurrentProject ? appContext.currentPageState?.id : null;
            
            await appContext.fetchProjects(); // Re-renders project list

            if (wasCurrentProject) {
                appContext.currentProject = result.newProjectName; // Update internal currentProject name
                // Try to re-select the same project (now with new name) and page if it was active
                const newProjectItem = Array.from(pageTreeContainer.querySelectorAll('.project-item'))
                    .find(item => item.dataset.projectName === result.newProjectName);

                if (newProjectItem) {
                    setActiveSidebarItem(newProjectItem); // Visually activate project
                    if (currentPageIdIfActive && appContext.loadPageContent) {
                        // Expand the project if needed to show its pages (fetchPageTree does this)
                        if (!newProjectItem.classList.contains('expanded')) {
                             const chevronIcon = newProjectItem.querySelector('.project-expand-icon');
                             if(chevronIcon) chevronIcon.click(); // This will also fetch tree
                        }
                        // Then load the previously active page
                        await appContext.loadPageContent(result.newProjectName, currentPageIdIfActive);
                    } else if (appContext.selectProject) { // If no specific page was active, select project (loads its root)
                         await appContext.selectProject(result.newProjectName, newProjectItem);
                    }
                } else {
                     // Should not happen if fetchProjects worked, but as a fallback:
                     if (appContext.clearEditor) appContext.clearEditor(true); // Go to homepage
                     appContext.currentProject = null;
                     appContext.currentPageState = null;
                }
                 if (appContext.currentPageDisplay && appContext.currentPageState) {
                    appContext.currentPageDisplay.textContent = `${result.newProjectName} / ${appContext.currentPageState.title}`;
                } else if (appContext.currentPageDisplay) {
                    appContext.currentPageDisplay.textContent = `Project: ${result.newProjectName} - No page selected`;
                }
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error renaming project ${currentProjectName}:`, error);
                if (showStatus) showStatus(`Failed to rename project: ${error.message}`, 'error');
            } else if (error.message) {
                console.warn(`Auth error during renameProject for ${currentProjectName}: ${error.message}`);
            }
        }
    };

    appContext.duplicateProject = async (projectName) => {
        const newProjectNamePrompt = prompt(`Enter name for the duplicated project (from "${projectName}"):`, `${projectName} (Copy)`);
        if (!newProjectNamePrompt || newProjectNamePrompt.trim() === "") {
            if (newProjectNamePrompt !== null && showStatus) showStatus('New project name cannot be empty.', 'warn');
            return;
        }
        const newDuplicatedProjectName = newProjectNamePrompt.trim();
        try {
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/duplicate`, {
                method: 'POST', body: JSON.stringify({ newProjectName: newDuplicatedProjectName })
            });
            const result = await response.json(); 
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            if (showStatus) showStatus(result.message, 'success');
            await appContext.fetchProjects(); // Refresh project list
            // Optional: auto-select the new project
            // const newProjectItem = Array.from(pageTreeContainer.querySelectorAll('.project-item'))
            //     .find(item => item.dataset.projectName === result.newProjectName);
            // if (newProjectItem && appContext.selectProject) {
            //    await appContext.selectProject(result.newProjectName, newProjectItem);
            // }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error duplicating project ${projectName}:`, error);
                if (showStatus) showStatus(`Failed to duplicate project: ${error.message}`, 'error');
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
            
            if (showStatus) showStatus(result.message, 'success');
            
            let pageToMakeActiveAfterDelete = appContext.currentPageState?.id;
            let projectToKeepActive = appContext.currentProject;
            let loadRootPageForThisProject = false;

            if (appContext.currentPageState && appContext.currentPageState.id === pageId && appContext.currentProject === projectName) {
                // Current page is being deleted. Clear editor and plan to load root of this project.
                if (appContext.clearEditor) appContext.clearEditor(false); // Clears current page, sets currentPageState to null
                appContext.currentPageState = null; // ensure
                // currentProject remains projectName for now
                loadRootPageForThisProject = true;
                pageToMakeActiveAfterDelete = null; 
            }
            
            const projectItem = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
            const projectPagesDiv = projectItem ? projectItem.querySelector('.project-pages-container') : null;

            // Refresh the tree for the affected project
            const newRootId = await appContext.fetchPageTree(projectName, null, projectPagesDiv); // Don't try to scroll to deleted page
            
            if (loadRootPageForThisProject) {
                if (newRootId && appContext.loadPageContent) {
                    await appContext.loadPageContent(projectName, newRootId);
                    // setActiveSidebarItem called by loadPageContent
                } else if (!newRootId && projectItem) { 
                    // Project became empty
                    if (showStatus) showStatus('Project is now empty.', 'info');
                    if(appContext.liveEditor) {
                        appContext.liveEditor.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 20px;">Project "${projectName}" is empty.</p>`;
                        appContext.liveEditor.contentEditable = 'false';
                    }
                    if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `Project: ${projectName} - Empty`;
                    appContext.currentPageState = null;
                    setActiveSidebarItem(projectItem); // Keep project visually active
                }
            } else if (pageToMakeActiveAfterDelete && projectPagesDiv && projectToKeepActive === projectName) {
                // If a different page was active in the same project, re-activate it (if it still exists)
                const stillActiveLi = projectPagesDiv.querySelector(`li.page[data-page-id="${CSS.escape(pageToMakeActiveAfterDelete)}"]`);
                if (stillActiveLi) {
                    setActiveSidebarItem(stillActiveLi);
                } else {
                    // The previously active page might have been a child of the deleted page.
                    // Fallback to loading root of current project.
                    if (newRootId && appContext.loadPageContent) {
                         await appContext.loadPageContent(projectName, newRootId);
                    } else if (projectItem) {
                        // Fallback if project becomes empty or root cannot be loaded.
                        if(appContext.liveEditor) {
                            appContext.liveEditor.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 20px;">Project "${projectName}" is empty.</p>`;
                            appContext.liveEditor.contentEditable = 'false';
                        }
                        if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `Project: ${projectName} - Empty`;
                        setActiveSidebarItem(projectItem);
                    }
                }
            }
            // If active page was in a different project, it remains active.

        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error deleting page ${pageTitle}:`, error);
                if (showStatus) showStatus(`Failed to delete page: ${error.message}`, 'error');
            } else if (error.message) {
                 console.warn(`Auth error during deletePage for ${pageTitle}: ${error.message}`);
            }
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
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/page/${pageId}/rename`, {
                method: 'PUT', body: JSON.stringify({ newTitle: newTitle })
            });
            const result = await response.json(); 
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            if (showStatus) showStatus(result.message, 'success');

            const projectItem = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
            const projectPagesDiv = projectItem ? projectItem.querySelector('.project-pages-container') : null;
            
            // Refresh tree and try to scroll to/activate the renamed page
            await appContext.fetchPageTree(projectName, pageId, projectPagesDiv); 

            if (appContext.currentPageState && appContext.currentPageState.id === pageId && appContext.currentProject === projectName) {
                appContext.currentPageState.title = result.newTitle; // newTitle from server
                if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `${projectName} / ${result.newTitle}`;
                // Ensure the item is visually active (fetchPageTree might reset this if it re-renders all LIs)
                const renamedPageLi = projectPagesDiv?.querySelector(`li.page[data-page-id="${CSS.escape(pageId)}"]`);
                if (renamedPageLi) {
                    setActiveSidebarItem(renamedPageLi);
                }
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error renaming page ${currentTitle}:`, error);
                if (showStatus) showStatus(`Failed to rename page: ${error.message}`, 'error');
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
            
            if (showStatus) showStatus(result.message, 'success');
            const newDuplicatedPageId = result.newPageId || result.newRootPageId;

            if (appContext.hasUnsavedChanges && appContext.currentPageState) {
                if (!confirm('You have unsaved changes. Load duplicated page and discard current changes?')) {
                    // Just refresh tree if user cancels loading the new page
                    const projectItemForRefresh = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
                    const projectPagesDivForRefresh = projectItemForRefresh ? projectItemForRefresh.querySelector('.project-pages-container') : null;
                    await appContext.fetchPageTree(projectName, appContext.currentPageState?.id, projectPagesDivForRefresh);
                    return;
                }
                if(appContext.clearEditor) appContext.clearEditor(false); // Clear current editor content
            } else if (appContext.currentPageState && appContext.clearEditor) { // No unsaved, but a page is loaded
                appContext.clearEditor(false);
            }

            const projectItem = pageTreeContainer.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
            const projectPagesDiv = projectItem ? projectItem.querySelector('.project-pages-container') : null;
            
            // Refresh tree, then load the new duplicated page
            await appContext.fetchPageTree(projectName, null, projectPagesDiv); // Refresh first
            
            if (appContext.loadPageContent && newDuplicatedPageId) {
                await appContext.loadPageContent(projectName, newDuplicatedPageId); // This will set it active
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error(`Error duplicating page ${pageTitle}:`, error);
                if (showStatus) showStatus(`Failed to duplicate page: ${error.message}`, 'error');
            } else if (error.message) {
                 console.warn(`Auth error during duplicatePage for ${pageTitle}: ${error.message}`);
            }
        }
    };

    // Initial render of user profile area
    renderUserProfileArea();
}
// --- END OF FILE sidePanel.js ---