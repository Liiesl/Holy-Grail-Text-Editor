// moreOptionsModal.js

function createMoreOptionsModalHTML() {
    return `
        <ul id="more-options-list">
            <li class="more-options-item font-selection-container">
                <button class="font-option-btn" data-font="sans-serif" title="Sans Serif Font">Aa</button>
                <button class="font-option-btn" data-font="serif" title="Serif Font">Aa</button>
                <button class="font-option-btn" data-font="monospace" title="Monospace Font">Aa</button>
            </li>
            <li class="more-options-item" data-action="toggle-full-width">
                <span class="more-options-label">Full Width</span>
                <i class="fas fa-arrows-alt-h editor-option-icon-right"></i>
            </li>
            <li class="more-options-item" data-action="import-page">
                <i class="fas fa-file-import"></i>
                <span class="more-options-label">Import</span>
            </li>
            <li class="more-options-item" data-action="export-page">
                <i class="fas fa-file-export"></i>
                <span class="more-options-label">Export</span>
            </li>
            <li class="more-options-item" data-action="peek-page">
                <i class="fas fa-clone"></i>
                <span class="more-options-label">Peek Page</span>
            </li>
        </ul>
    `;
}

export function initMoreOptionsModal(appContext) {
    const moreOptionsBtn = document.getElementById('more-options-btn');

    if (!moreOptionsBtn) {
        console.warn('More Options button not found. Feature will not be available.');
        return;
    }

    let moreOptionsModal = document.getElementById('more-options-modal');
    if (!moreOptionsModal) {
        moreOptionsModal = document.createElement('div');
        moreOptionsModal.id = 'more-options-modal';
        moreOptionsModal.className = 'more-options-modal';
        moreOptionsModal.style.display = 'none';
        moreOptionsModal.innerHTML = createMoreOptionsModalHTML();
        document.body.appendChild(moreOptionsModal);
    }

    appContext.moreOptionsModal = moreOptionsModal;

    const setActiveFontButton = () => {
        const currentFont = appContext.userSettings.fontFamily || 'sans-serif';
        const fontButtons = moreOptionsModal.querySelectorAll('.font-option-btn');
        fontButtons.forEach(btn => {
            if (btn.dataset.font === currentFont) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    };

    const toggleModal = (event) => {
        event.stopPropagation();
        const isVisible = moreOptionsModal.style.display === 'block';
        if (isVisible) {
            moreOptionsModal.style.display = 'none';
        } else {
            moreOptionsModal.style.display = 'block';
            positionModal();
            setActiveFontButton(); // Set active font when modal opens
        }
    };

    const positionModal = () => {
        if (moreOptionsModal.style.display !== 'block') return;

        const btnRect = moreOptionsBtn.getBoundingClientRect();
        moreOptionsModal.style.top = btnRect.bottom + 5 + 'px';
        
        let newLeft = btnRect.right - moreOptionsModal.offsetWidth;
        
        if (newLeft < 5) newLeft = 5;
        if (newLeft + moreOptionsModal.offsetWidth > window.innerWidth - 5) {
            newLeft = window.innerWidth - 5 - moreOptionsModal.offsetWidth;
        }
        moreOptionsModal.style.left = newLeft + 'px';
    };

    moreOptionsBtn.addEventListener('click', toggleModal);

    document.addEventListener('click', (event) => {
        if (moreOptionsModal.style.display === 'block' && 
            !moreOptionsModal.contains(event.target) && 
            event.target !== moreOptionsBtn && !moreOptionsBtn.contains(event.target)) {
            moreOptionsModal.style.display = 'none';
        }
    });

    window.addEventListener('resize', () => {
        if (moreOptionsModal.style.display === 'block') {
            positionModal();
        }
    });

    moreOptionsModal.addEventListener('click', (event) => {
        const item = event.target.closest('.more-options-item[data-action]');
        if (item) {
            const action = item.dataset.action;
            console.log('More Options action:', action);
            
            switch (action) {
                case 'toggle-full-width':
                    // ... (keep existing logic) ...
                    const icon = item.querySelector('.editor-option-icon-right');
                    if (icon) {
                        if (icon.classList.contains('fa-arrows-alt-h')) {
                             icon.classList.remove('fa-arrows-alt-h');
                             icon.classList.add('fa-compress-arrows-alt');
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
                case 'export-page': // MODIFIED
                    if (appContext.openExportModal) {
                        appContext.openExportModal();
                    } else {
                        appContext.showStatus('Export feature not available.', 'error');
                        console.warn('openExportModal function not available on appContext.');
                    }
                    break;
                case 'peek-page': 
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
                    break; 
            }
            moreOptionsModal.style.display = 'none'; // Close more options modal after action
        }

        const fontButton = event.target.closest('.font-option-btn');
        if (fontButton) {
            const selectedFont = fontButton.dataset.font;
            if (appContext.changeGlobalFont) {
                appContext.changeGlobalFont(selectedFont); // This will also update .active class via listener in changeGlobalFont
            }
            appContext.showStatus(`Font changed to ${selectedFont.charAt(0).toUpperCase() + selectedFont.slice(1)}`, 'info', 1500);
            // Optionally: moreOptionsModal.style.display = 'none'; // Keep modal open after font selection
        }
    });

    appContext.closeMoreOptionsModal = () => {
        if (moreOptionsModal.style.display === 'block') {
            moreOptionsModal.style.display = 'none';
        }
    };

    // Initial active font button state (in case modal is pre-rendered and app context is ready)
    // This is mainly for safety, setActiveFontButton on open is more reliable.
    if (appContext.userSettings && appContext.userSettings.fontFamily) {
        setActiveFontButton();
    }
}