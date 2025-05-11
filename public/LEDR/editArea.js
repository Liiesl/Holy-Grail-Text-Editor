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
        return null; 
    }
}

// --- Helper to process page links, fetch their titles, and make them non-editable ---
async function _processAndRefreshPageLinkTitlesInEditor(editorElement, editorContext) {
    if (!editorElement || !editorContext.currentProject || !editorContext.fetchWithAuth) {
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

    const titleCache = new Map(); 

    const fetchPromises = Array.from(uniquePageIds).map(pageId =>
        editorContext.fetchWithAuth(`/api/project/${editorContext.currentProject}/page-info/${pageId}`)
            .then(response => {
                if (response.ok) return response.json();
                console.warn(`Failed to fetch title for linked page ${pageId} in project ${editorContext.currentProject}. Status: ${response.status}`);
                return null; 
            })
            .then(data => {
                if (data && data.title) {
                    titleCache.set(pageId, data.title);
                } else {
                    titleCache.set(pageId, null); 
                }
            })
            .catch(error => {
                console.error(`Error fetching title for page ${pageId} in project ${editorContext.currentProject}:`, error);
                titleCache.set(pageId, null); 
            })
    );

    await Promise.all(fetchPromises);

    pageLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            const pageId = href.substring('page://'.length);
            const fetchedTitle = titleCache.get(pageId);

            if (fetchedTitle !== undefined) { 
                if (fetchedTitle === null) {
                    // Keep existing text
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
        announcementsContentArea, // For refreshing announcement tree on title change
        showStatus,
        htmlToMarkdown,
        fetchWithAuth,
        autosaveDelay,
        clientConverter,
        globalAppContext 
    } = editorContext;

    const currentDmpInstance = editorContext.DmpInstance || DmpInstance;
    
    const isUserAdmin = () => editorContext.currentUser && (editorContext.currentUser.role === 'admin' || editorContext.currentUser.role === 'owner');

    async function _savePageContent(isAutosave = false, preparedSaveData = null) {
        const isAnnouncementPage = editorContext.currentPageState && editorContext.currentPageState.type === 'announcement';

        if (isAnnouncementPage && !isUserAdmin()) {
            if (!isAutosave) editorContext.showStatus('Announcements are read-only.', 'info');
            editorContext.hasUnsavedChanges = false; 
            if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
            return true; 
        }

        if (!editorContext.currentPageState || 
            (!isAnnouncementPage && !editorContext.currentProject) || 
            (isAnnouncementPage && !editorContext.currentAnnouncementContext)) {
            if (!isAutosave) editorContext.showStatus('No page selected or context loaded.', 'error');
            else {
                 const statusElement = editorContext.statusMessage || (globalAppContext && globalAppContext.statusMessage);
                 if (statusElement && statusElement.textContent.includes('Autosaving...')) {
                    editorContext.showStatus('Autosave cancelled: page unloaded.', 'info', 2000);
                 }
            }
            return false;
        }

        const pageIdBeingSaved = editorContext.currentPageState.id;
        const contextId = isAnnouncementPage ? editorContext.currentAnnouncementContext.id : editorContext.currentProject; 

        let mode = 'full'; 
        let requestBodyPayload;
        let targetMarkdownForStateUpdate;

        if (isAutosave && preparedSaveData) {
            targetMarkdownForStateUpdate = preparedSaveData.targetMarkdown;
            if (preparedSaveData.type === 'patch' && currentDmpInstance && preparedSaveData.baseVersion && !isAnnouncementPage) { // Patching for projects only for now
                mode = 'patch';
                requestBodyPayload = {
                    patch_text: preparedSaveData.data, 
                    base_version_hash: preparedSaveData.baseVersion
                };
            } else { 
                mode = 'full';
                requestBodyPayload = { markdown: preparedSaveData.data }; 
                if (isAnnouncementPage && editorContext.currentPageState.versionHash) { // Send base hash for announcements if available for optimistic lock
                     // requestBodyPayload.base_version_hash = editorContext.currentPageState.versionHash; // Backend admin route might need this
                }
            }
        } else { 
            const currentHtml = liveEditor.innerHTML;
            targetMarkdownForStateUpdate = htmlToMarkdown(currentHtml);

            if (!editorContext.hasUnsavedChanges && !preparedSaveData) { 
                if (!isAutosave) editorContext.showStatus('No changes to save.', 'info', 1500);
                 else {
                    const statusElement = editorContext.statusMessage || (globalAppContext && globalAppContext.statusMessage);
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

            if (isAnnouncementPage && isUserAdmin()) {
                mode = 'full';
                requestBodyPayload = { markdown: targetMarkdownForStateUpdate };
                // if (editorContext.currentPageState.versionHash) {
                //     requestBodyPayload.base_version_hash = editorContext.currentPageState.versionHash;
                // }
                console.log(`Attempting FULL content save for ANNOUNCEMENT ${contextId}/${pageIdBeingSaved}.`);
            } else if (!isAnnouncementPage) { // Project page
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
                    console.log(`Attempting PATCH save for project ${contextId}/${pageIdBeingSaved}. Base hash: ${editorContext.currentPageState.versionHash}`);
                } else {
                    mode = 'full';
                    requestBodyPayload = { markdown: targetMarkdownForStateUpdate };
                    console.log(`Attempting FULL content save for project ${contextId}/${pageIdBeingSaved}. (No DmpInstance, versionHash, or originalMarkdown)`);
                }
            } else {
                console.error("_savePageContent: Could not determine save parameters.");
                return false;
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
            const statusElement = editorContext.statusMessage || (globalAppContext && globalAppContext.statusMessage);
            if (!isAutosave) {
                editorContext.showStatus(`Saving (${mode})...`, 'info', 0); 
            } else {
                if (statusElement && !statusElement.textContent.startsWith(`Autosaving (${mode})...`)) {
                     editorContext.showStatus(`Autosaving (${mode})...`, 'info', 0);
                }
            }
            
            let saveUrl;
            if (isAnnouncementPage && isUserAdmin()) {
                saveUrl = `/api/admin/announcements/${contextId}/page/${pageIdBeingSaved}`;
            } else if (!isAnnouncementPage) {
                saveUrl = `/api/project/${contextId}/page/${pageIdBeingSaved}`;
            } else {
                 console.error("Save URL could not be determined in editor instance.");
                 editorContext.showStatus('Save failed: Internal error.', 'error');
                 editorContext.isSaving = false;
                 if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
                 return false;
            }

            const response = await fetchWithAuth(saveUrl, {
                method: 'POST',
                body: JSON.stringify(requestBodyPayload)
            });

            if (response.status === 409 && mode === 'patch' && !isAnnouncementPage) { // Patch conflict only for projects for now
                 if (editorContext.currentPageState && editorContext.currentPageState.id === pageIdBeingSaved && editorContext.currentProject === contextId) {
                    editorContext.showStatus(`Save conflict: Page was modified elsewhere. Your next save will overwrite.`, 'error', 5000);
                    editorContext.currentPageState.versionHash = null; 
                } else {
                     console.warn(`Save conflict for ${contextId}/${pageIdBeingSaved}, but page context changed for this editor instance.`);
                }
                return false; 
            }
            // TODO: Handle 409 for admin announcement save if backend implements optimistic locking with base_version_hash

            if (!response.ok)  {
                 const errData = await response.json().catch(() => ({}));
                 throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json(); 
            
            const editorStillOnPage = editorContext.currentPageState && editorContext.currentPageState.id === pageIdBeingSaved &&
                                     ((isAnnouncementPage && editorContext.currentAnnouncementContext && editorContext.currentAnnouncementContext.id === contextId) ||
                                      (!isAnnouncementPage && editorContext.currentProject === contextId));

            if (editorStillOnPage) {
                editorContext.showStatus(isAutosave ? 'All changes saved.' : (result.message || 'Page saved!'), 'success', isAutosave ? 2000: 2500);
            
                editorContext.currentPageState.originalMarkdown = result.newMarkdown; 
                editorContext.currentPageState.versionHash = result.newVersionHash;

                if (result.newTitle && result.newTitle !== editorContext.currentPageState.title) {
                    editorContext.currentPageState.title = result.newTitle;
                    if (currentPageDisplay) {
                        if (isAnnouncementPage && editorContext.currentAnnouncementContext) {
                             currentPageDisplay.textContent = `Announcement: ${editorContext.currentAnnouncementContext.name} > ${result.newTitle}`;
                        } else if (!isAnnouncementPage && editorContext.currentProject) { // project page
                             currentPageDisplay.textContent = `${editorContext.currentProject} > ${result.newTitle}`;
                        }
                    }
                    
                    if (isAnnouncementPage && globalAppContext && globalAppContext.fetchAnnouncementPageTree && announcementsContentArea && editorContext.currentAnnouncementContext) {
                        const annItemLi = announcementsContentArea.querySelector(`.announcement-list-item[data-announcement-id="${CSS.escape(editorContext.currentAnnouncementContext.id)}"]`);
                        const pagesContainer = annItemLi?.querySelector('.announcement-pages-container');
                        if (pagesContainer && annItemLi.classList.contains('expanded')) {
                            await globalAppContext.fetchAnnouncementPageTree(editorContext.currentAnnouncementContext.id, editorContext.currentAnnouncementContext.name, pagesContainer, false);
                            const activeLi = pagesContainer.querySelector(`li.page[data-page-id="${CSS.escape(editorContext.currentPageState.id)}"]`);
                            if (activeLi) activeLi.classList.add('active-page');
                        }
                    } else if (!isAnnouncementPage && globalAppContext && globalAppContext.fetchPageTree && pageTreeContainer) { 
                        await globalAppContext.fetchPageTree(contextId, editorContext.currentPageState.id); 
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
                console.log(`Save successful for ${contextId}/${pageIdBeingSaved}, but editor context has changed. UI not updated for that save.`);
            }
            return true;

        } catch (error) {
            if (error.message && !error.message.toLowerCase().includes('auth error')) {
                console.error('Error saving page in editor instance:', error);
                 if (editorStillOnPage) {
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
            if (editorStillOnPage) {
                if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
                if (editorContext.hasUnsavedChanges && editorContext.scheduleAutosave) {
                    editorContext.scheduleAutosave(); 
                }
            }
        }
    }

    editorContext.updateSaveButtonState = () => { 
        if (!savePageBtn) return; 
        const isAnnouncement = editorContext.currentPageState && editorContext.currentPageState.type === 'announcement';
        let saveDisabled = true;

        if (isAnnouncement) {
            saveDisabled = !isUserAdmin() || !editorContext.hasUnsavedChanges || !editorContext.currentPageState || editorContext.isSaving;
        } else { // Project page
            saveDisabled = !editorContext.hasUnsavedChanges || !editorContext.currentPageState || editorContext.isSaving;
        }
        savePageBtn.disabled = saveDisabled;
    };

    editorContext.scheduleAutosave = () => { 
        const isAnnouncement = editorContext.currentPageState && editorContext.currentPageState.type === 'announcement';
        if (isAnnouncement && !isUserAdmin()) {
            if (editorContext.autosaveTimeoutId) {
                clearTimeout(editorContext.autosaveTimeoutId);
                editorContext.autosaveTimeoutId = null;
            }
            return;
        }

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
        const isAnnouncement = editorContext.currentPageState && editorContext.currentPageState.type === 'announcement';
        if (isAnnouncement && !isUserAdmin()) {
            return;
        }

        if (!editorContext.currentPageState || 
            (!isAnnouncement && !editorContext.currentProject) || 
            (isAnnouncement && !editorContext.currentAnnouncementContext) || 
            !editorContext.hasUnsavedChanges) {
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
            
            const statusElement = editorContext.statusMessage || (globalAppContext && globalAppContext.statusMessage);
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
        if (isAnnouncement && isUserAdmin()) {
            preparedSaveData = {
                type: 'full',
                data: newMarkdown, 
                targetMarkdown: newMarkdown
                // baseVersion: editorContext.currentPageState.versionHash // if backend uses for announcements
            };
        } else if (!isAnnouncement) { // Project page
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
        } else {
            return; // Should not happen
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
            globalAppContext.currentAnnouncementContext = null; 
        }

        if (currentPageDisplay) currentPageDisplay.textContent = 'No page selected';

        if (fullClear) { 
            // Handled by auth logic / logout
        } else if (editorContext.currentUser && editorContext.displayHomepage && editorContext.currentView === 'home') {
            editorContext.displayHomepage();
        } else if (editorContext.currentProject && !fullClear && editorContext.currentView !== 'announcements_list' && editorContext.currentView !== 'announcement_detail') {
            if (currentPageDisplay) currentPageDisplay.textContent = `Project: ${editorContext.currentProject} - No page selected`;
        } else if (editorContext.currentView === 'announcements_list') {
             if (currentPageDisplay) currentPageDisplay.textContent = 'Announcements';
             liveEditor.contentEditable = 'false';
             liveEditor.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 20px;">Select an announcement to view its content.</p>';
        } else if (editorContext.currentView === 'announcement_detail' && editorContext.currentAnnouncementContext) {
             if (currentPageDisplay) currentPageDisplay.textContent = `Announcement: ${editorContext.currentAnnouncementContext.name}`;
             liveEditor.contentEditable = isUserAdmin() ? 'true' : 'false'; // Set editable based on role
             liveEditor.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 20px;">Select a page from the announcement.</p>';
        }


        if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();
     };

    editorContext.loadPageContent = async (projectName, pageId) => { // This is for USER PROJECT pages
        if (editorContext.clearHomepage) { 
            editorContext.clearHomepage();
        }
        liveEditor.contentEditable = 'true'; 
        liveEditor.dataset.placeholder = "Type '/' for commands, or start writing..."; 

        if (editorContext.autosaveTimeoutId) {
            clearTimeout(editorContext.autosaveTimeoutId);
            editorContext.autosaveTimeoutId = null;
        }
        const statusElement = editorContext.statusMessage || (globalAppContext && globalAppContext.statusMessage);
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
            editorContext.currentAnnouncementContext = null; 
            editorContext.currentPageState = { 
                id: data.id,
                originalMarkdown: data.markdown, 
                title: data.title,
                versionHash: data.versionHash,
                type: 'project' // Explicitly set type
            };
            liveEditor.innerHTML = clientConverter.makeHtml(data.markdown); 

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
            
            const mainPageTreeContainer = globalAppContext ? globalAppContext.pageTreeContainer : pageTreeContainer;
            if (mainPageTreeContainer && globalAppContext && mainPageTreeContainer === globalAppContext.pageTreeContainer) {
                const projectTreeItems = mainPageTreeContainer.querySelectorAll('.project-item li.page.active-page');
                projectTreeItems.forEach(el => el.classList.remove('active-page'));

                const activeLi = mainPageTreeContainer.querySelector(`.project-item li.page[data-page-id="${CSS.escape(pageId)}"]`);
                if (activeLi) {
                    activeLi.classList.add('active-page');
                    if (mainPageTreeContainer.contains(activeLi)) { 
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

    liveEditor.addEventListener('input', (e) => { 
        let trackChanges = false;
        if (editorContext.currentPageState) {
            if (editorContext.currentPageState.type === 'announcement') {
                if (isUserAdmin()) {
                    trackChanges = true;
                }
            } else { // For project pages
                trackChanges = true;
            }
        }

        if (trackChanges) {
            const currentEditorMarkdown = htmlToMarkdown(liveEditor.innerHTML);
            if (editorContext.currentPageState.originalMarkdown !== undefined && currentEditorMarkdown !== editorContext.currentPageState.originalMarkdown) {
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
        // This handler is for user project page links. Announcement links are handled in loadAnnouncementPageContent in sideAnnouncement.js.
        if (editorContext.currentPageState && editorContext.currentPageState.type === 'announcement') {
            return; // Let announcement-specific link handler in sideAnnouncement.js work
        }

        const target = event.target.closest('a');
        if (target && target.hasAttribute('href') && editorContext.currentProject) { // Only for project context
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
                if (editorContext.updateSaveButtonState) editorContext.updateSaveButtonState();


                if (pageIdToLoad && editorContext.loadPageContent) {
                    await editorContext.loadPageContent(editorContext.currentProject, pageIdToLoad);
                }
            }
        }
    });

    liveEditor.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter' && !e.shiftKey) { 
            const slashCommandActive = editorContext.isSlashCommandActive;
            if (slashCommandActive) {
                return;
            }
            
            let isReadOnly = liveEditor.contentEditable === 'false';
            if (editorContext.currentPageState && editorContext.currentPageState.type === 'announcement' && !isUserAdmin()) {
                 isReadOnly = true; // Non-admin cannot edit announcements
            }

            if (isReadOnly) {
                 e.preventDefault();
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

    if (liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML === '<p><br></p>') {
        liveEditor.classList.add('is-empty');
    } else {
        liveEditor.classList.remove('is-empty');
    }
    liveEditor.dataset.placeholder = "Type '/' for commands, or start writing...";
}