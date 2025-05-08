// SCMD/emojiModal.js

export function initEmojiModal(appContext) {
    const { showStatus } = appContext;

    let modal = document.getElementById('emoji-modal-dynamic');
    let filterInputInstance = null;
    let emojiListContainerInstance = null;
    let currentCallbackOnSelect = null;

    appContext.emojiCache = null; // To cache fetched emoji data

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'emoji-modal-dynamic';
        modal.style.display = 'none';
        // Basic styling, more in emojiModal.css
        modal.style.position = 'fixed';
        modal.style.zIndex = '1001'; // Above slash command modal (1000)

        modal.innerHTML = `
            <div class="emoji-modal-header-dynamic">
                <h3 class="emoji-modal-title-dynamic">Insert Emoji</h3>
                <span class="emoji-modal-close-button-dynamic">×</span>
            </div>
            <div class="emoji-modal-body-dynamic">
                <input type="text" id="emoji-filter-input-dynamic" placeholder="Filter emojis...">
                <div id="emoji-list-container-dynamic">
                    <!-- Emojis will be rendered here -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    appContext.emojiModal = modal;
    emojiListContainerInstance = modal.querySelector('#emoji-list-container-dynamic');
    appContext.emojiListContainer = emojiListContainerInstance; // For potential external access
    filterInputInstance = modal.querySelector('#emoji-filter-input-dynamic');

    if (!modal || !emojiListContainerInstance || !filterInputInstance) {
        console.warn("Emoji Modal dynamic DOM elements not found/created. Feature may not work.");
        appContext.openEmojiModal = () => console.error("Emoji Modal not initialized.");
        appContext.closeEmojiModal = () => {};
        return;
    }

    const closeButton = modal.querySelector('.emoji-modal-close-button-dynamic');

    function filterEmojis(query) {
        if (!appContext.emojiCache || !emojiListContainerInstance) return;

        const lowerQuery = query.toLowerCase().trim();
        let matchesFound = false;
        const items = emojiListContainerInstance.querySelectorAll('.emoji-item');

        items.forEach(item => {
            const emojiName = item.dataset.emojiName.toLowerCase();
            // Add more dataset attributes for keywords if available and needed
            const matches = lowerQuery === '' || emojiName.includes(lowerQuery);
            item.style.display = matches ? '' : 'none';
            if (matches) {
                matchesFound = true;
            }
        });
        
        const existingMsg = emojiListContainerInstance.querySelector('.emoji-no-filter-results');
        if (existingMsg) existingMsg.remove();

        if (!matchesFound && lowerQuery !== '') {
            const noFilterResultsMsg = document.createElement('p');
            noFilterResultsMsg.className = 'emoji-no-filter-results emoji-message';
            noFilterResultsMsg.textContent = 'No emojis match your filter.';
            emojiListContainerInstance.appendChild(noFilterResultsMsg); // Append inside list container
        }
    }

    if (filterInputInstance) {
        filterInputInstance.addEventListener('input', () => {
            filterEmojis(filterInputInstance.value);
        });
    }

    function resetModal() {
        if (emojiListContainerInstance) {
            emojiListContainerInstance.innerHTML = '<p class="emoji-loading-message emoji-message">Loading emojis...</p>';
        }
        currentCallbackOnSelect = null;
        if (filterInputInstance) {
            filterInputInstance.value = '';
        }
        const noFilterResultsMsg = emojiListContainerInstance ? emojiListContainerInstance.querySelector('.emoji-no-filter-results') : null;
        if (noFilterResultsMsg) noFilterResultsMsg.remove();
    }

    appContext.openEmojiModal = (callback, anchorRect = null, initialQuery = '') => {
        resetModal();
        currentCallbackOnSelect = callback;

        modal.style.visibility = 'hidden';
        modal.style.display = 'block';
        const modalRect = modal.getBoundingClientRect();
        let finalTop, finalLeft;

        if (anchorRect) { // anchorRect is the slashCommandModal's rect or similar UI element
            const modalWidth = modalRect.width;
            const modalHeight = modalRect.height;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const margin = 5; // Space between modals/elements
            const edgePadding = 10; // Min space from window edge

            // Attempt 1: Position to the right of the anchor, top-aligned with anchor
            let proposedLeft = anchorRect.right + margin;
            let proposedTop = anchorRect.top;

            // Check if it fits on the right. If not, try to the left.
            if (proposedLeft + modalWidth > windowWidth - edgePadding) {
                proposedLeft = anchorRect.left - modalWidth - margin;
                
                // If placing it on the left also makes it go off-screen (left side),
                // or if the anchor is very wide, position it aligned with anchor's left edge,
                // but ensure it doesn't overflow the right window edge.
                if (proposedLeft < edgePadding) {
                    proposedLeft = anchorRect.left; // Align with anchor's left
                    if (proposedLeft + modalWidth > windowWidth - edgePadding) {
                        // If still overflows right, push it from the right edge of the window
                        proposedLeft = windowWidth - modalWidth - edgePadding;
                    }
                }
            }
            
            // Ensure it's not off-screen left after horizontal adjustments
            proposedLeft = Math.max(edgePadding, proposedLeft);
            finalLeft = proposedLeft;

            // Vertical positioning:
            // Start by aligning modal's top with anchor's top.
            // If modal's bottom goes below window's bottom edge:
            if (proposedTop + modalHeight > windowHeight - edgePadding) {
                // Shift modal up so its bottom aligns with the window's bottom edge (minus padding)
                proposedTop = windowHeight - modalHeight - edgePadding;
            }
            // Ensure modal's top is not above window's top edge:
            proposedTop = Math.max(edgePadding, proposedTop);
            finalTop = proposedTop;

        } else {
            // Fallback: Center on screen if no anchorRect is provided
            finalLeft = (window.innerWidth - modalRect.width) / 2;
            finalTop = (window.innerHeight - modalRect.height) / 2;
        }

        modal.style.top = `${finalTop}px`;
        modal.style.left = `${finalLeft}px`;
        modal.style.transform = ''; // Reset transform if it was used for centering previously
        modal.style.visibility = 'visible';

        if (filterInputInstance) {
            filterInputInstance.value = initialQuery; // Usually empty for emojis
        }

        loadEmojis().then(() => {
            if (filterInputInstance && initialQuery) {
                filterEmojis(initialQuery);
            }
            if (filterInputInstance && document.activeElement !== filterInputInstance) {
                setTimeout(() => filterInputInstance.focus(), 50);
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
        // Don't reset here, resetModal is called by openEmojiModal.
    };

    if (closeButton) {
        closeButton.addEventListener('click', appContext.closeEmojiModal);
    }

    async function loadEmojis() {
        if (!emojiListContainerInstance) return;

        if (appContext.emojiCache) {
            renderEmojiList(appContext.emojiCache);
            return;
        }

        emojiListContainerInstance.innerHTML = '<p class="emoji-loading-message emoji-message">Loading emojis...</p>';
        try {
            // Using unpkg for emoji.json (versioned for stability)
            const response = await fetch('https://unpkg.com/emoji.json@13.1.0/emoji.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const emojiData = await response.json();
            appContext.emojiCache = emojiData; // Cache the data
            renderEmojiList(emojiData);
        } catch (error) {
            console.error('Error fetching emoji list:', error);
            emojiListContainerInstance.innerHTML = `<p class="emoji-error-message emoji-message">Failed to load emojis: ${error.message}</p>`;
            if (showStatus) showStatus(`Failed to load emoji list: ${error.message}`, 'error');
        }
    }

    function renderEmojiList(emojiData) {
        if (!emojiListContainerInstance) return;
        emojiListContainerInstance.innerHTML = ''; // Clear loading message

        if (!emojiData || emojiData.length === 0) {
            emojiListContainerInstance.innerHTML = '<p class="emoji-message">No emojis found.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        emojiData.forEach(emoji => {
            // We can filter out some categories if desired, e.g. component emojis or flags for brevity
            if (emoji.category && emoji.category.toLowerCase().includes('component')) {
                return; // Skip skin tone modifiers etc.
            }

            const li = document.createElement('li');
            li.className = 'emoji-item';
            li.dataset.emojiChar = emoji.char;
            li.dataset.emojiName = emoji.name;
            // Could add more data attributes for filtering (e.g., group, subgroup)

            const charSpan = document.createElement('span');
            charSpan.className = 'emoji-char';
            charSpan.textContent = emoji.char;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'emoji-name';
            nameSpan.textContent = emoji.name;

            li.appendChild(charSpan);
            li.appendChild(nameSpan);

            li.addEventListener('click', () => {
                if (currentCallbackOnSelect) {
                    currentCallbackOnSelect({
                        char: emoji.char,
                        name: emoji.name
                        // Pass other details if needed by the callback
                    });
                    // Closing of the modal is handled by the callback in emojiCommand.js
                }
            });
            fragment.appendChild(li);
        });
        emojiListContainerInstance.appendChild(fragment);
    }
}