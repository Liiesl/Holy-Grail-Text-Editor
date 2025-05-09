// SCMD/commands/pageOperationCommands.js

export const createSubpageCommand = {
    command: 'create-subpage',
    short: 'sp',
    icon: 'command-icon',
    iconClass: 'fas fa-file-lines',
    text: 'New Subpage',
    description: 'Create a new subpage and link it',
    category: 'Pages',
    canExecute: (appContext) => {
        return !!(appContext.currentProject && appContext.currentPageState);
    },
    execute: async (appContext, { selection, range }) => {
        const { liveEditor, showStatus, currentProject, currentPageState, fetchPageTree, fetchWithAuth } = appContext;

        if (!currentProject || !currentPageState) {
            showStatus('Cannot create subpage: No parent page loaded.', 'error');
            return false; // Indicate command failed or should not proceed with default cleanup
        }

        const subpageTitle = prompt('Enter title for the new subpage:');
        if (!subpageTitle || !subpageTitle.trim()) {
            return true; // User cancelled, but command sequence finished, allow default cleanup.
        }

        try {
            const response = await fetchWithAuth(`/api/project/${currentProject}/pages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }, // fetchWithAuth will add Auth header
                body: JSON.stringify({ title: subpageTitle.trim(), parentId: currentPageState.id })
            });

            if (!response.ok) {
                // fetchWithAuth handles 401/403 by throwing and showing login.
                // This handles other server errors (400, 404, 500 etc.)
                const errData = await response.json().catch(() => ({ error: 'Unknown server error' }));
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json();

            liveEditor.focus();
            const sel = window.getSelection();
            if (sel && range) { // range is from before slash command UI was removed
                sel.removeAllRanges();
                sel.addRange(range);
            }
            
            const linkHTML = `<a href="page://${result.newPageId}">${result.title}</a> `; // use  
            document.execCommand('insertHTML', false, linkHTML);
            
            showStatus(`Subpage "${result.title}" created and linked.`, 'success');
            
            if (fetchPageTree) {
                await fetchPageTree(currentProject /*, result.newPageId */); 
            }
            return true; // Command succeeded, allow default cleanup.
        } catch (error) {
            // This will catch errors from fetchWithAuth (e.g. auth failure)
            // or from the !response.ok check above.
            console.error('Error creating subpage via slash command:', error);
            // If fetchWithAuth showed login, this status might be for a logged-out user, which is fine.
            // If it's another error, it's relevant.
            showStatus(`Failed to create subpage: ${error.message}`, 'error');
            return true; // Error occurred, but allow default cleanup.
        }
    }
};

export const embedPageCommand = {
    command: 'embed-page',
    short: 'ep',
    icon: 'command-icon',
    iconClass: 'fas fa-file-import',
    text: 'Embed Page',
    description: 'Link an existing page',
    category: 'Pages',
    execute: (appContext, { slashCmdFinalRect, selection, range, currentSearchQuery, originalSlashCommandInfo }) => {
        const { liveEditor, openEmbedPageModal, closeEmbedPageModal, showStatus, removeSlashCommandTextFromEditor, closeSlashCommandModal } = appContext;

        if (openEmbedPageModal) {
            openEmbedPageModal(
                (selectedPage) => { // This is the callback on page selection from embedPageModal
                    // 1. Close the embedPageModal itself
                    if (closeEmbedPageModal) closeEmbedPageModal();

                    if (selectedPage && selectedPage.pageId && selectedPage.pageTitle) {
                        // 2. Clean up slash command text from editor
                        if (removeSlashCommandTextFromEditor && originalSlashCommandInfo) {
                            removeSlashCommandTextFromEditor(originalSlashCommandInfo, currentSearchQuery);
                        }

                        // 3. Insert the link
                        liveEditor.focus(); // Ensure editor is focused
                        const sel = window.getSelection();
                        if (sel && range) { // Restore selection to where slash command was invoked
                                            // This range was captured *before* any slash text removal attempts by slashCommand.js
                                            // or after its own removal if we did that (but we deferred)
                            sel.removeAllRanges();
                            sel.addRange(range.cloneRange()); // Use a clone of the original range

                            // Adjust range if text removal happened before this point and affected it.
                            // For simplicity, we assume 'range' is still valid relative to the state *before* slash command input.
                            // The removeSlashCommandTextFromEditor should have updated the DOM,
                            // and this range is now where the link should be inserted.
                        }

                        const linkHTML = `<a href="page://${selectedPage.pageId}">${selectedPage.pageTitle}</a> `;
                        document.execCommand('insertHTML', false, linkHTML);
                        liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    }
                    
                    // 4. Close the slash command modal and reset its state
                    if (closeSlashCommandModal) {
                         closeSlashCommandModal();
                         // After slash command modal is closed, fully reset its related state in appContext
                         appContext.slashCommandInfo = null; 
                         // searchQuery in slashCommand.js scope will be reset on next slash activation
                    }
                },
                slashCmdFinalRect,      // anchorRect for embedPageModal
                currentSearchQuery      // initialQuery for embedPageModal filter
            );
            return false; // Indicate to slashCommand.js that execution is async and it shouldn't do default cleanup.
        } else {
            showStatus('Embed page functionality is not available.', 'error');
            // Cleanup slash command UI if modal can't open
            if (removeSlashCommandTextFromEditor && originalSlashCommandInfo) {
                removeSlashCommandTextFromEditor(originalSlashCommandInfo, currentSearchQuery);
            }
            if (closeSlashCommandModal) {
                closeSlashCommandModal();
                appContext.slashCommandInfo = null;
            }
            return true; // Standard cleanup because the command effectively failed to launch its UI.
        }
    }
};