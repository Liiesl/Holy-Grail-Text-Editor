// embedPageModal.js

export function initEmbedPageModal(appContext) {
    const {
        showStatus,
        fetchWithAuth // Ensure fetchWithAuth is available from appContext
    } = appContext;

    let modal = document.getElementById('embed-page-modal-dynamic');
    let filterInputInstance = null;

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'embed-page-modal-dynamic';
        modal.style.display = 'none';
        modal.style.position = 'fixed';
        modal.style.zIndex = '1001';

        modal.innerHTML = `
            <div class="embed-modal-header-dynamic">
                <h3 class="embed-modal-title-dynamic">Link to Page</h3>
                <span class="embed-modal-close-button-dynamic">×</span>
            </div>
            <div class="embed-modal-body-dynamic">
                <input type="text" id="embed-page-filter-input-dynamic" placeholder="Filter pages...">
                <div id="embed-page-tree-container-dynamic">
                    <!-- Tree for current context (project or announcement) will be rendered here -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    appContext.embedPageModal = modal;
    const embedPageTreeContainer = modal.querySelector('#embed-page-tree-container-dynamic');
    appContext.embedPageTreeContainer = embedPageTreeContainer;
    filterInputInstance = modal.querySelector('#embed-page-filter-input-dynamic');

    if (!appContext.embedPageModal || !appContext.embedPageTreeContainer || !filterInputInstance) {
        console.warn("Embed Page Modal dynamic DOM elements not found/created. Feature may not work.");
        appContext.openEmbedPageModal = () => console.error("Embed Page Modal not initialized.");
        appContext.closeEmbedPageModal = () => {};
        return;
    }

    let currentCallbackOnSelect = null;
    const closeButton = appContext.embedPageModal.querySelector('.embed-modal-close-button-dynamic');

    function filterTree(query) {
        // This function assumes the tree is rendered within a container having a specific class,
        // e.g., .context-pages-container (formerly .project-pages-container)
        const contextPagesContainer = appContext.embedPageTreeContainer.querySelector('.context-pages-container');
        if (!contextPagesContainer) return;
        const pageListRootUl = contextPagesContainer.querySelector('ul');
        if (!pageListRootUl) return;

        const lowerQuery = query.toLowerCase();
        let matchesFound = false;

        const allPageItems = pageListRootUl.querySelectorAll('li.page');
        allPageItems.forEach(li => {
            const titleSpan = li.querySelector('.page-title-text');
            if (titleSpan) {
                const pageTitle = titleSpan.textContent.toLowerCase();
                const matches = lowerQuery === '' || pageTitle.includes(lowerQuery);
                li.style.display = matches ? '' : 'none';
                if (matches) {
                    matchesFound = true;
                    let current = li.parentElement;
                    while (current && current !== pageListRootUl.parentElement) {
                        if (current.tagName === 'UL' || (current.tagName === 'LI' && current.classList.contains('page'))) {
                             if (current.style.display === 'none') current.style.display = '';
                        }
                        current = current.parentElement;
                    }
                }
            }
        });

        const allUlsInTree = Array.from(pageListRootUl.querySelectorAll('ul'));
        allUlsInTree.push(pageListRootUl);

        for (let i = allUlsInTree.length - 1; i >= 0; i--) {
            const ul = allUlsInTree[i];
            const visibleLIs = Array.from(ul.children).filter(childLi =>
                childLi.tagName === 'LI' &&
                childLi.classList.contains('page') &&
                childLi.style.display !== 'none'
            );
            if (visibleLIs.length === 0 && ul.children.length > 0) {
                ul.style.display = 'none';
            } else if (visibleLIs.length > 0) {
                ul.style.display = '';
            }
        }

        const existingMsg = contextPagesContainer.querySelector('.embed-no-filter-results');
        if (existingMsg) existingMsg.remove();

        if (!matchesFound && lowerQuery !== '') {
            const noFilterResultsMsg = document.createElement('p');
            noFilterResultsMsg.className = 'embed-no-filter-results embed-no-results-message';
            noFilterResultsMsg.textContent = 'No pages match your filter.';
            if (pageListRootUl) {
                pageListRootUl.insertAdjacentElement('afterend', noFilterResultsMsg);
            } else {
                contextPagesContainer.appendChild(noFilterResultsMsg);
            }
        }
    }

    if (filterInputInstance) {
        filterInputInstance.addEventListener('input', () => {
            filterTree(filterInputInstance.value);
        });
    }

    function resetModal() {
        appContext.embedPageTreeContainer.innerHTML = '<p class="embed-loading-message">Loading...</p>';
        currentCallbackOnSelect = null;
        if (filterInputInstance) {
            filterInputInstance.value = '';
        }
        const noFilterResultsMsg = appContext.embedPageTreeContainer.querySelector('.embed-no-filter-results');
        if (noFilterResultsMsg) noFilterResultsMsg.remove();
    }

    appContext.openEmbedPageModal = (callback, anchorRect = null, initialQuery = '') => {
        resetModal();
        currentCallbackOnSelect = callback;

        const targetModal = appContext.embedPageModal;

        targetModal.style.visibility = 'hidden';
        targetModal.style.display = 'block';
        const modalRect = targetModal.getBoundingClientRect();

        let finalTop, finalLeft;

        if (anchorRect) {
            finalTop = anchorRect.top;
            finalLeft = anchorRect.right + 10;

            if (finalLeft + modalRect.width > window.innerWidth - 10) {
                finalLeft = anchorRect.left - modalRect.width - 10;
            }
            if (finalLeft < 10) {
                finalLeft = 10;
            }

            if (finalTop + modalRect.height > window.innerHeight - 10) {
                finalTop = window.innerHeight - modalRect.height - 10;
            }
            finalTop = Math.max(10, finalTop);

        } else {
            finalLeft = (window.innerWidth - modalRect.width) / 2;
            finalTop = (window.innerHeight - modalRect.height) / 2;
        }

        targetModal.style.top = `${finalTop}px`;
        targetModal.style.left = `${finalLeft}px`;
        targetModal.style.transform = '';

        targetModal.style.display = 'block';
        targetModal.style.visibility = 'visible';

        if (filterInputInstance) {
            filterInputInstance.value = initialQuery;
        }

        // --- MODIFICATION: Call generic tree loader ---
        loadContextTreeIntoModal().then(() => {
            if (filterInputInstance && initialQuery) {
                filterTree(initialQuery);
            }
            if (filterInputInstance && document.activeElement !== filterInputInstance) {
                 setTimeout(() => filterInputInstance.focus(), 50);
            }
        }).catch(err => {
            console.error("Error during loadContextTreeIntoModal or initial filter:", err);
        });
    };

    appContext.closeEmbedPageModal = () => {
        if (appContext.embedPageModal) {
            appContext.embedPageModal.style.display = 'none';
        }
        resetModal();
    };

    if (closeButton) {
        closeButton.addEventListener('click', appContext.closeEmbedPageModal);
    }

    // --- MODIFICATION: Renamed and generalized function ---
    async function loadContextTreeIntoModal() {
        const {
            currentProject,
            currentAnnouncementContext,
            currentPageState, // To check type
            currentUser,
            embedPageTreeContainer
        } = appContext;

        embedPageTreeContainer.innerHTML = '';

        let contextType = null; // 'project' or 'announcement'
        let contextId = null;
        let contextName = null;
        let apiUrl = null;
        let iconClass = 'fas fa-folder'; // Default icon

        const isUserAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'owner');

        if (currentAnnouncementContext && currentPageState && currentPageState.type === 'announcement' && isUserAdmin) {
            contextType = 'announcement';
            contextId = currentAnnouncementContext.id;
            contextName = currentAnnouncementContext.name;
            // MODIFICATION: Corrected API URL for announcement tree
            apiUrl = `/api/admin/announcements/${contextId}/tree`;
            iconClass = 'fas fa-bullhorn'; // Icon for announcements
        } else if (currentProject) {
            contextType = 'project';
            contextId = currentProject;
            contextName = currentProject; // Assuming currentProject is the ID/name string
            apiUrl = `/api/project/${contextId}/tree`;
            iconClass = 'fas fa-book'; // Icon for projects
        }

        if (!contextType || !contextId || !apiUrl) {
            embedPageTreeContainer.innerHTML = '<p class="embed-no-results-message">No active project or valid announcement context found to list pages.</p>';
            return;
        }

        const contextListUl = document.createElement('ul');
        contextListUl.className = 'context-list'; // Generic class
        embedPageTreeContainer.appendChild(contextListUl);

        const contextLi = document.createElement('li');
        contextLi.className = 'context-item'; // Generic class
        contextLi.dataset.contextId = contextId;
        contextLi.dataset.contextType = contextType;


        const contextHeaderDiv = document.createElement('div');
        contextHeaderDiv.className = 'context-header'; // Generic class

        const contextTypeIcon = document.createElement('i');
        contextTypeIcon.className = iconClass; // Dynamic icon
        contextHeaderDiv.appendChild(contextTypeIcon);

        const contextNameSpan = document.createElement('span');
        contextNameSpan.textContent = contextName; // Dynamic name
        contextNameSpan.className = 'context-name-text'; // Generic class
        contextHeaderDiv.appendChild(contextNameSpan);
        contextLi.appendChild(contextHeaderDiv);

        const contextPagesDiv = document.createElement('div');
        // Use a generic class name for the container of pages, so filterTree can find it
        contextPagesDiv.className = 'context-pages-container';
        contextPagesDiv.style.display = 'block';
        contextLi.appendChild(contextPagesDiv);
        contextListUl.appendChild(contextLi);

        contextPagesDiv.innerHTML = '<li class="embed-loading-message" style="padding-left: 15px; list-style: none;">Loading pages...</li>';
        try {
            const response = await fetchWithAuth(apiUrl);
            if (!response.ok) {
                 const errData = await response.json().catch(() => ({error: `Server error ${response.status}`}));
                 if (response.status === 404 && errData.error && errData.error.toLowerCase().includes("root page") && errData.error.toLowerCase().includes("not found")) {
                    contextPagesDiv.innerHTML = `<li class="embed-no-results-message" style="padding-left: 15px; list-style: none;">${contextName} is empty.</li>`;
                    return;
                 }
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const treeData = await response.json();

            if (!treeData.rootPageId && (!treeData.tree || treeData.tree.length === 0)) {
                 contextPagesDiv.innerHTML = `<li class="embed-no-results-message" style="padding-left: 15px; list-style: none;">${contextName} is empty or has no pages.</li>`;
                 return;
            }

            contextPagesDiv.innerHTML = '';
            const pageListRootUl = document.createElement('ul');

            if (treeData.rootPageId && treeData.rootPageTitle) {
                const rootPageNode = {
                    id: treeData.rootPageId,
                    title: treeData.rootPageTitle,
                    children: treeData.tree
                };
                // Pass contextName and contextType to item creation, though not strictly used by callback data yet
                const rootLi = createPageListItemForEmbedModal(rootPageNode, contextName, contextType, currentCallbackOnSelect);
                pageListRootUl.appendChild(rootLi);
            } else {
                renderPageTreeForEmbedModalRecursive(treeData.tree, pageListRootUl, contextName, contextType, currentCallbackOnSelect);
            }
            contextPagesDiv.appendChild(pageListRootUl);

        } catch (error) {
            console.error(`Error fetching page tree for ${contextType} '${contextName}' in embed modal:`, error);
            contextPagesDiv.innerHTML = `<li class="embed-error-message" style="padding-left: 15px; list-style: none;">Error loading pages: ${error.message}</li>`;
            if (showStatus) showStatus(`Failed to load tree for ${contextName}: ${error.message}`, 'error');
        }
    }

    // --- MODIFICATION: Added contextType to parameters, changed projectName to contextName ---
    function createPageListItemForEmbedModal(node, contextName, contextType, callback) {
        const li = document.createElement('li');
        li.dataset.pageId = node.id;
        li.className = 'page';

        const itemContentWrapper = document.createElement('div');
        itemContentWrapper.className = 'page-item-content';

        const icon = document.createElement('i');
        icon.className = 'fas fa-file-lines';
        itemContentWrapper.appendChild(icon);

        const titleSpan = document.createElement('span');
        titleSpan.textContent = node.title;
        titleSpan.className = 'page-title-text';
        itemContentWrapper.appendChild(titleSpan);
        li.appendChild(itemContentWrapper);

        itemContentWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            if (callback) {
                callback({
                    // contextName: contextName, // Could be useful for callback consumer
                    // contextType: contextType, // Could be useful
                    pageId: node.id,
                    pageTitle: node.title
                });
                // Closing modal is handled by the callback in embedPageCommand
            }
        });

        if (node.children && node.children.length > 0) {
            const childrenUl = document.createElement('ul');
            renderPageTreeForEmbedModalRecursive(node.children, childrenUl, contextName, contextType, callback);
            li.appendChild(childrenUl);
        }
        return li;
    }

    // --- MODIFICATION: Added contextType to parameters, changed projectName to contextName ---
    function renderPageTreeForEmbedModalRecursive(nodes, parentUlElement, contextName, contextType, callback) {
        if (!nodes || nodes.length === 0) {
            return;
        }
        nodes.forEach(node => {
            const li = createPageListItemForEmbedModal(node, contextName, contextType, callback);
            parentUlElement.appendChild(li);
        });
    }
}