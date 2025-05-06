// Attempt to initialize diff-match-patch
let DmpInstance = null;
if (typeof diff_match_patch === 'function') {
    DmpInstance = new diff_match_patch();
} else {
    console.warn("diff_match_patch library not loaded. Differential saving disabled; will use full content saves.");
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

    // --- Internal Save Logic ---
    // Modified to accept preparedSaveData for autosaves and handle differential saving
    async function _savePageContent(isAutosave = false, preparedSaveData = null) {
        if (!appContext.currentPageState || !appContext.currentProject) {
            if (!isAutosave) showStatus('No page selected or project loaded.', 'error');
            else if (isAutosave && appContext.statusMessage.textContent === 'Autosaving...') {
                appContext.showStatus('Autosave cancelled: page unloaded.', 'info', 2000);
            }
            return false;
        }

        const pageIdBeingSaved = appContext.currentPageState.id;
        const projectBeingSaved = appContext.currentProject;

        let mode = 'full'; // 'patch' or 'full'
        let requestBodyPayload;
        let targetMarkdownForStateUpdate; // The full markdown content we intend to save / that results from patch

        if (isAutosave && preparedSaveData) {
            targetMarkdownForStateUpdate = preparedSaveData.targetMarkdown;
            if (preparedSaveData.type === 'patch' && DmpInstance && preparedSaveData.baseVersion) {
                mode = 'patch';
                requestBodyPayload = {
                    patch_text: preparedSaveData.data, // patch_text
                    base_version_hash: preparedSaveData.baseVersion
                };
            } else { // Autosave determined full save or DmpInstance not available for patch
                mode = 'full';
                requestBodyPayload = { markdown: preparedSaveData.data }; // full markdown
            }
        } else { // Manual save
            const currentHtml = liveEditor.innerHTML;
            targetMarkdownForStateUpdate = htmlToMarkdown(currentHtml);

            if (!appContext.hasUnsavedChanges && !preparedSaveData) { // If no precomputed data, check current changes
                if (!isAutosave) showStatus('No changes to save.', 'info', 1500);
                 else if (isAutosave && appContext.statusMessage.textContent === 'Autosaving...') {
                    appContext.showStatus('All changes saved.', 'success', 2000);
                }
                return true;
            }
            
            // For manual saves, if content happens to be identical now (e.g., user undid changes)
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
                DmpInstance.diff_cleanupSemantic(diffs); // Make patch more human-readable
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
        
        if (appContext.autosaveTimeoutId) {
            clearTimeout(appContext.autosaveTimeoutId);
            appContext.autosaveTimeoutId = null;
        }
        
        try {
            if (!isAutosave) {
                showStatus(`Saving (${mode})...`, 'info', 0); 
            } else {
                if (appContext.statusMessage.textContent !== `Autosaving (${mode})...`) {
                    showStatus(`Autosaving (${mode})...`, 'info', 0);
                }
            }

            const response = await fetch(`/api/project/${projectBeingSaved}/page/${pageIdBeingSaved}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBodyPayload)
            });

            if (response.status === 409 && mode === 'patch') {
                // Conflict detected during a patch save
                if (appContext.currentPageState && appContext.currentPageState.id === pageIdBeingSaved && appContext.currentProject === projectBeingSaved) {
                    showStatus(`Save conflict: Page was modified elsewhere. Your next save will overwrite.`, 'error', 5000);
                    appContext.currentPageState.versionHash = null; // Force next save to be full
                    // Keep hasUnsavedChanges = true, as local changes are still not on server
                } else {
                     console.warn(`Save conflict for ${projectBeingSaved}/${pageIdBeingSaved}, but page context changed.`);
                }
                return false; // Save failed due to conflict
            }

            if (!response.ok)  {
                 const errData = await response.json();
                 throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json(); // Expect { newMarkdown, newVersionHash, newTitle, message }
            
            if (appContext.currentPageState && appContext.currentPageState.id === pageIdBeingSaved && appContext.currentProject === projectBeingSaved) {
                showStatus(isAutosave ? 'All changes saved.' : (result.message || 'Page saved!'), 'success', isAutosave ? 2000: 2500);
            
                // CRITICAL: Update originalMarkdown and versionHash from server response
                appContext.currentPageState.originalMarkdown = result.newMarkdown;
                appContext.currentPageState.versionHash = result.newVersionHash;

                if (result.newTitle && result.newTitle !== appContext.currentPageState.title) {
                    appContext.currentPageState.title = result.newTitle;
                    currentPageDisplay.textContent = `${appContext.currentProject} / ${result.newTitle}`;
                    if (appContext.fetchPageTree) {
                        await appContext.fetchPageTree(appContext.currentProject, appContext.currentPageState.id); 
                    }
                }
                
                const veryCurrentHtml = liveEditor.innerHTML;
                const veryCurrentMarkdown = htmlToMarkdown(veryCurrentHtml);

                // Compare editor content with the new canonical markdown from server
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
            console.error('Error saving page:', error);
            if (appContext.currentPageState && appContext.currentPageState.id === pageIdBeingSaved && appContext.currentProject === projectBeingSaved) {
                showStatus(`Failed to save page. ${error.message}`, 'error', 5000);
            } else {
                console.error(`Error saving page ${projectBeingSaved}/${pageIdBeingSaved} (context changed): ${error.message}`);
            }
            // Re-evaluate hasUnsavedChanges based on current editor vs (potentially stale) originalMarkdown
            // If save failed, versionHash should not be nullified here unless it was a conflict.
            // The existing originalMarkdown is still the last known good state.
            const checkAfterFailHtml = liveEditor.innerHTML;
            const checkAfterFailMarkdown = htmlToMarkdown(checkAfterFailHtml);
            if (appContext.currentPageState && checkAfterFailMarkdown !== appContext.currentPageState.originalMarkdown) {
                 appContext.hasUnsavedChanges = true;
            } else {
                 appContext.hasUnsavedChanges = false;
            }
            return false;
        } finally {
            appContext.isSaving = false; 
            if (appContext.currentPageState && appContext.currentPageState.id === pageIdBeingSaved && appContext.currentProject === projectBeingSaved) {
                if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
                
                if (appContext.hasUnsavedChanges && appContext.scheduleAutosave) {
                    appContext.scheduleAutosave(); // Reschedule if changes still exist or new ones made
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
                data: patchText, // This is patch_text
                baseVersion: appContext.currentPageState.versionHash,
                targetMarkdown: newMarkdown
            };
        } else {
            showStatus('Autosaving (full)...', 'info', 0);
            preparedSaveData = {
                type: 'full',
                data: newMarkdown, // This is full markdown
                targetMarkdown: newMarkdown
            };
        }
        
        await _savePageContent(true, preparedSaveData);
    };

    appContext.clearEditor = () => {
        liveEditor.innerHTML = '';
        currentPageDisplay.textContent = 'No page selected';
        if (appContext.currentProject) {
            currentPageDisplay.textContent = `Project: ${appContext.currentProject} - No page selected`;
        }
        appContext.currentPageState = null; // Clears id, title, originalMarkdown, versionHash
        appContext.hasUnsavedChanges = false;
        if (appContext.autosaveTimeoutId) {
            clearTimeout(appContext.autosaveTimeoutId);
            appContext.autosaveTimeoutId = null;
        }
        if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
        liveEditor.dataset.placeholder = "Type '/' for commands, or start writing...";
        liveEditor.classList.add('is-empty'); // Ensure placeholder shows
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
            const response = await fetch(`/api/project/${projectName}/page/${pageId}`);
            if (!response.ok) {
                 const errData = await response.json();
                 throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json(); // Expects { id, title, markdown, versionHash }
            
            appContext.currentPageState = { 
                id: data.id, 
                originalMarkdown: data.markdown,
                title: data.title,
                versionHash: data.versionHash // Store the version hash
            };
            liveEditor.innerHTML = clientConverter.makeHtml(data.markdown);
            
            if (liveEditor.innerHTML.trim() === '') {
                 liveEditor.classList.add('is-empty');
                 liveEditor.dispatchEvent(new Event('focus')); // Re-trigger focus to ensure placeholder logic if it was just cleared
            } else {
                 liveEditor.classList.remove('is-empty');
                 liveEditor.removeAttribute('data-placeholder'); // Though CSS handles placeholder via ::before
            }

            currentPageDisplay.textContent = `${projectName} / ${data.title || data.id}`;
            appContext.hasUnsavedChanges = false; 
            if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
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
            console.error('Error loading page content:', error);
            showStatus(`Failed to load page: ${pageId}. ${error.message}`, 'error');
            if (appContext.clearEditor) appContext.clearEditor(); 
            if (projectName) currentPageDisplay.textContent = `Project: ${projectName} - Error loading page.`;
        }
    };

    appContext.savePage = async () => { // Manual save
        await _savePageContent(false, null); // false for isAutosave, null for preparedSaveData
    };

    // --- Event Listeners ---
    liveEditor.addEventListener('input', (e) => {
        if (appContext.currentPageState) { // Ensure a page is loaded
            const currentEditorMarkdown = htmlToMarkdown(liveEditor.innerHTML);
            // Check against the definitive originalMarkdown
            if (currentEditorMarkdown !== appContext.currentPageState.originalMarkdown) {
                if (!appContext.hasUnsavedChanges) {
                    appContext.hasUnsavedChanges = true;
                    if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
                }
            } else { // Content matches original
                if (appContext.hasUnsavedChanges) {
                    appContext.hasUnsavedChanges = false;
                    if (appContext.updateSaveButtonState) appContext.updateSaveButtonState();
                }
            }
            
            if (appContext.hasUnsavedChanges) { // Schedule autosave only if there are actual unsaved changes
               if (appContext.scheduleAutosave) appContext.scheduleAutosave();
            } else { // If changes were undone to match original, clear any pending autosave
                if (appContext.autosaveTimeoutId) {
                    clearTimeout(appContext.autosaveTimeoutId);
                    appContext.autosaveTimeoutId = null; 
                }
            }
        }

        // Placeholder visibility logic based on content
        if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') { // Consider a single empty paragraph with a <br> as empty for placeholder
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
            e.preventDefault(); 
            
            // Ensure consistent paragraph separation behavior
            // Some browsers default to <div>, setting to <p> is more common for rich text.
            document.execCommand('defaultParagraphSeparator', false, 'p');
            document.execCommand('insertParagraph', false);
            
            // Dispatch input to trigger change detection, autosave scheduling, and placeholder update
            liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }
    });

    // Initial placeholder setup and dynamic updates
    liveEditor.addEventListener('focus', () => {
        // Redundant with input event but good for initial focus on empty editor
        if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') {
            liveEditor.classList.add('is-empty');
        } else {
            liveEditor.classList.remove('is-empty');
        }
    });
    liveEditor.addEventListener('blur', () => {
        // On blur, if it's empty, ensure the class is set.
        // No need to remove 'is-empty' on blur if content exists, input handler does that.
        if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') {
            liveEditor.classList.add('is-empty');
        }
    });

    // Set initial state for placeholder
    if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') {
        liveEditor.classList.add('is-empty');
    } else {
        liveEditor.classList.remove('is-empty');
    }
    liveEditor.dataset.placeholder = "Type '/' for commands, or start writing...";
}