import { initEditArea } from '../editArea.js'; // Adjust path as needed
import { initSlashCommand } from '../SCMD/slashCommand.js'; // ADDED: For Slash Command

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

        // SCMD related properties
        this.slashCommandModalElement = null; // DOM element for SCMD modal
        this.slashCommandInstance = null;     // To store {destroy} method from initSlashCommand

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

        // Properties for editorContext (SCMD and potentially others)
        this.isSlashCommandActive = false;
        this.slashCommandInfo = null;

        this._createModalDOM();
        this._initEditorAndSCMDLogic(); // Combined initialization
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

        // Create slash command modal for this peek instance
        this.slashCommandModalElement = document.createElement('div');
        this.slashCommandModalElement.id = `peek-scmd-modal-${this.modalId}`;
        this.slashCommandModalElement.className = 'slash-command-modal'; // Use same styling as global
        this.slashCommandModalElement.style.position = 'fixed'; // SCMD modal is usually fixed
        this.slashCommandModalElement.style.display = 'none';
        // It's important this has a high z-index, typically handled by CSS for .slash-command-modal
        document.body.appendChild(this.slashCommandModalElement);
    }

    _initEditorAndSCMDLogic() {
        // `this` (PagePeekModal instance) acts as editorContext for initEditArea
        initEditArea(this);

        // Prepare `this` (PagePeekModal instance) to be the editorContext for initSlashCommand
        // The PagePeekModal instance itself will provide properties like `liveEditor`, `showStatus`, etc.
        // It also needs to provide the `slashCommandModal` DOM element it created.
        this.slashCommandModal = this.slashCommandModalElement; // Make SCMD DOM element available on context
        this._prepareContextDelegates(); // Setup delegates for global functions if needed by commands

        // Initialize SCMD for this peek modal's editor
        this.slashCommandInstance = initSlashCommand(this); // Pass `this` as the editorContext

        if (this.projectId && this.pageId) {
            this.loadPageContent(this.projectId, this.pageId);
        } else {
            this.showStatus('Error: Project or Page ID missing for peek.', 'error');
            if (this.clearEditor) this.clearEditor();
        }
    }

    _setupEventListeners() {
        // Make the modal draggable (simple version)
        const titleBar = this.domElement.querySelector('.page-peek-modal-title');
        if (titleBar) {
            let isDragging = false;
            let offsetX, offsetY;

            titleBar.addEventListener('mousedown', (e) => {
                if (e.target !== titleBar) return; // Only drag by title bar itself, not buttons inside
                if (this.mode !== 'peek' || this.isMinimized) return; // Only allow dragging in 'peek' mode and not minimized

                isDragging = true;
                this.bringToFront();
                const rect = this.domElement.getBoundingClientRect();
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
                this.domElement.style.cursor = 'grabbing';
                e.preventDefault(); // Prevent text selection
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                this.domElement.style.left = `${e.clientX - offsetX}px`;
                this.domElement.style.top = `${e.clientY - offsetY}px`;
                this.domElement.style.transform = 'none'; // Remove translate if dragging manually
            });

            document.addEventListener('mouseup', () => {
                if (!isDragging) return;
                isDragging = false;
                this.domElement.style.cursor = 'grab';
            });
        }

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

    _prepareContextDelegates() {
        // Properties/methods `initSlashCommand` or its commands might need from the context,
        // delegating to `globalAppContext` if they are global resources.

        // `liveEditor` is `this.liveEditor`
        // `slashCommandModal` is `this.slashCommandModalElement` (assigned to `this.slashCommandModal` before calling initSCMD)
        // `isSlashCommandActive` is `this.isSlashCommandActive` (instance property)
        // `slashCommandInfo` is `this.slashCommandInfo` (instance property)
        // `showStatus` is `this.showStatus` (instance method)
        // `currentProject` is `this.projectId`
        // `currentPageState` is `this.currentPageState` (managed by initEditArea(this))

        this.htmlToMarkdown = this.globalAppContext.htmlToMarkdown;
        this.clientConverter = this.globalAppContext.clientConverter; // Or use its own if preferred (this.clientConverter is already set up)+        this.fetchWithAuth = this.globalAppContext.fetchWithAuth; // Already on `this` via constructor

        // Modals and their functions (for commands like emoji, embed page)
        this.emojiModal = this.globalAppContext.emojiModal;
        this.emojiListContainer = this.globalAppContext.emojiListContainer;
        this.openEmojiModal = (...args) => this.globalAppContext.openEmojiModal(...args);
        this.closeEmojiModal = (...args) => this.globalAppContext.closeEmojiModal(...args);

        this.embedPageModal = this.globalAppContext.embedPageModal;
        this.embedPageTreeContainer = this.globalAppContext.embedPageTreeContainer;
        this.openEmbedPageModal = (...args) => this.globalAppContext.openEmbedPageModal(...args);
        this.closeEmbedPageModal = (...args) => this.globalAppContext.closeEmbedPageModal(...args);

        this.openPageInPeekMode = (...args) => this.globalAppContext.openPageInPeekMode(...args);
        // For `openInPagePeekCommand.canExecute`
        this.activePeekModals = this.globalAppContext.activePeekModals;
        this.maxPeekModals = this.globalAppContext.maxPeekModals;

        // `removeSlashCommandTextFromEditor` and `closeSlashCommandModal`
        // will be defined ON `this` (the PagePeekModal instance) by `initSlashCommand(this)`.
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
        
        // Cleanup SCMD specific resources
        if (this.slashCommandInstance && this.slashCommandInstance.destroy) {
            this.slashCommandInstance.destroy();
        }
        if (this.slashCommandModalElement) {
            this.slashCommandModalElement.remove();
        }

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
            let preferredSide = 'side-peek-right'; // Default side if no other modals or complex scenarios
            const otherModals = this.globalAppContext.activePeekModals.filter(m => m !== this);

            if (otherModals.length === 1) {
                const otherModal = otherModals[0];
                if (otherModal.isMinimized) {
                    // If the other modal is minimized, its physical side is determined
                    // by the mode it was in *before* minimizing.
                    // toggleMinimize logic:
                    // - 'side-peek-left' minimizes to left.
                    // - 'peek' or 'side-peek-right' minimizes to right.
                    if (otherModal.minimizingFromMode === 'side-peek-left') {
                        // Other modal is minimized on the left.
                        preferredSide = 'side-peek-right';
                    } else {
                        // Other modal was 'peek' or 'side-peek-right', so it's minimized on the right.
                        preferredSide = 'side-peek-left';
                    }
                } else {
                    // Other modal is not minimized, use its current active mode.
                    const otherCurrentMode = otherModal.mode; // No need for getEffectiveModalMode as it's active
                    if (otherCurrentMode === 'side-peek-left') {
                        preferredSide = 'side-peek-right';
                    } else if (otherCurrentMode === 'side-peek-right') {
                        preferredSide = 'side-peek-left';
                    }
                    // If other modal is 'peek', the default preferredSide ('side-peek-right') is often suitable,
                    // or you could implement more complex logic (e.g., based on which modal was opened first).
                    // For now, the default handles the case where the other modal is 'peek'.
                }
            }
            // If there are no other modals, or more than one other active (unlikely with maxPeekModals=2 logic),
            // the default 'side-peek-right' will be used.
            newModeCandidate = preferredSide;
        } else { // Was side-peek-left or side-peek-right, toggle back to 'peek'
            newModeCandidate = 'peek';
        }

        if (this.mode !== newModeCandidate) {
            this.switchToMode(newModeCandidate);
        }
        // switchToMode usually calls bringToFront if not minimized.
        // handlePeekModalLayoutChange will be called to ensure final layout consistency.
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

        // Check how many modals are *active and not minimized*.
        const activeNonMinimizedModalsCount = this.globalAppContext.activePeekModals.filter(
            m => !m.isMinimized
        ).length;

        // Enable the button if this modal is active & non-minimized,
        // and the total count of such modals is within the allowed range (1 or 2).
        // handlePeekModalLayoutChange will enforce specific layouts based on the resulting state.
        if (activeNonMinimizedModalsCount > 0 && activeNonMinimizedModalsCount <= this.globalAppContext.maxPeekModals) {
            this.toggleViewBtn.disabled = false;
        } else {
            // This covers cases like:
            // - More than maxPeekModals are active (defensive, should ideally not happen).
            // - Zero active non-minimized modals (but this.isMinimized is false, implies an issue or transitional state).
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
                 if (oldestModal.isMinimized) oldestModal.toggleMinimize(); // Restore it to make it obvious
                 else oldestModal.bringToFront();
                 return null;
            }
        }

        let newModalMode = 'peek'; // Default for the first modal, or if the existing one is minimized.
        if (appContext.activePeekModals.length === 1) {
            const existingModal = appContext.activePeekModals[0];
            
            if (existingModal.isMinimized) {
                // New modal opens as 'peek'.
                // handlePeekModalLayoutChange will then position it relative to the
                // minimized modal's effective mode (e.g., if minimized was side-left, new one might go side-right).
                newModalMode = 'peek'; 
            } else { 
                // Existing modal is active and not minimized.
                // Arrange them side-by-side.
                const currentModeOfExisting = existingModal.mode; // Use its actual current mode
                
                if (currentModeOfExisting === 'peek') {
                    existingModal.switchToMode('side-peek-left');
                    newModalMode = 'side-peek-right';
                } else if (currentModeOfExisting === 'side-peek-left') {
                    newModalMode = 'side-peek-right'; // New modal takes the other side
                } else if (currentModeOfExisting === 'side-peek-right') {
                    newModalMode = 'side-peek-left'; // New modal takes the other side
                }
                // If existingModal was already a side-peek, new modal takes the complementary side.
                // handlePeekModalLayoutChange will run after this and ensure consistency if needed.
            }
        }

        const newModal = new PagePeekModal(appContext, pageId, newModalMode);
        appContext.activePeekModals.push(newModal);
        appContext.handlePeekModalLayoutChange(); // Crucial: this will apply final layout rules
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
                    // depricated
                    // if (activeModal.mode.startsWith('side-peek')) {
                    //    activeModal.switchToMode('peek');
                    // }
                } else if (minimizedModals.length === 1) {
                    // One active modal, one minimized modal.
                    const minimizedModal = minimizedModals[0];
                    const minimizedEffectiveMode = getEffectiveModalMode(minimizedModal);

                    if (activeModal.mode === 'peek') {
                        // MODIFICATION: If active modal is 'peek', do nothing here.
                        // It's allowed to stay in 'peek' mode.
                        // The user can use toggleViewMode to switch to a side-peek,
                        // and that function will try to pick an appropriate side
                        // respecting the minimized modal's effective side.
                    } else if (activeModal.mode === 'side-peek-left') {
                        // Active modal is 'side-peek-left'.
                        // If minimized modal also effectively claims the left side,
                        // switch the active modal to 'side-peek-right'.
                        if (minimizedEffectiveMode === 'side-peek-left') {
                            activeModal.switchToMode('side-peek-right');
                        }
                        // Otherwise (minimized is 'side-peek-right' or 'peek'), activeModal stays 'side-peek-left'.
                    } else if (activeModal.mode === 'side-peek-right') {
                        // Active modal is 'side-peek-right'.
                        // If minimized modal also effectively claims the right side,
                        // switch the active modal to 'side-peek-left'.
                        if (minimizedEffectiveMode === 'side-peek-right') {
                            activeModal.switchToMode('side-peek-left');
                        }
                        // Otherwise (minimized is 'side-peek-left' or 'peek'), activeModal stays 'side-peek-right'.
                    }
                }
            } else if (activeNonMinimizedModals.length === 2) {
                const [m1, m2] = activeNonMinimizedModals; // Order might be by insertion or arbitrary based on filter.

                const m1IsPeek = m1.mode === 'peek';
                const m2IsPeek = m2.mode === 'peek';
                const m1IsSideLeft = m1.mode === 'side-peek-left';
                const m1IsSideRight = m1.mode === 'side-peek-right';
                const m2IsSideLeft = m2.mode === 'side-peek-left';
                const m2IsSideRight = m2.mode === 'side-peek-right';

                if (m1IsPeek && m2IsPeek) {
                    // Both are 'peek'. Force side-by-side.
                    // Assign based on z-index: higher z-index (more recent) to the right.
                    const m1Z = parseInt(m1.domElement.style.zIndex || 0);
                    const m2Z = parseInt(m2.domElement.style.zIndex || 0);

                    if (m1Z > m2Z) { // m1 is "more recent" / on top
                        m1.switchToMode('side-peek-right');
                        m2.switchToMode('side-peek-left');
                    } else if (m2Z > m1Z) { // m2 is "more recent" / on top
                        m2.switchToMode('side-peek-right');
                        m1.switchToMode('side-peek-left');
                    } else { // Equal or undefined z-index, or same age.
                             // Default: if m1 is first in array (potentially older), it gets left.
                        m1.switchToMode('side-peek-left');
                        m2.switchToMode('side-peek-right');
                    }
                } else if ((m1IsSideLeft && m2IsSideLeft) || (m1IsSideRight && m2IsSideRight)) {
                    // Both are side-peeks but on the same side (e.g., both left). Force one to the other side.
                    const m1Z = parseInt(m1.domElement.style.zIndex || 0);
                    const m2Z = parseInt(m2.domElement.style.zIndex || 0);

                    // The one with higher z-index (more recent interaction/focus) keeps its side, the other moves.
                    if (m1Z > m2Z) { // m1 is "on top"/more recent. Change m2.
                         if (m1IsSideLeft) m2.switchToMode('side-peek-right');
                         else m2.switchToMode('side-peek-left'); // m1 must be side-peek-right
                    } else { // m2 is "on top" or z-indices are equal/indeterminate. Change m1.
                         if (m2IsSideLeft) m1.switchToMode('side-peek-right');
                         else m1.switchToMode('side-peek-left'); // m2 must be side-peek-right
                    }
                } else if ((m1IsPeek && (m2IsSideLeft || m2IsSideRight)) || ((m1IsSideLeft || m1IsSideRight) && m2IsPeek)) {
                    // One is 'peek', the other is 'side-peek'. Force them both to side-by-side.
                    // The existing side-peek modal keeps its side, the 'peek' modal takes the other.
                    if (m1IsPeek) { // m1 is 'peek', m2 is 'side-peek'
                        if (m2IsSideLeft) {
                            m1.switchToMode('side-peek-right');
                            // m2 remains 'side-peek-left'
                        } else { // m2 must be 'side-peek-right'
                            m1.switchToMode('side-peek-left');
                            // m2 remains 'side-peek-right'
                        }
                    } else { // m2 is 'peek', m1 is 'side-peek'
                        if (m1IsSideLeft) {
                            m2.switchToMode('side-peek-right');
                            // m1 remains 'side-peek-left'
                        } else { // m1 must be 'side-peek-right'
                            m2.switchToMode('side-peek-left');
                            // m1 remains 'side-peek-right'
                        }
                    }
                }
                // If modals are already 'side-peek-left' and 'side-peek-right' (or vice-versa),
                // they will not match any of the above conditions, and no change is needed,
                // as this is the desired stable side-by-side state.
            }

            // After layout adjustments, update toggle button states for all modals.
            // This ensures buttons reflect the possibility of new actions based on the new layout.
            appContext.activePeekModals.forEach(modal => {
                if (modal.updateToggleButtonState) {
                    modal.updateToggleButtonState();
                }
            });
        } finally {
            updatePeekOverlayVisibility(appContext); // This function itself is fine.
            appContext.isHandlingLayoutChange = false;
        }
    };
}