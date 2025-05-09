// liveEditorManager.js

export function initLiveEditor(liveEditorElement, appContext) {
    const {
        showStatus,
        htmlToMarkdown, // Ensure this is in appContext
    } = appContext;

    // Helper function to update the 'is-empty' class
    function updateIsEmptyClass() {
        const content = liveEditorElement.innerHTML.trim();
        // Consider an empty paragraph with a break as empty too for placeholder purposes
        if (content === '' || content === '<p><br></p>') {
            if (!liveEditorElement.classList.contains('is-empty')) {
                liveEditorElement.classList.add('is-empty');
            }
        } else {
            if (liveEditorElement.classList.contains('is-empty')) {
                liveEditorElement.classList.remove('is-empty');
            }
        }
    }

    // --- Event Listeners ---
    liveEditorElement.addEventListener('input', (e) => {
        if (appContext.currentPageState) {
            const currentEditorMarkdown = htmlToMarkdown(liveEditorElement.innerHTML);
            if (currentEditorMarkdown !== appContext.currentPageState.originalMarkdown) {
                if (!appContext.hasUnsavedChanges) {
                    appContext.hasUnsavedChanges = true;
                    if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
                }
            } else {
                if (appContext.hasUnsavedChanges) {
                    appContext.hasUnsavedChanges = false;
                    if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
                }
            }

            if (appContext.hasUnsavedChanges) {
                if (appContext.scheduleAutosave) appContext.scheduleAutosave();
            } else {
                if (appContext.autosaveTimeoutId) {
                    clearTimeout(appContext.autosaveTimeoutId);
                    appContext.autosaveTimeoutId = null;
                }
            }
        }
        updateIsEmptyClass();
    });

    liveEditorElement.addEventListener('click', async (event) => {
        const target = event.target.closest('a');
        if (target && target.hasAttribute('href') && appContext.currentProject) {
            const href = target.getAttribute('href');

            if (href.startsWith('page://')) {
                event.preventDefault();
                const pageIdToLoad = href.substring('page://'.length);

                if (appContext.currentPageState && appContext.currentPageState.id === pageIdToLoad) {
                    showStatus('Already on this page.', 'info', 1000);
                    return;
                }

                if (appContext.hasUnsavedChanges) {
                    if (appContext.performAutosave) {
                        showStatus('Saving changes before navigation...', 'info', 0);
                        await appContext.performAutosave();
                        if (appContext.hasUnsavedChanges) {
                            if (!confirm('Failed to save all changes. Are you sure you want to navigate away? Changes might be lost.')) {
                                showStatus('Navigation cancelled.', 'info', 1500);
                                return;
                            }
                        }
                        showStatus('', '', 0);
                    } else if (!confirm('You have unsaved changes. Are you sure you want to navigate away? Changes will be lost.')) {
                        return;
                    }
                }
                appContext.hasUnsavedChanges = false;
                if (appContext.autosaveTimeoutId) {
                    clearTimeout(appContext.autosaveTimeoutId);
                    appContext.autosaveTimeoutId = null;
                }

                if (pageIdToLoad && appContext.loadPageContent) {
                    await appContext.loadPageContent(appContext.currentProject, pageIdToLoad);
                }
            }
        }
    });

    liveEditorElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            if (appContext.isSlashCommandActive) { // Check if slash command modal is active
                return;
            }

            e.preventDefault();
            // Ensure focus before execCommand, though generally it should be focused for keydown
            liveEditorElement.focus(); 
            
            // Using new 'insertParagraph' command which is more standard
            // Fallback to older method if needed, but 'insertParagraph' is widely supported
            // document.execCommand('defaultParagraphSeparator', false, 'p'); // May not be needed with insertParagraph
            document.execCommand('insertParagraph', false);

            // Dispatch input event to trigger change detection, autosave, etc.
            liveEditorElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }
    });

    liveEditorElement.addEventListener('focus', () => {
        updateIsEmptyClass();
    });

    liveEditorElement.addEventListener('blur', () => {
        updateIsEmptyClass();
    });

    // --- Editor API (attached to appContext) ---
    appContext.setLiveEditorContent = (htmlContent) => {
        liveEditorElement.innerHTML = htmlContent;
        updateIsEmptyClass();
    };

    appContext.clearLiveEditorContent = () => {
        liveEditorElement.innerHTML = '';
        updateIsEmptyClass();
    };

    appContext.getLiveEditorHTML = () => {
        return liveEditorElement.innerHTML;
    };

    // Initial state
    updateIsEmptyClass();
    liveEditorElement.dataset.placeholder = "Type '/' for commands, or start writing...";
}