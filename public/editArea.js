// --- START OF FILE editArea.js ---

// Attempt to initialize diff-match-patch
let DmpInstance = null; // This can remain global if diff_match_patch is stateless or used carefully
if (typeof diff_match_patch === 'function') {
    DmpInstance = new diff_match_patch();
} else {
    console.warn("diff_match_patch library not loaded. Differential saving disabled.");
}

// Client-side SHA256 helper (async) - remains global utility
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


export function initEditArea(editorContext) { // Takes an editorContext object
    const {
        // DOM Elements from context
        liveEditor,
        savePageBtn,
        currentPageDisplay,
        pageTreeContainer, // Can be null for modals (main app's page tree)
        
        // Core functions from context
        showStatus, // editorContext.showStatus(...)
        htmlToMarkdown, // editorContext.htmlToMarkdown
        fetchWithAuth, // editorContext.fetchWithAuth
        
        // Configuration from context
        autosaveDelay,
        clientConverter, // Showdown converter instance from editorContext
        
        // Potentially global app context if this instance needs to trigger global actions
        globalAppContext 
    } = editorContext;

    // Ensure DmpInstance is available (either global or from context, context takes precedence)
    const currentDmpInstance = editorContext.DmpInstance || DmpInstance;

    // Internal function, now operates on editorContext's state and elements
    async function _savePageContent(isAutosave = false, preparedSaveData = null) {
        // Ensure currentProject is accessed from editorContext
        if (!editorContext.currentPageState || !editorContext.currentProject) {
            if (!isAutosave) editorContext.showStatus('No page selected or project loaded.', 'error');
            else {
                 // Check for specific status message element on context first
                 const statusElement = editorContext.statusMessageElement || (globalAppContext && globalAppContext.statusMessage);
                 if (statusElement && statusElement.textContent.includes('Autosaving...')) {
                    editorContext.showStatus('Autosave cancelled: page unloaded.', 'info', 2000);
                 }
            }
            return false;
        }

        const pageIdBeingSaved = editorContext.currentPageState.id;
        const projectBeingSaved = editorContext.currentProject; 

        let mode = 'full'; 
        let requestBodyPayload;
        let targetMarkdownForStateUpdate;

        if (isAutosave && preparedSaveData) {
            targetMarkdownForStateUpdate = preparedSaveData.targetMarkdown;
            if (preparedSaveData.type === 'patch' && currentDmpInstance && preparedSaveData.baseVersion) {
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

            if (!editorContext.hasUnsavedChanges && !preparedSaveData) { 
                if (!isAutosave) editorContext.showStatus('No changes to save.', 'info', 1500);
                 else {
                    const statusElement = editorContext.statusMessageElement || (globalAppContext && globalAppContext.statusMessage);
                    if (statusElement && statusElement.textContent.includes('Autosaving...')) {
                       editorContext.showStatus('All changes saved.', 'success', 2000);
                    }
                 }
                return true;
            }
            
            if (!isAutosave && targetMarkdownForStateUpdate === editorContext.currentPageState.originalMarkdown) {
                console.log("_savePageContent: Manual save - content identical to last saved state. Skipping network request.");
                editorContext.hasUnsavedChanges = false;
                if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
                editorContext.showStatus('No changes to save.', 'info', 1500);
                return true;
            }

            if (currentDmpInstance && editorContext.currentPageState.versionHash && editorContext.currentPageState.originalMarkdown !== null) {
                mode = 'patch';
                const diffs = currentDmpInstance.diff_main(editorContext.currentPageState.originalMarkdown, targetMarkdownForStateUpdate);
                currentDmpInstance.diff_cleanupSemantic(diffs); 
                const patchList = currentDmpInstance.patch_make(editorContext.currentPageState.originalMarkdown, diffs);
                const patchText = currentDmpInstance.patch_toText(patchList);
                requestBodyPayload = {
                    patch_text: patchText,
                    base_version_hash: editorContext.currentPageState.versionHash
                };
                console.log(`Attempting PATCH save for ${pageIdBeingSaved} in project ${projectBeingSaved}. Base hash: ${editorContext.currentPageState.versionHash}`);
            } else {
                mode = 'full';
                requestBodyPayload = { markdown: targetMarkdownForStateUpdate };
                console.log(`Attempting FULL content save for ${pageIdBeingSaved} in project ${projectBeingSaved}. (No DmpInstance, versionHash, or originalMarkdown)`);
            }
        }
        
        if (editorContext.isSaving) {
            if (!isAutosave) editorContext.showStatus('Save operation already in progress.', 'info', 1500);
            return false;
        }

        editorContext.isSaving = true;
        if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
        if (editorContext.autosaveTimeoutId) {
            clearTimeout(editorContext.autosaveTimeoutId);
            editorContext.autosaveTimeoutId = null;
        }
        
        try {
            const statusElement = editorContext.statusMessageElement || (globalAppContext && globalAppContext.statusMessage);
            if (!isAutosave) {
                editorContext.showStatus(`Saving (${mode})...`, 'info', 0); 
            } else {
                if (statusElement && !statusElement.textContent.startsWith(`Autosaving (${mode})...`)) {
                     editorContext.showStatus(`Autosaving (${mode})...`, 'info', 0);
                }
            }
            
            const response = await fetchWithAuth(`/api/project/${projectBeingSaved}/page/${pageIdBeingSaved}`, {
                method: 'POST',
                body: JSON.stringify(requestBodyPayload)
            });

            if (response.status === 409 && mode === 'patch') {
                 if (editorContext.currentPageState && editorContext.currentPageState.id === pageIdBeingSaved && editorContext.currentProject === projectBeingSaved) {
                    editorContext.showStatus(`Save conflict: Page was modified elsewhere. Your next save will overwrite.`, 'error', 5000);
                    editorContext.currentPageState.versionHash = null; // Force full save next time
                } else {
                     console.warn(`Save conflict for ${projectBeingSaved}/${pageIdBeingSaved}, but page context changed for this editor instance.`);
                }
                return false; 
            }

            if (!response.ok)  {
                 const errData = await response.json().catch(() => ({}));
                 throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json(); 
            
             if (editorContext.currentPageState && editorContext.currentPageState.id === pageIdBeingSaved && editorContext.currentProject === projectBeingSaved) {
                editorContext.showStatus(isAutosave ? 'All changes saved.' : (result.message || 'Page saved!'), 'success', isAutosave ? 2000: 2500);
            
                editorContext.currentPageState.originalMarkdown = result.newMarkdown;
                editorContext.currentPageState.versionHash = result.newVersionHash;

                if (result.newTitle && result.newTitle !== editorContext.currentPageState.title) {
                    editorContext.currentPageState.title = result.newTitle;
                    if (currentPageDisplay) currentPageDisplay.textContent = `${projectBeingSaved} / ${result.newTitle}`;
                    
                    // If this is the main editor (identified by having globalAppContext and its pageTreeContainer), update the main page tree
                    if (globalAppContext && globalAppContext.fetchPageTree && pageTreeContainer === globalAppContext.pageTreeContainer) { 
                        await globalAppContext.fetchPageTree(projectBeingSaved, editorContext.currentPageState.id); 
                    }
                }
                
                const veryCurrentHtml = liveEditor.innerHTML;
                const veryCurrentMarkdown = htmlToMarkdown(veryCurrentHtml);

                if (veryCurrentMarkdown === result.newMarkdown) {
                    editorContext.hasUnsavedChanges = false;
                } else {
                    editorContext.hasUnsavedChanges = true; 
                    console.warn("Content diverged slightly after save, marking as unsaved. This might be due to HTML to Markdown conversion nuances or rapid edits.");
                }
            } else {
                console.log(`Save successful for ${projectBeingSaved}/${pageIdBeingSaved}, but editor context has changed. UI not updated for that save.`);
            }
            return true;

        } catch (error) {
            if (error.message && !error.message.toLowerCase().includes('auth error')) {
                console.error('Error saving page in editor instance:', error);
                 if (editorContext.currentPageState && editorContext.currentPageState.id === pageIdBeingSaved && editorContext.currentProject === projectBeingSaved) {
                    editorContext.showStatus(`Failed to save page. ${error.message}`, 'error', 5000);
                }
            }
            const checkAfterFailHtml = liveEditor.innerHTML;
            const checkAfterFailMarkdown = htmlToMarkdown(checkAfterFailHtml);
            if (editorContext.currentPageState && checkAfterFailMarkdown !== editorContext.currentPageState.originalMarkdown) {
                 editorContext.hasUnsavedChanges = true;
            } else {
                 editorContext.hasUnsavedChanges = false;
            }
            return false;
        } finally {
             editorContext.isSaving = false; 
            if (editorContext.currentPageState && editorContext.currentPageState.id === pageIdBeingSaved && editorContext.currentProject === projectBeingSaved) {
                if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
                if (editorContext.hasUnsavedChanges && editorContext.scheduleAutosave) {
                    editorContext.scheduleAutosave(); 
                }
            }
        }
    }

    editorContext.updateSaveButtonState = () => {
        if (!savePageBtn) return; 
        savePageBtn.disabled = !editorContext.hasUnsavedChanges || !editorContext.currentPageState || editorContext.isSaving;
    };

    editorContext.scheduleAutosave = () => {
        if (editorContext.autosaveTimeoutId) {
            clearTimeout(editorContext.autosaveTimeoutId);
            editorContext.autosaveTimeoutId = null; 
        }
        if (editorContext.hasUnsavedChanges && editorContext.currentPageState && !editorContext.isSaving) {
            editorContext.autosaveTimeoutId = setTimeout(async () => { 
                editorContext.autosaveTimeoutId = null; 
                if (editorContext.performAutosave) {
                   await editorContext.performAutosave();
                }
            }, autosaveDelay);
        }
    };

    editorContext.performAutosave = async () => {
        if (!editorContext.currentPageState || !editorContext.currentProject || !editorContext.hasUnsavedChanges) {
            return; 
        }
        if (editorContext.isSaving) {
            return;
        }

        const currentHtmlForCheck = liveEditor.innerHTML;
        const newMarkdown = htmlToMarkdown(currentHtmlForCheck);

        if (newMarkdown === editorContext.currentPageState.originalMarkdown) {
            console.log("Autosave: Content identical to last saved state. Skipping network request.");
            editorContext.hasUnsavedChanges = false;
            if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
            
            const statusElement = editorContext.statusMessageElement || (globalAppContext && globalAppContext.statusMessage);
            if (statusElement && statusElement.textContent.includes('Autosaving...')) {
                editorContext.showStatus('All changes saved.', 'success', 2000);
            }
            if (editorContext.autosaveTimeoutId) {
                 clearTimeout(editorContext.autosaveTimeoutId);
                 editorContext.autosaveTimeoutId = null;
            }
            return;
        }
        
        let preparedSaveData;
        if (currentDmpInstance && editorContext.currentPageState.versionHash && editorContext.currentPageState.originalMarkdown !== null) {
            // showStatus is called within _savePageContent
            const diffs = currentDmpInstance.diff_main(editorContext.currentPageState.originalMarkdown, newMarkdown);
            currentDmpInstance.diff_cleanupSemantic(diffs);
            const patchList = currentDmpInstance.patch_make(editorContext.currentPageState.originalMarkdown, diffs);
            const patchText = currentDmpInstance.patch_toText(patchList);
            preparedSaveData = {
                type: 'patch',
                data: patchText, 
                baseVersion: editorContext.currentPageState.versionHash,
                targetMarkdown: newMarkdown
            };
        } else {
            preparedSaveData = {
                type: 'full',
                data: newMarkdown, 
                targetMarkdown: newMarkdown
            };
        }
        
        await _savePageContent(true, preparedSaveData);
    };

    editorContext.clearEditor = (fullClear = false) => { 
        liveEditor.innerHTML = '';
        if(currentPageDisplay) { // currentPageDisplay might not exist in all contexts
            currentPageDisplay.textContent = 'No page selected';
            // `editorContext.currentProject` should be managed by the instance itself.
            // `fullClear` might mean clearing the `editorContext.currentProject` if this instance is the main one.
            if (editorContext.currentProject && !fullClear) {
                currentPageDisplay.textContent = `Project: ${editorContext.currentProject} - No page selected`;
            } else if (fullClear && globalAppContext && editorContext === globalAppContext) { // Check if this context IS the global app context
                globalAppContext.currentProject = null; 
            }
        }
        editorContext.currentPageState = null; 
        editorContext.hasUnsavedChanges = false;
        if (editorContext.autosaveTimeoutId) {
            clearTimeout(editorContext.autosaveTimeoutId);
            editorContext.autosaveTimeoutId = null;
        }
        if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
        liveEditor.dataset.placeholder = "Type '/' for commands, or start writing...";
        liveEditor.classList.add('is-empty'); 
    };

    editorContext.loadPageContent = async (projectName, pageId) => {
        if (editorContext.autosaveTimeoutId) { 
            clearTimeout(editorContext.autosaveTimeoutId);
            editorContext.autosaveTimeoutId = null;
        }
        const statusElement = editorContext.statusMessageElement || (globalAppContext && globalAppContext.statusMessage);
        if (statusElement && statusElement.textContent.startsWith('Autosaving...')) {
            editorContext.showStatus('', '', 0); 
        }

        try {
            editorContext.showStatus(`Loading page: ${pageId}...`, 'info', 0);
            const response = await fetchWithAuth(`/api/project/${projectName}/page/${pageId}`);
            if (!response.ok) {
                 const errData = await response.json().catch(() => ({}));
                 throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json(); 
            
            editorContext.currentProject = projectName; // Set current project for this editor instance
            editorContext.currentPageState = { 
                id: data.id, 
                originalMarkdown: data.markdown,
                title: data.title,
                versionHash: data.versionHash 
            };
            liveEditor.innerHTML = clientConverter.makeHtml(data.markdown); // Use instance's converter
            
            if (liveEditor.innerHTML.trim() === '') liveEditor.classList.add('is-empty');
            else liveEditor.classList.remove('is-empty');

            if (currentPageDisplay) currentPageDisplay.textContent = `${projectName} / ${data.title || data.id}`;
            editorContext.hasUnsavedChanges = false; 
            if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState(); 
            editorContext.showStatus(`Loaded page: ${data.title || data.id}`, 'success', 1500);
 
            // Update active state in page tree (only if it's the main editor context)
            if (pageTreeContainer && globalAppContext && pageTreeContainer === globalAppContext.pageTreeContainer) {
                document.querySelectorAll('#page-tree .active-page').forEach(el => el.classList.remove('active-page'));
                const activeLi = pageTreeContainer.querySelector(`li[data-page-id="${CSS.escape(pageId)}"]`);
                if (activeLi) {
                    activeLi.classList.add('active-page');
                    if (pageTreeContainer.contains(activeLi)) { // Ensure it's part of the main tree
                        activeLi.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }
            }

        } catch (error) {
             if (error.message && !error.message.toLowerCase().includes('auth error')) {
                console.error('Error loading page content in editor instance:', error);
                editorContext.showStatus(`Failed to load page: ${pageId}. ${error.message}`, 'error');
             }
            if (editorContext.clearEditor) editorContext.clearEditor(); 
            if (currentPageDisplay && projectName) currentPageDisplay.textContent = `Project: ${projectName} - Error loading page.`;
        }
    };

    editorContext.savePage = async () => { await _savePageContent(false, null); };

    // --- Event Listeners ---
    liveEditor.addEventListener('input', (e) => {
        if (editorContext.currentPageState) { 
            const currentEditorMarkdown = htmlToMarkdown(liveEditor.innerHTML);
            if (currentEditorMarkdown !== editorContext.currentPageState.originalMarkdown) {
                if (!editorContext.hasUnsavedChanges) {
                    editorContext.hasUnsavedChanges = true;
                    if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
                }
            } else { 
                if (editorContext.hasUnsavedChanges) {
                    editorContext.hasUnsavedChanges = false;
                    if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
                }
            }
            
            if (editorContext.hasUnsavedChanges) { 
               if (editorContext.scheduleAutosave) editorContext.scheduleAutosave();
            } else { 
                if (editorContext.autosaveTimeoutId) {
                    clearTimeout(editorContext.autosaveTimeoutId);
                    editorContext.autosaveTimeoutId = null; 
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

    if (savePageBtn) { // savePageBtn might not exist in all editor contexts
        savePageBtn.addEventListener('click', () => {
            if (editorContext.savePage) editorContext.savePage();
        });
    }

    liveEditor.addEventListener('click', async (event) => {
        const target = event.target.closest('a');
        // Use editorContext.currentProject for navigation context
        if (target && target.hasAttribute('href') && editorContext.currentProject) {
            const href = target.getAttribute('href');
            
            if (href.startsWith('page://')) {
                event.preventDefault();
                const pageIdToLoad = href.substring('page://'.length);

                if (editorContext.currentPageState && editorContext.currentPageState.id === pageIdToLoad) {
                    editorContext.showStatus('Already on this page.', 'info', 1000);
                    return; 
                }

                if (editorContext.hasUnsavedChanges) {
                    // For modals, we might want a different confirmation or rely on global beforeunload
                    // For now, assume this logic is fine for both, or can be customized by editorContext.showStatus
                    if (editorContext.performAutosave) {
                        editorContext.showStatus('Saving changes before navigation...', 'info', 0);
                        await editorContext.performAutosave(); 
                        if (editorContext.hasUnsavedChanges) { 
                            if (!confirm('Failed to save all changes. Are you sure you want to navigate away? Changes might be lost.')) {
                                editorContext.showStatus('Navigation cancelled.', 'info', 1500);
                                return;
                            }
                        }
                        editorContext.showStatus('', '', 0); 
                    } else if (!confirm('You have unsaved changes. Are you sure you want to navigate away? Changes will be lost.')) {
                         return;
                    }
                }
                editorContext.hasUnsavedChanges = false; 
                if (editorContext.autosaveTimeoutId) {
                    clearTimeout(editorContext.autosaveTimeoutId);
                    editorContext.autosaveTimeoutId = null;
                }

                // Navigation needs to be handled carefully. If this is a modal, it should load content into itself.
                // If it's the main editor, it loads into the main editor.
                // The `loadPageContent` function on `editorContext` should handle this correctly.
                if (pageIdToLoad && editorContext.loadPageContent) {
                    await editorContext.loadPageContent(editorContext.currentProject, pageIdToLoad);
                }
            }
        }
    });

    liveEditor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { 
            // Check for slash command active state possibly on globalAppContext if modal
            const slashCommandActive = (globalAppContext && globalAppContext.isSlashCommandActive) || editorContext.isSlashCommandActive;
            if (slashCommandActive) {
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
        // If this is a modal, it might want to bring itself to the front.
        if (editorContext.bringToFront) editorContext.bringToFront();
    });
    liveEditor.addEventListener('blur', () => {
        if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') {
            liveEditor.classList.add('is-empty');
        }
    });

    // Initial placeholder check
    if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') {
        liveEditor.classList.add('is-empty');
    } else {
        liveEditor.classList.remove('is-empty');
    }
    liveEditor.dataset.placeholder = "Type '/' for commands, or start writing...";
}
// --- END OF FILE editArea.js ---