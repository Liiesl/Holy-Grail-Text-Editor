// main.js

import { initSidePanel } from './sidePanel.js';
import { initEditArea } from './editArea.js';
import { initSlashCommand } from './slashCommand.js';
import { initTextStyleModal } from './textStyleModal.js'; 
import { initTableEditor } from './tableEditor.js'; 

// Make sure TurndownService is available globally (e.g., via <script> tag in index.html)
// If using a module bundler, you would import it:
// import TurndownService from 'turndown'; 
// import { gfm } from 'turndown-plugin-gfm'; // Example if using GFM plugins and bundler

document.addEventListener('DOMContentLoaded', () => {
   const appContext = {
       // State
       currentProject: null,
       currentPageState: null, // { id, title, originalMarkdown, versionHash }
       hasUnsavedChanges: false,
       slashCommandInfo: null,
       autosaveTimeoutId: null,
       autosaveDelay: 3000,
       isSaving: false,

       // DOM Elements
       pageTreeContainer: document.getElementById('page-tree'),
       liveEditor: document.getElementById('live-editor'),
       savePageBtn: document.getElementById('save-page-btn'),
       currentPageDisplay: document.getElementById('current-page-display'),
       statusMessage: document.getElementById('status-message'),
       slashCommandModal: document.getElementById('slash-command-modal'),
       actionsModal: document.getElementById('actions-modal'), 
       textStyleModal: document.getElementById('text-style-modal'),


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
       createNewSubpage: null, 
       createNewProject: null, 
       htmlToMarkdown: null,
       openActionsModal: null,

       // Action handlers (defined in sidePanel.js and attached to appContext)
       deleteProject: null,
       renameProject: null,
       duplicateProject: null,
       deletePage: null,
       renamePage: null,
       duplicatePage: null,
   };

   // --- Utility Functions (Show Status) ---
   appContext.showStatus = (message, type = 'info', duration = 3000) => {
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

    // --- HTML to Markdown Converter (using Turndown library) ---
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
            br: '  \n', // General rule for <br> within text lines
        });
        
        turndownServiceInstance.addRule('pWithOnlyBrToHTML', {
            filter: function (node) {
                return node.nodeName === 'P' &&
                       node.childNodes.length === 1 &&
                       node.firstChild.nodeName === 'BR';
            },
            replacement: function (content, node) {
                return '<p><br></p>\n\n';
            }
        });

        turndownServiceInstance.addRule('emptyPToHTMLPWithBr', {
            filter: function (node) {
                return node.nodeName === 'P' && node.innerHTML.trim() === '';
            },
            replacement: function (content, node) {
                return '<p><br></p>\n\n';
            }
        });

        turndownServiceInstance.addRule('strikethrough', {
            filter: ['del', 's', 'strike'],
            replacement: function (content) {
                return '~~' + content + '~~';
            }
        });

        turndownServiceInstance.addRule('taskListItems', {
            filter: function (node) {
                return node.nodeName === 'LI' &&
                       node.firstChild &&
                       node.firstChild.nodeName === 'INPUT' &&
                       node.firstChild.getAttribute('type') === 'checkbox';
            },
            replacement: function (content, node) {
                const checkbox = node.firstChild;
                const isChecked = checkbox.checked;
                const newContent = content.replace(/^\s+/, ''); 
                const parentList = node.parentNode;
                let listItemPrefix = '';

                if (parentList && parentList.nodeName === 'OL') {
                    let count = 1;
                    let sibling = node.previousElementSibling;
                    while (sibling) {
                        if (sibling.nodeName === 'LI') {
                            count++;
                        }
                        sibling = sibling.previousElementSibling;
                    }
                    listItemPrefix = count + '. ';
                } else {
                    listItemPrefix = (turndownServiceInstance.options.bulletListMarker || '*') + ' ';
                }
                return listItemPrefix + (isChecked ? '[x] ' : '[ ] ') + newContent;
            }
        });

        turndownServiceInstance.keep(['table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption']);


        appContext.htmlToMarkdown = (htmlString) => {
            if (!turndownServiceInstance) { 
                console.error("TurndownService is not available. Returning raw HTML as fallback.");
                return htmlString; 
            }
            try {
                let cleanedHtml = htmlString.replace(/\u00A0/g, ' ');
                let markdown = turndownServiceInstance.turndown(cleanedHtml);
                markdown = markdown.replace(/\n{3,}/g, '\n\n');
                markdown = markdown.trim();
                if (markdown) {
                    markdown += '\n';
                }
                return markdown;
            } catch (error) {
                console.error("Error during HTML to Markdown conversion with Turndown:", error);
                appContext.showStatus("Error converting content to Markdown. Content might be preserved as HTML.", "error");
                return `<!-- Turndown Conversion Error: ${error.message} -->\n${htmlString}`;
            }
        };

    } else {
        console.error("TurndownService library not found. Markdown conversion will be unreliable. Please include turndown.js in your HTML.");
        appContext.htmlToMarkdown = (htmlString) => {
            console.warn("Using basic fallback HTML-to-Markdown converter because Turndown library is missing.");
            const tempDiv = document.createElement('div');
            let processedHtml = htmlString
                .replace(/<h[1-6][^>]*>/gi, '\n\n') 
                .replace(/<\/h[1-6]>/gi, '\n\n')    
                .replace(/<p[^>]*>/gi, '\n\n')      
                .replace(/<\/p>/gi, '\n\n')        
                .replace(/<br[^>]*>/gi, '\n');      
            tempDiv.innerHTML = processedHtml;
            let text = tempDiv.innerText || tempDiv.textContent || "";
            text = text.replace(/\n\s*\n/g, '\n\n'); 
            text = text.trim();
            if (text) {
                text += '\n'; 
            }
            return text;
        };
    }


   // Initialize modules
   initEditArea(appContext); 
   initSidePanel(appContext); 
   initSlashCommand(appContext);
   initTextStyleModal(appContext); 
   initTableEditor(appContext); 


   // --- Global Event Listeners ---
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
            if (appContext.slashCommandModal && appContext.slashCommandModal.style.display !== 'none') {
                appContext.slashCommandModal.style.display = 'none';
                 if (appContext.liveEditor) appContext.liveEditor.focus();
            }
            if (appContext.textStyleModal && appContext.textStyleModal.style.display !== 'none') {
                appContext.textStyleModal.style.display = 'none';
            }
            // Note: Table toolbar Escape handling is within tableEditor.js
        }
    });

    if (appContext.actionsModal) {
        appContext.actionsModal.addEventListener('click', (event) => {
            if (event.target === appContext.actionsModal) {
                appContext.actionsModal.style.display = 'none';
            }
        });
    }

   // --- Initialization ---
   if (appContext.fetchProjects) {
       appContext.fetchProjects();
   } else {
       console.error("fetchProjects function not initialized on appContext by sidePanel.js");
   }
});