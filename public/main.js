// main.js

import { initSidePanel } from './sidePanel.js';
import { initEditArea } from './editArea.js';
import { initSlashCommand } from './SCMD/slashCommand.js';
import { initHomepage } from './homePage.js'; // ADDED
import { initTextStyleModal } from './textStyleModal.js';
import { initTableEditor } from './tableEditor.js';
import { initEmojiModal } from './SCMD/emojiModal.js';
import { initEmbedPageModal } from './SCMD/embedPageModal.js';
import { initAuth } from './auth_client.js';
import { initUserSettingsModal } from './userSettingsModal.js';
import { initMoreOptionsModal } from './moreOptionsModal.js';
import { initPagePeekModalSystem } from './pagePeekModal.js'; // ADDED

document.addEventListener('DOMContentLoaded', () => {
   const appContext = {
       // Auth State
       currentUser: null, // { id, username }
       
       // App State for the MAIN EDITOR
       currentProject: null,
       currentPageState: null, // { id, title, originalMarkdown, versionHash }
       hasUnsavedChanges: false,
       isSaving: false, // Specific to main editor instance
       autosaveTimeoutId: null, // Specific to main editor instance

       slashCommandInfo: null,
       isSlashCommandActive: false,
       autosaveDelay: 3000, // Global config, can be passed to instances

       // DOM Elements (Main editor specific)
       pageTreeContainer: document.getElementById('page-tree'),
       userProfileAreaContainer: document.getElementById('user-profile-area-container'),
       liveEditor: document.getElementById('live-editor'), // Main editor
       savePageBtn: document.getElementById('save-page-btn'), // Main save button
       currentPageDisplay: document.getElementById('current-page-display'), // Main page display
       statusMessage: document.getElementById('status-message'), // Main status message

       // Common Modals / UI elements (can be used by global context or passed)
       slashCommandModal: document.getElementById('slash-command-modal'),
       actionsModal: document.getElementById('actions-modal'),
       textStyleModal: document.getElementById('text-style-modal'),
       userSettingsModal: null, 
       moreOptionsModal: null,
       emojiModal: null,
       emojiListContainer: null,
       embedPageModal: null,
       embedPageTreeContainer: null,

       // Page Peek Modal System
       activePeekModals: [], // Will be managed by initPagePeekModalSystem
       openPageInPeekMode: null, // Will be set by initPagePeekModalSystem
       removePeekModal: null,    // Will be set by initPagePeekModalSystem
       closeAllPeekModals: null, // Will be set by initPagePeekModalSystem
       getTopPeekModal: null,    // Will be set by initPagePeekModalSystem
       handlePeekModalLayoutChange: null, // Will be set by initPagePeekModalSystem


       // Core functions (some are for main editor, some are global utilities)
       showStatus: null, // This will be the global showStatus
       // Methods specific to main editor instance, will be populated by initEditArea
       displayHomepage: null, // ADDED: For homepage module
       clearHomepage: null,   // ADDED: For homepage module       
       updateSaveButtonState: null, 
       clearEditor: null, 
       loadPageContent: null,
       savePage: null,
       scheduleAutosave: null,
       performAutosave: null,
       
       // Global utility functions
       htmlToMarkdown: null, // Will be set up
       fetchWithAuth: null, // Will be set up
       clientConverter: null, // Global showdown instance for main editor
       DmpInstance: null, // Global DMP instance (if shared)

       // Side panel functions
       fetchProjects: null,
       fetchPageTree: null,
       createNewProject: null,
       
       // Other modal/action handlers
       openActionsModal: null,
       openUserSettingsModal: null,
       closeUserSettingsModal: null,
       openEmbedPageModal: null,
       openEmojiModal: null,
       closeEmojiModal: null,
       closeMoreOptionsModal: null,
       closeEmbedPageModal: null,
       removeSlashCommandTextFromEditor: null,
       closeSlashCommandModal: null,

       slashCommandInstance: null, // For the main editor's SCMD instance
       // Auth functions
       checkAuthStatus: null, 
       showLoginScreen: null, 
       logoutUser: null,
       renderUserProfile: null, 

       // Action handlers (project/page management)
       deleteProject: null,
       renameProject: null,
       duplicateProject: null,
       deletePage: null,
       renamePage: null,
       duplicatePage: null,
   };

    appContext.fetchWithAuth = async (url, options = {}) => {
        // ... (fetchWithAuth implementation remains the same) ...
        const token = localStorage.getItem('authToken');
        options.headers = {
            ...options.headers,
        };
        if (options.body && !options.headers['Content-Type']) {
             options.headers['Content-Type'] = 'application/json';
        }

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, options);

        if (response.status === 401 || response.status === 403) {
            console.warn(`Authentication error (${response.status}) for ${url}. Clearing token.`);
            localStorage.removeItem('authToken');
            appContext.currentUser = null;
            
            if(appContext.renderUserProfile) appContext.renderUserProfile(); 
            if(appContext.pageTreeContainer) appContext.pageTreeContainer.innerHTML = '<p style="padding: 0 10px; font-size: 0.9em; color: var(--text-secondary);">Please log in to see projects.</p>';
            const projectsHeadingContainer = document.getElementById('projects-heading-container');
            if(projectsHeadingContainer) projectsHeadingContainer.innerHTML = ''; 
            
            // Close any open peek modals as auth is lost
            if(appContext.closeAllPeekModals) appContext.closeAllPeekModals(true); // Force close

            if (appContext.showLoginScreen) appContext.showLoginScreen();
            const errorData = await response.json().catch(() => ({ error: `Auth Error: ${response.status}` }));
            throw new Error(errorData.error || `Auth Error: ${response.status}`);
        }
        return response;
    };


   appContext.showStatus = (message, type = 'info', duration = 3000) => { // This is the GLOBAL status
       if (!appContext.statusMessage) return;
       // ... (global showStatus implementation remains the same) ...
       appContext.statusMessage.textContent = message;
       appContext.statusMessage.className = type;

       if (appContext.statusMessage._timeoutId) {
           clearTimeout(appContext.statusMessage._timeoutId);
           appContext.statusMessage._timeoutId = null;
       }

       if (duration > 0) {
           appContext.statusMessage._timeoutId = setTimeout(() => {
               if (appContext.statusMessage.textContent === message) {
                   appContext.statusMessage.textContent = '';
                   appContext.statusMessage.className = '';
               }
               appContext.statusMessage._timeoutId = null;
           }, duration);
       }
   };

    // Initialize Turndown and Showdown, DmpInstance for global use
    // ... (htmlToMarkdown setup remains the same) ...
    let turndownServiceInstance;
    if (typeof TurndownService === 'function') {
        turndownServiceInstance = new TurndownService({ /* ... options ... */ });
        // ... (addRule for strikethrough, taskListItems, etc.) ...
        turndownServiceInstance.addRule('pWithOnlyBrToHTML', {
            filter: function (node) { return node.nodeName === 'P' && node.childNodes.length === 1 && node.firstChild.nodeName === 'BR'; },
            replacement: function () { return '<p><br></p>\n\n'; }
        });
        turndownServiceInstance.addRule('emptyPToHTMLPWithBr', {
            filter: function (node) { return node.nodeName === 'P' && node.innerHTML.trim() === ''; },
            replacement: function () { return '<p><br></p>\n\n'; }
        });
        turndownServiceInstance.addRule('strikethrough', {
            filter: ['del', 's', 'strike'],
            replacement: function (content) { return '~~' + content + '~~'; }
        });
        turndownServiceInstance.addRule('taskListItems', {
            filter: function (node) { return node.nodeName === 'LI' && node.firstChild && node.firstChild.nodeName === 'INPUT' && node.firstChild.getAttribute('type') === 'checkbox'; },
            replacement: function (content, node) {
                const checkbox = node.firstChild;
                const isChecked = checkbox.checked;
                const newContent = content.replace(/^\s+/, ''); // Remove leading spaces before content
                const parentList = node.parentNode;
                let listItemPrefix = (parentList && parentList.nodeName === 'OL' ? (Array.from(parentList.children).indexOf(node) + 1) + '. ' : (turndownServiceInstance.options.bulletListMarker || '*') + ' ');
                return listItemPrefix + (isChecked ? '[x] ' : '[ ] ') + newContent;
            }
        });
        turndownServiceInstance.keep(['table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption']);

        appContext.htmlToMarkdown = (htmlString) => {
            if (!turndownServiceInstance) { return htmlString; }
            try {
                let cleanedHtml = htmlString.replace(/\u00A0/g, ' '); // Replace non-breaking spaces
                let markdown = turndownServiceInstance.turndown(cleanedHtml);
                // Normalize newlines: remove triple+ newlines, ensure single trailing newline for non-empty.
                markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
                if (markdown) markdown += '\n'; // Add a single trailing newline if content exists
                return markdown;
            } catch (error) {
                console.error("Turndown error:", error);
                return `<!-- Turndown Error: ${error.message} -->\n${htmlString}`; // Return original on error
            }
        };
    } else {
        console.error("TurndownService library not found.");
        appContext.htmlToMarkdown = (htmlString) => { return htmlString; }; // Fallback
    }

    appContext.clientConverter = new showdown.Converter();
    appContext.clientConverter.setOption('tables', true);
    
    if (typeof diff_match_patch === 'function') {
        appContext.DmpInstance = new diff_match_patch();
    } else {
        appContext.DmpInstance = null;
        console.warn("diff_match_patch library not loaded globally. Differential saving disabled for main editor if not provided by context.");
    }


    appContext.logoutUser = async () => {
        // ... (logoutUser implementation remains largely the same, but ensure it calls global clearEditor) ...
        const token = localStorage.getItem('authToken');
        if (token) {
            try {
                await appContext.fetchWithAuth('/api/auth/logout', { method: 'POST' });
            } catch (error) {
                console.warn("Error calling server logout (token might still be valid on server if blacklist used):", error.message);
            }
        }

        localStorage.removeItem('authToken');
        appContext.currentUser = null;
        appContext.currentProject = null; // Clear global current project
        appContext.currentPageState = null; // Clear global current page state
        appContext.hasUnsavedChanges = false; // Reset global unsaved changes flag

        // Explicitly clear editor for logout, don't rely on clearEditor(true)
        // which might try to show homepage if user context was briefly available.
        if (appContext.liveEditor) {
            appContext.liveEditor.innerHTML = '';
            appContext.liveEditor.contentEditable = 'true';
            appContext.liveEditor.dataset.placeholder = "Type '/' for commands, or start writing...";
            appContext.liveEditor.classList.add('is-empty');
        }
         if (appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = 'No page selected';
         if (appContext.savePageBtn) appContext.savePageBtn.disabled = true;
         
        // Clear user profile area
        if (appContext.userProfileAreaContainer) {
            appContext.userProfileAreaContainer.innerHTML = '';
        }

        if (appContext.pageTreeContainer) appContext.pageTreeContainer.innerHTML = '<p style="padding: 0 10px; font-size: 0.9em; color: var(--text-secondary);">Please log in to see projects.</p>';
        const projectsHeadingContainer = document.getElementById('projects-heading-container');
        if(projectsHeadingContainer) projectsHeadingContainer.innerHTML = ''; 

        if (appContext.closeAllPeekModals) appContext.closeAllPeekModals(true); // Force close peek modals

        if (appContext.showStatus) appContext.showStatus('Logged out successfully.', 'info');
        if (appContext.showLoginScreen) appContext.showLoginScreen();
    };

   // Initialize modules
   initAuth(appContext); 
   
   // initEditArea for the MAIN editor instance.
   // appContext itself serves as the "editorContext" for the main editor.
   initEditArea(appContext); 

   initSidePanel(appContext); 
   appContext.slashCommandInstance = initSlashCommand(appContext); // Initialize for main editor
   initTextStyleModal(appContext);
   initTableEditor(appContext);
   initEmojiModal(appContext);
   initMoreOptionsModal(appContext);
   initEmbedPageModal(appContext);
   initUserSettingsModal(appContext); 
   initHomepage(appContext); // ADDED: Initialize the homepage system
   initPagePeekModalSystem(appContext); // ADDED: Initialize the peek modal system

   window.addEventListener('beforeunload', (event) => {
       let unsavedInPeek = false;
       if (appContext.activePeekModals) {
           // Check if any peek modal's SCMD is active and might have unconfirmed input
           const sCMDActiveInPeek = appContext.activePeekModals.some(
               modal => modal.isSlashCommandActive && modal.slashCommandInfo && modal.slashCommandInfo.textNode.textContent.substring(modal.slashCommandInfo.offset).length > 0
           );
           if (sCMDActiveInPeek) { // If SCMD has pending input, consider it "unsaved" for this check
               unsavedInPeek = true;
           }
           unsavedInPeek = appContext.activePeekModals.some(modal => modal.hasUnsavedChanges && !modal.isMinimized);
       }
       if (appContext.hasUnsavedChanges || unsavedInPeek) {
           event.preventDefault();
           event.returnValue = '';
           return 'You have unsaved changes. Are you sure you want to leave?';
       }
   });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            // Do not let global Escape interfere if a SCMD is active in any editor
            if (appContext.isSlashCommandActive) { // Main editor's SCMD
                // Let the SCMD's own keydown handler deal with Escape
                return;
            }
            if (appContext.activePeekModals && appContext.activePeekModals.some(m => m.isSlashCommandActive)) {
                // Let the SCMD's own keydown handler in the peek modal deal with Escape
                return;
            }

            // Prioritize closing the topmost, non-minimized peek modal
            const topPeekModal = appContext.getTopPeekModal ? appContext.getTopPeekModal() : null;
            if (topPeekModal && topPeekModal.domElement.style.display !== 'none' && !topPeekModal.isMinimized) {
                if (topPeekModal.close) topPeekModal.close(); // Attempt to close it (might ask for confirmation)
                return; // Stop further Escape processing
            }
            // Then other modals as before
            if (appContext.actionsModal && appContext.actionsModal.style.display !== 'none') {
                appContext.actionsModal.style.display = 'none';
            }
            if (appContext.userSettingsModal && appContext.userSettingsModal.style.display !== 'none' && appContext.closeUserSettingsModal) { // Check if modal is closable
                appContext.closeUserSettingsModal();
            }
            if (appContext.embedPageModal && appContext.embedPageModal.style.display !== 'none') { 
                if (!appContext.isSlashCommandActive && appContext.closeEmbedPageModal) {
                     appContext.closeEmbedPageModal();
                }
            }
            if (appContext.emojiModal && appContext.emojiModal.style.display !== 'none') {
                if (!appContext.isSlashCommandActive && appContext.closeEmojiModal) {
                    appContext.closeEmojiModal();
                }
            }
            if (appContext.closeMoreOptionsModal) { 
                appContext.closeMoreOptionsModal();
             }
        }
    });

    if (appContext.actionsModal) {
        appContext.actionsModal.addEventListener('click', (event) => {
            if (event.target === appContext.actionsModal) {
                appContext.actionsModal.style.display = 'none';
            }
        });
    }

   if (appContext.checkAuthStatus) {
        appContext.checkAuthStatus() // This often triggers sidePanel's fetchProjectsAndDisplay
            .then(() => {
                // After auth is checked and initial project/page load MIGHT have happened...
                if (appContext.currentUser && !appContext.currentProject && !appContext.currentPageState && appContext.displayHomepage) {
                    // If user is logged in, but NO project is active (e.g., user has no projects, or initial load failed)
                    // and no page is loaded, then display the main homepage.
                    appContext.displayHomepage();
                }
            });
   } else {
       console.error("checkAuthStatus function not initialized. Auth will not work.");
       if (appContext.showLoginScreen) appContext.showLoginScreen(); 
   }

   // Register Service Worker (Add this section)
   if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => { // Use 'load' to register SW after page content is loaded
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => {
                    console.log('Service Worker registered successfully with scope:', registration.scope);
                })
                .catch(error => {
                    console.error('Service Worker registration failed:', error);
                });
        });
    }
});
// --- END OF FILE main.js ---