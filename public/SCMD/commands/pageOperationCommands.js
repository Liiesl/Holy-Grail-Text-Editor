// SCMD/commands/pageOperationCommands.js

export const createSubpageCommand = {
    command: 'create-subpage',
    short: ['sp', 'np', 'newpage', 'ns', 'cs'],
    icon: 'command-icon',
    iconClass: 'fas fa-file-lines',
    text: 'New Subpage',
    description: 'Create a new subpage and link it',
    category: 'Pages',
    canExecute: (appContext) => {
        const isProjectContext = !!(appContext.currentProject && appContext.currentPageState);
        const isUserAdmin = appContext.currentUser && (appContext.currentUser.role === 'admin' || appContext.currentUser.role === 'owner');
        const isAnnouncementContext = isUserAdmin &&
                                      appContext.currentAnnouncementContext &&
                                      appContext.currentPageState &&
                                      appContext.currentPageState.type === 'announcement';
        return isProjectContext || isAnnouncementContext;
    },
    execute: async (appContext, { selection, range }) => {
        const {
            liveEditor,
            showStatus,
            currentProject,
            currentPageState,
            currentAnnouncementContext,
            fetchPageTree, // For projects
            fetchAnnouncementPageTree, // For announcements
            fetchWithAuth
        } = appContext;

        const isUserAdmin = appContext.currentUser && (appContext.currentUser.role === 'admin' || appContext.currentUser.role === 'owner');
        const isAnnouncementMode = isUserAdmin && currentAnnouncementContext && currentPageState && currentPageState.type === 'announcement';

        if (!currentPageState) {
            showStatus('Cannot create subpage: No parent page loaded.', 'error');
            return true; // Allow default cleanup
        }
        if (isAnnouncementMode && !currentAnnouncementContext.id) {
            showStatus('Cannot create subpage: Announcement context is invalid.', 'error');
            return true;
        }
        if (!isAnnouncementMode && !currentProject) {
            showStatus('Cannot create subpage: Project context is invalid.', 'error');
            return true;
        }

        const subpageTitle = prompt('Enter title for the new subpage:');
        if (!subpageTitle || !subpageTitle.trim()) {
            return true; // User cancelled, but command sequence finished, allow default cleanup.
        }

        try {
            let apiUrl;
            let payload;
            let contextId; // project name or announcement ID

            if (isAnnouncementMode) {
                apiUrl = `/api/admin/announcements/${currentAnnouncementContext.id}/pages`;
                payload = { title: subpageTitle.trim(), parentId: currentPageState.id };
                contextId = currentAnnouncementContext.id;
            } else { // Project mode
                apiUrl = `/api/project/${currentProject}/pages`;
                payload = { title: subpageTitle.trim(), parentId: currentPageState.id };
                contextId = currentProject;
            }

            const response = await fetchWithAuth(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: 'Unknown server error' }));
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json();

            liveEditor.focus();
            const sel = window.getSelection();
            if (sel && range) {
                sel.removeAllRanges();
                sel.addRange(range);
            }

            const linkHTML = `<a href="page://${result.newPageId}">${result.title}</a> `; // Use   (non-breaking space)
            document.execCommand('insertHTML', false, linkHTML);

            showStatus(`Subpage "${result.title}" created and linked.`, 'success');

            if (isAnnouncementMode) {
                if (fetchAnnouncementPageTree && appContext.announcementsContentArea) {
                    // Need to find the container for the specific announcement's tree
                    const annItemLi = appContext.announcementsContentArea.querySelector(`.announcement-list-item[data-announcement-id="${CSS.escape(contextId)}"]`);
                    const pagesContainer = annItemLi?.querySelector('.announcement-pages-container');
                    if (pagesContainer && annItemLi && annItemLi.classList.contains('expanded')) {
                         // Reload tree and then load the new page.
                        await fetchAnnouncementPageTree(contextId, currentAnnouncementContext.name, pagesContainer, false);
                        if (appContext.loadAnnouncementPageContent) {
                            await appContext.loadAnnouncementPageContent(contextId, result.newPageId, currentAnnouncementContext.name);
                        }
                    } else if (annItemLi && appContext.selectAnnouncementHandler) {
                        // If tree not expanded, select announcement to load tree and root, then load new page if not root
                        await appContext.selectAnnouncementHandler(contextId, currentAnnouncementContext.name, annItemLi);
                        if (result.newPageId !== annItemLi.dataset.rootPageId && appContext.loadAnnouncementPageContent) {
                            await appContext.loadAnnouncementPageContent(contextId, result.newPageId, currentAnnouncementContext.name);
                        }
                    }
                }
            } else { // Project mode
                if (fetchPageTree) {
                    await fetchPageTree(contextId, result.newPageId); // Load new page after tree refresh
                }
            }
            return true; // Command succeeded, allow default cleanup.
        } catch (error) {
            console.error('Error creating subpage via slash command:', error);
            showStatus(`Failed to create subpage: ${error.message}`, 'error');
            return true; // Error occurred, but allow default cleanup.
        }
    }
};

export const embedPageCommand = {
    command: 'embed-page',
    short: ['ep', 'embed', 'lp'],
    icon: 'command-icon',
    iconClass: 'fas fa-file-import',
    text: 'Embed Page',
    description: 'Link an existing page',
    category: 'Pages',
    // --- START MODIFICATION ---
    canExecute: (appContext) => {
        if (!appContext.openEmbedPageModal) return false; // Modal function must exist

        const isUserAdmin = appContext.currentUser && (appContext.currentUser.role === 'admin' || appContext.currentUser.role === 'owner');
        const projectContextValid = !!appContext.currentProject;
        const announcementContextValid = !!(
            appContext.currentAnnouncementContext &&
            appContext.currentPageState && // Ensure we have a page state
            appContext.currentPageState.type === 'announcement' && // Specifically for announcement page
            isUserAdmin // And user is admin
        );
        return projectContextValid || announcementContextValid;
    },
    execute: (appContext, { slashCmdFinalRect, selection, range, currentSearchQuery, originalSlashCommandInfo }) => {
        const {
            liveEditor,
            openEmbedPageModal, // Guaranteed to exist if canExecute passed
            closeEmbedPageModal,
            showStatus,
            removeSlashCommandTextFromEditor,
            closeSlashCommandModal,
            currentProject,
            currentPageState,
            currentAnnouncementContext,
            currentUser
        } = appContext;

        // Determine context validity (even though canExecute should handle it, this is a safeguard)
        const isUserAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'owner');
        const isValidProjectContext = !!currentProject; // Simplified: if currentProject exists, assume project context for embedding
        const isValidAnnouncementContext = !!(
            currentAnnouncementContext &&
            currentPageState &&
            currentPageState.type === 'announcement' &&
            isUserAdmin
        );

        if (!isValidProjectContext && !isValidAnnouncementContext) {
            // This state should ideally be prevented by canExecute.
            if (showStatus) showStatus('Embed Page: No valid context (project or admin in announcement).', 'info');
            if (removeSlashCommandTextFromEditor && originalSlashCommandInfo) {
                removeSlashCommandTextFromEditor(originalSlashCommandInfo, currentSearchQuery);
            }
            if (closeSlashCommandModal) {
                closeSlashCommandModal();
                appContext.slashCommandInfo = null;
            }
            return true; // Command sequence finished, allow cleanup.
        }

        // At this point, openEmbedPageModal is available and context is valid.
        openEmbedPageModal(
            (selectedPage) => {
                if (closeEmbedPageModal) closeEmbedPageModal();

                if (selectedPage && selectedPage.pageId && selectedPage.pageTitle) {
                    if (removeSlashCommandTextFromEditor && originalSlashCommandInfo) {
                        removeSlashCommandTextFromEditor(originalSlashCommandInfo, currentSearchQuery);
                    }

                    liveEditor.focus();
                    const sel = window.getSelection();
                    if (sel && range) {
                        sel.removeAllRanges();
                        sel.addRange(range.cloneRange());
                    }

                    const linkHTML = `<a href="page://${selectedPage.pageId}">${selectedPage.pageTitle}</a> `; // Use   (non-breaking space)
                    document.execCommand('insertHTML', false, linkHTML);
                    liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

                    if (showStatus) showStatus(`Page "${selectedPage.pageTitle}" embedded.`, 'success');

                } else {
                    // User might have closed the modal without selecting.
                    if (showStatus) showStatus('Embed Page: No page selected.', 'info');
                }

                if (closeSlashCommandModal) {
                     closeSlashCommandModal();
                     appContext.slashCommandInfo = null;
                }
            },
            slashCmdFinalRect,
            currentSearchQuery
        );
        return false; // Modal is open, command sequence not fully finished from slash command perspective.
        // --- END MODIFICATION ---
    }
};

export const openInPagePeekCommand = {
    command: 'open-in-peek',
    short: ['peek', 'op', 'openpeek', 'viewpeek'],
    icon: 'command-icon',
    iconClass: 'fas fa-window-restore',
    text: 'Open in Page Peek',
    description: 'Open the current page in a peek window',
    category: 'Pages',
    canExecute: (appContext) => {
        const isProjectContext = appContext.currentPageState &&
                                 appContext.currentPageState.id &&
                                 appContext.currentProject && // Ensure it's a project
                                 appContext.currentPageState.type !== 'announcement' && // Not an announcement
                                 appContext.openPageInPeekMode;

        const isAnnouncementContext = appContext.currentPageState &&
                                      appContext.currentPageState.id &&
                                      appContext.currentAnnouncementContext && // Ensure it's an announcement
                                      appContext.currentPageState.type === 'announcement' &&
                                      appContext.openPageInPeekMode;

        return isProjectContext || isAnnouncementContext;
    },
    execute: (appContext, options) => {
        const { currentPageState, currentProject, currentAnnouncementContext, openPageInPeekMode, showStatus } = appContext;

        if (!currentPageState || !currentPageState.id) {
            if (showStatus) showStatus('Cannot open in peek: No current page loaded.', 'error');
            return true;
        }
        if (!openPageInPeekMode) {
            if (showStatus) showStatus('Cannot open in peek: Page peek functionality is not available.', 'error');
            return true;
        }

        let contextId;
        let pageType;

        if (currentPageState.type === 'announcement' && currentAnnouncementContext) {
            contextId = currentAnnouncementContext.id;
            pageType = 'announcement';
        } else if (currentProject && currentPageState.type !== 'announcement') { // Assume project if not announcement
            contextId = currentProject;
            pageType = 'project';
        } else {
            if (showStatus) showStatus('Cannot open in peek: Page context is unclear.', 'error');
            return true;
        }

        openPageInPeekMode(currentPageState.id, contextId, pageType);
        return true;
    }
};