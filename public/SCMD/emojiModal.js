// SCMD/emojiModal.js

// Define categories, their order, icons, and IDs for sections/navigation
const CATEGORY_CONFIG = [
    { name: "Smileys & Emotion", icon: "fa-regular fa-face-smile", id: "cat-smileys-emotion" },
    { name: "People & Body", icon: "fa-solid fa-child", id: "cat-people-body" },
    { name: "Animals & Nature", icon: "fa-solid fa-paw", id: "cat-animals-nature" },
    { name: "Food & Drink", icon: "fa-solid fa-utensils", id: "cat-food-drink" },
    { name: "Activities", icon: "fa-solid fa-futbol", id: "cat-activities" },
    { name: "Travel & Places", icon: "fa-solid fa-car", id: "cat-travel-places" },
    { name: "Objects", icon: "fa-regular fa-lightbulb", id: "cat-objects" },
    { name: "Symbols", icon: "fa-solid fa-icons", id: "cat-symbols" },
    { name: "Flags", icon: "fa-regular fa-flag", id: "cat-flags" }
];

// Helper to generate a unique ID for categories not in CATEGORY_CONFIG
const generateCategoryId = (name) => `cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

export function initEmojiModal(appContext) {
    const { showStatus } = appContext;

    let modal = document.getElementById('emoji-modal-dynamic');
    let filterInputInstance = null;
    let emojiListContainerInstance = null;
    let categoryNavContainerInstance = null; // For category navigation icons
    let currentCallbackOnSelect = null;
    let highlightedEmojiIndex = -1;

    appContext.emojiCache = null;

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'emoji-modal-dynamic';
        modal.style.display = 'none';
        // modal.style.position, zIndex etc are handled by CSS

        modal.innerHTML = `
            <div class="emoji-modal-header-dynamic">
                <h3 class="emoji-modal-title-dynamic">Insert Emoji</h3>
                <span class="emoji-modal-close-button-dynamic">×</span>
            </div>
            <div class="emoji-modal-body-dynamic">
                <input type="text" id="emoji-filter-input-dynamic" placeholder="Filter emojis..." style="display: none;">
                <div id="emoji-category-nav-dynamic">
                    <!-- Category icons will be rendered here -->
                </div>
                <div id="emoji-list-container-dynamic">
                    <!-- Emojis will be rendered here by category -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    appContext.emojiModal = modal;
    emojiListContainerInstance = modal.querySelector('#emoji-list-container-dynamic');
    categoryNavContainerInstance = modal.querySelector('#emoji-category-nav-dynamic');
    appContext.emojiListContainer = emojiListContainerInstance; // Keep for potential external use
    filterInputInstance = modal.querySelector('#emoji-filter-input-dynamic');
    if (filterInputInstance) filterInputInstance.style.display = 'none';

    if (!modal || !emojiListContainerInstance || !categoryNavContainerInstance) {
        console.warn("Emoji Modal dynamic DOM elements not found/created. Feature may not work.");
        // Provide dummy functions to prevent errors if initialization fails
        appContext.openEmojiModal = () => console.error("Emoji Modal not initialized.");
        appContext.closeEmojiModal = () => {};
        return;
    }

    const closeButton = modal.querySelector('.emoji-modal-close-button-dynamic');

    function updateHighlightedEmoji() {
        if (!emojiListContainerInstance) return;
        // Query for items that are not style="display: none" AND their parent section is not style="display:none"
        const items = Array.from(emojiListContainerInstance.querySelectorAll('.emoji-category-section:not([style*="display: none"]) .emoji-item:not([style*="display: none"])'));
        
        items.forEach((item, index) => {
            if (index === highlightedEmojiIndex) {
                item.classList.add('highlighted');
                item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            } else {
                item.classList.remove('highlighted');
            }
        });
    }
    
    appContext.filterEmojisInModal = (query) => {
        if (!appContext.emojiCache || !emojiListContainerInstance) return;

        const lowerQuery = query.toLowerCase().trim();
        let totalMatchesFound = 0;
        
        const categorySections = emojiListContainerInstance.querySelectorAll('.emoji-category-section');

        categorySections.forEach(section => {
            const items = section.querySelectorAll('.emoji-item');
            let sectionMatchesFound = 0;
            items.forEach(item => {
                const emojiName = item.dataset.emojiName.toLowerCase();
                const keywordsString = item.dataset.emojiKeywords || '';
                const emojiKeywords = keywordsString.toLowerCase().split(',').filter(k => k.trim() !== '');

                let matches = lowerQuery === ''; // Show all if query is empty
                if (!matches) {
                    matches = emojiName.includes(lowerQuery) || 
                              emojiKeywords.some(keyword => keyword.includes(lowerQuery));
                }
                
                item.style.display = matches ? '' : 'none';
                if (matches) {
                    sectionMatchesFound++;
                    totalMatchesFound++;
                }
                item.classList.remove('highlighted'); 
            });

            section.style.display = sectionMatchesFound > 0 ? '' : 'none';
        });
        
        // Manage "No results" message
        let noFilterResultsMsg = emojiListContainerInstance.querySelector('.emoji-no-filter-results.emoji-message');
        if (totalMatchesFound === 0 && lowerQuery !== '') {
            if (!noFilterResultsMsg) {
                noFilterResultsMsg = document.createElement('p');
                // Using general .emoji-message and specific .emoji-no-filter-results for styling
                noFilterResultsMsg.className = 'emoji-message emoji-no-filter-results'; 
                emojiListContainerInstance.appendChild(noFilterResultsMsg);
            }
            noFilterResultsMsg.textContent = 'No emojis match your filter.';
            noFilterResultsMsg.style.display = ''; 
        } else {
            if (noFilterResultsMsg) {
                noFilterResultsMsg.style.display = 'none'; 
            }
        }

        // Update highlighted index based on new set of visible items
        const allVisibleItems = Array.from(emojiListContainerInstance.querySelectorAll('.emoji-category-section:not([style*="display: none"]) .emoji-item:not([style*="display: none"])'));
        if (allVisibleItems.length > 0) {
            highlightedEmojiIndex = 0; // Highlight the first visible item
        } else {
            highlightedEmojiIndex = -1;
        }
        updateHighlightedEmoji();
    };

    appContext.navigateEmojiInModal = (direction) => {
        if (!emojiListContainerInstance) return;
        const visibleItems = Array.from(emojiListContainerInstance.querySelectorAll('.emoji-category-section:not([style*="display: none"]) .emoji-item:not([style*="display: none"])'));
        if (visibleItems.length === 0) {
            highlightedEmojiIndex = -1;
            return;
        }

        if (highlightedEmojiIndex === -1 && visibleItems.length > 0) { // If no current highlight, start at first/last
            highlightedEmojiIndex = direction === 'down' ? 0 : visibleItems.length - 1;
        } else {
            if (direction === 'down') {
                highlightedEmojiIndex = (highlightedEmojiIndex + 1) % visibleItems.length;
            } else if (direction === 'up') {
                highlightedEmojiIndex = (highlightedEmojiIndex - 1 + visibleItems.length) % visibleItems.length;
            }
        }
        updateHighlightedEmoji();
    };

    appContext.selectEmojiInModal = () => {
        if (!emojiListContainerInstance || highlightedEmojiIndex === -1) return false;
        const visibleItems = Array.from(emojiListContainerInstance.querySelectorAll('.emoji-category-section:not([style*="display: none"]) .emoji-item:not([style*="display: none"])'));
        const selectedItem = visibleItems[highlightedEmojiIndex];

        if (selectedItem && currentCallbackOnSelect) {
            currentCallbackOnSelect({
                char: selectedItem.dataset.emojiChar,
                name: selectedItem.dataset.emojiName
            });
            // Optionally close modal here or let the callback handle it
            // appContext.closeEmojiModal(); 
            return true;
        }
        return false;
    };

    function resetModal() {
        if (emojiListContainerInstance) {
            emojiListContainerInstance.innerHTML = '<p class="emoji-loading-message emoji-message">Loading emojis...</p>';
        }
        if (categoryNavContainerInstance) {
            categoryNavContainerInstance.innerHTML = ''; // Clear category nav
        }
        currentCallbackOnSelect = null;
        highlightedEmojiIndex = -1;
    }

    appContext.openEmojiModal = (callback, anchorRect = null, initialQuery = '') => {
        resetModal();
        currentCallbackOnSelect = callback;

        modal.style.visibility = 'hidden'; // Hide while positioning
        modal.style.display = 'flex'; // Changed from 'block' to match CSS
        
        // Positioning logic (same as before)
        const modalRect = modal.getBoundingClientRect();
        let finalTop, finalLeft;
        if (anchorRect) {
            const modalWidth = modalRect.width;
            const modalHeight = modalRect.height;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const margin = 5;
            const edgePadding = 10;

            let proposedLeft = anchorRect.right + margin;
            let proposedTop = anchorRect.top;

            if (proposedLeft + modalWidth > windowWidth - edgePadding) {
                proposedLeft = anchorRect.left - modalWidth - margin;
                if (proposedLeft < edgePadding) { // If still out of bounds or too close to left
                    proposedLeft = Math.max(edgePadding, anchorRect.left - ( (anchorRect.left + modalWidth > windowWidth - edgePadding) ? modalWidth : 0));
                     // Try to align left if it overflows right, but ensure it doesn't go off-screen left
                    if (proposedLeft + modalWidth > windowWidth - edgePadding) { // If aligning left also fails, center or fix
                         proposedLeft = windowWidth - modalWidth - edgePadding;
                    }
                }
            }
            proposedLeft = Math.max(edgePadding, proposedLeft);
            finalLeft = proposedLeft;

            if (proposedTop + modalHeight > windowHeight - edgePadding) {
                proposedTop = windowHeight - modalHeight - edgePadding;
            }
            proposedTop = Math.max(edgePadding, proposedTop);
            finalTop = proposedTop;
        } else {
            finalLeft = (window.innerWidth - modalRect.width) / 2;
            finalTop = (window.innerHeight - modalRect.height) / 2;
        }
        modal.style.top = `${finalTop}px`;
        modal.style.left = `${finalLeft}px`;
        modal.style.transform = ''; 
        modal.style.visibility = 'visible'; // Show after positioning

        loadEmojis().then(() => {
            if (appContext.filterEmojisInModal) {
                appContext.filterEmojisInModal(initialQuery || ''); // Apply initial filter or show all
            }
        }).catch(err => {
            console.error("Error during loadEmojis or initial filter:", err);
            if (emojiListContainerInstance) {
                emojiListContainerInstance.innerHTML = `<p class="emoji-error-message emoji-message">Error loading emojis: ${err.message}</p>`;
            }
        });
    };

    appContext.closeEmojiModal = () => {
        if (modal) {
            modal.style.display = 'none';
        }
        highlightedEmojiIndex = -1;
    };

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            let activeEditorContext = appContext;
            const topPeekModal = appContext.getTopPeekModal ? appContext.getTopPeekModal() : null;
            if (topPeekModal && topPeekModal.editorContext && topPeekModal.editorContext.isEmojiSearchActive) {
                activeEditorContext = topPeekModal.editorContext;
            }
            
            if (activeEditorContext._removeEmojiTriggerTextAndStateFromEditor) {
                activeEditorContext._removeEmojiTriggerTextAndStateFromEditor(true); 
            } else {
                appContext.closeEmojiModal();
            }
        });
    }

    async function loadEmojis() {
        if (!emojiListContainerInstance) return Promise.reject(new Error("Emoji list container not found"));

        if (appContext.emojiCache) {
            renderEmojiList(appContext.emojiCache);
            return Promise.resolve();
        }

        emojiListContainerInstance.innerHTML = '<p class="emoji-loading-message emoji-message">Loading emojis...</p>';
        try {
            const response = await fetch('./SCMD/emoji-data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const emojiData = await response.json();
            appContext.emojiCache = emojiData;
            renderEmojiList(emojiData);
        } catch (error) {
            console.error('Error fetching emoji list:', error);
            emojiListContainerInstance.innerHTML = `<p class="emoji-error-message emoji-message">Failed to load emojis: ${error.message}</p>`;
            if (showStatus) showStatus(`Failed to load emoji list: ${error.message}`, 'error');
            throw error; // Re-throw to be caught by openEmojiModal's catch
        }
    }

    function renderEmojiList(emojiData) {
        if (!emojiListContainerInstance || !categoryNavContainerInstance) return;

        emojiListContainerInstance.innerHTML = ''; 
        categoryNavContainerInstance.innerHTML = '';

        if (!emojiData || emojiData.length === 0) {
            emojiListContainerInstance.innerHTML = '<p class="emoji-message">No emojis found.</p>';
            return;
        }

        const groupedEmojis = new Map();
        emojiData.forEach(emoji => {
            if (emoji.category && emoji.category.toLowerCase().includes('component')) { // Skip 'component' emojis
                return; 
            }
            const categoryName = emoji.category || 'Uncategorized';
            if (!groupedEmojis.has(categoryName)) {
                groupedEmojis.set(categoryName, []);
            }
            groupedEmojis.get(categoryName).push(emoji);
        });

        const categoryDetailsLookup = new Map(CATEGORY_CONFIG.map(c => [c.name, c]));
        const finalCategoryOrder = [];

        // Add categories from CATEGORY_CONFIG that exist in data
        CATEGORY_CONFIG.forEach(catConf => {
            if (groupedEmojis.has(catConf.name) && groupedEmojis.get(catConf.name).length > 0) {
                finalCategoryOrder.push({ ...catConf, emojis: groupedEmojis.get(catConf.name) });
            }
        });

        // Add any other categories from data not in CATEGORY_CONFIG (e.g., "Uncategorized")
        groupedEmojis.forEach((emojis, name) => {
            if (!categoryDetailsLookup.has(name) && emojis.length > 0) {
                finalCategoryOrder.push({
                    name: name,
                    icon: 'fa-solid fa-shapes', // Default icon for uncategorized
                    id: generateCategoryId(name),
                    emojis: emojis
                });
            }
        });
        
        if (finalCategoryOrder.length === 0) {
            emojiListContainerInstance.innerHTML = '<p class="emoji-message">No displayable emojis found.</p>';
            return;
        }

        const listFragment = document.createDocumentFragment();

        finalCategoryOrder.forEach(categoryInfo => {
            // 1. Create category navigation button
            const navButton = document.createElement('button');
            navButton.className = 'emoji-category-button-dynamic';
            navButton.title = categoryInfo.name;
            navButton.dataset.targetCategoryId = categoryInfo.id;
            navButton.innerHTML = `<i class="${categoryInfo.icon}" aria-hidden="true"></i>`;
            navButton.setAttribute('aria-label', categoryInfo.name);
            
            navButton.addEventListener('click', () => {
                const targetSection = emojiListContainerInstance.querySelector(`#${categoryInfo.id}`);
                if (targetSection) {
                    targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
            categoryNavContainerInstance.appendChild(navButton);

            // 2. Create category section in the list
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'emoji-category-section';
            sectionDiv.id = categoryInfo.id;

            const headerEl = document.createElement('h5');
            headerEl.className = 'emoji-category-header-dynamic';
            headerEl.textContent = categoryInfo.name;
            sectionDiv.appendChild(headerEl);

            const gridDiv = document.createElement('div');
            gridDiv.className = 'emoji-category-grid-dynamic';

            categoryInfo.emojis.forEach(emoji => {
                const itemDiv = document.createElement('div'); // Changed from 'li'
                itemDiv.className = 'emoji-item';
                itemDiv.dataset.emojiChar = emoji.emoji;
                itemDiv.dataset.emojiName = emoji.name;
                itemDiv.dataset.emojiKeywords = emoji.keywords ? emoji.keywords.join(',') : '';
                itemDiv.setAttribute('role', 'button');
                itemDiv.setAttribute('aria-label', emoji.name);


                const charSpan = document.createElement('span');
                charSpan.className = 'emoji-char';
                charSpan.textContent = emoji.emoji;
                charSpan.setAttribute('aria-hidden', 'true'); // Character itself might be read with emoji item's aria-label

                const nameSpan = document.createElement('span'); // Hidden by CSS
                nameSpan.className = 'emoji-name';
                nameSpan.textContent = emoji.name;

                itemDiv.appendChild(charSpan);
                itemDiv.appendChild(nameSpan);

                itemDiv.addEventListener('click', () => {
                    if (currentCallbackOnSelect) {
                        currentCallbackOnSelect({ char: emoji.emoji, name: emoji.name });
                    }
                });
                itemDiv.addEventListener('keydown', (e) => { // For Enter/Space if item gets focus
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                         if (currentCallbackOnSelect) {
                            currentCallbackOnSelect({ char: emoji.emoji, name: emoji.name });
                        }
                    }
                });
                gridDiv.appendChild(itemDiv);
            });
            sectionDiv.appendChild(gridDiv);
            listFragment.appendChild(sectionDiv);
        });

        emojiListContainerInstance.appendChild(listFragment);
        
        // Set initial highlight
        const allVisibleItems = Array.from(emojiListContainerInstance.querySelectorAll('.emoji-category-section:not([style*="display: none"]) .emoji-item:not([style*="display: none"])'));
        highlightedEmojiIndex = allVisibleItems.length > 0 ? 0 : -1;
        if (highlightedEmojiIndex !== -1) {
            updateHighlightedEmoji();
        }
    }
}