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
                    <!-- Tree for current project will be rendered here -->
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
        const projectPagesContainer = appContext.embedPageTreeContainer.querySelector('.project-pages-container');
        if (!projectPagesContainer) return;
        const pageListRootUl = projectPagesContainer.querySelector('ul');
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
                    // Make sure ancestors are visible if a child matches
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

        // After filtering LIs, adjust visibility of ULs that might have become empty.
        const allUlsInTree = Array.from(pageListRootUl.querySelectorAll('ul'));
        allUlsInTree.push(pageListRootUl); // Include the root UL itself for checking

        for (let i = allUlsInTree.length - 1; i >= 0; i--) {
            const ul = allUlsInTree[i];
            const visibleLIs = Array.from(ul.children).filter(childLi => 
                childLi.tagName === 'LI' && 
                childLi.classList.contains('page') && 
                childLi.style.display !== 'none'
            );
            if (visibleLIs.length === 0 && ul.children.length > 0) { // Only hide if it had LIs and now all are hidden
                ul.style.display = 'none';
            } else if (visibleLIs.length > 0) {
                ul.style.display = ''; // Ensure it's visible if it has visible children
            }
        }
        
        // Handle "no results" message for filtering
        const existingMsg = projectPagesContainer.querySelector('.embed-no-filter-results');
        if (existingMsg) existingMsg.remove();

        if (!matchesFound && lowerQuery !== '') {
            const noFilterResultsMsg = document.createElement('p');
            noFilterResultsMsg.className = 'embed-no-filter-results embed-no-results-message';
            noFilterResultsMsg.textContent = 'No pages match your filter.';
            // Append it inside projectPagesContainer, ideally after the (now hidden) list
            if (pageListRootUl) {
                pageListRootUl.insertAdjacentElement('afterend', noFilterResultsMsg);
            } else {
                projectPagesContainer.appendChild(noFilterResultsMsg);
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

        loadCurrentProjectTreeIntoModal().then(() => {
            if (filterInputInstance && initialQuery) {
                filterTree(initialQuery); // Apply initial filter after tree is loaded
            }
            if (filterInputInstance && document.activeElement !== filterInputInstance) {
                 setTimeout(() => filterInputInstance.focus(), 50); // Focus after tree load and initial filter
            }
        }).catch(err => {
            console.error("Error during loadCurrentProjectTreeIntoModal or initial filter:", err);
            // Error message already shown by loadCurrentProjectTreeIntoModal's catch, or by fetchWithAuth
            // embedPageTreeContainer.innerHTML = `<p class="embed-error-message">Error loading page list: ${err.message}</p>`;
        });
    };

    appContext.closeEmbedPageModal = () => {
        if (appContext.embedPageModal) { // Check if modal exists
            appContext.embedPageModal.style.display = 'none';
        }
        resetModal(); 
    };

    if (closeButton) {
        closeButton.addEventListener('click', appContext.closeEmbedPageModal);
    }

    async function loadCurrentProjectTreeIntoModal() {
        const { currentProject, embedPageTreeContainer } = appContext; 

        embedPageTreeContainer.innerHTML = ''; 

        if (!currentProject) {
            embedPageTreeContainer.innerHTML = '<p class="embed-no-results-message">Please select an active project in the sidebar first.</p>';
            return;
        }

        const projectListUl = document.createElement('ul');
        projectListUl.className = 'project-list'; 
        embedPageTreeContainer.appendChild(projectListUl);

        const projectLi = document.createElement('li');
        projectLi.className = 'project-item'; 
        projectLi.dataset.projectName = currentProject;

        const projectHeaderDiv = document.createElement('div');
        projectHeaderDiv.className = 'project-header'; 
        
        const projectTypeIcon = document.createElement('i');
        projectTypeIcon.className = 'fas fa-book'; 
        projectHeaderDiv.appendChild(projectTypeIcon);

        const projectNameSpan = document.createElement('span');
        projectNameSpan.textContent = currentProject;
        projectNameSpan.className = 'project-name-text'; 
        projectHeaderDiv.appendChild(projectNameSpan);
        projectLi.appendChild(projectHeaderDiv);

        const projectPagesDiv = document.createElement('div');
        projectPagesDiv.className = 'project-pages-container'; 
        projectPagesDiv.style.display = 'block'; 
        projectLi.appendChild(projectPagesDiv);
        projectListUl.appendChild(projectLi); 

        projectPagesDiv.innerHTML = '<li class="embed-loading-message" style="padding-left: 15px; list-style: none;">Loading pages...</li>';
        try {
            const response = await fetchWithAuth(`/api/project/${currentProject}/tree`); // Use fetchWithAuth
            if (!response.ok) {
                 // fetchWithAuth handles 401/403. This handles other non-OK responses.
                 const errData = await response.json().catch(() => ({error: `Server error ${response.status}`}));
                 if (response.status === 404 && errData.error && errData.error.toLowerCase().includes("root page") && errData.error.toLowerCase().includes("not found")) {
                    projectPagesDiv.innerHTML = '<li class="embed-no-results-message" style="padding-left: 15px; list-style: none;">Project is empty.</li>';
                    return; // Return to prevent further processing and error display
                 }
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const treeData = await response.json();

            if (!treeData.rootPageId && (!treeData.tree || treeData.tree.length === 0)) {
                 projectPagesDiv.innerHTML = '<li class="embed-no-results-message" style="padding-left: 15px; list-style: none;">Project is empty or has no pages.</li>';
                 return;
            }
            
            projectPagesDiv.innerHTML = ''; 
            const pageListRootUl = document.createElement('ul'); 

            if (treeData.rootPageId && treeData.rootPageTitle) {
                const rootPageNode = {
                    id: treeData.rootPageId,
                    title: treeData.rootPageTitle,
                    children: treeData.tree 
                };
                const rootLi = createPageListItemForEmbedModal(rootPageNode, currentProject, currentCallbackOnSelect);
                pageListRootUl.appendChild(rootLi);
            } else { 
                renderPageTreeForEmbedModalRecursive(treeData.tree, pageListRootUl, currentProject, currentCallbackOnSelect);
            }
            projectPagesDiv.appendChild(pageListRootUl);

        } catch (error) {
            // This catch block will handle errors thrown by fetchWithAuth (e.g. auth failure),
            // or by the !response.ok check above.
            console.error(`Error fetching page tree for ${currentProject} in embed modal:`, error);
            projectPagesDiv.innerHTML = `<li class="embed-error-message" style="padding-left: 15px; list-style: none;">Error loading pages: ${error.message}</li>`;
            // If fetchWithAuth shows login, this status is for a logged-out user.
            // If it's another error, it's a relevant operational error.
            if (showStatus) showStatus(`Failed to load tree for ${currentProject}: ${error.message}`, 'error');
        }
    }

    function createPageListItemForEmbedModal(node, projectName, callback) {
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
                    projectName: projectName,
                    pageId: node.id,
                    pageTitle: node.title
                });
                // Closing modal is now handled by the callback defined in embedPageCommand
                // appContext.closeEmbedPageModal(); // This would be premature here
            }
        });

        if (node.children && node.children.length > 0) {
            const childrenUl = document.createElement('ul');
            renderPageTreeForEmbedModalRecursive(node.children, childrenUl, projectName, callback);
            li.appendChild(childrenUl);
        }
        return li;
    }

    function renderPageTreeForEmbedModalRecursive(nodes, parentUlElement, projectName, callback) {
        if (!nodes || nodes.length === 0) {
            return;
        }
        nodes.forEach(node => {
            const li = createPageListItemForEmbedModal(node, projectName, callback);
            parentUlElement.appendChild(li);
        });
    }
}