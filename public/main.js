// main.js

import { initSidePanel } from './sidePanel.js';
import { initEditArea } from './editArea.js';
import { initSlashCommand } from './slashCommand.js';
import { initTextStyleModal } from './textStyleModal.js'; // ADDED THIS LINE

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
       textStyleModal: document.getElementById('text-style-modal'), // ADDED THIS LINE


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

            // blankReplacement is for elements that are "blank" but not necessarily <p> or <p><br>.
            // We'll rely on specific rules for <p> and <p><br> instead.
            // Default: (content, node) => node.isBlock ? '\n\n' : ''
        });
        
        // Rule 1: Handle <p><br></p> - a paragraph containing only a <br>
        // This is a common way rich text editors represent an empty line.
        turndownServiceInstance.addRule('pWithOnlyBrToHTML', {
            filter: function (node) {
                return node.nodeName === 'P' &&
                       node.childNodes.length === 1 &&
                       node.firstChild.nodeName === 'BR';
            },
            replacement: function (content, node) {
                // Output the literal HTML string <p><br></p>
                // The \n\n ensures it's treated as a block in the "Markdown" file.
                return '<p><br></p>\n\n';
            }
        });

        // Rule 2: Handle <p></p> - a completely empty paragraph
        turndownServiceInstance.addRule('emptyPToHTMLPWithBr', {
            filter: function (node) {
                // Ensure it's a P node and its innerHTML (trimmed) is empty.
                // This avoids matching <p> tags that contain only whitespace text nodes.
                // It also correctly doesn't match <p><br></p> because innerHTML would be "<br>".
                return node.nodeName === 'P' && node.innerHTML.trim() === '';
            },
            replacement: function (content, node) {
                // Also convert this to the literal HTML string <p><br></p>
                return '<p><br></p>\n\n';
            }
        });


        // --- Add GFM (GitHub Flavored Markdown)-like features ---
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


        appContext.htmlToMarkdown = (htmlString) => {
            if (!turndownServiceInstance) { 
                console.error("TurndownService is not available. Returning raw HTML as fallback.");
                return htmlString; 
            }
            try {
                // Pre-processing: Clean up non-breaking spaces.
                let cleanedHtml = htmlString.replace(/\u00A0/g, ' ');

                // Convert HTML to "Markdown" (which may now include <p><br></p>)
                let markdown = turndownServiceInstance.turndown(cleanedHtml);
                
                // Post-processing: Normalize multiple blank newlines *between blocks*.
                // This should not affect the content of the <p><br></p> tags themselves.
                // Example: `BlockA\n\n\n\n<p><br></p>\n\nBlockB` becomes `BlockA\n\n<p><br></p>\n\nBlockB`
                markdown = markdown.replace(/\n{3,}/g, '\n\n');
                
                // Trim leading/trailing whitespace from the entire document.
                markdown = markdown.trim();

                // Ensure a final newline character.
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
            // Fallback basic converter (unchanged, less relevant if Turndown is present)
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
   initTextStyleModal(appContext); // ADDED THIS LINE


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
            // ADDED: Hide text style modal on Escape as well
            if (appContext.textStyleModal && appContext.textStyleModal.style.display !== 'none') {
                appContext.textStyleModal.style.display = 'none';
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

   // --- Initialization ---
   if (appContext.fetchProjects) {
       appContext.fetchProjects();
   } else {
       console.error("fetchProjects function not initialized on appContext by sidePanel.js");
   }
});