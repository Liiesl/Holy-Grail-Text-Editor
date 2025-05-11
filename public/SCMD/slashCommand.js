// SCMD/slashCommand.js

import { paragraphCommand, h1Command, h2Command, h3Command, blockquoteCommand } from './commands/basicBlockCommands.js';
import { bulletListCommand, numberedListCommand, checklistCommand } from './commands/listCommands.js';
import { dividerCommand, codeBlockCommand, tableCommand } from './commands/mediaCommands.js';
import { emojiCommand } from './commands/miscCommand.js'; // Import emojiCommand
import { createSubpageCommand, embedPageCommand, openInPagePeekCommand } from './commands/pageOperationCommands.js'; // MODIFIED: Import openInPagePeekCommand


export function initSlashCommand(editorContext) { // Renamed appContext to editorContext
    const {
        liveEditor,
        slashCommandModal, // This is the DOM element for this instance's SCMD
        // showStatus is used by individual commands via editorContext.showStatus()
        // currentProject, currentPageState, etc., are on editorContext and used by commands
    } = editorContext;
 
    // These are local to this slash command instance
    let slashCommandActive = false;
    let selectedCommandIndex = 0;
    let filteredCommands = []; // For display (metadata only)
    let searchQuery = '';
    
    // Ensure editorContext has these properties if they are to be managed by SCMD state
    // These are read/written by this SCMD instance on the editorContext it's bound to.
    editorContext.isSlashCommandActive = editorContext.isSlashCommandActive || false;
    editorContext.slashCommandInfo = editorContext.slashCommandInfo || null;

    const commandRegistry = {}; // Stores full command objects with execute methods
    const allCommandMetadata = []; // Stores metadata for filtering and display

    function registerCommand(cmdModule) {
        allCommandMetadata.push({
            command: cmdModule.command,
            short: cmdModule.short,
            icon: cmdModule.icon,
            iconClass: cmdModule.iconClass,
            iconText: cmdModule.iconText,
            text: cmdModule.text,
            description: cmdModule.description,
            category: cmdModule.category,
        });
        commandRegistry[cmdModule.command] = cmdModule;
    }

    // Register all imported commands
    [
        paragraphCommand, h1Command, h2Command, h3Command, blockquoteCommand,
        bulletListCommand, numberedListCommand, checklistCommand, emojiCommand, 
        dividerCommand, codeBlockCommand, tableCommand,
        createSubpageCommand, embedPageCommand, openInPagePeekCommand // MODIFIED: Register openInPagePeekCommand
    ].forEach(registerCommand);


    // Define these methods on the editorContext for this specific SCMD instance
    editorContext.removeSlashCommandTextFromEditor = (scInfo, scQueryToDelete) => {
        if (!scInfo || !scInfo.textNode || !scInfo.textNode.parentNode || scInfo.textNode.nodeType !== Node.TEXT_NODE) {
            console.warn("removeSlashCommandTextFromEditor: Invalid scInfo or textNode.", scInfo);
            return;
        }
    
        const { textNode, offset } = scInfo;
        // Check if textNode still has content and if the slash character is plausible
        if (textNode.textContent === null || offset === 0 || textNode.textContent.length < offset || textNode.textContent[offset - 1] !== '/') {
            console.warn("removeSlashCommandTextFromEditor: '/' not at expected position, invalid offset, or textNode has no content.", { textContent: textNode.textContent, offset });
            return;
        }
        
        const sel = window.getSelection();
        if (!sel) return;
    
        const rangeToDelete = document.createRange();
        try {
            // It's crucial that liveEditor is focused and selection is managed appropriately by the calling command (embedPageCommand)
            // This function just performs the deletion.
            rangeToDelete.setStart(textNode, offset - 1); // Start at '/'
            const endDeletionOffset = Math.min(offset + scQueryToDelete.length, textNode.textContent.length);
            rangeToDelete.setEnd(textNode, endDeletionOffset);
            
            // If the current selection is already where we want to delete, that's fine.
            // If not, this might disrupt. However, embedPageCommand should restore selection later.
            // sel.removeAllRanges(); // Avoid this if possible, let calling command manage selection.
            // sel.addRange(rangeToDelete);
            rangeToDelete.deleteContents();
    
            // The calling command (embedPageCommand) will handle setting the final cursor position after inserting its content.
        } catch (error) {
            console.error("Error removing slash command text via appContext function:", error, {textNodeContent: textNode.textContent, offset, scQueryToDelete});
        }
    };
    
    editorContext.closeSlashCommandModal = () => {
        if (slashCommandModal) slashCommandModal.style.display = 'none';
        slashCommandActive = false; // local to this SCMD instance
        editorContext.isSlashCommandActive = false; // on the editor specific context

        // searchQuery = ''; // Keep searchQuery as it might be needed by embedPageCommand's callback for cleanup
        // editorContext.slashCommandInfo = null; // Keep slashCommandInfo for the same reason
        // The actual reset of searchQuery and slashCommandInfo should happen after embedPageCommand's callback is fully done,
        // or if slash command closes normally (e.g. Escape, click outside).
    };


    function getEditorArea() {
        // If liveEditor is part of a peek modal, its scroll container is different
        const peekEditorArea = liveEditor.closest('.page-peek-modal-editor-area');
        if (peekEditorArea) return peekEditorArea;
        return liveEditor.closest('.editor-area'); // Fallback for main editor
    }

    function getCursorCoords() {
        if (!liveEditor.contains(window.getSelection().anchorNode)) return null; // Selection not in this editor
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(true); 

        let rect = range.getClientRects()[0];
        if (!rect) { // Fallback for empty lines or complex scenarios
            const tempSpan = document.createElement('span');
            tempSpan.textContent = '\u200b'; // Zero-width space
            try {
                range.insertNode(tempSpan);
                rect = tempSpan.getBoundingClientRect();
                if (tempSpan.parentNode) tempSpan.parentNode.removeChild(tempSpan);
            } catch (error) {
                if (tempSpan.parentNode) try { tempSpan.parentNode.removeChild(tempSpan); } catch (e) {/*ignore*/}
                return null;
            }
        }
        if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0)) return null;
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    }

    function findCurrentBlock(node) {
        let block = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
        while (block && block !== liveEditor && !['P', 'H1', 'H2', 'H3', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'TD', 'TH'].includes(block.tagName)) {
            block = block.parentNode;
        }
        return (block && block !== liveEditor) ? block : null;
    }

    function updateCommandList() {
        const lowerSearchQuery = searchQuery.toLowerCase();
        
        // Reset selected index if the list will be completely re-evaluated due to search
        // This is already handled in the 'input' event listener: `selectedCommandIndex = 0;` when searchQuery changes.

        if (!lowerSearchQuery) {
            // No search query: Show all executable commands, grouped by category (original behavior)
            filteredCommands = allCommandMetadata.filter(cmd => 
                commandRegistry[cmd.command].canExecute ? commandRegistry[cmd.command].canExecute(editorContext) : true
            );
            // Optionally, sort default list by category then text if not inherently done by grouping.
            // The current rendering logic groups by category, then lists commands as they are in allCommandMetadata.
            // For consistency, you might sort cmds within each category alphabetically by text.
            // Example: (inside the reduce for commandsByCategory or after)
            // Object.values(commandsByCategory).forEach(cmdsArray => cmdsArray.sort((a,b) => a.text.localeCompare(b.text)));

        } else {
            // Search query is active: Score, filter, and sort commands
            const scoredCommands = allCommandMetadata
                .filter(cmd => commandRegistry[cmd.command].canExecute ? commandRegistry[cmd.command].canExecute(editorContext) : true)
                .map(cmd => {
                    let score = 0;
                    // Determine the highest priority match
                    if (cmd.text.toLowerCase().includes(lowerSearchQuery)) {
                        score = 4; // Highest priority: Title match
                    } else if (cmd.short && Array.isArray(cmd.short) && cmd.short.some(s => s.toLowerCase().includes(lowerSearchQuery))) {
                        score = 3; // Second priority: Short command match
                    } else if (cmd.description.toLowerCase().includes(lowerSearchQuery)) {
                        score = 2; // Third priority: Description match
                    } else if (cmd.category.toLowerCase().includes(lowerSearchQuery)) {
                        score = 1; // Lowest priority: Category match
                    }
                    return { ...cmd, score }; // Return the original command data with its score
                })
                .filter(cmd => cmd.score > 0); // Keep only commands that actually matched

            // Sort commands:
            // 1. By score in descending order (higher score first).
            // 2. For tie-breaking (same score), sort by command text alphabetically (ascending).
            scoredCommands.sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                return a.text.localeCompare(b.text);
            });
            
            filteredCommands = scoredCommands; // Update filteredCommands with the sorted list
        }
        
        // Adjust selectedCommandIndex to be within the bounds of the new filteredCommands list
        selectedCommandIndex = Math.max(0, Math.min(selectedCommandIndex, filteredCommands.length - 1));
        if (filteredCommands.length === 0) {
            selectedCommandIndex = -1; // No item can be selected if list is empty
        }
        
        slashCommandModal.innerHTML = ''; // Clear previous list
        
        if (filteredCommands.length === 0) {
            slashCommandModal.innerHTML = `<div class="no-results">No commands found</div>`;
            return;
        }
        
        const commandList = document.createElement('ul');
        commandList.className = 'command-list';
        
        if (lowerSearchQuery && filteredCommands.length > 0) {
            // With an active search query, render a flat list sorted by score
            filteredCommands.forEach((cmd, index) => {
                const commandItem = document.createElement('li');
                commandItem.dataset.command = cmd.command;
                commandItem.className = index === selectedCommandIndex ? 'selected' : '';
                
                const iconElement = document.createElement(cmd.icon === 'command-icon-text' ? 'span' : 'i');
                iconElement.className = cmd.icon === 'command-icon-text' ? cmd.icon : `${cmd.icon} ${cmd.iconClass}`;
                if (cmd.iconText) iconElement.textContent = cmd.iconText;
                
                const textContainer = document.createElement('div');
                textContainer.className = 'command-text';
                textContainer.innerHTML = `
                    <div class="command-title">${cmd.text}</div>
                    <div class="command-description">${cmd.description}</div>`;
                
                commandItem.append(iconElement, textContainer);
                commandList.appendChild(commandItem);
            });
        } else {
            // No search query: Render with category grouping (original behavior)
            const commandsByCategory = filteredCommands.reduce((acc, cmd) => {
                (acc[cmd.category] = acc[cmd.category] || []).push(cmd);
                return acc;
            }, {});
            
            // Optional: Sort categories alphabetically
            const sortedCategories = Object.keys(commandsByCategory).sort((a,b) => a.localeCompare(b));

            let currentIndex = 0;
            // Object.entries(commandsByCategory).forEach(([category, cmds]) => { // Original order
            sortedCategories.forEach(category => { // Sorted category order
                const cmds = commandsByCategory[category];
                // Optional: Sort commands within this category alphabetically by text
                // cmds.sort((a,b) => a.text.localeCompare(b.text)); // This line is commented out by default. Uncomment to sort commands alphabetically within categories.


                const categoryHeader = document.createElement('div');
                categoryHeader.className = 'command-category';
                categoryHeader.textContent = category;
                commandList.appendChild(categoryHeader);
                
                cmds.forEach(cmd => {
                    const commandItem = document.createElement('li');
                    commandItem.dataset.command = cmd.command;
                    commandItem.className = currentIndex === selectedCommandIndex ? 'selected' : '';
                    
                    const iconElement = document.createElement(cmd.icon === 'command-icon-text' ? 'span' : 'i');
                    iconElement.className = cmd.icon === 'command-icon-text' ? cmd.icon : `${cmd.icon} ${cmd.iconClass}`;
                    if (cmd.iconText) iconElement.textContent = cmd.iconText;
                    
                    const textContainer = document.createElement('div');
                    textContainer.className = 'command-text';
                    textContainer.innerHTML = `
                        <div class="command-title">${cmd.text}</div>
                        <div class="command-description">${cmd.description}</div>`;
                    
                    commandItem.append(iconElement, textContainer);
                    commandList.appendChild(commandItem);
                    currentIndex++;
                });
            });
        }
        slashCommandModal.appendChild(commandList);

        // Ensure the selected item is visible
        const selectedItem = slashCommandModal.querySelector('li.selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }

    function positionModal(cursorPos) {
        if (!cursorPos) {
            slashCommandModal.style.display = 'none';
            return;
        }

        slashCommandModal.style.visibility = 'hidden';
        slashCommandModal.style.display = 'block';
        const modalRect = slashCommandModal.getBoundingClientRect();

        let finalTop = cursorPos.bottom + 5;
        let finalLeft = cursorPos.left;

        if (finalTop + modalRect.height > window.innerHeight - 10) {
            finalTop = cursorPos.top - modalRect.height - 5;
        }
        if (finalLeft + modalRect.width > window.innerWidth - 10) {
            finalLeft = window.innerWidth - modalRect.width - 10;
        }
        finalTop = Math.max(10, finalTop);
        finalLeft = Math.max(10, finalLeft);

        slashCommandModal.style.top = `${finalTop}px`;
        slashCommandModal.style.left = `${finalLeft}px`;
        slashCommandModal.style.visibility = 'visible';
        
        const selectedItem = slashCommandModal.querySelector('li.selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest' });
        }
    }

    function removeSlashCharacterAndQuery(contextForRemoval) { // This is for standard commands, pass the editorContext
        const scInfo = contextForRemoval.slashCommandInfo;
        if (!scInfo || !scInfo.textNode || !scInfo.textNode.parentNode || scInfo.textNode.nodeType !== Node.TEXT_NODE) return;

        const { textNode, offset } = scInfo;
        if (offset === 0 || textNode.textContent.length < offset || textNode.textContent[offset - 1] !== '/') return;
        
        const sel = window.getSelection();
        if (!sel) return;

        const rangeToDelete = document.createRange();
        try {
            rangeToDelete.setStart(textNode, offset - 1); 
            const endDeletionOffset = Math.min(offset + searchQuery.length, textNode.textContent.length);
            rangeToDelete.setEnd(textNode, endDeletionOffset); 
            
            sel.removeAllRanges(); 
            sel.addRange(rangeToDelete); 
            rangeToDelete.deleteContents(); 

            const newRange = document.createRange();
            newRange.setStart(rangeToDelete.startContainer, rangeToDelete.startOffset);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);

        } catch (error) {
            console.error("Error removing slash command text:", error, {textNodeContent: textNode.textContent, offset, searchQueryLength: searchQuery.length});
            liveEditor.focus();
        }
    }

    async function executeCommand(commandName) {
        const commandToExecute = commandRegistry[commandName];
        if (!commandToExecute) {
            console.warn(`Command not found in registry: ${commandName}`);
            return;
        }

        const editorArea = getEditorArea();
        const scrollYBefore = editorArea ? editorArea.scrollTop : null;
        
        let slashCmdFinalRect = null;
        if (slashCommandModal.style.display !== 'none') {
            slashCmdFinalRect = slashCommandModal.getBoundingClientRect();
        }
        
        const scInfoBackup = editorContext.slashCommandInfo ? { ...editorContext.slashCommandInfo } : null; // Clone for safety
        const currentSearchQueryForCommand = searchQuery; // Capture searchQuery at execution time

        // For commands like 'embed-page', 'emoji', cleanup is deferred.
        // For others, it happens before execution.
        const isDeferredCleanupCommand = ['embed-page', 'emoji'].includes(commandToExecute.command);

        if (!isDeferredCleanupCommand) {
            if (editorContext.slashCommandInfo) {
                removeSlashCharacterAndQuery(editorContext); // Pass editorContext
             }
            slashCommandModal.style.display = 'none';
            slashCommandActive = false;
            editorContext.isSlashCommandActive = false;
            searchQuery = ''; 
            editorContext.slashCommandInfo = null;
        }
        
        liveEditor.focus(); 
        
        const currentSel = window.getSelection();
        let currentRange = null;
        let currentBlock = null;

        if (currentSel && currentSel.rangeCount > 0) {
            currentRange = currentSel.getRangeAt(0).cloneRange(); // Clone to preserve
            currentBlock = findCurrentBlock(currentRange.startContainer);
        }
        
        if (!isDeferredCleanupCommand && currentBlock && 
            currentBlock !== liveEditor && 
            currentBlock.parentNode && 
            (currentBlock.innerHTML.trim() === '' || currentBlock.innerHTML.trim().toLowerCase() === '<br>') &&
            !['LI', 'TD', 'TH'].includes(currentBlock.tagName.toUpperCase())
        ) {
            const newStandardEmptyBlock = document.createElement('p');
            newStandardEmptyBlock.innerHTML = '<br>';
            currentBlock.parentNode.replaceChild(newStandardEmptyBlock, currentBlock);
            currentBlock = newStandardEmptyBlock;
            
            if (currentSel) {
                const newRangeForEmptyBlock = document.createRange();
                newRangeForEmptyBlock.setStart(currentBlock, 0); 
                newRangeForEmptyBlock.collapse(true);
                currentSel.removeAllRanges();
                currentSel.addRange(newRangeForEmptyBlock);
                currentRange = newRangeForEmptyBlock;
            }
        }

        const executionOptions = {
            currentBlock,
            selection: currentSel, 
            range: currentRange,   
            slashCmdFinalRect,     
            originalSlashCommandInfo: scInfoBackup,
            currentSearchQuery: currentSearchQueryForCommand 
        };
        
        const commandExecutionResult = await commandToExecute.execute(editorContext, executionOptions);

        // If commandExecutionResult is false, the command (e.g., embed-page) is handling its own UI/state cleanup.
        if (commandExecutionResult !== false) { 
            const commandUsesTimeoutForFocus = ['checklist', 'code-block', 'table'].includes(commandToExecute.command);
            const commandManipulatesSelectionAfterHR = commandToExecute.command === 'divider';

            const performFinalActions = () => {
                liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                if (editorArea && scrollYBefore !== null) {
                    // Scroll restoration logic (can be complex)
                }
                // Ensure editor still has focus
                // if(document.activeElement !== liveEditor && !isDeferredCleanupCommand) { // Avoid refocus if deferred command is active
                //     liveEditor.focus();
                // }
            };
            
            const needsLongerDelayForScrollSettle = commandUsesTimeoutForFocus || commandManipulatesSelectionAfterHR;
            if (needsLongerDelayForScrollSettle) {
                setTimeout(() => requestAnimationFrame(performFinalActions), 50);
            } else {
                requestAnimationFrame(performFinalActions);
            }
        } else {
            // Command (e.g. embed-page) has indicated it will manage its own lifecycle.
            // Slash command modal might still be visible, searchQuery and slashCommandInfo are preserved
            // until the command calls editorContext.closeSlashCommandModal() and appContext.removeSlashCommandTextFromEditor().
        }
    }


    liveEditor.addEventListener('input', (e) => {
        const sel = window.getSelection();
        if (!sel.rangeCount) {
             if (editorContext.isSlashCommandActive) {
                slashCommandModal.style.display = 'none';
                slashCommandActive = false; searchQuery = ''; editorContext.slashCommandInfo = null;
                editorContext.isSlashCommandActive = false;
             }
            return;
        }
        
        const range = sel.getRangeAt(0);
        // If selection is not within the current liveEditor, bail
        if (!liveEditor.contains(range.startContainer)) {
            if (editorContext.isSlashCommandActive) editorContext.closeSlashCommandModal(); // Close if active for this editor
            return;
        }

        const node = range.startContainer;
        const offset = range.startOffset;

        if (editorContext.isSlashCommandActive) {
            const scInfo = editorContext.slashCommandInfo;
            if (!scInfo || node !== scInfo.textNode || offset < scInfo.offset ) {
                slashCommandModal.style.display = 'none';
                slashCommandActive = false; searchQuery = ''; editorContext.slashCommandInfo = null;
                editorContext.isSlashCommandActive = false;

                if (editorContext.embedPageModal && editorContext.embedPageModal.style.display !== 'none' && editorContext.closeEmbedPageModal) {
                   // Check if the active command was embed-page; if so, its callback handles closure.
                }

                if (editorContext.emojiModal && editorContext.emojiModal.style.display !== 'none' && editorContext.closeEmojiModal) {
                    // Similar logic
                }
                return; 
            }

            if (node.nodeType === Node.TEXT_NODE) {
                const textAfterSlash = node.textContent.substring(scInfo.offset);
                if (textAfterSlash !== searchQuery) { 
                    searchQuery = textAfterSlash; 
                    selectedCommandIndex = 0; 
                    updateCommandList(); 
                    if(editorContext.isSlashCommandActive) positionModal(getCursorCoords()); 
                }
            } else { 
                 slashCommandModal.style.display = 'none';
                 slashCommandActive = false; searchQuery = ''; appContext.slashCommandInfo = null;
                 editorContext.isSlashCommandActive = false;
            }
            return; 
        }
        
        if (e.inputType === 'insertText' && e.data === '/' && node.nodeType === Node.TEXT_NODE) {
            let isAtBlockStart = false;
            if (offset === 1) { 
                let textBeforeInBlock = "";
                const parentBlock = findCurrentBlock(node); 
                let currentSibling = node.previousSibling;
                while(currentSibling && parentBlock && parentBlock.contains(currentSibling)){
                    textBeforeInBlock = currentSibling.textContent + textBeforeInBlock;
                    currentSibling = currentSibling.previousSibling;
                }
                if (textBeforeInBlock.trim() === "") { 
                    isAtBlockStart = true;
                }
            }
            
            const editorIsEmpty = liveEditor.innerHTML.trim() === '<p><br></p>' || liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML.trim() === '<br>';
            const charBeforeSlash = (offset > 1) ? node.textContent[offset - 2] : null; 
            const isAfterSpace = charBeforeSlash === ' ' || charBeforeSlash === '\u00A0'; 

            if (isAtBlockStart || isAfterSpace || (editorIsEmpty && offset === 1) ) {
                const cursorPos = getCursorCoords();
                if (!cursorPos) return; 
                
                searchQuery = ''; 
                selectedCommandIndex = 0;
                editorContext.slashCommandInfo = { 
                    textNode: node, 
                    offset: offset, 
                };
                updateCommandList(); 
                positionModal(cursorPos);
                slashCommandActive = true;
                editorContext.isSlashCommandActive = true;
            }
        
        }
    });
 
    slashCommandModal.addEventListener('click', (e) => {
        // Ensure the click is relevant to this specific slash command modal
        if (slashCommandModal.contains(e.target)) {
            const commandItem = e.target.closest('li[data-command]');
            if (commandItem) executeCommand(commandItem.dataset.command);
        }
    });
    
    const handleDocumentClick = (e) => {
        if (editorContext.isSlashCommandActive && !slashCommandModal.contains(e.target) && !liveEditor.contains(e.target)) {
            const embedModal = editorContext.embedPageModal; // Use editorContext to access global modals
            if (embedModal && embedModal.style.display !== 'none' && embedModal.contains(e.target)) {
                // Click is inside embed modal, which is fine. Let it handle its events.
                // Slash command modal should remain as is, under control of embedPageCommand if active.
                return;
            }

            // Check other global modals if necessary, e.g., emojiModal
            const emojiM = editorContext.emojiModal;
            if (emojiM && emojiM.style.display !== 'none' && emojiM.contains(e.target)) {
                return;
            }

            // If an embed/emoji modal was open via this SCMD, its command should handle closure.
            // This click outside means user is abandoning the SCMD flow.
            if (editorContext.closeEmbedPageModal && embedModal && embedModal.style.display !== 'none') {
                editorContext.closeEmbedPageModal();
            }
            if (editorContext.closeEmojiModal && emojiM && emojiM.style.display !== 'none') {
                editorContext.closeEmojiModal();
            }

            editorContext.closeSlashCommandModal(); // Use the method that sets both internal and context flags
            searchQuery = ''; 
            editorContext.slashCommandInfo = null; // Reset info for this context
        }
    };
    document.addEventListener('click', handleDocumentClick);
 
    liveEditor.addEventListener('keydown', (e) => {
        if (!editorContext.isSlashCommandActive) return;

        if (e.key === 'Backspace' && editorContext.slashCommandInfo) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                if (range.collapsed && 
                    range.startContainer === editorContext.slashCommandInfo.textNode &&
                    range.startOffset === editorContext.slashCommandInfo.offset && 
                    searchQuery === '') { 
                    
                    slashCommandModal.style.display = 'none';
                    slashCommandActive = false; 
                    appContext.isSlashCommandActive = false;
                    // searchQuery and slashCommandInfo will be cleared by the 'input' event or next char.
                    // Let backspace proceed to delete '/'.
                    return; 
                }
            }
        }

        if (!['Escape', 'ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Backspace', 'Delete'].includes(e.key) && 
            (e.key.length > 1 && !e.ctrlKey && !e.metaKey && !e.altKey) ) { 
            e.preventDefault();
            e.stopPropagation(); // Prevent event from bubbling to other keydown listeners (e.g. main window for Escape)
             return;
        }

        if (['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Escape'].includes(e.key)) {
            e.preventDefault(); 

            if (e.key === 'Escape') {
                if (editorContext.embedPageModal && editorContext.embedPageModal.style.display !== 'none' && editorContext.closeEmbedPageModal) {
                    editorContext.closeEmbedPageModal();
                }
                if (editorContext.emojiModal && editorContext.emojiModal.style.display !== 'none' && editorContext.closeEmojiModal) {
                    editorContext.closeEmojiModal();
                }
                editorContext.closeSlashCommandModal();
                searchQuery = ''; 
                editorContext.slashCommandInfo = null;
                liveEditor.focus(); 
            } else if (e.key === 'ArrowDown' && filteredCommands.length > 0) {
                selectedCommandIndex = (selectedCommandIndex + 1) % filteredCommands.length;
                updateCommandList();
            } else if (e.key === 'ArrowUp' && filteredCommands.length > 0) {
                selectedCommandIndex = (selectedCommandIndex - 1 + filteredCommands.length) % filteredCommands.length;
                updateCommandList();
            } else if ((e.key === 'Enter' || e.key === 'Tab') && selectedCommandIndex >= 0 && selectedCommandIndex < filteredCommands.length) {
                executeCommand(filteredCommands[selectedCommandIndex].command);
            }
        }
    });

    liveEditor.addEventListener('focus', () => {
        const editorContent = liveEditor.innerHTML.trim().toLowerCase();
        const isEmptyEffectively = editorContent === '' || editorContent === '<p></p>' || editorContent === '<p><br></p>' || editorContent === '<br>' || editorContent === '<br/>';
        const hasNoBlockLevelChildren = !liveEditor.querySelector('p, h1, h2, h3, div, ul, ol, blockquote, pre, li, hr, table');

        if (isEmptyEffectively || (liveEditor.childNodes.length === 0) || 
            (liveEditor.childNodes.length === 1 && liveEditor.firstChild.nodeName === 'BR') || 
            (hasNoBlockLevelChildren && liveEditor.textContent.trim() !== '')) { 
            
            if (!(liveEditor.childNodes.length === 1 && liveEditor.firstChild.nodeName === 'P' && 
                  (liveEditor.firstChild.innerHTML.trim() === '' || liveEditor.firstChild.innerHTML.trim().toLowerCase() === '<br>'))) 
            {
                const currentContent = liveEditor.innerHTML; 
                liveEditor.innerHTML = ''; 
                document.execCommand('defaultParagraphSeparator', false, 'p'); 

                const p = document.createElement('p');
                if (hasNoBlockLevelChildren && currentContent.trim() !== '' && currentContent.trim() !== '<br>') {
                    p.innerHTML = currentContent; 
                } else {
                    p.innerHTML = '<br>'; 
                }
                liveEditor.appendChild(p);
                
                const sel = window.getSelection();
                if (sel) {
                    const range = document.createRange();
                    if (p.firstChild) {
                         range.setStartBefore(p.firstChild);
                    } else { 
                        range.setStart(p, 0);
                    }
                    range.collapse(true);
                    sel.removeAllRanges(); 
                    sel.addRange(range);
                }
            }
        }
    });

    // Return a cleanup function for this SCMD instance
    return {
        destroy: () => {
            document.removeEventListener('click', handleDocumentClick);
            // liveEditor and slashCommandModal listeners are removed when their elements are destroyed.
            // Clear any pending timeouts if SCMD itself managed them (not currently the case).
            if (slashCommandModal) slashCommandModal.innerHTML = ''; // Clear content
        }
    };
}