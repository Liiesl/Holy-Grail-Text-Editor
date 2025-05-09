// moreOptionsModal.js

export function initMoreOptionsModal(appContext) {
    const moreOptionsBtn = document.getElementById('more-options-btn');
    const moreOptionsModal = document.getElementById('more-options-modal');

    if (!moreOptionsBtn || !moreOptionsModal) {
        console.warn('More Options button or modal not found. Feature will not be available.');
        return;
    }

    appContext.moreOptionsModal = moreOptionsModal; // Make modal accessible globally

    const toggleModal = (event) => {
        event.stopPropagation(); // Prevent click from immediately closing via document listener
        const isVisible = moreOptionsModal.style.display === 'block';
        if (isVisible) {
            moreOptionsModal.style.display = 'none';
        } else {
            moreOptionsModal.style.display = 'block';
            positionModal();
        }
    };

    const positionModal = () => {
        if (moreOptionsModal.style.display !== 'block') return; // Only position if visible

        const btnRect = moreOptionsBtn.getBoundingClientRect();
        moreOptionsModal.style.top = btnRect.bottom + 5 + 'px'; // 5px gap below button
        
        // Align right edge of modal with right edge of button
        let newLeft = btnRect.right - moreOptionsModal.offsetWidth;
        
        // Ensure modal doesn't go off-screen to the left
        if (newLeft < 5) {
            newLeft = 5;
        }
        // Ensure modal doesn't go off-screen to the right (less likely, but good check)
        if (newLeft + moreOptionsModal.offsetWidth > window.innerWidth - 5) {
            newLeft = window.innerWidth - 5 - moreOptionsModal.offsetWidth;
        }
        moreOptionsModal.style.left = newLeft + 'px';
    };

    moreOptionsBtn.addEventListener('click', toggleModal);

    // Close modal if clicked outside
    document.addEventListener('click', (event) => {
        if (moreOptionsModal.style.display === 'block' && 
            !moreOptionsModal.contains(event.target) && 
            event.target !== moreOptionsBtn && !moreOptionsBtn.contains(event.target) ) { // check if click was on button or its children
            moreOptionsModal.style.display = 'none';
        }
    });

    // Reposition (or close) modal on window resize
    window.addEventListener('resize', () => {
        if (moreOptionsModal.style.display === 'block') {
            positionModal(); 
            // Alternatively, to close: moreOptionsModal.style.display = 'none';
        }
    });

    // Handle clicks on modal items (placeholders for now)
    moreOptionsModal.addEventListener('click', (event) => {
        const item = event.target.closest('.more-options-item[data-action]');
        if (item) {
            const action = item.dataset.action;
            console.log('More Options action:', action);
            
            switch (action) {
                case 'toggle-full-width':
                    const icon = item.querySelector('.editor-option-icon-right');
                    if (icon) {
                        // This is a very basic toggle, real implementation would change app state
                        if (icon.classList.contains('fa-arrows-alt-h')) {
                             icon.classList.remove('fa-arrows-alt-h');
                             icon.classList.add('fa-compress-arrows-alt'); // Example alternative
                             appContext.showStatus('Full width ON (placeholder)', 'info', 1500);
                        } else {
                             icon.classList.remove('fa-compress-arrows-alt');
                             icon.classList.add('fa-arrows-alt-h');
                             appContext.showStatus('Full width OFF (placeholder)', 'info', 1500);
                        }
                    }
                    break;
                case 'import-page':
                    appContext.showStatus('Import action clicked (not implemented)', 'info', 2000);
                    break;
                case 'export-page':
                    appContext.showStatus('Export action clicked (not implemented)', 'info', 2000);
                    break;
                case 'peek-page': // ADDED
                    if (appContext.currentPageState && appContext.currentPageState.id) {
                        if (appContext.openPageInPeekMode) {
                            appContext.openPageInPeekMode(appContext.currentPageState.id, appContext.currentProject);
                        } else {
                            console.warn('openPageInPeekMode function not available on appContext.');
                            appContext.showStatus('Peek feature not available.', 'error');
                        }
                    } else {
                        appContext.showStatus('No page selected to peek.', 'info');
                    }
                    break; // ADDED
            }
            moreOptionsModal.style.display = 'none'; // Close modal after action
        }

        const fontPlaceholder = event.target.closest('.font-placeholder-btn');
        if (fontPlaceholder) {
            console.log('Font placeholder clicked:', fontPlaceholder.textContent);
            const allFontPlaceholders = moreOptionsModal.querySelectorAll('.font-placeholder-btn');
            allFontPlaceholders.forEach(btn => btn.classList.remove('active'));
            fontPlaceholder.classList.add('active');
            appContext.showStatus(`Font style "${fontPlaceholder.textContent}" selected (placeholder)`, 'info', 1500);
            // Optional: moreOptionsModal.style.display = 'none'; // Close modal after font selection
        }
    });

    // Add close function to appContext for global Escape key handler
    appContext.closeMoreOptionsModal = () => {
        if (moreOptionsModal.style.display === 'block') {
            moreOptionsModal.style.display = 'none';
        }
    };
}