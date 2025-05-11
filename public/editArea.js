// --- START OF FILE editArea.js ---

// Attempt to initialize diff-match-patch
let DmpInstance = null; 
if (typeof diff_match_patch === 'function') {
    DmpInstance = new diff_match_patch();
} else {
    console.warn("diff_match_patch library not loaded. Differential saving disabled.");
}

// Client-side SHA256 helper (async)
async function calculateHashClient(text) {
    // ... (implementation as before)
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
        return null; 
    }
}

// --- Helper to process page links, fetch their titles, and make them non-editable ---
async function _processAndRefreshPageLinkTitlesInEditor(editorElement, editorContext) {
    if (!editorElement || !editorContext.currentProject || !editorContext.fetchWithAuth) {
        // console.log("_processAndRefreshPageLinkTitlesInEditor: Missing context or editor element.");
        return false;
    }

    const pageLinks = Array.from(editorElement.querySelectorAll('a[href^="page://"]'));
    if (pageLinks.length === 0) return false;

    let contentChangedByTitleFetch = false;
    const uniquePageIds = new Set();
    pageLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            const pageId = href.substring('page://'.length);
            if (pageId) uniquePageIds.add(pageId);
        }
    });

    if (uniquePageIds.size === 0) return false;

    const titleCache = new Map(); // Stores fetched titles { pageId: title }

    const fetchPromises = Array.from(uniquePageIds).map(pageId =>
        // MODIFIED URL to use the new page-info endpoint
        editorContext.fetchWithAuth(`/api/project/${editorContext.currentProject}/page-info/${pageId}`)
            .then(response => {
                if (response.ok) return response.json();
                // The new endpoint might still return 404 if page not found or access denied.
                console.warn(`Failed to fetch title for linked page ${pageId} in project ${editorContext.currentProject}. Status: ${response.status}`);
                return null; // Indicate page not found or error
            })
            .then(data => {
                // The new endpoint directly returns { id, title }
                if (data && data.title) {
                    titleCache.set(pageId, data.title);
                } else {
                    // If data is null (from response not ok) or data.title is missing
                    titleCache.set(pageId, null); // Explicitly mark as not found or error
                }
            })
            .catch(error => {
                console.error(`Error fetching title for page ${pageId} in project ${editorContext.currentProject}:`, error);
                titleCache.set(pageId, null); // Explicitly mark as error
            })
    );

    await Promise.all(fetchPromises);

    pageLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            const pageId = href.substring('page://'.length);
            const fetchedTitle = titleCache.get(pageId);

            if (fetchedTitle !== undefined) { // If we attempted to fetch this ID
                if (fetchedTitle === null) {
                    // Page not found or error fetching title. Keep existing text.
                    // console.warn(`Title for page ${pageId} (linked as "${link.textContent}") could not be refreshed. Using existing text.`);
                } else if (link.textContent !== fetchedTitle) {
                    link.textContent = fetchedTitle;
                    contentChangedByTitleFetch = true;
                }
            }
        }
        link.setAttribute('contenteditable', 'false');
        const nestedEditable = link.querySelectorAll('[contenteditable="true"]');
        nestedEditable.forEach(el => el.setAttribute('contenteditable', 'false'));
    });
    return contentChangedByTitleFetch;
}


export function initEditArea(editorContext) {
    const {
        liveEditor,
        savePageBtn,
        currentPageDisplay,
        pageTreeContainer,
        showStatus,
        htmlToMarkdown,
        fetchWithAuth,
        autosaveDelay,
        clientConverter,
        globalAppContext
    } = editorContext;

    const currentDmpInstance = editorContext.DmpInstance || DmpInstance;
    
    // `updateInternalPageLinks` is removed as titles are fetched on load.
    
    async function _savePageContent(isAutosave = false, preparedSaveData = null) {
        // ... (implementation as before)
        if (!editorContext.currentPageState || !editorContext.currentProject) {
            if (!isAutosave) editorContext.showStatus('No page selected or project loaded.', 'error');
            else {
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
                    editorContext.currentPageState.versionHash = null; 
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
            
                editorContext.currentPageState.originalMarkdown = result.newMarkdown; // This is the MD from the server
                editorContext.currentPageState.versionHash = result.newVersionHash;

                if (result.newTitle && result.newTitle !== editorContext.currentPageState.title) {
                    editorContext.currentPageState.title = result.newTitle;
                    if (currentPageDisplay) currentPageDisplay.textContent = `${projectBeingSaved} > ${result.newTitle}`;
                    
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
        liveEditor.contentEditable = 'true';
        liveEditor.dataset.placeholder = "Type '/' for commands, or start writing...";
        liveEditor.classList.add('is-empty');
        editorContext.currentPageState = null; 
        editorContext.hasUnsavedChanges = false;
        if (editorContext.autosaveTimeoutId) {
            clearTimeout(editorContext.autosaveTimeoutId);
            editorContext.autosaveTimeoutId = null;
        }
         if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();

        if (fullClear && globalAppContext && editorContext === globalAppContext) { 
            globalAppContext.currentProject = null; 
        }

        // Update UI elements that depend on page state
        if (currentPageDisplay) currentPageDisplay.textContent = 'No page selected';
        // updateSaveButtonState will be called at the end.

        // Now, decide what content (if any) to show in the cleared editor
        if (fullClear) { 
            // Typically on logout. Login screen will be shown by auth logic.
            // Editor remains blank with default placeholder, as set above.
        } else if (editorContext.currentUser && editorContext.displayHomepage) {
            // Not a fullClear (e.g., navigating away from a page, project unselected, or initial load with user)
            // and user is logged in: display the main homepage.
            // displayHomepage will make editor non-editable, set its own content, and update currentPageDisplay.
            editorContext.displayHomepage();
        } else if (editorContext.currentProject && !fullClear) {
            // A project is active, but no page is selected.
            // Homepage is not shown; editor shows "Project X - No page selected".
            if (currentPageDisplay) currentPageDisplay.textContent = `Project: ${editorContext.currentProject} - No page selected`;
            // Editor remains editable with placeholder, as set at the start of this function.
        }
        // If !editorContext.currentUser and !fullClear, user is logged out. Auth logic shows login screen.
        // The liveEditor remains blank with placeholder (app-container is hidden).

        if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
     };

    editorContext.loadPageContent = async (projectName, pageId) => {
        if (editorContext.clearHomepage) { // Ensure homepage is cleared before loading page content
            editorContext.clearHomepage();
        }
        liveEditor.contentEditable = 'true'; // Ensure editor is editable for page content
        liveEditor.dataset.placeholder = "Type '/' for commands, or start writing..."; // Reset placeholder

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

            editorContext.currentProject = projectName;
            editorContext.currentPageState = {
                id: data.id,
                originalMarkdown: data.markdown, 
                title: data.title,
                versionHash: data.versionHash
            };
            liveEditor.innerHTML = clientConverter.makeHtml(data.markdown); 

            // _processAndRefreshPageLinkTitlesInEditor will now use the new endpoint
            const titlesWereRefreshed = await _processAndRefreshPageLinkTitlesInEditor(liveEditor, editorContext);

            if (titlesWereRefreshed) {
                editorContext.currentPageState.originalMarkdown = htmlToMarkdown(liveEditor.innerHTML);
            }

            if (liveEditor.innerHTML.trim() === '') liveEditor.classList.add('is-empty');
            else liveEditor.classList.remove('is-empty');

            if (currentPageDisplay) currentPageDisplay.textContent = `${projectName} > ${data.title || data.id}`;
            
            editorContext.hasUnsavedChanges = false; 
            if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
            editorContext.showStatus(`Loaded page: ${data.title || data.id}`, 'success', 1500);

            if (pageTreeContainer && globalAppContext && pageTreeContainer === globalAppContext.pageTreeContainer) {
                document.querySelectorAll('#page-tree .active-page').forEach(el => el.classList.remove('active-page'));
                const activeLi = pageTreeContainer.querySelector(`li[data-page-id="${CSS.escape(pageId)}"]`);
                if (activeLi) {
                    activeLi.classList.add('active-page');
                    if (pageTreeContainer.contains(activeLi)) { 
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

    if (savePageBtn) { 
        savePageBtn.addEventListener('click', () => {
            if (editorContext.savePage) editorContext.savePage();
        });
    }
    liveEditor.addEventListener('click', async (event) => { 
        const target = event.target.closest('a');
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

                if (pageIdToLoad && editorContext.loadPageContent) {
                    await editorContext.loadPageContent(editorContext.currentProject, pageIdToLoad);
                }
            }
        }
    });
    liveEditor.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter' && !e.shiftKey) { 
            // Check if SCMD is active for *this specific* editorContext
            const slashCommandActive = editorContext.isSlashCommandActive;
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
        if (editorContext.bringToFront) editorContext.bringToFront();
    });
    liveEditor.addEventListener('blur', () => { 
        if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') {
            liveEditor.classList.add('is-empty');
        }
    });

    // Initial placeholder check and link processing for initial content if any
    // This part is tricky because loadPageContent might not have run yet if content is pre-loaded by other means.
    // Assuming loadPageContent is the main way content gets into the editor for now.
    // If editor has pre-filled content from server-side rendering directly into the div,
    // _processAndRefreshPageLinkTitlesInEditor would need to be called after initEditArea.
    if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') {
        liveEditor.classList.add('is-empty');
    } else {
        liveEditor.classList.remove('is-empty');
        // If content is loaded by means other than loadPageContent, and editorContext.currentProject is set,
        // you might want to call _processAndRefreshPageLinkTitlesInEditor here.
        // Example: if (editorContext.currentProject && !editorContext.currentPageState) { /* call it */ }
        // However, this is best handled by ensuring loadPageContent is the canonical way.
    }
    liveEditor.dataset.placeholder = "Type '/' for commands, or start writing...";
}
// --- END OF FILE editArea.js ---