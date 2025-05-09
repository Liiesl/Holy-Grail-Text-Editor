// Attempt to initialize diff-match-patch
let DmpInstance = null;
if (typeof diff_match_patch === 'function') {
    DmpInstance = new diff_match_patch();
} else {
    console.warn("diff_match_patch library not loaded. Differential saving disabled.");
}

// Client-side SHA256 helper (async)
async function calculateHashClient(text) {
    if (text === null || typeof text === 'undefined') return null;
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    } catch (error) {
        console.error("Error calculating hash on client:", error);
        return null; // Fallback or indicate error
    }
}


export function initEditArea(appContext) {
    const {
        liveEditor,
        savePageBtn,
        currentPageDisplay,
        pageTreeContainer,
        showStatus,
        htmlToMarkdown,
    } = appContext;

    const clientConverter = new showdown.Converter();
    clientConverter.setOption('tables', true);

    async function _savePageContent(isAutosave = false, preparedSaveData = null) {
        // ... (existing initial checks for currentPageState, currentProject) ...
        if (!appContext.currentPageState || !appContext.currentProject) {
            if (!isAutosave) showStatus('No page selected or project loaded.', 'error');
            else if (isAutosave && appContext.statusMessage.textContent === 'Autosaving...') {
                appContext.showStatus('Autosave cancelled: page unloaded.', 'info', 2000);
            }
            return false;
        }

        const pageIdBeingSaved = appContext.currentPageState.id;
        const projectBeingSaved = appContext.currentProject;

        let mode = 'full'; 
        let requestBodyPayload;
        let targetMarkdownForStateUpdate;

        if (isAutosave && preparedSaveData) {
            targetMarkdownForStateUpdate = preparedSaveData.targetMarkdown;
            if (preparedSaveData.type === 'patch' && DmpInstance && preparedSaveData.baseVersion) {
                mode = 'patch';
                requestBodyPayload = {
                    patch_text: preparedSaveData.data, 
                    base_version_hash: preparedSaveData.baseVersion
                };
            } else { 
                mode = 'full';
                requestBodyPayload = { markdown: preparedSaveData.data }; 
            }
        } else { 
            const currentHtml = liveEditor.innerHTML;
            targetMarkdownForStateUpdate = htmlToMarkdown(currentHtml);

            if (!appContext.hasUnsavedChanges && !preparedSaveData) { 
                if (!isAutosave) showStatus('No changes to save.', 'info', 1500);
                 else if (isAutosave && appContext.statusMessage.textContent === 'Autosaving...') {
                    appContext.showStatus('All changes saved.', 'success', 2000);
                }
                return true;
            }
            
            if (!isAutosave && targetMarkdownForStateUpdate === appContext.currentPageState.originalMarkdown) {
                console.log("_savePageContent: Manual save - content identical to last saved state. Skipping network request.");
                appContext.hasUnsavedChanges = false;
                if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
                showStatus('No changes to save.', 'info', 1500);
                return true;
            }

            if (DmpInstance && appContext.currentPageState.versionHash && appContext.currentPageState.originalMarkdown !== null) {
                mode = 'patch';
                const diffs = DmpInstance.diff_main(appContext.currentPageState.originalMarkdown, targetMarkdownForStateUpdate);
                DmpInstance.diff_cleanupSemantic(diffs); 
                const patchList = DmpInstance.patch_make(appContext.currentPageState.originalMarkdown, diffs);
                const patchText = DmpInstance.patch_toText(patchList);
                requestBodyPayload = {
                    patch_text: patchText,
                    base_version_hash: appContext.currentPageState.versionHash
                };
                console.log(`Attempting PATCH save for ${pageIdBeingSaved}. Base hash: ${appContext.currentPageState.versionHash}`);
            } else {
                mode = 'full';
                requestBodyPayload = { markdown: targetMarkdownForStateUpdate };
                console.log(`Attempting FULL content save for ${pageIdBeingSaved}. (No DmpInstance, versionHash, or originalMarkdown)`);
            }
        }
        
        if (appContext.isSaving) {
            if (!isAutosave) showStatus('Save operation already in progress.', 'info', 1500);
            return false;
        }

        appContext.isSaving = true;
        if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
        if (appContext.autosaveTimeoutId) clearTimeout(appContext.autosaveTimeoutId);
        
        try {
            if (!isAutosave) {
                showStatus(`Saving (${mode})...`, 'info', 0); 
            } else {
                if (appContext.statusMessage.textContent !== `Autosaving (${mode})...`) {
                    showStatus(`Autosaving (${mode})...`, 'info', 0);
                }
            }
            
            // USE appContext.fetchWithAuth instead of fetch
            const response = await appContext.fetchWithAuth(`/api/project/${appContext.currentProject}/page/${appContext.currentPageState.id}`, {
                method: 'POST',
                // headers already handled by fetchWithAuth if body is present
                body: JSON.stringify(requestBodyPayload)
            });

            if (response.status === 409 && mode === 'patch') {
                if (appContext.currentPageState && appContext.currentPageState.id === pageIdBeingSaved && appContext.currentProject === projectBeingSaved) {
                    showStatus(`Save conflict: Page was modified elsewhere. Your next save will overwrite.`, 'error', 5000);
                    appContext.currentPageState.versionHash = null; 
                } else {
                     console.warn(`Save conflict for ${projectBeingSaved}/${pageIdBeingSaved}, but page context changed.`);
                }
                return false; 
            }

            if (!response.ok)  {
                 const errData = await response.json().catch(() => ({}));
                 throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json(); 
            
            // ... (update appContext.currentPageState, UI, hasUnsavedChanges based on result) ...
             if (appContext.currentPageState && appContext.currentPageState.id === pageIdBeingSaved && appContext.currentProject === projectBeingSaved) {
                appContext.showStatus(isAutosave ? 'All changes saved.' : (result.message || 'Page saved!'), 'success', isAutosave ? 2000: 2500);
            
                appContext.currentPageState.originalMarkdown = result.newMarkdown;
                appContext.currentPageState.versionHash = result.newVersionHash;

                if (result.newTitle && result.newTitle !== appContext.currentPageState.title) {
                    appContext.currentPageState.title = result.newTitle;
                    currentPageDisplay.textContent = `${appContext.currentProject} / ${result.newTitle}`;
                    if (appContext.fetchPageTree) { // Check if function exists
                        await appContext.fetchPageTree(appContext.currentProject, appContext.currentPageState.id); 
                    }
                }
                
                const veryCurrentHtml = liveEditor.innerHTML;
                const veryCurrentMarkdown = htmlToMarkdown(veryCurrentHtml);

                if (veryCurrentMarkdown === result.newMarkdown) {
                    appContext.hasUnsavedChanges = false;
                } else {
                    appContext.hasUnsavedChanges = true; 
                }
            } else {
                console.log(`Save successful for ${projectBeingSaved}/${pageIdBeingSaved}, but page context has changed. UI not updated for that save.`);
            }
            return true;

        } catch (error) {
            // fetchWithAuth might throw for 401/403, which means user is logged out.
            // No need to show "Failed to save page" if it's an auth error handled by fetchWithAuth.
            if (error.message && !error.message.toLowerCase().includes('auth error')) {
                console.error('Error saving page:', error);
                if (appContext.currentPageState && appContext.currentPageState.id === pageIdBeingSaved && appContext.currentProject === projectBeingSaved) {
                    showStatus(`Failed to save page. ${error.message}`, 'error', 5000);
                }
            }
             // Update hasUnsavedChanges based on current content vs original
            const checkAfterFailHtml = liveEditor.innerHTML;
            const checkAfterFailMarkdown = htmlToMarkdown(checkAfterFailHtml);
            if (appContext.currentPageState && checkAfterFailMarkdown !== appContext.currentPageState.originalMarkdown) {
                 appContext.hasUnsavedChanges = true;
            } else {
                 appContext.hasUnsavedChanges = false;
            }
            return false;
        } finally {
            // ... (reset appContext.isSaving, updateSaveButtonState, scheduleAutosave if needed) ...
             appContext.isSaving = false; 
            if (appContext.currentPageState && appContext.currentPageState.id === pageIdBeingSaved && appContext.currentProject === projectBeingSaved) {
                if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
                if (appContext.hasUnsavedChanges && appContext.scheduleAutosave) { // Check if functions exist
                    appContext.scheduleAutosave(); 
                }
            }
        }
    }

    appContext.updateSaveButtonState = () => {
        savePageBtn.disabled = !appContext.hasUnsavedChanges || !appContext.currentPageState || appContext.isSaving;
    };

    appContext.scheduleAutosave = () => {
        if (appContext.autosaveTimeoutId) {
            clearTimeout(appContext.autosaveTimeoutId);
            appContext.autosaveTimeoutId = null; 
        }
        if (appContext.hasUnsavedChanges && appContext.currentPageState && !appContext.isSaving) {
            appContext.autosaveTimeoutId = setTimeout(() => {
                appContext.autosaveTimeoutId = null; 
                if (appContext.performAutosave) {
                    appContext.performAutosave().catch(err => {
                        console.error("Error during performAutosave execution:", err);
                    });
                }
            }, appContext.autosaveDelay);
        }
    };

    appContext.performAutosave = async () => {
        if (!appContext.currentPageState || !appContext.currentProject || !appContext.hasUnsavedChanges) {
            return; 
        }
        if (appContext.isSaving) {
            return;
        }

        const currentHtmlForCheck = liveEditor.innerHTML;
        const newMarkdown = htmlToMarkdown(currentHtmlForCheck);

        if (newMarkdown === appContext.currentPageState.originalMarkdown) {
            console.log("Autosave: Content identical to last saved state. Skipping network request.");
            appContext.hasUnsavedChanges = false;
            if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
            showStatus('All changes saved.', 'success', 2000);
            if (appContext.autosaveTimeoutId) {
                 clearTimeout(appContext.autosaveTimeoutId);
                 appContext.autosaveTimeoutId = null;
            }
            return;
        }
        
        let preparedSaveData;
        if (DmpInstance && appContext.currentPageState.versionHash && appContext.currentPageState.originalMarkdown !== null) {
            showStatus('Autosaving (patch)...', 'info', 0);
            const diffs = DmpInstance.diff_main(appContext.currentPageState.originalMarkdown, newMarkdown);
            DmpInstance.diff_cleanupSemantic(diffs);
            const patchList = DmpInstance.patch_make(appContext.currentPageState.originalMarkdown, diffs);
            const patchText = DmpInstance.patch_toText(patchList);
            preparedSaveData = {
                type: 'patch',
                data: patchText, 
                baseVersion: appContext.currentPageState.versionHash,
                targetMarkdown: newMarkdown
            };
        } else {
            showStatus('Autosaving (full)...', 'info', 0);
            preparedSaveData = {
                type: 'full',
                data: newMarkdown, 
                targetMarkdown: newMarkdown
            };
        }
        
        await _savePageContent(true, preparedSaveData);
    };

    appContext.clearEditor = (fullClear = false) => {
        liveEditor.innerHTML = '';
        currentPageDisplay.textContent = 'No page selected';
        if (appContext.currentProject && !fullClear) {
            currentPageDisplay.textContent = `Project: ${appContext.currentProject} - No page selected`;
        } else if (fullClear) {
            appContext.currentProject = null; // Ensure project is cleared on fullClear
        }
        appContext.currentPageState = null; 
        appContext.hasUnsavedChanges = false;
        if (appContext.autosaveTimeoutId) clearTimeout(appContext.autosaveTimeoutId);
        if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
        liveEditor.dataset.placeholder = "Type '/' for commands, or start writing...";
        liveEditor.classList.add('is-empty'); 
    };

    appContext.loadPageContent = async (projectName, pageId) => {
        if (appContext.autosaveTimeoutId) { 
            clearTimeout(appContext.autosaveTimeoutId);
            appContext.autosaveTimeoutId = null;
        }
        if (appContext.statusMessage.textContent.startsWith('Autosaving...')) {
            appContext.showStatus('', '', 0); 
        }

        try {
            showStatus(`Loading page: ${pageId}...`, 'info', 0);
            // USE appContext.fetchWithAuth
            const response = await appContext.fetchWithAuth(`/api/project/${projectName}/page/${pageId}`);
            // ... (check response.ok, parse data) ...
            if (!response.ok) {
                 const errData = await response.json().catch(() => ({}));
                 throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json(); 
            appContext.currentProject = projectName; 
            // ... (update appContext.currentPageState, liveEditor.innerHTML, UI, hasUnsavedChanges) ...
            appContext.currentPageState = { 
                id: data.id, 
                originalMarkdown: data.markdown,
                title: data.title,
                versionHash: data.versionHash 
            };
            liveEditor.innerHTML = clientConverter.makeHtml(data.markdown);
            
            if (liveEditor.innerHTML.trim() === '') liveEditor.classList.add('is-empty');
            else liveEditor.classList.remove('is-empty');

            currentPageDisplay.textContent = `${projectName} / ${data.title || data.id}`;
            appContext.hasUnsavedChanges = false; 
            if (appContext.updateSaveButtonState) appContext.updateSaveButtonState(); // Check exists
            showStatus(`Loaded page: ${data.title || data.id}`, 'success', 1500);
 
            document.querySelectorAll('#page-tree .active-page').forEach(el => el.classList.remove('active-page'));
            const activeLi = pageTreeContainer.querySelector(`li[data-page-id="${CSS.escape(pageId)}"]`);
            if (activeLi) {
                activeLi.classList.add('active-page');
                if (pageTreeContainer.contains(activeLi)) {
                    activeLi.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }

        } catch (error) {
             if (error.message && !error.message.toLowerCase().includes('auth error')) {
                console.error('Error loading page content:', error);
                showStatus(`Failed to load page: ${pageId}. ${error.message}`, 'error');
             }
            if (appContext.clearEditor) appContext.clearEditor(); // This will now use fullClear = false by default
            if (projectName) currentPageDisplay.textContent = `Project: ${projectName} - Error loading page.`;
        }
    };

    appContext.savePage = async () => { await _savePageContent(false, null); };

    // --- Event Listeners ---
    liveEditor.addEventListener('input', (e) => {
        if (appContext.currentPageState) { 
            const currentEditorMarkdown = htmlToMarkdown(liveEditor.innerHTML);
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

        if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') { 
            if (!liveEditor.classList.contains('is-empty')) {
                 liveEditor.classList.add('is-empty');
            }
        } else {
            if (liveEditor.classList.contains('is-empty')) {
                 liveEditor.classList.remove('is-empty');
            }
        }
    });

    savePageBtn.addEventListener('click', () => {
        if (appContext.savePage) appContext.savePage();
    });

    liveEditor.addEventListener('click', async (event) => {
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

    liveEditor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { 
            // If slash command modal is active, let it handle the Enter key.
            if (appContext.isSlashCommandActive) {
                return;
            }
            
            e.preventDefault(); 
            
            document.execCommand('defaultParagraphSeparator', false, 'p');
            document.execCommand('insertParagraph', false);
            
            liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }
    });

    liveEditor.addEventListener('focus', () => {
        if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') {
            liveEditor.classList.add('is-empty');
        } else {
            liveEditor.classList.remove('is-empty');
        }
    });
    liveEditor.addEventListener('blur', () => {
        if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') {
            liveEditor.classList.add('is-empty');
        }
    });

    if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') {
        liveEditor.classList.add('is-empty');
    } else {
        liveEditor.classList.remove('is-empty');
    }
    liveEditor.dataset.placeholder = "Type '/' for commands, or start writing...";
    
    // REMOVED: Context Menu for Tables listener. Table interactions are now handled by tableEditor.js via hover/focus.
}