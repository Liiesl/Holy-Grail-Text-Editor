import { initEditArea } from '../editArea.js'; // Adjust path as needed

let DmpInstanceForModals = null;
if (typeof diff_match_patch === 'function') {
    DmpInstanceForModals = new diff_match_patch();
} else {
    console.warn("diff_match_patch library not loaded. Differential saving for peek modals disabled.");
}

let modalZIndexCounter = 1100; // Initial z-index for modals

// Helper function to determine the effective mode of a modal, considering if it's minimized
function getEffectiveModalMode(modal) {
    if (!modal) return null;
    // If minimized, its "spatial claim" is based on the mode it was in before minimizing
    if (modal.isMinimized && modal.minimizingFromMode) {
        return modal.minimizingFromMode;
    }
    // Otherwise, its current mode is its effective mode
    return modal.mode;
}


class PagePeekModal {
    constructor(globalAppContext, pageIdToLoad, initialMode = 'peek') {
        this.globalAppContext = globalAppContext;
        this.pageId = pageIdToLoad;
        this.projectId = globalAppContext.currentProject;
        this.modalId = `peek-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.mode = initialMode; // 'peek', 'side-peek-left', 'side-peek-right'
        this.isMinimized = false;
        this.minimizingFromMode = null; // Stores the mode before minimization
        this.domElement = null;

        this.liveEditor = null;
        this.savePageBtn = null;
        this.currentPageDisplay = null;
        this.statusMessageElement = null;
        this.toggleViewBtn = null; // Cache for the toggle view button

        this.currentPageState = null;
        this.hasUnsavedChanges = false;
        this.isSaving = false;
        this.autosaveTimeoutId = null;
        this.clientConverter = new showdown.Converter();
        this.clientConverter.setOption('tables', true);

        this.fetchWithAuth = this.globalAppContext.fetchWithAuth;
        this.htmlToMarkdown = this.globalAppContext.htmlToMarkdown;
        this.autosaveDelay = this.globalAppContext.autosaveDelay;
        this.DmpInstance = DmpInstanceForModals;
        this.pageTreeContainer = null;

        this._createModalDOM();
        this._initEditorLogic();
        this._setupEventListeners();

        this.bringToFront();
    }

    _createModalDOM() {
        this.domElement = document.createElement('div');
        this.domElement.id = this.modalId;
        this.domElement.classList.add('page-peek-modal', this.mode + '-mode');

        this.domElement.innerHTML = `
            <div class="peek-modal-top-section">
                <div class="page-peek-modal-controls left">
                    <button class="peek-control-btn toggle-view-btn" title="Toggle Side Peek"><i class="fas fa-columns"></i></button>
                    <button class="peek-control-btn minimize-btn" title="Minimize / Restore"><i class="fas fa-window-minimize"></i></button>
                </div>
                <div class="page-peek-modal-title" id="modal-page-display-${this.modalId}">Loading page...</div>
                <div class="page-peek-modal-status" id="modal-status-message-${this.modalId}"></div>
                <div class="page-peek-modal-controls right">
                     <button class="modal-save-page-btn" id="modal-save-page-btn-${this.modalId}" disabled><i class="fas fa-save"></i> Save</button>
                     <button class="peek-control-btn close-peek-btn" title="Close Peek"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div class="page-peek-modal-editor-area">
                <div class="modal-live-editor" id="modal-live-editor-${this.modalId}" contenteditable="true" data-placeholder="Write here..."></div>
            </div>
        `;
        document.body.appendChild(this.domElement);

        this.liveEditor = this.domElement.querySelector(`#modal-live-editor-${this.modalId}`);
        this.savePageBtn = this.domElement.querySelector(`#modal-save-page-btn-${this.modalId}`);
        this.currentPageDisplay = this.domElement.querySelector(`#modal-page-display-${this.modalId}`);
        this.statusMessageElement = this.domElement.querySelector(`#modal-status-message-${this.modalId}`);
        this.toggleViewBtn = this.domElement.querySelector('.toggle-view-btn'); // Cache the button

        if (this.liveEditor.innerHTML.trim() === '') {
            this.liveEditor.classList.add('is-empty');
        }
    }

    _initEditorLogic() {
        initEditArea(this);

        if (this.projectId && this.pageId) {
            this.loadPageContent(this.projectId, this.pageId);
        } else {
            this.showStatus('Error: Project or Page ID missing for peek.', 'error');
            if (this.clearEditor) this.clearEditor();
        }
    }

    _setupEventListeners() {
        this.domElement.addEventListener('mousedown', () => {
            if (!this.isMinimized) { // Only bring to front if not minimized
                this.bringToFront();
            }
        });

        const closeButton = this.domElement.querySelector('.close-peek-btn');
        closeButton.addEventListener('click', () => this.close());

        const minimizeButton = this.domElement.querySelector('.minimize-btn');
        minimizeButton.addEventListener('click', () => this.toggleMinimize());

        if (this.toggleViewBtn) {
            this.toggleViewBtn.addEventListener('click', () => this.toggleViewMode());
        }
    }

    bringToFront() {
        modalZIndexCounter++;
        this.domElement.style.zIndex = modalZIndexCounter;
    }

    showStatus(message, type = 'info', duration = 3000) {
        if (!this.statusMessageElement) return;
        this.statusMessageElement.textContent = message;
        this.statusMessageElement.className = `page-peek-modal-status ${type}`;

        if (this.statusMessageElement._timeoutId) {
            clearTimeout(this.statusMessageElement._timeoutId);
        }
        if (duration > 0) {
            this.statusMessageElement._timeoutId = setTimeout(() => {
                if (this.statusMessageElement.textContent === message) {
                    this.statusMessageElement.textContent = '';
                    this.statusMessageElement.className = 'page-peek-modal-status';
                }
            }, duration);
        }
    }

    updateSaveButtonState() {
        if (!this.savePageBtn) return;
        this.savePageBtn.disabled = !this.hasUnsavedChanges || !this.currentPageState || this.isSaving;
    }

    scheduleAutosave() {
        if (this.autosaveTimeoutId) {
            clearTimeout(this.autosaveTimeoutId);
            this.autosaveTimeoutId = null;
        }
        if (this.hasUnsavedChanges && this.currentPageState && !this.isSaving) {
            this.autosaveTimeoutId = setTimeout(async () => {
                this.autosaveTimeoutId = null;
                if (this.performAutosave) {
                   await this.performAutosave();
                }
            }, this.autosaveDelay);
        }
    }

    close() {
        if (this.hasUnsavedChanges) {
            if (!confirm('You have unsaved changes in this peek window. Are you sure you want to close it?')) {
                return;
            }
        }
        if (this.autosaveTimeoutId) clearTimeout(this.autosaveTimeoutId);
        this.domElement.remove();
        this.globalAppContext.removePeekModal(this.modalId);
    }

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        this.domElement.classList.toggle('minimized', this.isMinimized);
        const icon = this.domElement.querySelector('.minimize-btn i');
        const editorArea = this.domElement.querySelector('.page-peek-modal-editor-area');

        if (this.isMinimized) { // Minimizing
            icon.classList.remove('fa-window-minimize');
            icon.classList.add('fa-window-restore');

            if (this.toggleViewBtn) this.toggleViewBtn.style.display = 'none';
            if (this.statusMessageElement) this.statusMessageElement.style.display = 'none';
            if (this.savePageBtn) this.savePageBtn.style.display = 'none';
            if (editorArea) editorArea.style.display = 'none';

            this.minimizingFromMode = this.mode; // Store current mode

            if (this.minimizingFromMode === 'side-peek-left') {
                this.domElement.style.left = '20px';
                this.domElement.style.right = 'auto';
            } else { // 'peek' or 'side-peek-right' will align to right when minimized
                this.domElement.style.right = '20px';
                this.domElement.style.left = 'auto';
            }
        } else { // Restoring
            icon.classList.remove('fa-window-restore');
            icon.classList.add('fa-window-minimize');

            if (this.toggleViewBtn) this.toggleViewBtn.style.display = '';
            if (this.statusMessageElement) this.statusMessageElement.style.display = '';
            if (this.savePageBtn) this.savePageBtn.style.display = '';
            if (editorArea) editorArea.style.display = '';

            this.domElement.style.left = ''; // Reset inline styles
            this.domElement.style.right = '';

            let targetRestoreMode = this.minimizingFromMode || 'peek'; // Default to original mode or 'peek'

            const otherModals = this.globalAppContext.activePeekModals.filter(m => m !== this);

            if (otherModals.length === 1) {
                const otherModal = otherModals[0];
                const otherEffectiveMode = getEffectiveModalMode(otherModal); // Considers if other is minimized

                if (targetRestoreMode === 'peek') {
                    if (otherEffectiveMode === 'side-peek-left') {
                        targetRestoreMode = 'side-peek-right';
                    } else if (otherEffectiveMode === 'side-peek-right') {
                        targetRestoreMode = 'side-peek-left';
                    }
                } else if (targetRestoreMode === 'side-peek-left' && otherEffectiveMode === 'side-peek-left') {
                    targetRestoreMode = 'side-peek-right'; // Avoid clash
                } else if (targetRestoreMode === 'side-peek-right' && otherEffectiveMode === 'side-peek-right') {
                    targetRestoreMode = 'side-peek-left'; // Avoid clash
                }
            }
            this.switchToMode(targetRestoreMode);
        }
        this.globalAppContext.handlePeekModalLayoutChange();
    }

    toggleViewMode() {
        if (this.isMinimized) {
            this.toggleMinimize(); // Restoring will call handlePeekModalLayoutChange
            return;
        }

        let newModeCandidate;
        if (this.mode === 'peek') {
            let preferredSide = 'side-peek-right'; // Default side
            const otherModals = this.globalAppContext.activePeekModals.filter(m => m !== this);
            if (otherModals.length === 1) {
                const otherModal = otherModals[0];
                const otherEffectiveMode = getEffectiveModalMode(otherModal); // Considers minimized state

                if (otherEffectiveMode === 'side-peek-left') {
                    preferredSide = 'side-peek-right';
                } else if (otherEffectiveMode === 'side-peek-right') {
                    preferredSide = 'side-peek-left';
                }
                // If other modal is 'peek' (active or minimized from peek), default 'side-peek-right' is fine.
            }
            newModeCandidate = preferredSide;
        } else { // Was side-peek-left or side-peek-right
            newModeCandidate = 'peek';
        }

        if (this.mode !== newModeCandidate) {
            this.switchToMode(newModeCandidate);
        }
        this.globalAppContext.handlePeekModalLayoutChange();
    }

    switchToMode(newMode) {
        if (this.mode === newMode && !this.isMinimized && this.minimizingFromMode !== this.mode) return;

        const oldMode = this.mode;
        this.domElement.classList.remove(oldMode + '-mode');
        if (oldMode.startsWith('side-peek')) {
            this.domElement.classList.remove('left', 'right');
        }

        this.domElement.style.left = '';
        this.domElement.style.right = '';
        this.domElement.style.top = '';
        this.domElement.style.width = '';
        this.domElement.style.height = '';
        this.domElement.style.transform = '';

        this.mode = newMode;
        this.domElement.classList.add(this.mode + '-mode');

        if (this.mode === 'peek') {
            this.domElement.style.left = '50%';
            this.domElement.style.top = '50%';
            this.domElement.style.transform = 'translate(-50%, -50%)';
        } else if (this.mode === 'side-peek-left') {
            this.domElement.classList.add('left');
        } else if (this.mode === 'side-peek-right') {
            this.domElement.classList.add('right');
        }

        if (!this.isMinimized) {
             this.bringToFront();
        }
    }

    updateToggleButtonState() {
        if (!this.toggleViewBtn) return;

        if (this.isMinimized) {
            // Button is typically hidden when minimized by toggleMinimize logic.
            // Set disabled to true for logical consistency if it were to become visible.
            this.toggleViewBtn.disabled = true;
            return;
        }

        // Filter for other modals that are currently active (not minimized).
        const otherActiveNonMinimizedModals = this.globalAppContext.activePeekModals.filter(
            m => m !== this && !m.isMinimized
        );

        if (otherActiveNonMinimizedModals.length === 0) {
            // This is the only active, non-minimized modal. Button should be enabled
            // to allow toggling its mode (e.g., from 'peek' to 'side-peek' or vice-versa).
            this.toggleViewBtn.disabled = false;
        } else if (otherActiveNonMinimizedModals.length === 1) {
            // There is exactly one other active, non-minimized modal.
            // So, there are two active, non-minimized modals in total (this + the other one).
            const otherModal = otherActiveNonMinimizedModals[0];
            if (this.mode.startsWith('side-peek') && otherModal.mode.startsWith('side-peek')) {
                // Both modals are in side-peek modes (e.g., left and right).
                // In this state, toggling one to 'peek' mode is usually disallowed or
                // immediately rectified by handlePeekModalLayoutChange.
                // Thus, the toggle button is disabled.
                this.toggleViewBtn.disabled = true;
            } else {
                // Not both are in side-peek mode. Example scenarios:
                // 1. This modal is 'peek', other is 'side-peek'.
                // 2. This modal is 'side-peek', other is 'peek'.
                // 3. Both modals are 'peek'.
                // In these cases, toggling is allowed. handlePeekModalLayoutChange will
                // then arrange them (e.g., into two side-peeks if both were 'peek').
                this.toggleViewBtn.disabled = false;
            }
        } else {
            // otherActiveNonMinimizedModals.length > 1.
            // This implies there are more than 2 active, non-minimized modals in total
            // (this modal + 2 or more others).
            // This state should ideally not occur if appContext.maxPeekModals = 2 is enforced.
            // As a defensive measure, disable the button.
            this.toggleViewBtn.disabled = true;
        }
    }


    async performAutosave() { console.warn("performAutosave called on modal before initEditArea configured it.");}
    async savePage() { console.warn("savePage called on modal before initEditArea configured it."); }
    async loadPageContent(projectName, pageId) { console.warn("loadPageContent called on modal before initEditArea configured it."); }
    clearEditor(fullClear = false) {
        if (this.liveEditor) this.liveEditor.innerHTML = '';
        if (this.currentPageDisplay) this.currentPageDisplay.textContent = 'No page loaded';
        if (this.liveEditor) this.liveEditor.classList.add('is-empty');
        this.currentPageState = null;
        this.hasUnsavedChanges = false;
        if (this.updateSaveButtonState) this.updateSaveButtonState();
    }
}

// NEW: Helper function to manage the visibility of the global peek overlay
function updatePeekOverlayVisibility(appContext) {
    if (!appContext.peekOverlayElement) return;

    const shouldShowOverlay = appContext.activePeekModals.some(
        modal => modal.mode === 'peek' && !modal.isMinimized
    );

    if (shouldShowOverlay) {
        appContext.peekOverlayElement.classList.add('active');
    } else {
        appContext.peekOverlayElement.classList.remove('active');
    }
}


export function initPagePeekModalSystem(appContext) {
    appContext.activePeekModals = [];
    appContext.maxPeekModals = 2; // Max 2 peek modals
    appContext.isHandlingLayoutChange = false; // Re-entrancy guard for layout changes

    let peekOverlay = document.createElement('div');
    peekOverlay.id = 'peek-modal-global-overlay';
    peekOverlay.classList.add('peek-modal-overlay');
    document.body.appendChild(peekOverlay);
    appContext.peekOverlayElement = peekOverlay;


    appContext.openPageInPeekMode = (pageId, projectId) => {
        if (appContext.activePeekModals.length >= appContext.maxPeekModals) {
            const oldestModal = appContext.activePeekModals[0];
            if (oldestModal) {
                 appContext.showStatus(`Max ${appContext.maxPeekModals} peek windows allowed. Please close one.`, 'info', 3000);
                 if (oldestModal.isMinimized) oldestModal.toggleMinimize();
                 else oldestModal.bringToFront();
                 return null;
            }
        }

        let newModalMode = 'peek';
        if (appContext.activePeekModals.length === 1) {
            const existingModal = appContext.activePeekModals[0];
            const existingEffectiveMode = getEffectiveModalMode(existingModal);

            if (existingEffectiveMode === 'peek') {
                if (existingModal.isMinimized) {
                    newModalMode = 'side-peek-left';
                    existingModal.minimizingFromMode = 'side-peek-right';
                } else {
                    existingModal.switchToMode('side-peek-left');
                    newModalMode = 'side-peek-right';
                }
            } else if (existingEffectiveMode === 'side-peek-left') {
                newModalMode = 'side-peek-right';
            } else if (existingEffectiveMode === 'side-peek-right') {
                newModalMode = 'side-peek-left';
            }
        }

        const newModal = new PagePeekModal(appContext, pageId, newModalMode);
        appContext.activePeekModals.push(newModal);
        appContext.handlePeekModalLayoutChange();
        return newModal;
    };

    appContext.removePeekModal = (modalId) => {
        appContext.activePeekModals = appContext.activePeekModals.filter(m => m.modalId !== modalId);
        appContext.handlePeekModalLayoutChange();
    };

    appContext.closeAllPeekModals = (force = false) => {
        [...appContext.activePeekModals].forEach(modal => {
            if (force) {
                modal.hasUnsavedChanges = false;
            }
            modal.close();
        });
    };

    appContext.getTopPeekModal = () => {
        if (appContext.activePeekModals.length === 0) return null;
        const nonMinimizedModals = appContext.activePeekModals.filter(m => !m.isMinimized);
        const targetArray = nonMinimizedModals.length > 0 ? nonMinimizedModals : appContext.activePeekModals;

        return targetArray.reduce((top, m) =>
            (!top || parseInt(m.domElement.style.zIndex || 0) > parseInt(top.domElement.style.zIndex || 0)) ? m : top,
            null
        );
    };

    appContext.handlePeekModalLayoutChange = () => {
        if (appContext.isHandlingLayoutChange) return;
        appContext.isHandlingLayoutChange = true;

        try {
            const activeNonMinimizedModals = appContext.activePeekModals.filter(m => !m.isMinimized);
            const minimizedModals = appContext.activePeekModals.filter(m => m.isMinimized);

            if (activeNonMinimizedModals.length === 1) {
                const activeModal = activeNonMinimizedModals[0];

                if (minimizedModals.length === 0) {
                    // Only one modal in total, and it's active.
                    // If it's in a side-peek mode, it should become 'peek'.
                    if (activeModal.mode.startsWith('side-peek')) {
                        activeModal.switchToMode('peek');
                    }
                } else if (minimizedModals.length === 1) {
                    // One active modal, one minimized modal.
                    const minimizedModal = minimizedModals[0];
                    const minimizedEffectiveMode = getEffectiveModalMode(minimizedModal);

                    if (activeModal.mode === 'peek') {
                        // Active modal is 'peek'. Adjust if minimized modal claims a side.
                        if (minimizedEffectiveMode === 'side-peek-left') {
                            activeModal.switchToMode('side-peek-right');
                        } else if (minimizedEffectiveMode === 'side-peek-right') {
                            activeModal.switchToMode('side-peek-left');
                        }
                        // If minimizedEffectiveMode is also 'peek', activeModal stays 'peek'.
                    } else if (activeModal.mode === 'side-peek-left') {
                        // Active modal is 'side-peek-left'. Switch to 'peek' if minimized modal conflicts.
                        if (minimizedEffectiveMode === 'side-peek-left') {
                            activeModal.switchToMode('peek'); // Conflict with minimized modal's claimed side.
                        }
                        // Otherwise (minimized is 'side-peek-right' or 'peek'), activeModal stays 'side-peek-left'.
                    } else if (activeModal.mode === 'side-peek-right') {
                        // Active modal is 'side-peek-right'. Switch to 'peek' if minimized modal conflicts.
                        if (minimizedEffectiveMode === 'side-peek-right') {
                            activeModal.switchToMode('peek'); // Conflict with minimized modal's claimed side.
                        }
                        // Otherwise (minimized is 'side-peek-left' or 'peek'), activeModal stays 'side-peek-right'.
                    }
                }
            } else if (activeNonMinimizedModals.length === 2) {
                // Two active, non-minimized modals. Ensure they are side-by-side.
                const [m1, m2] = activeNonMinimizedModals;

                const m1IsPeek = m1.mode === 'peek';
                const m2IsPeek = m2.mode === 'peek';
                const m1IsSide = m1.mode.startsWith('side-peek');
                const m2IsSide = m2.mode.startsWith('side-peek');

                if (m1IsPeek && m2IsPeek) {
                    // Both are 'peek', force side-by-side.
                    m1.switchToMode('side-peek-left');
                    m2.switchToMode('side-peek-right');
                } else if (m1IsPeek && m2IsSide) {
                    // m1 is 'peek', m2 is side. Force m1 to the other side.
                    if (m2.mode === 'side-peek-left') m1.switchToMode('side-peek-right');
                    else m1.switchToMode('side-peek-left');
                } else if (m1IsSide && m2IsPeek) {
                    // m1 is side, m2 is 'peek'. Force m2 to the other side.
                    if (m1.mode === 'side-peek-left') m2.switchToMode('side-peek-right');
                    else m2.switchToMode('side-peek-left');
                } else if (m1IsSide && m2IsSide && m1.mode === m2.mode) {
                    // Both are side-peeks but on the same side. Force one to the other side.
                    const m1Z = parseInt(m1.domElement.style.zIndex || 0);
                    const m2Z = parseInt(m2.domElement.style.zIndex || 0);

                    // Prefer to change the modal with the lower z-index (older interaction)
                    // or m1 if z-indices are equal/indeterminate (m2 considered "top" by default in this condition)
                    if (m1Z > m2Z) { // m1 is "on top" / more recent. Change m2.
                         if (m1.mode === 'side-peek-left') m2.switchToMode('side-peek-right');
                         else m2.switchToMode('side-peek-left');
                    } else { // m2 is "on top" or z-indices are equal/indeterminate. Change m1.
                         if (m2.mode === 'side-peek-left') m1.switchToMode('side-peek-right');
                         else m1.switchToMode('side-peek-left');
                    }
                }
                // If m1IsSide && m2IsSide && m1.mode !== m2.mode, they are already correctly side-by-side. No action needed.
            }

            // After layout adjustments, update toggle button states for all modals.
            appContext.activePeekModals.forEach(modal => {
                if (modal.updateToggleButtonState) {
                    modal.updateToggleButtonState();
                }
            });
        } finally {
            updatePeekOverlayVisibility(appContext);
            appContext.isHandlingLayoutChange = false;
        }
    };
}