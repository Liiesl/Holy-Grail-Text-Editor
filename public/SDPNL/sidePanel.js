// sidePanel.js
import { initSideProjectFunctions } from './sideProject.js';
import { initSideAnnouncementFunctions } from './sideAnnouncement.js';

export function initSidePanel(appContext) {
    const {
        actionsModal,
        showStatus,
        userProfileAreaContainer,
        // New specific containers are managed by respective modules (sideAnnouncement, sideProject)
        // For projects, sideProject.js will use appContext.projectsContentArea,
        // which should be the element with id="pageTreeContainer" for CSS compatibility.
    } = appContext;


    // --- Helper to clear active visual states in the sidebar ---
    const clearSidebarActiveStates = () => {
        // Remove active class from any project item in the entire sidebar
        const currentActiveProjectItem = document.querySelector('.sidebar .project-item.active-project');
        if (currentActiveProjectItem) currentActiveProjectItem.classList.remove('active-project');
        
        // Remove active class from any page item (project page or announcement page)
        // This targets LIs with class 'page' and 'active-page' which are used by both project and announcement trees
        const currentActivePageItems = document.querySelectorAll('.sidebar li.page.active-page');
        currentActivePageItems.forEach(item => item.classList.remove('active-page'));

        // Remove active class from any announcement list item
        const currentActiveAnnouncementListItem = document.querySelector('.sidebar .announcement-list-item.active-announcement');
        if (currentActiveAnnouncementListItem) currentActiveAnnouncementListItem.classList.remove('active-announcement');
    };
    appContext.clearSidebarActiveStates = clearSidebarActiveStates;


    // --- Render User Profile Area ---
    function renderUserProfileArea() {
        if (!userProfileAreaContainer) {
            console.warn("User profile area container not found in DOM.");
            return;
        }
        userProfileAreaContainer.innerHTML = ''; // Clear previous content
        if (!appContext.currentUser) {
            userProfileAreaContainer.classList.add('empty-profile');
            return;
        }
        userProfileAreaContainer.classList.remove('empty-profile');
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
            e.stopPropagation(); 
            if (appContext.openUserSettingsModal) {
                appContext.openUserSettingsModal();
            }
        });
        profileAreaDiv.appendChild(settingsBtn);
        userProfileAreaContainer.appendChild(profileAreaDiv);
    }
    appContext.renderUserProfile = renderUserProfileArea; 


    // --- Action Button Creator (Common Helper) ---
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
    appContext.createActionButton = createActionButton;

    const isUserAdmin = () => appContext.currentUser && (appContext.currentUser.role === 'admin' || appContext.currentUser.role === 'owner');

    // --- Actions Modal (Common UI) ---
    appContext.openActionsModal = (event, targetType, targetId, targetName, contextId = null) => { // contextId for page is project/announcementId
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
            const projectNameForPeek = targetId; // targetId is projectName here
            actions = [
                { label: `Rename Project "${targetName}"`, icon: 'fa-edit', handler: () => appContext.renameProject(targetId, targetName) },
                { label: `Duplicate Project "${targetName}"`, icon: 'fa-copy', handler: () => appContext.duplicateProject(targetId, targetName) },
                { label: `Delete Project "${targetName}"`, icon: 'fa-trash-alt', handler: () => appContext.deleteProject(targetId, targetName) },
                { label: `Sort Pages A-Z`, icon: 'fa-sort-alpha-down', handler: () => { console.log(`Sort Pages A-Z for ${targetName} (NYI)`); showStatus('Sort Pages A-Z (Not Yet Implemented)', 'info');} },
                { 
                    label: `Peek Root Page of "${targetName}"`, 
                    icon: 'fa-eye', 
                    handler: async () => {
                        if (!appContext.projectsContentArea) {
                            showStatus('Project content area not found.', 'error'); return;
                        }
                        const projectItem = appContext.projectsContentArea.querySelector(`.project-item[data-project-name="${CSS.escape(projectNameForPeek)}"]`);
                        if (!projectItem) {
                            showStatus(`Project item for "${projectNameForPeek}" not found.`, 'error');
                            return;
                        }
                        let rootPageId = projectItem.dataset.rootPageId;

                        if (!rootPageId || rootPageId === 'null' || rootPageId === 'undefined') {
                            if (appContext.fetchPageTreeForPeek) { 
                                rootPageId = await appContext.fetchPageTreeForPeek(projectNameForPeek);
                            } else if (appContext.fetchPageTree) {
                                const tempDiv = document.createElement('div'); 
                                const projectPagesContainer = projectItem.querySelector('.project-pages-container');
                                rootPageId = await appContext.fetchPageTree(projectNameForPeek, null, projectPagesContainer || tempDiv);
                            } else {
                                showStatus('Cannot determine root page: tree fetching function not available.', 'warn');
                                return;
                            }
                        }

                        if (rootPageId && rootPageId !== 'null' && rootPageId !== 'undefined') {
                            if (appContext.currentPageState && appContext.currentPageState.id === rootPageId && appContext.currentProject === projectNameForPeek && appContext.currentPageState.type !== 'announcement') {
                                showStatus('Cannot peek the currently active page. Open another page first.', 'info');
                                return;
                            }
                            if (appContext.openPageInPeekMode) {
                                appContext.openPageInPeekMode(rootPageId, projectNameForPeek, 'project');
                            } else {
                                showStatus('Peek feature not available.', 'error');
                            }
                        } else {
                            showStatus(`Project "${projectNameForPeek}" has no root page or is empty.`, 'info');
                        }
                    } 
                },
            ];
        } else if (targetType === 'page') { // contextId is the project name
            actions = [
                { label: `Rename Page "${targetName}"`, icon: 'fa-edit', handler: () => appContext.renamePage(contextId, targetId, targetName) },
                { label: `Duplicate Page "${targetName}"`, icon: 'fa-copy', handler: () => appContext.duplicatePage(contextId, targetId, targetName) },
                { label: `Delete Page "${targetName}"`, icon: 'fa-trash-alt', handler: () => appContext.deletePage(contextId, targetId, targetName) },
                { label: `Sort Subpages A-Z`, icon: 'fa-sort-alpha-down', handler: () => { console.log(`Sort Subpages A-Z for ${targetName} (NYI)`); showStatus('Sort Subpages A-Z (Not Yet Implemented)', 'info'); } },
                { 
                    label: `Peek Page "${targetName}"`, 
                    icon: 'fa-eye', 
                    handler: () => {
                        if (appContext.currentPageState && appContext.currentPageState.id === targetId && appContext.currentProject === contextId && appContext.currentPageState.type !== 'announcement') {
                            showStatus('Cannot peek the currently active page. Open another page first.', 'info');
                            return;
                        }
                        if (appContext.openPageInPeekMode) {
                            appContext.openPageInPeekMode(targetId, contextId, 'project');
                        } else {
                            showStatus('Peek feature not available.', 'error');
                        }
                    }
                },
            ];
        } else if (targetType === 'announcement' && isUserAdmin()) { // targetId is announcementId
            const announcementId = targetId;
            const announcementName = targetName;
            const announcementItem = appContext.announcementsContentArea?.querySelector(`.announcement-list-item[data-announcement-id="${CSS.escape(announcementId)}"]`);
            const currentStatus = announcementItem?.dataset.announcementStatus || 'unknown';

            actions = [
                { label: `Rename Announcement "${announcementName}"`, icon: 'fa-edit', handler: () => appContext.renameAnnouncement(announcementId, announcementName) },
                { label: `Change Status (currently: ${currentStatus})`, icon: 'fa-exchange-alt', handler: () => appContext.changeAnnouncementStatus(announcementId, announcementName, currentStatus) },
                { label: `Duplicate Announcement "${announcementName}"`, icon: 'fa-copy', handler: () => appContext.duplicateAnnouncement(announcementId, announcementName) }, // Assumes appContext.duplicateAnnouncement exists
                { label: `Delete Announcement "${announcementName}"`, icon: 'fa-trash-alt', handler: () => appContext.deleteAnnouncement(announcementId, announcementName) },
                { label: `Sort Pages A-Z`, icon: 'fa-sort-alpha-down', handler: () => { console.log(`Sort Pages A-Z for ${announcementName} (NYI)`); showStatus('Sort Pages A-Z (Not Yet Implemented)', 'info');} },
            ];
        } else if (targetType === 'announcement-page' && isUserAdmin()) { // targetId is pageId, contextId is announcementId
            const announcementIdForPage = contextId;
            const pageId = targetId;
            const pageName = targetName;
            actions = [
                { label: `Rename Page "${pageName}"`, icon: 'fa-edit', handler: () => appContext.renameAnnouncementPage(announcementIdForPage, pageId, pageName) },
                { label: `Duplicate Page "${pageName}"`, icon: 'fa-copy', handler: () => appContext.duplicateAnnouncementPage(announcementIdForPage, pageId, pageName) },
                { label: `Delete Page "${pageName}"`, icon: 'fa-trash-alt', handler: () => appContext.deleteAnnouncementPage(announcementIdForPage, pageId, pageName) },
                { label: `Sort Subpages A-Z`, icon: 'fa-sort-alpha-down', handler: () => { console.log(`Sort Subpages A-Z for ${pageName} (NYI)`); showStatus('Sort Subpages A-Z (Not Yet Implemented)', 'info'); } },
                // Peek for announcement pages is directly on the item, but can be added here too if desired.
            ];
        }


        if (actions.length === 0) {
             const li = document.createElement('li');
             li.textContent = "No actions available.";
             li.style.cursor = "default"; li.style.textAlign = "center"; li.style.color = "var(--text-secondary)";
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
                    if (appContext.closeActionsModalOnClickOutside) {
                        window.removeEventListener('click', appContext.closeActionsModalOnClickOutside, true);
                        delete appContext.closeActionsModalOnClickOutside;
                    }
                });
                actionsList.appendChild(li);
            });
        }

        const button = event.currentTarget; 
        const buttonRect = button.getBoundingClientRect();
        actionsModal.style.visibility = 'hidden';
        actionsModal.style.display = 'block';
        let modalTop = buttonRect.bottom + 2;
        let modalLeft = buttonRect.left;
        if (modalTop + actionsModal.offsetHeight > window.innerHeight - 10) { 
            modalTop = buttonRect.top - actionsModal.offsetHeight - 2;
        }
        if (modalTop < 10) modalTop = 10;
        actionsModal.style.top = `${modalTop}px`;
        if (modalLeft + actionsModal.offsetWidth > window.innerWidth - 10) {
            modalLeft = window.innerWidth - actionsModal.offsetWidth - 10;
        }
        if (modalLeft < 10) modalLeft = 10;
        actionsModal.style.left = `${modalLeft}px`;
        actionsModal.style.visibility = 'visible';

        if (appContext.closeActionsModalOnClickOutside) {
            window.removeEventListener('click', appContext.closeActionsModalOnClickOutside, true);
        }
        appContext.closeActionsModalOnClickOutside = (e) => {
            if (!modalContentElement.contains(e.target)) {
                actionsModal.style.display = 'none';
                window.removeEventListener('click', appContext.closeActionsModalOnClickOutside, true);
                delete appContext.closeActionsModalOnClickOutside; 
            }
        };
        setTimeout(() => {
            window.addEventListener('click', appContext.closeActionsModalOnClickOutside, true); 
        }, 0);
    };
    
    // --- Set Active Sidebar Item (Common Helper for top-level items) ---
    function setActiveSidebarItem(itemElement) {
        if (!itemElement) return;
        
        if (appContext.clearSidebarActiveStates) appContext.clearSidebarActiveStates();

        if (itemElement.classList.contains('project-item')) {
            itemElement.classList.add('active-project');
            appContext.currentProject = itemElement.dataset.projectName; 
        } else if (itemElement.classList.contains('announcement-list-item')) {
            itemElement.classList.add('active-announcement');
            // appContext.currentAnnouncementContext is set by selectAnnouncementHandler or loadAnnouncementPageContent
        } else if (itemElement.classList.contains('page')) { 
            // This case is usually handled more explicitly by page click handlers in sideProject.js or sideAnnouncement.js
            // as they need to set parent project/announcement active too.
            itemElement.classList.add('active-page');
            const parentProjectItem = itemElement.closest('.project-item');
            if (parentProjectItem) {
                parentProjectItem.classList.add('active-project');
                appContext.currentProject = parentProjectItem.dataset.projectName;
            }
            const parentAnnouncementItem = itemElement.closest('.announcement-list-item');
            if (parentAnnouncementItem) {
                parentAnnouncementItem.classList.add('active-announcement');
                // appContext.currentAnnouncementContext should already be set if an announcement page is being activated
            }
        }
    }
    appContext.setActiveSidebarItem = setActiveSidebarItem;

    // --- Render Home Button (Internal function) ---
    function renderHomeButtonInternal() {
        let homeButtonContainer = document.getElementById('home-button-container');
        if (homeButtonContainer) homeButtonContainer.remove(); 
        if (!appContext.currentUser) return;

        homeButtonContainer = document.createElement('div');
        homeButtonContainer.id = 'home-button-container';
        homeButtonContainer.classList.add('home-button-section', 'sidebar-nav-item-container'); 

        const homeButton = document.createElement('button');
        homeButton.classList.add('sidebar-home-btn', 'sidebar-nav-item'); 
        homeButton.id = 'nav-home-btn';
        const homeIcon = document.createElement('i');
        homeIcon.classList.add('fas', 'fa-home');
        homeButton.appendChild(homeIcon);
        homeButton.appendChild(document.createTextNode(' Home'));

        homeButton.addEventListener('click', async () => { // Make handler async
            const isAlreadyHome = appContext.currentView === 'home' &&
                                  !(appContext.currentProject || appContext.currentPageState || appContext.currentAnnouncementContext);
            if (isAlreadyHome) {
                if(appContext.showStatus) appContext.showStatus("Already on the Homepage.", "info", 1500);
                return;
            }
            if (appContext.hasUnsavedChanges && appContext.currentPageState && appContext.currentPageState.type !== 'announcement') {
                if (!confirm('You have unsaved changes. Are you sure you want to navigate to the homepage? Your current work will be lost.')) return;
                 // No need to manually set appContext.hasUnsavedChanges = false here,
                 // clearEditor(true) should handle related states including this flag.
            }

            // First, clear the editor pane and its specific states.
            if (appContext.clearEditor) {
                appContext.clearEditor(true); // true for full clear, including unsaved changes flag
            }

            // After clearing the editor, explicitly display the homepage content.
            // This call now also handles fetching project data.
            if (appContext.displayHomepage) {
               await appContext.displayHomepage(); // await this as it fetches projects
            } else {
                console.warn("appContext.displayHomepage function is not available. Homepage might not be displayed.");
            }

            // Update app state AFTER potentially asynchronous homepage display
            appContext.currentProject = null;
            appContext.currentAnnouncementContext = null;
            appContext.currentPageState = null; // Redundant if clearEditor(true) does it, but safe
            appContext.currentView = 'home';
            appContext.hasUnsavedChanges = false; // Redundant if clearEditor(true) does it, but safe
            if (appContext.updateSaveButtonState) appContext.updateSaveButtonState(); // Should reflect cleared state
            if (appContext.autosaveTimeoutId) {
                clearTimeout(appContext.autosaveTimeoutId);
                appContext.autosaveTimeoutId = null;
            }
            if(appContext.clearSidebarActiveStates) appContext.clearSidebarActiveStates();

            // Collapse sidebar items (keep this)
            document.querySelectorAll('.sidebar .project-item.expanded, .sidebar .announcement-list-item.expanded').forEach(item => {
                // ... (collapsing logic) ...
                 item.classList.remove('expanded');
                const pagesContainer = item.querySelector('.project-pages-container, .announcement-pages-container');
                if (pagesContainer) pagesContainer.style.display = 'none';
                const chevron = item.querySelector('.project-expand-icon, .announcement-expand-icon');
                if (chevron) {
                    chevron.classList.remove('fa-chevron-down');
                    chevron.classList.add('fa-chevron-right');
                }
            });

            // Refresh announcements (keep this)
            if (appContext.fetchAnnouncementsList) appContext.fetchAnnouncementsList();

            // REMOVE the redundant fetchProjects call here
            // if (appContext.fetchProjects) appContext.fetchProjects();
        });
        homeButtonContainer.appendChild(homeButton);

        if (userProfileAreaContainer && userProfileAreaContainer.parentNode) {
            userProfileAreaContainer.insertAdjacentElement('afterend', homeButtonContainer);
        } else {
            console.warn("User profile area container not found or has no parent. Home button placement might be incorrect.");
            const sidebar = document.querySelector('.sidebar'); 
            if (sidebar) {
                const firstChild = sidebar.firstChild;
                if (firstChild) sidebar.insertBefore(homeButtonContainer, firstChild);
                else sidebar.appendChild(homeButtonContainer);
            } else {
                 console.error("Could not find a suitable place to insert the Home button in the sidebar.");
            }
        }
    }

    // --- Initialize modular functionalities ---
    initSideAnnouncementFunctions(appContext); 
    initSideProjectFunctions(appContext); 

    // --- Function to render/re-render core non-list sidebar elements ---
    appContext.renderCoreSidebarElements = () => {
        if (appContext.renderUserProfile) {
            appContext.renderUserProfile(); 
        }
        renderHomeButtonInternal(); 
        if (appContext.renderAnnouncementsSectionHeader) { 
            appContext.renderAnnouncementsSectionHeader(); 
        } else {
            if (appContext.announcementsSectionHeader) appContext.announcementsSectionHeader.innerHTML = '';
        }
        if (appContext.renderProjectsSectionHeader) {
            appContext.renderProjectsSectionHeader();
        } else {
            if (appContext.projectsSectionHeader) appContext.projectsSectionHeader.innerHTML = '';
        }

        if (!appContext.currentUser) {
            if (appContext.announcementsContentArea) appContext.announcementsContentArea.innerHTML = '<p style="padding: 0 10px; font-size: 0.9em; color: var(--text-secondary);">Please log in to see announcements.</p>';
            if (appContext.projectsContentArea) {
                 appContext.projectsContentArea.innerHTML = '<p style="padding: 0 10px; font-size: 0.9em; color: var(--text-secondary);">Please log in to see projects.</p>';
            }
        }
    };

    appContext.renderCoreSidebarElements();
}