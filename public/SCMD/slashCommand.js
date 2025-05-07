// SCMD/slashCommand.js

import { paragraphCommand, h1Command, h2Command, h3Command, blockquoteCommand } from './commands/basicBlockCommands.js';
import { bulletListCommand, numberedListCommand, checklistCommand } from './commands/listCommands.js';
import { dividerCommand, codeBlockCommand, tableCommand } from './commands/mediaCommands.js';
import { createSubpageCommand, embedPageCommand } from './commands/pageOperationCommands.js';


export function initSlashCommand(appContext) {
    const {
        liveEditor,
        slashCommandModal,
        // showStatus, // showStatus is used by individual commands via appContext
    } = appContext;

    let slashCommandActive = false;
    let selectedCommandIndex = 0;
    let filteredCommands = []; // For display (metadata only)
    let searchQuery = '';
    
    appContext.isSlashCommandActive = appContext.isSlashCommandActive || false;

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
        bulletListCommand, numberedListCommand, checklistCommand,
        dividerCommand, codeBlockCommand, tableCommand,
        createSubpageCommand, embedPageCommand // embedPageCommand is registered here
    ].forEach(registerCommand);


    appContext.removeSlashCommandTextFromEditor = (scInfo, scQueryToDelete) => {
        if (!scInfo || !scInfo.textNode || !scInfo.textNode.parentNode || scInfo.textNode.nodeType !== Node.TEXT_NODE) {
            console.warn("removeSlashCommandTextFromEditor: Invalid scInfo or textNode.", scInfo);
            return;
        }
    
        const { textNode, offset } = scInfo;
        if (offset === 0 || textNode.textContent.length < offset || textNode.textContent[offset - 1] !== '/') {
             console.warn("removeSlashCommandTextFromEditor: '/' not at expected position or invalid offset.", { textContent: textNode.textContent, offset });
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
    
    appContext.closeSlashCommandModal = () => {
        if (slashCommandModal) slashCommandModal.style.display = 'none';
        slashCommandActive = false;
        appContext.isSlashCommandActive = false;
        // searchQuery = ''; // Keep searchQuery as it might be needed by embedPageCommand's callback for cleanup
        // appContext.slashCommandInfo = null; // Keep slashCommandInfo for the same reason
        // The actual reset of searchQuery and slashCommandInfo should happen after embedPageCommand's callback is fully done,
        // or if slash command closes normally (e.g. Escape, click outside).
    };


    function getEditorArea() {
        return liveEditor.closest('.editor-area');
    }

    function getCursorCoords() {
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
        
        filteredCommands = lowerSearchQuery
            ? allCommandMetadata.filter(cmd => {
                const canExec = commandRegistry[cmd.command].canExecute ? commandRegistry[cmd.command].canExecute(appContext) : true;
                if (!canExec) return false;

                return cmd.text.toLowerCase().includes(lowerSearchQuery) || 
                       cmd.description.toLowerCase().includes(lowerSearchQuery) ||
                       cmd.category.toLowerCase().includes(lowerSearchQuery) ||
                       cmd.short?.toLowerCase().includes(lowerSearchQuery);
            })
            : allCommandMetadata.filter(cmd => commandRegistry[cmd.command].canExecute ? commandRegistry[cmd.command].canExecute(appContext) : true);
        
        selectedCommandIndex = Math.min(selectedCommandIndex, filteredCommands.length > 0 ? filteredCommands.length - 1 : 0);
        if (filteredCommands.length === 0) selectedCommandIndex = -1;
        
        slashCommandModal.innerHTML = '';
        
        if (filteredCommands.length === 0) {
            slashCommandModal.innerHTML = `<div class="no-results">No commands found</div>`;
            return;
        }
        
        const commandsByCategory = filteredCommands.reduce((acc, cmd) => {
            (acc[cmd.category] = acc[cmd.category] || []).push(cmd);
            return acc;
        }, {});
        
        const commandList = document.createElement('ul');
        commandList.className = 'command-list';
        
        let currentIndex = 0;
        Object.entries(commandsByCategory).forEach(([category, cmds]) => {
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
        slashCommandModal.appendChild(commandList);

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

    function removeSlashCharacterAndQuery(appContextRef) { // This is for standard commands
        const scInfo = appContextRef.slashCommandInfo;
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
        
        const scInfoBackup = appContext.slashCommandInfo ? { ...appContext.slashCommandInfo } : null; // Clone for safety
        const currentSearchQueryForCommand = searchQuery; // Capture searchQuery at execution time

        // For commands like 'embed-page', cleanup is deferred.
        // For others, it happens before execution.
        const isDeferredCleanupCommand = commandToExecute.command === 'embed-page';

        if (!isDeferredCleanupCommand) {
            if (appContext.slashCommandInfo) {
                removeSlashCharacterAndQuery(appContext);
            }
            slashCommandModal.style.display = 'none';
            slashCommandActive = false;
            appContext.isSlashCommandActive = false;
            searchQuery = ''; 
            appContext.slashCommandInfo = null; 
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
        
        const commandExecutionResult = await commandToExecute.execute(appContext, executionOptions);

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
            // until the command calls appContext.closeSlashCommandModal() and appContext.removeSlashCommandTextFromEditor().
        }
    }


    liveEditor.addEventListener('input', (e) => {
        const sel = window.getSelection();
        if (!sel.rangeCount) {
             if (appContext.isSlashCommandActive) { // Use appContext state consistently
                slashCommandModal.style.display = 'none';
                slashCommandActive = false; searchQuery = ''; appContext.slashCommandInfo = null;
                appContext.isSlashCommandActive = false;
             }
            return;
        }
        
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        const offset = range.startOffset;

        if (appContext.isSlashCommandActive) { // Use appContext state
            const scInfo = appContext.slashCommandInfo;
            if (!scInfo || node !== scInfo.textNode || offset < scInfo.offset ) {
                slashCommandModal.style.display = 'none';
                slashCommandActive = false; searchQuery = ''; appContext.slashCommandInfo = null;
                appContext.isSlashCommandActive = false;
                // If an embed modal was opened, it should also be closed or managed.
                if (appContext.embedPageModal && appContext.embedPageModal.style.display !== 'none' && appContext.closeEmbedPageModal) {
                   // Check if the active command was embed-page; if so, its callback handles closure.
                   // Otherwise, this is an unexpected state, maybe close it.
                   // This path is tricky, usually embedPage would control its own closure.
                }
                return; 
            }

            if (node.nodeType === Node.TEXT_NODE) {
                const textAfterSlash = node.textContent.substring(scInfo.offset);
                if (textAfterSlash !== searchQuery) { 
                    searchQuery = textAfterSlash; 
                    selectedCommandIndex = 0; 
                    updateCommandList(); 
                    if(appContext.isSlashCommandActive) positionModal(getCursorCoords()); 
                }
            } else { 
                 slashCommandModal.style.display = 'none';
                 slashCommandActive = false; searchQuery = ''; appContext.slashCommandInfo = null;
                 appContext.isSlashCommandActive = false;
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
                appContext.slashCommandInfo = { 
                    textNode: node, 
                    offset: offset, 
                };
                updateCommandList(); 
                positionModal(cursorPos);
                slashCommandActive = true;
                appContext.isSlashCommandActive = true;
            }
        }
    });
 
    slashCommandModal.addEventListener('click', (e) => {
        const commandItem = e.target.closest('li[data-command]');
        if (commandItem) executeCommand(commandItem.dataset.command);
    });
    
    document.addEventListener('click', (e) => {
        if (appContext.isSlashCommandActive && !slashCommandModal.contains(e.target) && !liveEditor.contains(e.target)) {
            const embedModal = appContext.embedPageModal;
            if (embedModal && embedModal.style.display !== 'none' && embedModal.contains(e.target)) {
                // Click is inside embed modal, which is fine. Let it handle its events.
                // Slash command modal should remain as is, under control of embedPageCommand if active.
                return;
            }
            // Standard click outside: close slash command and potentially its related modals.
            if (appContext.closeEmbedPageModal && embedModal && embedModal.style.display !== 'none') {
                // If embedPageModal was opened by slash command, closing slash command should also close it.
                // The embedPageCommand's callback might not have fired.
                appContext.closeEmbedPageModal();
            }
            slashCommandModal.style.display = 'none';
            slashCommandActive = false; 
            searchQuery = ''; 
            appContext.slashCommandInfo = null;
            appContext.isSlashCommandActive = false;
        }
    });
 
    liveEditor.addEventListener('keydown', (e) => {
        if (!appContext.isSlashCommandActive) return;

        if (e.key === 'Backspace' && appContext.slashCommandInfo) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                if (range.collapsed && 
                    range.startContainer === appContext.slashCommandInfo.textNode &&
                    range.startOffset === appContext.slashCommandInfo.offset && 
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
             return;
        }

        if (['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Escape'].includes(e.key)) {
            e.preventDefault(); 

            if (e.key === 'Escape') {
                // If embedPageModal is open due to slash command, it should also close.
                if (appContext.embedPageModal && appContext.embedPageModal.style.display !== 'none' && appContext.closeEmbedPageModal) {
                    // Check if the currently "selected" or "in-progress" command is embed-page.
                    // For now, just close it. A more robust check could be added.
                    appContext.closeEmbedPageModal();
                }
                slashCommandModal.style.display = 'none';
                slashCommandActive = false; 
                searchQuery = ''; 
                appContext.slashCommandInfo = null;
                appContext.isSlashCommandActive = false;
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
}