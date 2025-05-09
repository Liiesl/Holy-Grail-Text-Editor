// main.js

import { initSidePanel } from './sidePanel.js';
import { initEditArea } from './editArea.js';
import { initSlashCommand } from './SCMD/slashCommand.js';
import { initTextStyleModal } from './textStyleModal.js';
import { initTableEditor } from './tableEditor.js';
import { initEmojiModal } from './SCMD/emojiModal.js';
import { initEmbedPageModal } from './SCMD/embedPageModal.js';
import { initAuth } from './auth_client.js';
import { initUserSettingsModal } from './userSettingsModal.js';

document.addEventListener('DOMContentLoaded', () => {
   const appContext = {
       // Auth State
       currentUser: null, // { id, username }
       
       // App State
       currentProject: null,
       currentPageState: null, // { id, title, originalMarkdown, versionHash }
       hasUnsavedChanges: false,
       slashCommandInfo: null,
       isSlashCommandActive: false,
       autosaveTimeoutId: null,
       autosaveDelay: 3000,
       isSaving: false,

       // DOM Elements
       pageTreeContainer: document.getElementById('page-tree'),
       userProfileAreaContainer: document.getElementById('user-profile-area-container'),
       liveEditor: document.getElementById('live-editor'),
       savePageBtn: document.getElementById('save-page-btn'),
       currentPageDisplay: document.getElementById('current-page-display'),
       statusMessage: document.getElementById('status-message'),
       slashCommandModal: document.getElementById('slash-command-modal'),
       actionsModal: document.getElementById('actions-modal'),
       textStyleModal: document.getElementById('text-style-modal'),
       userSettingsModal: null, 
       emojiModal: null,
       emojiListContainer: null,
       embedPageModal: null,
       embedPageTreeContainer: null,

       // Core functions
       showStatus: null,
       updateSaveButtonState: null,
       clearEditor: null, 
       loadPageContent: null,
       savePage: null,
       scheduleAutosave: null,
       performAutosave: null,
       fetchProjects: null,
       fetchPageTree: null,
       createNewProject: null,
       htmlToMarkdown: null,
       openActionsModal: null,
       openUserSettingsModal: null,
       closeUserSettingsModal: null,
       openEmbedPageModal: null,
       openEmojiModal: null,
       closeEmojiModal: null,
       closeEmbedPageModal: null,
       removeSlashCommandTextFromEditor: null,
       closeSlashCommandModal: null,
       fetchWithAuth: null, 
       checkAuthStatus: null, 
       showLoginScreen: null, 
       logoutUser: null,
       renderUserProfile: null, // For sidePanel to expose its render function

       // Action handlers
       deleteProject: null,
       renameProject: null,
       duplicateProject: null,
       deletePage: null,
       renamePage: null,
       duplicatePage: null,
   };

    appContext.fetchWithAuth = async (url, options = {}) => {
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
            
            // Update UI for logged-out state BEFORE showing login screen
            if(appContext.renderUserProfile) appContext.renderUserProfile(); // Clears profile area
            if(appContext.pageTreeContainer) appContext.pageTreeContainer.innerHTML = '<p style="padding: 0 10px; font-size: 0.9em; color: var(--text-secondary);">Please log in to see projects.</p>';
            const projectsHeadingContainer = document.getElementById('projects-heading-container');
            if(projectsHeadingContainer) projectsHeadingContainer.innerHTML = ''; 

            if (appContext.showLoginScreen) appContext.showLoginScreen();
            const errorData = await response.json().catch(() => ({ error: `Auth Error: ${response.status}` }));
            throw new Error(errorData.error || `Auth Error: ${response.status}`);
        }
        return response;
    };


   appContext.showStatus = (message, type = 'info', duration = 3000) => {
       if (!appContext.statusMessage) return;
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

    let turndownServiceInstance;
    if (typeof TurndownService === 'function') {
        turndownServiceInstance = new TurndownService({
            headingStyle: 'atx',
            hr: '---',
            bulletListMarker: '*',
            codeBlockStyle: 'fenced',
            fence: '```',
            emDelimiter: '_',
            strongDelimiter: '**',
            linkStyle: 'inlined',
            br: '  \n', 
        });
        
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
                const newContent = content.replace(/^\s+/, '');
                const parentList = node.parentNode;
                let listItemPrefix = (parentList && parentList.nodeName === 'OL' ? (Array.from(parentList.children).indexOf(node) + 1) + '. ' : (turndownServiceInstance.options.bulletListMarker || '*') + ' ');
                return listItemPrefix + (isChecked ? '[x] ' : '[ ] ') + newContent;
            }
        });
        turndownServiceInstance.keep(['table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption']);

        appContext.htmlToMarkdown = (htmlString) => {
            if (!turndownServiceInstance) { return htmlString; }
            try {
                let cleanedHtml = htmlString.replace(/\u00A0/g, ' ');
                let markdown = turndownServiceInstance.turndown(cleanedHtml);
                markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
                if (markdown) markdown += '\n';
                return markdown;
            } catch (error) {
                console.error("Turndown error:", error);
                return `<!-- Turndown Error: ${error.message} -->\n${htmlString}`;
            }
        };
    } else {
        console.error("TurndownService library not found.");
        appContext.htmlToMarkdown = (htmlString) => { return htmlString; };
    }

    appContext.logoutUser = async () => {
        const token = localStorage.getItem('authToken');
        if (token) {
            try {
                // Optional: Call a server endpoint to invalidate the token if using a blacklist
                // Ensure this endpoint exists and handles logout correctly on the server.
                // For JWT, this might involve adding the token to a blacklist.
                await appContext.fetchWithAuth('/api/auth/logout', { method: 'POST' });
            } catch (error) {
                // Log error but proceed with client-side logout
                console.warn("Error calling server logout (token might still be valid on server if blacklist used):", error.message);
            }
        }

        localStorage.removeItem('authToken');
        appContext.currentUser = null;
        appContext.currentProject = null;
        appContext.currentPageState = null;
        appContext.hasUnsavedChanges = false;

        if (appContext.clearEditor) appContext.clearEditor(true);
        if (appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = 'No page selected';
        if (appContext.savePageBtn) appContext.savePageBtn.disabled = true;
        
        // Clear sidebar content specifically
        if (appContext.renderUserProfile) appContext.renderUserProfile(); // Will clear the profile area
        if (appContext.pageTreeContainer) appContext.pageTreeContainer.innerHTML = '<p style="padding: 0 10px; font-size: 0.9em; color: var(--text-secondary);">Please log in to see projects.</p>';
        const projectsHeadingContainer = document.getElementById('projects-heading-container');
        if(projectsHeadingContainer) projectsHeadingContainer.innerHTML = ''; 

        if (appContext.showStatus) appContext.showStatus('Logged out successfully.', 'info');
        if (appContext.showLoginScreen) appContext.showLoginScreen();
    };

   // Initialize modules
   initAuth(appContext); 
   initEditArea(appContext);
   initSidePanel(appContext); 
   initSlashCommand(appContext);
   initTextStyleModal(appContext);
   initTableEditor(appContext);
   initEmojiModal(appContext);
   initEmbedPageModal(appContext);
   initUserSettingsModal(appContext); 

   window.addEventListener('beforeunload', (event) => {
       if (appContext.hasUnsavedChanges) {
           event.preventDefault();
           event.returnValue = '';
           return 'You have unsaved changes. Are you sure you want to leave?';
       }
   });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (appContext.actionsModal && appContext.actionsModal.style.display !== 'none') {
                appContext.actionsModal.style.display = 'none';
            }
            if (appContext.userSettingsModal && appContext.userSettingsModal.style.display !== 'none' && appContext.closeUserSettingsModal) {
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
       appContext.checkAuthStatus(); 
   } else {
       console.error("checkAuthStatus function not initialized. Auth will not work.");
       if (appContext.showLoginScreen) appContext.showLoginScreen(); 
   }
});