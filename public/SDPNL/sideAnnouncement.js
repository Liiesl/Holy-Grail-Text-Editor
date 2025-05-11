// sideAnnouncement.js

export function initSideAnnouncementFunctions(appContext) {
    const {
        showStatus,
        announcementsSectionHeader,
        announcementsContentArea,
    } = appContext;

    // This helper is used by UI rendering logic AND by the function guards
    const isUserAdmin = () => appContext.currentUser && (appContext.currentUser.role === 'admin' || appContext.currentUser.role === 'owner');

    function renderAnnouncementsSectionHeader() {
        if (!announcementsSectionHeader) {
            console.warn("Announcements section header container not found.");
            return;
        }
        announcementsSectionHeader.innerHTML = '';
        if (!appContext.currentUser) {
            announcementsSectionHeader.style.display = 'none';
            if (announcementsContentArea) announcementsContentArea.innerHTML = '<p style="padding: 0 10px; font-size: 0.9em; color: var(--text-secondary);">Please log in to see announcements.</p>';
            return;
        }
        announcementsSectionHeader.style.display = 'block';

        const wrapper = document.createElement('div');
        wrapper.classList.add('announcements-h2-wrapper');

        const h2 = document.createElement('h2');
        const icon = document.createElement('i');
        icon.classList.add('fas', 'fa-bullhorn');
        h2.appendChild(icon);
        h2.appendChild(document.createTextNode(' Announcements'));
        wrapper.appendChild(h2);

        if (isUserAdmin()) {
            const actionsGroup = document.createElement('div');
            actionsGroup.classList.add('sidebar-actions-group');
            const addAnnouncementBtn = appContext.createActionButton('fa-plus', 'Create New Announcement', () => {
                if (appContext.createNewAnnouncement) appContext.createNewAnnouncement();
            });
            actionsGroup.appendChild(addAnnouncementBtn);
            wrapper.appendChild(actionsGroup);
        }
        announcementsSectionHeader.appendChild(wrapper);
    }
    appContext.renderAnnouncementsSectionHeader = renderAnnouncementsSectionHeader;

    appContext.fetchAnnouncementsList = async () => {
        if (!appContext.currentUser) {
            if (announcementsContentArea) announcementsContentArea.innerHTML = '<p style="padding: 0 10px; font-size: 0.9em; color: var(--text-secondary);">Please log in to see announcements.</p>';
            if (appContext.renderAnnouncementsSectionHeader) appContext.renderAnnouncementsSectionHeader();
            return;
        }
        if (!announcementsContentArea) {
            console.error("Announcements content area not found for fetchAnnouncementsList");
            return;
        }
        if (appContext.renderAnnouncementsSectionHeader) appContext.renderAnnouncementsSectionHeader();

        announcementsContentArea.innerHTML = '';
        const announcementsUl = document.createElement('ul');
        announcementsUl.classList.add('announcements-list');
        announcementsContentArea.appendChild(announcementsUl);

        try {
            if (showStatus) showStatus("Loading announcements...", "info", 0);
            const listUrl = isUserAdmin() ? '/api/admin/announcements' : '/api/announcements';
            const response = await appContext.fetchWithAuth(listUrl);
            if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `HTTP error! status: ${response.status}`); }
            const announcements = await response.json();
            if (showStatus) showStatus("", "info", 0);

            if (announcements.length === 0) {
                const message = isUserAdmin() ? 'No announcements. Click "+" in header to create one.' : 'No published announcements available.';
                announcementsUl.innerHTML = `<li class="no-items-message">${message}</li>`;
            } else {
                announcements.forEach(ann => {
                    const li = document.createElement('li');
                    li.classList.add('announcement-list-item');
                    li.dataset.announcementId = ann.id;
                    li.dataset.announcementName = ann.name;
                    if (ann.status) li.dataset.announcementStatus = ann.status; 

                    const itemHeaderDiv = document.createElement('div');
                    itemHeaderDiv.classList.add('announcement-header');

                    const chevronIcon = document.createElement('i');
                    chevronIcon.classList.add('fas', 'fa-chevron-right', 'announcement-expand-icon');
                    itemHeaderDiv.appendChild(chevronIcon);

                    const itemIcon = document.createElement('i');
                    itemIcon.classList.add('fas', isUserAdmin() && ann.status === 'draft' ? 'fa-pencil-ruler' : (ann.status === 'archived' ? 'fa-archive' : 'fa-newspaper'));
                    if(ann.status) itemIcon.title = `Status: ${ann.status}`;
                    itemHeaderDiv.appendChild(itemIcon);

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = ann.name;
                    nameSpan.classList.add('announcement-name-text');
                    itemHeaderDiv.appendChild(nameSpan);

                    if (isUserAdmin()) {
                        const actionsGroup = document.createElement('div');
                        actionsGroup.classList.add('sidebar-actions-group');
                        const moreActionsBtn = appContext.createActionButton('fa-ellipsis-h', 'More Announcement Actions', (event) => {
                            if (appContext.openActionsModal) appContext.openActionsModal(event, 'announcement', ann.id, ann.name);
                        });
                        const addPageBtn = appContext.createActionButton('fa-plus', 'Add Page to Announcement', () => {
                            if (appContext.createNewAnnouncementPage) appContext.createNewAnnouncementPage(ann.id, null, ann.name);
                        });
                        actionsGroup.appendChild(moreActionsBtn);
                        actionsGroup.appendChild(addPageBtn);
                        itemHeaderDiv.appendChild(actionsGroup);
                    }

                    li.appendChild(itemHeaderDiv);

                    const pagesContainerDiv = document.createElement('div');
                    pagesContainerDiv.classList.add('announcement-pages-container');
                    pagesContainerDiv.style.display = 'none';
                    li.appendChild(pagesContainerDiv);

                    chevronIcon.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const isExpanded = li.classList.toggle('expanded');
                        chevronIcon.classList.toggle('fa-chevron-right', !isExpanded);
                        chevronIcon.classList.toggle('fa-chevron-down', isExpanded);
                        pagesContainerDiv.style.display = isExpanded ? 'block' : 'none';

                        if (isExpanded && (pagesContainerDiv.children.length === 0 || pagesContainerDiv.querySelector('.no-subpages-message') || pagesContainerDiv.querySelector('.no-items-message'))) {
                            if (appContext.fetchAnnouncementPageTree) {
                                await appContext.fetchAnnouncementPageTree(ann.id, ann.name, pagesContainerDiv, false);
                            }
                        }
                    });

                    itemHeaderDiv.addEventListener('click', (e) => {
                        if (e.target.closest('.sidebar-action-btn') || e.target.closest('.announcement-expand-icon')) return;
                        if (appContext.selectAnnouncementHandler) {
                            appContext.selectAnnouncementHandler(ann.id, ann.name, li);
                        }
                    });
                    announcementsUl.appendChild(li);
                });
            }
        } catch (error) {
            if (error.message && !error.message.toLowerCase().startsWith('auth error')) {
                console.error("Error fetching announcements list:", error);
                if (showStatus) showStatus(`Failed to load announcements: ${error.message}`, 'error');
                announcementsUl.innerHTML = `<li class="error-message">Error loading announcements.</li>`;
            } else if (error.message) {
                console.warn(`Auth error during fetchAnnouncementsList: ${error.message}`);
            }
        }
    };

    appContext.selectAnnouncementHandler = async (announcementId, announcementName, announcementLiElement) => {
        if (!announcementLiElement) {
             console.error(`selectAnnouncementHandler: announcementLiElement for "${announcementName}" is missing.`);
             if(showStatus) showStatus(`Could not find announcement "${announcementName}" in sidebar.`, 'error');
             return;
        }
        const pagesContainerDiv = announcementLiElement.querySelector('.announcement-pages-container');
        if (!pagesContainerDiv) {
            console.error("Announcement pages container not found for selectAnnouncementHandler on:", announcementName);
            return;
        }
        const currentIsAdmin = isUserAdmin();

        if (appContext.hasUnsavedChanges && appContext.currentPageState) {
            let confirmMsg = 'You have unsaved changes. Are you sure you want to switch? Changes will be lost.';
            if (appContext.currentPageState.type === 'project') {
                confirmMsg = 'You have unsaved changes in the current project page. Are you sure you want to switch to view an announcement? Your current work will be lost.';
            } else if (appContext.currentPageState.type === 'announcement' && currentIsAdmin) {
                 confirmMsg = 'You have unsaved changes in the current announcement page. Are you sure you want to switch? Your changes will be lost.';
            }
            
            if (appContext.performAutosave && (appContext.currentPageState.type === 'project' || (appContext.currentPageState.type === 'announcement' && currentIsAdmin))) {
                if(showStatus) showStatus('Autosaving changes before switching...', 'info', 0);
                await appContext.performAutosave();
                if (appContext.hasUnsavedChanges) { // Check if autosave failed or still unsaved
                    if (!confirm('Failed to save all changes. Are you sure you want to switch? Changes might be lost.')) {
                        if(showStatus) showStatus('Switch cancelled.', 'info', 1500);
                        return;
                    }
                }
                if(showStatus) showStatus('', '', 0); // Clear autosave message
            } else if (!confirm(confirmMsg)) {
                 return;
            }
            appContext.hasUnsavedChanges = false;
            if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
        }


        if (appContext.currentPageState &&
            ((appContext.currentPageState.type === 'announcement' && appContext.currentAnnouncementContext?.id !== announcementId) ||
             (appContext.currentPageState.type !== 'announcement'))) {
            if (appContext.clearEditor) {
                appContext.clearEditor(false); // Clear content, but keep context if any (project, etc.)
            }
        }


        appContext.currentProject = null;
        appContext.currentView = 'announcement_detail';
        appContext.currentAnnouncementContext = { id: announcementId, name: announcementName };
        appContext.currentPageState = null; // Clear current page state until a page is loaded

        if (appContext.liveEditor) {
            appContext.liveEditor.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 20px;">Select a page from the announcement.</p>';
            appContext.liveEditor.classList.add('is-empty');
            appContext.liveEditor.contentEditable = currentIsAdmin ? 'true' : 'false';
        }
        if (appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `Announcement: ${announcementName}`;
        
        if(appContext.savePageBtn) {
             appContext.savePageBtn.disabled = true; // Will be updated by updateSaveButtonState after page load
        }
        if(appContext.updateSaveButtonState) appContext.updateSaveButtonState();


        if (appContext.setActiveSidebarItem) {
             appContext.setActiveSidebarItem(announcementLiElement);
        } else {
            if(appContext.clearSidebarActiveStates) appContext.clearSidebarActiveStates();
            announcementLiElement.classList.add('active-announcement');
        }

        if (!announcementLiElement.classList.contains('expanded')) {
            announcementLiElement.classList.add('expanded');
            const chevron = announcementLiElement.querySelector('.announcement-expand-icon');
            if (chevron) {
                chevron.classList.remove('fa-chevron-right');
                chevron.classList.add('fa-chevron-down');
            }
            pagesContainerDiv.style.display = 'block';
        }

        if (appContext.fetchAnnouncementPageTree) {
            await appContext.fetchAnnouncementPageTree(announcementId, announcementName, pagesContainerDiv, true);
        }
    };

    const renderAnnouncementPageTreeInternal = (nodes, parentUlElement, announcementId, announcementName) => {
        parentUlElement.innerHTML = '';
        if (!nodes || nodes.length === 0) {
             parentUlElement.innerHTML = '<li class="no-subpages-message" style="padding-left:10px; color: var(--text-secondary); font-style:italic;">No pages in this announcement.</li>';
             return;
        }
        nodes.forEach(node => {
            const li = document.createElement('li');
            li.dataset.pageId = node.id;
            li.classList.add('page', 'announcement-page-item');
            const hasChildren = node.children && node.children.length > 0;
            if (hasChildren) li.classList.add('has-children');

            const pageItemHeaderDiv = document.createElement('div');
            pageItemHeaderDiv.classList.add('page-item-header');

            const pageChevronIcon = document.createElement('i');
            pageChevronIcon.classList.add('fas', 'fa-chevron-right', 'page-expand-icon');
            if (!hasChildren) pageChevronIcon.style.visibility = 'hidden';
            pageItemHeaderDiv.appendChild(pageChevronIcon);

            const icon = document.createElement('i');
            icon.classList.add('fas', 'fa-file-alt', 'page-type-icon');
            pageItemHeaderDiv.appendChild(icon);

            const titleSpan = document.createElement('span');
            titleSpan.textContent = node.title;
            titleSpan.classList.add('page-title-text');
            pageItemHeaderDiv.appendChild(titleSpan);

            const actionsGroup = document.createElement('div');
            actionsGroup.classList.add('sidebar-actions-group');

            if (isUserAdmin()) {
                const morePageActionsBtn = appContext.createActionButton('fa-ellipsis-h', 'More Page Actions', (event) => {
                    if (appContext.openActionsModal) appContext.openActionsModal(event, 'announcement-page', node.id, node.title, announcementId);
                });
                const addSubpageBtn = appContext.createActionButton('fa-plus', 'Add Subpage Here', () => {
                     if (appContext.createNewAnnouncementPage) appContext.createNewAnnouncementPage(announcementId, node.id, node.title);
                });
                actionsGroup.appendChild(morePageActionsBtn);
                actionsGroup.appendChild(addSubpageBtn);
            }
            const peekPageBtn = appContext.createActionButton('fa-eye', 'Peek Page Content', (event) => {
                 if (appContext.currentPageState && appContext.currentPageState.id === node.id && appContext.currentAnnouncementContext?.id === announcementId && appContext.currentPageState.type === 'announcement') {
                     if(showStatus) showStatus('Cannot peek the currently active page.', 'info'); return;
                 }
                 if (appContext.openPageInPeekMode) appContext.openPageInPeekMode(node.id, announcementId, 'announcement');
                 else if(showStatus) showStatus('Peek feature not available.', 'error');
            });
            actionsGroup.appendChild(peekPageBtn);

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
                        renderAnnouncementPageTreeInternal(node.children, childrenUl, announcementId, announcementName);
                    }
                });
            }

            pageItemHeaderDiv.addEventListener('click', async (e) => {
                if (e.target.closest('.sidebar-action-btn') || e.target.closest('.page-expand-icon')) return;
                
                const currentIsAdmin = isUserAdmin();
                if (appContext.currentAnnouncementContext?.id === announcementId && appContext.currentPageState?.id === node.id && appContext.currentPageState?.type === 'announcement') {
                    return; // Already on this page
                }

                // Handle unsaved changes before navigating
                if (appContext.hasUnsavedChanges && appContext.currentPageState) {
                    let confirmMsg = 'You have unsaved changes. Load new page and discard current changes?';
                     if (currentIsAdmin && appContext.currentPageState.type === 'announcement') {
                         // Admin editing announcement
                         if (appContext.performAutosave) {
                            if(showStatus) showStatus('Autosaving changes before navigation...', 'info', 0);
                            await appContext.performAutosave();
                            if (appContext.hasUnsavedChanges) { // Check if autosave failed
                                if (!confirm('Failed to save all changes. Are you sure you want to load this page? Changes might be lost.')) {
                                     if(showStatus) showStatus('Navigation cancelled.', 'info', 1500); return;
                                }
                            }
                            if(showStatus) showStatus('', '', 0);
                         } else if (!confirm(confirmMsg)) {
                             return;
                         }
                     } else if (appContext.currentPageState.type === 'project') { // Unsaved changes in a project
                         if (!confirm('You have unsaved changes in a project page. Are you sure you want to load this announcement page? Your current work will be lost.')) return;
                     }
                     appContext.hasUnsavedChanges = false; // Assume proceeding
                     if(appContext.updateSaveButtonState) appContext.updateSaveButtonState();
                }


                if(appContext.clearSidebarActiveStates) appContext.clearSidebarActiveStates();
                li.classList.add('active-page');

                const parentAnnouncementListItem = document.querySelector(`.sidebar .announcement-list-item[data-announcement-id="${CSS.escape(announcementId)}"]`);
                if (parentAnnouncementListItem) parentAnnouncementListItem.classList.add('active-announcement');
                else console.warn("Could not find parent announcement list item to mark active");

                if (appContext.loadAnnouncementPageContent) {
                    await appContext.loadAnnouncementPageContent(announcementId, node.id, announcementName);
                }
            });
            parentUlElement.appendChild(li);
        });
    };

    appContext.fetchAnnouncementPageTree = async (announcementId, announcementName, containerForTreeUl, loadRootPage = true) => {
        if (!containerForTreeUl) {
            console.error("fetchAnnouncementPageTree: No container provided for the tree.");
            return null;
        }
        const parentAnnouncementLi = containerForTreeUl.closest('.announcement-list-item');
        containerForTreeUl.innerHTML = '<ul><li style="padding-left:10px; color: var(--text-secondary); font-style:italic;">Loading pages...</li></ul>';
        try {
            const treeUrl = isUserAdmin() ? `/api/admin/announcements/${announcementId}/tree` : `/api/announcements/${announcementId}/tree`;
            const response = await appContext.fetchWithAuth(treeUrl);
            if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `HTTP error! status: ${response.status}`); }
            const treeData = await response.json();

            containerForTreeUl.innerHTML = '';
            const rootUl = document.createElement('ul');
            containerForTreeUl.appendChild(rootUl);

            if (parentAnnouncementLi && treeData.rootPageId) {
                parentAnnouncementLi.dataset.rootPageId = treeData.rootPageId;
            } else if (parentAnnouncementLi) {
                delete parentAnnouncementLi.dataset.rootPageId;
            }

            if (!treeData.rootPageId && (!treeData.tree || treeData.tree.length === 0)) {
                rootUl.innerHTML = '<li class="no-subpages-message" style="padding-left:10px; color: var(--text-secondary); font-style:italic;">Announcement is empty.</li>';
                if (appContext.currentAnnouncementContext?.id === announcementId) {
                    if(appContext.liveEditor) {
                        appContext.liveEditor.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 20px;">This announcement is empty.</p>';
                        appContext.liveEditor.contentEditable = isUserAdmin() ? 'true' : 'false';
                        appContext.liveEditor.classList.add('is-empty');
                    }
                    if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `Announcement: ${announcementName} - Empty`;
                    appContext.currentPageState = null; // No page to be current
                    if(appContext.updateSaveButtonState) appContext.updateSaveButtonState();
                }
                return null;
            }

            renderAnnouncementPageTreeInternal(treeData.tree, rootUl, announcementId, announcementName);

            if (loadRootPage && treeData.rootPageId && appContext.loadAnnouncementPageContent) {
                 if (!appContext.currentPageState || appContext.currentPageState.id !== treeData.rootPageId || appContext.currentPageState.type !== 'announcement') {
                    await appContext.loadAnnouncementPageContent(announcementId, treeData.rootPageId, announcementName);
                 }
            } else if (loadRootPage && !treeData.rootPageId && appContext.currentAnnouncementContext?.id === announcementId) {
                // If loadRootPage is true, but there's no root page, clear the editor
                if (appContext.liveEditor) {
                    appContext.liveEditor.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 20px;">This announcement has no default page. Select a page from the list.</p>';
                    appContext.liveEditor.contentEditable = isUserAdmin() ? 'true' : 'false';
                    appContext.liveEditor.classList.add('is-empty');
                }
                if (appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `Announcement: ${announcementName}`;
                appContext.currentPageState = null;
                if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
            }
            return treeData.rootPageId || null;
        } catch (error) {
            console.error(`Error fetching page tree for announcement ${announcementName}:`, error);
            containerForTreeUl.innerHTML = `<ul><li style="padding-left:10px; color: var(--text-error); font-style:italic;">Error: ${error.message}</li></ul>`;
            if (showStatus) showStatus(`Failed to load tree for ${announcementName}: ${error.message}`, 'error');
            if (appContext.currentAnnouncementContext?.id === announcementId) {
                appContext.currentPageState = null;
                if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
            }
            return null;
        }
    };

    appContext.loadAnnouncementPageContent = async (announcementId, pageId, announcementNameForDisplay) => {
        const currentIsAdmin = isUserAdmin();
        if (appContext.liveEditor) {
            appContext.liveEditor.contentEditable = currentIsAdmin ? 'true' : 'false';
        }
        if (appContext.clearHomepage) appContext.clearHomepage();
        if (appContext.autosaveTimeoutId) { clearTimeout(appContext.autosaveTimeoutId); appContext.autosaveTimeoutId = null; }
        
        const statusElement = appContext.statusMessage || (appContext.globalAppContext && appContext.globalAppContext.statusMessage);
        if (statusElement && statusElement.textContent.startsWith('Autosaving...')) { if(showStatus) showStatus('', '', 0); }

        appContext.currentProject = null;
        appContext.currentView = 'announcement_detail';
        appContext.currentAnnouncementContext = { id: announcementId, name: announcementNameForDisplay };

        try {
            if(showStatus) showStatus(`Loading announcement page...`, 'info', 0);
            const pageUrl = currentIsAdmin ? `/api/admin/announcements/${announcementId}/page/${pageId}` : `/api/announcements/${announcementId}/page/${pageId}`;
            const response = await appContext.fetchWithAuth(pageUrl);
            if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `HTTP error! status: ${response.status}`); }
            const data = await response.json();
            
            appContext.currentPageState = { 
                id: data.id, 
                originalMarkdown: data.markdown, 
                title: data.title, 
                versionHash: data.versionHash, // Important for admins if saving/patching
                type: 'announcement' 
            };

            if (appContext.liveEditor) {
                appContext.liveEditor.innerHTML = appContext.clientConverter.makeHtml(data.markdown);
                const announcementLinks = appContext.liveEditor.querySelectorAll('a[href^="page://"]');
                announcementLinks.forEach(link => {
                    link.setAttribute('contenteditable', 'false'); 
                    link.addEventListener('click', async (event) => {
                        event.preventDefault();
                        const linkedPageId = link.getAttribute('href').substring('page://'.length);
                        if (appContext.currentAnnouncementContext?.id === announcementId && appContext.currentPageState?.id === linkedPageId && appContext.currentPageState?.type === 'announcement') {
                            if(showStatus) showStatus('Already on this announcement page.', 'info', 1000);
                            return;
                        }

                        // Handle unsaved changes if admin is editing
                        if (currentIsAdmin && appContext.hasUnsavedChanges && appContext.currentPageState?.type === 'announcement') {
                            if (appContext.performAutosave) {
                                if(showStatus) showStatus('Autosaving changes before navigation...', 'info', 0);
                                await appContext.performAutosave();
                                if (appContext.hasUnsavedChanges) { 
                                    if (!confirm('Failed to save all changes. Are you sure you want to navigate away? Changes might be lost.')) {
                                        if(showStatus) showStatus('Navigation cancelled.', 'info', 1500);
                                        return;
                                    }
                                }
                                if(showStatus) showStatus('', '', 0); 
                            } else if (!confirm('You have unsaved changes. Are you sure you want to navigate away? Changes will be lost.')) {
                                return;
                            }
                            appContext.hasUnsavedChanges = false; 
                            if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
                        }


                        const announcementPageLiHeader = appContext.announcementsContentArea?.querySelector(`.announcement-page-item[data-page-id="${CSS.escape(linkedPageId)}"] .page-item-header`);
                        if (announcementPageLiHeader && announcementPageLiHeader.click) {
                            // Simulate click on the sidebar item for consistent state update
                            announcementPageLiHeader.click(); 
                        } else {
                            // Fallback: direct load if sidebar item not found (should ideally not happen)
                            if (showStatus) showStatus('Navigating to linked page...', 'info', 500);
                            await appContext.loadAnnouncementPageContent(announcementId, linkedPageId, announcementNameForDisplay);
                        }
                    });
                });

                if (appContext.liveEditor.innerHTML.trim() === '' || appContext.liveEditor.innerHTML === '<p><br></p>') appContext.liveEditor.classList.add('is-empty');
                else appContext.liveEditor.classList.remove('is-empty');
            }

            if (appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `Announcement: ${announcementNameForDisplay} > ${data.title || data.id}`;
            appContext.hasUnsavedChanges = false; // Reset on fresh load
            if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
            if(showStatus) showStatus(`Loaded: ${data.title || data.id}`, 'success', 1500);

            if (appContext.announcementsContentArea) {
                const currentActiveTreeItem = appContext.announcementsContentArea.querySelector('li.page.active-page');
                if (currentActiveTreeItem) currentActiveTreeItem.classList.remove('active-page');

                const newActiveLi = appContext.announcementsContentArea.querySelector(`li.page.announcement-page-item[data-page-id="${CSS.escape(pageId)}"]`);
                if (newActiveLi) {
                    newActiveLi.classList.add('active-page');
                    const mainAnnListItem = document.querySelector(`.sidebar .announcement-list-item[data-announcement-id="${CSS.escape(announcementId)}"]`);
                    if (mainAnnListItem) {
                         if (!mainAnnListItem.classList.contains('active-announcement')) {
                            const otherActiveMainAnn = document.querySelector('.sidebar .announcement-list-item.active-announcement:not([data-announcement-id="'+ CSS.escape(announcementId) +'"])');
                            if (otherActiveMainAnn) otherActiveMainAnn.classList.remove('active-announcement');
                            mainAnnListItem.classList.add('active-announcement');
                         }
                    } else {
                        console.warn("loadAnnouncementPageContent: Could not find main announcement list item to ensure active state for", announcementId);
                    }
                    if (appContext.announcementsContentArea.contains(newActiveLi)) {
                        newActiveLi.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                    }
                }
            }
        } catch (error) {
            console.error('Error loading announcement page content:', error);
            if(showStatus) showStatus(`Failed to load announcement page: ${error.message}`, 'error');
            if (appContext.liveEditor) {
                appContext.liveEditor.innerHTML = `<p class="error-message">Error loading page.</p>`;
                appContext.liveEditor.contentEditable = currentIsAdmin ? 'true' : 'false'; // Ensure correct state on error
            }
            if (appContext.currentPageDisplay && announcementNameForDisplay) appContext.currentPageDisplay.textContent = `Announcement: ${announcementNameForDisplay} - Error.`;
            appContext.currentPageState = null; // Clear state on error
            if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
        }
    };

    // --- Admin Specific Actions ---
    appContext.createNewAnnouncement = async () => {
        if (!isUserAdmin()) {
            if (showStatus) showStatus("Admin privileges required to create announcements.", "warn");
            return;
        }
        const announcementNameStr = prompt("Enter new announcement name:");
        if (!announcementNameStr || announcementNameStr.trim() === "") {
            if (announcementNameStr !== null && showStatus) showStatus('Announcement name cannot be empty.', 'warn');
            return;
        }
        const newName = announcementNameStr.trim();
        try {
            const response = await appContext.fetchWithAuth('/api/admin/announcements', {
                method: 'POST',
                body: JSON.stringify({ name: newName })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message || `Announcement "${newName}" created.`, 'success');
            await appContext.fetchAnnouncementsList();
            const newAnnItem = announcementsContentArea?.querySelector(`.announcement-list-item[data-announcement-id="${result.announcement.id}"]`);
            if (newAnnItem && appContext.selectAnnouncementHandler) {
                appContext.selectAnnouncementHandler(result.announcement.id, result.announcement.name, newAnnItem);
            }
        } catch (error) {
            console.error('Error creating announcement:', error);
            if (showStatus) showStatus(`Failed to create announcement: ${error.message}`, 'error');
        }
    };

    appContext.renameAnnouncement = async (announcementId, currentName) => {
        if (!isUserAdmin()) {
            if (showStatus) showStatus("Admin privileges required to rename announcements.", "warn");
            return;
        }
        const newNameStr = prompt(`Enter new name for announcement "${currentName}":`, currentName);
        if (!newNameStr || newNameStr.trim() === "" || newNameStr.trim() === currentName) {
            if (newNameStr !== null && showStatus) showStatus('Name cannot be empty or unchanged.', 'warn');
            return;
        }
        const newName = newNameStr.trim();
        try {
            const response = await appContext.fetchWithAuth(`/api/admin/announcements/${announcementId}`, {
                method: 'PUT',
                body: JSON.stringify({ name: newName })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message || 'Announcement renamed.', 'success');
            await appContext.fetchAnnouncementsList(); 
             if (appContext.currentAnnouncementContext?.id === announcementId) {
                appContext.currentAnnouncementContext.name = newName;
                if(appContext.currentPageDisplay && appContext.currentPageState) { // If a page is loaded
                    appContext.currentPageDisplay.textContent = `Announcement: ${newName} > ${appContext.currentPageState.title || appContext.currentPageState.id}`;
                } else if (appContext.currentPageDisplay) { // If only announcement is selected
                     appContext.currentPageDisplay.textContent = `Announcement: ${newName}`;
                }
            }
        } catch (error) {
            console.error(`Error renaming announcement ${currentName}:`, error);
            if (showStatus) showStatus(`Failed to rename: ${error.message}`, 'error');
        }
    };

    appContext.changeAnnouncementStatus = async (announcementId, announcementName, currentStatus) => {
        if (!isUserAdmin()) {
            if (showStatus) showStatus("Admin privileges required to change announcement status.", "warn");
            return;
        }
        const newStatus = prompt(`Enter new status for "${announcementName}" (current: ${currentStatus}). Options: draft, published, archived:`, currentStatus);
        if (!newStatus || !['draft', 'published', 'archived'].includes(newStatus.toLowerCase())) {
            if (newStatus !== null && showStatus) showStatus('Invalid status. Must be draft, published, or archived.', 'warn');
            return;
        }
        try {
            const response = await appContext.fetchWithAuth(`/api/admin/announcements/${announcementId}`, {
                method: 'PUT',
                body: JSON.stringify({ status: newStatus.toLowerCase() })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message || 'Announcement status updated.', 'success');
            await appContext.fetchAnnouncementsList(); 
        } catch (error) {
            console.error(`Error changing status for ${announcementName}:`, error);
            if (showStatus) showStatus(`Failed to change status: ${error.message}`, 'error');
        }
    };

    appContext.deleteAnnouncement = async (announcementId, announcementName) => {
        if (!isUserAdmin()) {
            if (showStatus) showStatus("Admin privileges required to delete announcements.", "warn");
            return;
        }
        if (!confirm(`Are you sure you want to delete the announcement "${announcementName}" and all its pages? This cannot be undone.`)) return;
        try {
            const response = await appContext.fetchWithAuth(`/api/admin/announcements/${announcementId}`, { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message || 'Announcement deleted.', 'success');
            if (appContext.currentAnnouncementContext?.id === announcementId) {
                if (appContext.clearEditor) appContext.clearEditor(true); 
            }
            await appContext.fetchAnnouncementsList();
        } catch (error) {
            console.error(`Error deleting announcement ${announcementName}:`, error);
            if (showStatus) showStatus(`Failed to delete: ${error.message}`, 'error');
        }
    };

    appContext.duplicateAnnouncement = async (announcementId, announcementName) => {
        if (!isUserAdmin()) {
            if (showStatus) showStatus("Admin privileges required to duplicate announcements.", "warn");
            return;
        }
        const newNameStr = prompt(`Enter name for the duplicated announcement (from "${announcementName}"):`, `${announcementName} (Copy)`);
        if (!newNameStr || newNameStr.trim() === "") {
             if (newNameStr !== null && showStatus) showStatus('New announcement name cannot be empty.', 'warn');
             return;
        }
        const newDuplicatedName = newNameStr.trim();

        try {
            const response = await appContext.fetchWithAuth(`/api/admin/announcements/${announcementId}/duplicate`, {
                 method: 'POST',
                 body: JSON.stringify({ newName: newDuplicatedName }) 
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message || `Announcement "${announcementName}" duplicated as "${newDuplicatedName}".`, 'success');
            await appContext.fetchAnnouncementsList();
        } catch (error) {
            console.error(`Error duplicating announcement ${announcementName}:`, error);
            if (showStatus) showStatus(`Failed to duplicate announcement: ${error.message}. Ensure backend route exists.`, 'error');
        }
    };


    appContext.createNewAnnouncementPage = async (announcementId, parentPageId, parentNameForPrompt = 'this item') => {
        if (!isUserAdmin()) {
            if (showStatus) showStatus("Admin privileges required to create announcement pages.", "warn");
            return;
        }
        const promptText = parentPageId ? `Enter title for new page under "${parentNameForPrompt}":` : `Enter title for new root page in announcement:`;
        const titleStr = prompt(promptText);

        // ---- START OF MODIFICATION ----
        if (titleStr === null) { // Handle prompt cancellation explicitly
            if (appContext.showStatus) appContext.showStatus('Page creation cancelled.', 'info', 2000);
            return;
        }
        if (titleStr.trim() === '') { // Handle empty input after clicking OK
            if (appContext.showStatus) appContext.showStatus('Page title cannot be empty.', 'warn');
            return;
        }
        // ---- END OF MODIFICATION ----

        const newPageTitle = titleStr.trim();

        if (appContext.hasUnsavedChanges && appContext.currentPageState?.type === 'announcement' && isUserAdmin()) {
             if (appContext.performAutosave) {
                if(showStatus) showStatus('Autosaving current page before creating new one...', 'info', 0);
                await appContext.performAutosave();
                if (appContext.hasUnsavedChanges) {
                    if (!confirm('Failed to save current changes. Create new page and discard current changes?')) {
                         if(showStatus) showStatus('Page creation cancelled.', 'info', 1500); return;
                    }
                }
                if(showStatus) showStatus('', '', 0);
             } else if (!confirm('You have unsaved changes. Create new page and discard current changes?')) return;
             appContext.hasUnsavedChanges = false;
             if(appContext.updateSaveButtonState) appContext.updateSaveButtonState();
        }

        try {
            const response = await appContext.fetchWithAuth(`/api/admin/announcements/${announcementId}/pages`, {
                method: 'POST',
                body: JSON.stringify({ title: newPageTitle, parentId: parentPageId })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(`Page "${result.title}" created.`, 'success');

            const annItemLi = appContext.announcementsContentArea?.querySelector(`.announcement-list-item[data-announcement-id="${CSS.escape(announcementId)}"]`);
            const pagesContainer = annItemLi?.querySelector('.announcement-pages-container');
            const currentAnnName = annItemLi ? annItemLi.dataset.announcementName : (appContext.currentAnnouncementContext?.name || "");
            
            if (pagesContainer && annItemLi.classList.contains('expanded')) {
                await appContext.fetchAnnouncementPageTree(announcementId, currentAnnName, pagesContainer, false); 
                await appContext.loadAnnouncementPageContent(announcementId, result.newPageId, currentAnnName); 
            } else if (annItemLi) { 
                if (appContext.selectAnnouncementHandler) {
                    await appContext.selectAnnouncementHandler(announcementId, currentAnnName, annItemLi);
                    if (result.newPageId !== annItemLi.dataset.rootPageId) {
                        await appContext.loadAnnouncementPageContent(announcementId, result.newPageId, currentAnnName);
                    }
                }
            }
            
            if (parentPageId && pagesContainer) {
                const parentPageLi = pagesContainer.querySelector(`li.page[data-page-id="${CSS.escape(parentPageId)}"]`);
                if (parentPageLi && parentPageLi.classList.contains('has-children') && !parentPageLi.classList.contains('expanded')) {
                    parentPageLi.classList.add('expanded');
                    const chevron = parentPageLi.querySelector('.page-expand-icon');
                    if (chevron) {
                        chevron.classList.remove('fa-chevron-right');
                        chevron.classList.add('fa-chevron-down');
                    }
                    const childrenUl = parentPageLi.querySelector('.page-children-container');
                    if (childrenUl) childrenUl.style.display = 'block';
                }
            }

        } catch (error) {
            console.error('Error creating announcement page:', error);
            if (showStatus) showStatus(`Failed to create page: ${error.message}`, 'error');
        }
    };

    appContext.renameAnnouncementPage = async (announcementId, pageId, currentTitle) => {
        if (!isUserAdmin()) {
            if (showStatus) showStatus("Admin privileges required to rename announcement pages.", "warn");
            return;
        }
        const newTitleStr = prompt(`Enter new title for page "${currentTitle}":`, currentTitle);
        if (!newTitleStr || newTitleStr.trim() === "" || newTitleStr.trim() === currentTitle) {
            if (newTitleStr !== null && showStatus) showStatus('Title cannot be empty or unchanged.', 'warn');
            return;
        }
        const newTitle = newTitleStr.trim();
        try {
            let currentMarkdown = "";
            let currentVersionHash = null;

            // If the page being renamed is the currently loaded page and admin is editing, use its content
            if (appContext.currentPageState?.id === pageId && appContext.currentAnnouncementContext?.id === announcementId && appContext.currentPageState.type === 'announcement' && isUserAdmin()) {
                if (appContext.hasUnsavedChanges && appContext.liveEditor) {
                    currentMarkdown = appContext.htmlToMarkdown(appContext.liveEditor.innerHTML);
                } else {
                    currentMarkdown = appContext.currentPageState.originalMarkdown;
                }
                currentVersionHash = appContext.currentPageState.versionHash;
            } else {
                // Fetch current markdown if not loaded or not the active editor content
                const pageGetRes = await appContext.fetchWithAuth(`/api/admin/announcements/${announcementId}/page/${pageId}`);
                if (!pageGetRes.ok) throw new Error((await pageGetRes.json()).error || 'Failed to fetch page for rename.');
                const pageData = await pageGetRes.json();
                currentMarkdown = pageData.markdown;
                currentVersionHash = pageData.versionHash;
            }


            const h1Regex = /^#\s+(.*?)(\r?\n|$)/m;
            const safeNewTitle = newTitle.replace(/\$/g, '$$$$'); // Escape $ for replacement string
            let updatedMarkdown;
            if (h1Regex.test(currentMarkdown)) {
                updatedMarkdown = currentMarkdown.replace(h1Regex, `# ${safeNewTitle}$2`);
            } else {
                updatedMarkdown = `# ${safeNewTitle}\n\n${currentMarkdown}`;
            }

            const payload = { markdown: updatedMarkdown };
            // if (currentVersionHash) { // If backend supports optimistic locking for admin rename/save
            //     payload.base_version_hash = currentVersionHash;
            // }

            const response = await appContext.fetchWithAuth(`/api/admin/announcements/${announcementId}/page/${pageId}`, {
                method: 'POST', 
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message || 'Page renamed.', 'success');

            const annItemLi = announcementsContentArea?.querySelector(`.announcement-list-item[data-announcement-id="${CSS.escape(announcementId)}"]`);
            const pagesContainer = annItemLi?.querySelector('.announcement-pages-container');
            const currentAnnName = annItemLi ? annItemLi.dataset.announcementName : (appContext.currentAnnouncementContext?.name || "");

            if (pagesContainer && annItemLi.classList.contains('expanded')) {
                await appContext.fetchAnnouncementPageTree(announcementId, currentAnnName, pagesContainer, false); 
            }
            if (appContext.currentPageState?.id === pageId && appContext.currentAnnouncementContext?.id === announcementId) {
                appContext.currentPageState.title = result.newTitle || newTitle; // Use title from response if available
                appContext.currentPageState.originalMarkdown = result.newMarkdown || updatedMarkdown;
                appContext.currentPageState.versionHash = result.newVersionHash || null;
                appContext.hasUnsavedChanges = false; // Content is now saved
                if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = `Announcement: ${currentAnnName} > ${appContext.currentPageState.title}`;
                if(appContext.liveEditor && appContext.liveEditor.contentEditable === 'true') { // Update editor if it was the one being edited
                     appContext.liveEditor.innerHTML = appContext.clientConverter.makeHtml(appContext.currentPageState.originalMarkdown);
                }
                if(appContext.updateSaveButtonState) appContext.updateSaveButtonState();
            }
        } catch (error) {
            console.error(`Error renaming page ${currentTitle}:`, error);
            if (showStatus) showStatus(`Failed to rename page: ${error.message}`, 'error');
        }
    };

    appContext.deleteAnnouncementPage = async (announcementId, pageId, pageTitle) => {
        if (!isUserAdmin()) {
            if (showStatus) showStatus("Admin privileges required to delete announcement pages.", "warn");
            return;
        }
        if (!confirm(`Are you sure you want to delete page "${pageTitle}" and its subpages? This cannot be undone.`)) return;
        try {
            const response = await appContext.fetchWithAuth(`/api/admin/announcements/${announcementId}/page/${pageId}`, { method: 'DELETE' });
            if (!response.ok) { 
                const textError = await response.text();
                throw new Error(textError || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json().catch(() => ({ message: 'Page deleted successfully. No JSON response.'})); 

            if (response.status >= 400 && result.error) throw new Error(result.error); 
            if (showStatus) showStatus(result.message || 'Page deleted.', 'success');

            const annItemLi = announcementsContentArea?.querySelector(`.announcement-list-item[data-announcement-id="${CSS.escape(announcementId)}"]`);
            const pagesContainer = annItemLi?.querySelector('.announcement-pages-container');
            const currentAnnName = annItemLi ? annItemLi.dataset.announcementName : (appContext.currentAnnouncementContext?.name || "");


            if (appContext.currentPageState?.id === pageId && appContext.currentAnnouncementContext?.id === announcementId) {
                if(appContext.clearEditor) appContext.clearEditor(false); 
                appContext.currentPageState = null;
                 // After clearing, try to load the root of the announcement
                if (annItemLi && appContext.selectAnnouncementHandler) {
                    // This will re-fetch tree and load root
                    appContext.selectAnnouncementHandler(announcementId, currentAnnName, annItemLi);
                } else if (pagesContainer && annItemLi.classList.contains('expanded')) {
                     await appContext.fetchAnnouncementPageTree(announcementId, currentAnnName, pagesContainer, true); 
                }
            } else if (pagesContainer && annItemLi.classList.contains('expanded')) {
                 await appContext.fetchAnnouncementPageTree(announcementId, currentAnnName, pagesContainer, false); 
            } else if (annItemLi) { // Tree not expanded, but it was affected
                 // Mark tree as needing refresh if it's expanded later
                 pagesContainer.innerHTML = ''; // Clear to force reload on expand
            }


        } catch (error) {
            console.error(`Error deleting page ${pageTitle}:`, error);
            if (showStatus) showStatus(`Failed to delete page: ${error.message}. Ensure backend route exists.`, 'error');
        }
    };

    appContext.duplicateAnnouncementPage = async (announcementId, pageId, pageTitle) => {
        if (!isUserAdmin()) {
            if (showStatus) showStatus("Admin privileges required to duplicate announcement pages.", "warn");
            return;
        }
        try {
            const response = await appContext.fetchWithAuth(`/api/admin/announcements/${announcementId}/page/${pageId}/duplicate`, { method: 'POST' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            if (showStatus) showStatus(result.message || `Page "${pageTitle}" duplicated.`, 'success');

            const newDuplicatedPageId = result.newPageId || result.newRootPageId; 

            if (appContext.hasUnsavedChanges && appContext.currentPageState?.type === 'announcement' && isUserAdmin()) {
                 if (appContext.performAutosave) {
                    if(showStatus) showStatus('Autosaving current page before loading duplicate...', 'info', 0);
                    await appContext.performAutosave();
                    if (appContext.hasUnsavedChanges) {
                        if (!confirm('Failed to save current changes. Load duplicated page and discard current changes?')) {
                            // Refresh tree if user cancels loading the new page
                            const annItemForRefresh = announcementsContentArea?.querySelector(`.announcement-list-item[data-announcement-id="${CSS.escape(announcementId)}"]`);
                            const pagesContainerForRefresh = annItemForRefresh?.querySelector('.announcement-pages-container');
                            const annNameForRefresh = annItemForRefresh ? annItemForRefresh.dataset.announcementName : (appContext.currentAnnouncementContext?.name || "");
                            if (pagesContainerForRefresh && annItemForRefresh.classList.contains('expanded')) {
                                await appContext.fetchAnnouncementPageTree(announcementId, annNameForRefresh, pagesContainerForRefresh, false);
                            }
                            if(showStatus) showStatus('Loading of duplicate cancelled.', 'info', 1500);
                            return;
                        }
                    }
                    if(showStatus) showStatus('', '', 0);
                 } else if (!confirm('You have unsaved changes. Load duplicated page and discard current changes?')) {
                    const annItemForRefresh = announcementsContentArea?.querySelector(`.announcement-list-item[data-announcement-id="${CSS.escape(announcementId)}"]`);
                    const pagesContainerForRefresh = annItemForRefresh?.querySelector('.announcement-pages-container');
                    const annNameForRefresh = annItemForRefresh ? annItemForRefresh.dataset.announcementName : (appContext.currentAnnouncementContext?.name || "");
                    if (pagesContainerForRefresh && annItemForRefresh.classList.contains('expanded')) {
                        await appContext.fetchAnnouncementPageTree(announcementId, annNameForRefresh, pagesContainerForRefresh, false);
                    }
                    return;
                }
                appContext.hasUnsavedChanges = false;
                if(appContext.updateSaveButtonState) appContext.updateSaveButtonState();
            }

            const annItemLi = announcementsContentArea?.querySelector(`.announcement-list-item[data-announcement-id="${CSS.escape(announcementId)}"]`);
            const pagesContainer = annItemLi?.querySelector('.announcement-pages-container');
            const currentAnnName = annItemLi ? annItemLi.dataset.announcementName : (appContext.currentAnnouncementContext?.name || "");

            if (newDuplicatedPageId) {
                if (pagesContainer && annItemLi.classList.contains('expanded')) {
                    await appContext.fetchAnnouncementPageTree(announcementId, currentAnnName, pagesContainer, false); 
                    await appContext.loadAnnouncementPageContent(announcementId, newDuplicatedPageId, currentAnnName); 
                }  else if(annItemLi && appContext.selectAnnouncementHandler) {
                    await appContext.selectAnnouncementHandler(announcementId, currentAnnName, annItemLi); // Will load root
                    if (newDuplicatedPageId !== annItemLi.dataset.rootPageId) { // If duplicated is not the new root
                         await appContext.loadAnnouncementPageContent(announcementId, newDuplicatedPageId, currentAnnName);
                    }
                }
            } else { // Fallback: just refresh tree if no ID returned
                 if (pagesContainer && annItemLi.classList.contains('expanded')) {
                    await appContext.fetchAnnouncementPageTree(announcementId, currentAnnName, pagesContainer, false);
                 }
            }


        } catch (error) {
            console.error(`Error duplicating page ${pageTitle}:`, error);
            if (showStatus) showStatus(`Failed to duplicate page: ${error.message}. Ensure backend route exists.`, 'error');
        }
    };
}