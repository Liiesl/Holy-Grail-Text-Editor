// SCMD/slashCommand.js

import { paragraphCommand, h1Command, h2Command, h3Command, blockquoteCommand } from './commands/basicBlockCommands.js';
import { bulletListCommand, numberedListCommand, checklistCommand } from './commands/listCommands.js';
import { dividerCommand, codeBlockCommand, tableCommand } from './commands/mediaCommands.js';
import { emojiCommand as emojiCommandDefinition } from './commands/miscCommand.js'; // Import emojiCommand (now a definition)
import { createSubpageCommand, embedPageCommand, openInPagePeekCommand } from './commands/pageOperationCommands.js';


export function initSlashCommand(editorContext) { // Renamed appContext to editorContext
    const {
        liveEditor,
        slashCommandModal,
        // For direct ':' trigger and emoji command execution:
        openEmojiModal, // from global appContext, but used via editorContext
        filterEmojisInModal,
        selectEmojiInModal,
        navigateEmojiInModal,
        // showStatus is used by individual commands via editorContext.showStatus()
    } = editorContext;
 
    let slashCommandActive = false;
    let selectedCommandIndex = 0;
    let filteredCommands = [];
    let searchQuery = '';
    
    editorContext.isSlashCommandActive = editorContext.isSlashCommandActive || false;
    editorContext.slashCommandInfo = editorContext.slashCommandInfo || null;
    // Initialize emoji search state on this specific editorContext
    editorContext.isEmojiSearchActive = editorContext.isEmojiSearchActive || false;
    editorContext.emojiSearchInfo = editorContext.emojiSearchInfo || null;


    // Define helper on editorContext for inserting emoji and cleaning up
    editorContext._handleEmojiSelectedForEditor = (emojiChar) => {
        const { emojiSearchInfo: esi, liveEditor: le } = editorContext; // Use current editorContext
        if (!esi || !esi.textNode || !esi.textNode.parentNode) {
            console.warn("Cannot insert emoji, emojiSearchInfo is invalid for this editor context.");
            if (editorContext.closeEmojiModal) editorContext.closeEmojiModal();
            editorContext.isEmojiSearchActive = false;
            editorContext.emojiSearchInfo = null;
            return;
        }
    
        const { textNode, offset: colonOffset } = esi;
        const currentText = textNode.textContent || "";
        
        // Determine query length: text from ':' up to current cursor or end of text node
        const sel = window.getSelection();
        let queryEndOffsetInTextNode = currentText.length; // Default to end of text node

        if (sel && sel.rangeCount > 0 && sel.anchorNode === textNode && sel.anchorOffset >= colonOffset) {
            queryEndOffsetInTextNode = sel.anchorOffset;
        }
        // If selection is elsewhere, queryEndOffsetInTextNode remains currentText.length,
        // effectively replacing from colon to end of that text node.

        const textBeforeColon = currentText.substring(0, colonOffset - 1); // Text before ':'
        const textAfterQuery = currentText.substring(queryEndOffsetInTextNode); // Text after the query part
    
        textNode.textContent = textBeforeColon + emojiChar + textAfterQuery;
    
        const newCursorPos = (colonOffset - 1) + emojiChar.length;
        const newRange = document.createRange();
        try {
            newRange.setStart(textNode, Math.min(newCursorPos, textNode.textContent.length));
            newRange.collapse(true);
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(newRange);
            }
        } catch (err) {
            console.error("Error setting cursor after emoji insertion:", err, {textNodeContent: textNode.textContent, newCursorPos});
        }
    
        if (editorContext.closeEmojiModal) editorContext.closeEmojiModal();
        editorContext.isEmojiSearchActive = false;
        editorContext.emojiSearchInfo = null;
        le.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        le.focus(); // Ensure focus is returned to the editor
    };
    
    // Define helper on editorContext for removing trigger text and resetting state
    editorContext._removeEmojiTriggerTextAndStateFromEditor = (andRemoveColon = true) => {
        const { emojiSearchInfo: esi, liveEditor: le } = editorContext; // Use current editorContext
        if (esi && esi.textNode && esi.textNode.parentNode) {
            const { textNode, offset: colonOffset } = esi; // colonOffset is position of char AFTER ':'
            const currentText = textNode.textContent || "";
            
            const sel = window.getSelection();
            let currentCursorInTextNode = -1;
            if (sel && sel.rangeCount > 0 && sel.anchorNode === textNode) {
                currentCursorInTextNode = sel.anchorOffset;
            }

            let queryEndOffset = currentText.length;
             if (currentCursorInTextNode !== -1 && currentCursorInTextNode >= colonOffset) {
                queryEndOffset = currentCursorInTextNode;
            }
            
            const removalStartOffset = colonOffset - 1; // Position of ':'
            const textBeforeTrigger = currentText.substring(0, andRemoveColon ? removalStartOffset : colonOffset);
            const textAfterQuery = currentText.substring(queryEndOffset);
            
            textNode.textContent = textBeforeTrigger + textAfterQuery;
            
            const newCursorPos = andRemoveColon ? removalStartOffset : colonOffset;
            const newRange = document.createRange();
            try {
                newRange.setStart(textNode, Math.min(newCursorPos, textNode.textContent.length));
                newRange.collapse(true);
                if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
            } catch (err) {
                 console.error("Error setting cursor after removing emoji trigger:", err, {textNodeContent: textNode.textContent, newCursorPos});
            }
        }
        if (editorContext.closeEmojiModal) editorContext.closeEmojiModal();
        editorContext.isEmojiSearchActive = false;
        editorContext.emojiSearchInfo = null;
        if (document.activeElement !== le) le.focus(); // Restore focus if not already there
    };


    const commandRegistry = {};
    const allCommandMetadata = [];

    function registerCommand(cmdModuleOrDefinition) {
        // If cmdModuleOrDefinition is a function, it's a factory needing editorContext
        const cmdModule = typeof cmdModuleOrDefinition === 'function' 
            ? cmdModuleOrDefinition(editorContext) 
            : cmdModuleOrDefinition;

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

    [
        paragraphCommand, h1Command, h2Command, h3Command, blockquoteCommand,
        bulletListCommand, numberedListCommand, checklistCommand, 
        dividerCommand, codeBlockCommand, tableCommand,
        createSubpageCommand, embedPageCommand, openInPagePeekCommand,
        emojiCommandDefinition // Register emoji command (pass editorContext if it's a factory)
    ].forEach(cmd => registerCommand(cmd));


    editorContext.removeSlashCommandTextFromEditor = (scInfo, scQueryToDelete) => {
        if (!scInfo || !scInfo.textNode || !scInfo.textNode.parentNode || scInfo.textNode.nodeType !== Node.TEXT_NODE) {
            console.warn("removeSlashCommandTextFromEditor: Invalid scInfo or textNode.", scInfo);
            return;
        }
    
        const { textNode, offset } = scInfo;
        if (textNode.textContent === null || offset === 0 || textNode.textContent.length < offset || textNode.textContent[offset - 1] !== '/') {
            console.warn("removeSlashCommandTextFromEditor: '/' not at expected position or invalid offset.", { textContent: textNode.textContent, offset });
            return;
        }
        
        const sel = window.getSelection();
        if (!sel) return;
    
        const rangeToDelete = document.createRange();
        try {
            rangeToDelete.setStart(textNode, offset - 1); 
            const endDeletionOffset = Math.min(offset + scQueryToDelete.length, textNode.textContent.length);
            rangeToDelete.setEnd(textNode, endDeletionOffset);
            rangeToDelete.deleteContents();
        } catch (error) {
            console.error("Error removing slash command text via appContext function:", error, {textNodeContent: textNode.textContent, offset, scQueryToDelete});
        }
    };
    
    editorContext.closeSlashCommandModal = () => {
        if (slashCommandModal) slashCommandModal.style.display = 'none';
        slashCommandActive = false; 
        editorContext.isSlashCommandActive = false; 
        // searchQuery and slashCommandInfo are reset by executeCommand or input listeners
    };


    function getEditorArea() {
        const peekEditorArea = liveEditor.closest('.page-peek-modal-editor-area');
        if (peekEditorArea) return peekEditorArea;
        return liveEditor.closest('.editor-area');
    }

    function getCursorCoords() {
        if (!liveEditor.contains(window.getSelection().anchorNode)) return null;
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(true); 

        let rect = range.getClientRects()[0];
        if (!rect) {
            const tempSpan = document.createElement('span');
            tempSpan.textContent = '\u200b';
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
        if (!lowerSearchQuery) {
            filteredCommands = allCommandMetadata.filter(cmd => 
                commandRegistry[cmd.command].canExecute ? commandRegistry[cmd.command].canExecute(editorContext) : true
            );
        } else {
            const scoredCommands = allCommandMetadata
                .filter(cmd => commandRegistry[cmd.command].canExecute ? commandRegistry[cmd.command].canExecute(editorContext) : true)
                .map(cmd => {
                    let score = 0;
                    if (cmd.text.toLowerCase().includes(lowerSearchQuery)) score = 4;
                    else if (cmd.short && Array.isArray(cmd.short) && cmd.short.some(s => s.toLowerCase().includes(lowerSearchQuery))) score = 3;
                    else if (cmd.description.toLowerCase().includes(lowerSearchQuery)) score = 2;
                    else if (cmd.category.toLowerCase().includes(lowerSearchQuery)) score = 1;
                    return { ...cmd, score };
                })
                .filter(cmd => cmd.score > 0);
            scoredCommands.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.text.localeCompare(b.text);
            });
            filteredCommands = scoredCommands;
        }
        
        selectedCommandIndex = Math.max(0, Math.min(selectedCommandIndex, filteredCommands.length - 1));
        if (filteredCommands.length === 0) selectedCommandIndex = -1;
        
        slashCommandModal.innerHTML = '';
        if (filteredCommands.length === 0) {
            slashCommandModal.innerHTML = `<div class="no-results">No commands found</div>`;
            return;
        }
        
        const commandList = document.createElement('ul');
        commandList.className = 'command-list';
        
        if (lowerSearchQuery && filteredCommands.length > 0) {
            filteredCommands.forEach((cmd, index) => {
                const commandItem = document.createElement('li');
                commandItem.dataset.command = cmd.command;
                commandItem.className = index === selectedCommandIndex ? 'selected' : '';
                const iconElement = document.createElement(cmd.icon === 'command-icon-text' ? 'span' : 'i');
                iconElement.className = cmd.icon === 'command-icon-text' ? cmd.icon : `${cmd.icon} ${cmd.iconClass}`;
                if (cmd.iconText) iconElement.textContent = cmd.iconText;
                const textContainer = document.createElement('div');
                textContainer.className = 'command-text';
                textContainer.innerHTML = `<div class="command-title">${cmd.text}</div><div class="command-description">${cmd.description}</div>`;
                commandItem.append(iconElement, textContainer);
                commandList.appendChild(commandItem);
            });
        } else {
            const commandsByCategory = filteredCommands.reduce((acc, cmd) => {
                (acc[cmd.category] = acc[cmd.category] || []).push(cmd);
                return acc;
            }, {});
            const sortedCategories = Object.keys(commandsByCategory).sort((a,b) => a.localeCompare(b));
            let currentIndex = 0;
            sortedCategories.forEach(category => {
                const cmds = commandsByCategory[category];
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
                    textContainer.innerHTML = `<div class="command-title">${cmd.text}</div><div class="command-description">${cmd.description}</div>`;
                    commandItem.append(iconElement, textContainer);
                    commandList.appendChild(commandItem);
                    currentIndex++;
                });
            });
        }
        slashCommandModal.appendChild(commandList);
        const selectedItem = slashCommandModal.querySelector('li.selected');
        if (selectedItem) selectedItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
        if (finalTop + modalRect.height > window.innerHeight - 10) finalTop = cursorPos.top - modalRect.height - 5;
        if (finalLeft + modalRect.width > window.innerWidth - 10) finalLeft = window.innerWidth - modalRect.width - 10;
        finalTop = Math.max(10, finalTop);
        finalLeft = Math.max(10, finalLeft);
        slashCommandModal.style.top = `${finalTop}px`;
        slashCommandModal.style.left = `${finalLeft}px`;
        slashCommandModal.style.visibility = 'visible';
        const selectedItem = slashCommandModal.querySelector('li.selected');
        if (selectedItem) selectedItem.scrollIntoView({ block: 'nearest' });
    }

    function removeSlashCharacterAndQuery(contextForRemoval) {
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
        const scInfoBackup = editorContext.slashCommandInfo ? { ...editorContext.slashCommandInfo } : null;
        const currentSearchQueryForCommand = searchQuery; 

        // For commands like 'embed-page', 'emoji', cleanup/modal closure is deferred.
        const isDeferredCleanupCommand = ['embed-page', 'emoji'].includes(commandToExecute.command);

        if (!isDeferredCleanupCommand) {
            if (editorContext.slashCommandInfo) {
                removeSlashCharacterAndQuery(editorContext);
             }
            editorContext.closeSlashCommandModal(); // Closes modal, resets SCMD active flags
            searchQuery = ''; 
            editorContext.slashCommandInfo = null;
        } else if (commandToExecute.command !== 'emoji') { // Emoji command handles its own SCMD modal closure
             editorContext.closeSlashCommandModal(); // For other deferred like embed-page
             // searchQuery and slashCommandInfo preserved for embed-page
        }
        
        liveEditor.focus(); 
        const currentSel = window.getSelection();
        let currentRange = null;
        let currentBlock = null;
        if (currentSel && currentSel.rangeCount > 0) {
            currentRange = currentSel.getRangeAt(0).cloneRange();
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

        if (commandExecutionResult !== false) { 
            const performFinalActions = () => {
                liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                if (editorArea && scrollYBefore !== null) { /* scroll restoration */ }
            };
            const needsLongerDelay = ['checklist', 'code-block', 'table', 'divider'].includes(commandToExecute.command);
            if (needsLongerDelay) setTimeout(() => requestAnimationFrame(performFinalActions), 50);
            else requestAnimationFrame(performFinalActions);
        }
    }


    liveEditor.addEventListener('input', (e) => {
        const sel = window.getSelection();
        if (!sel.rangeCount) {
             if (editorContext.isSlashCommandActive) { // SCMD was active, but selection lost
                editorContext.closeSlashCommandModal();
                searchQuery = ''; editorContext.slashCommandInfo = null;
             }
             if (editorContext.isEmojiSearchActive) { // Emoji search was active
                if (editorContext._removeEmojiTriggerTextAndStateFromEditor) {
                    editorContext._removeEmojiTriggerTextAndStateFromEditor(false); // Keep colon, remove query, close modal
                }
             }
            return;
        }
        
        const range = sel.getRangeAt(0);
        if (!liveEditor.contains(range.startContainer)) {
            if (editorContext.isSlashCommandActive) editorContext.closeSlashCommandModal();
            if (editorContext.isEmojiSearchActive && editorContext._removeEmojiTriggerTextAndStateFromEditor) {
                 editorContext._removeEmojiTriggerTextAndStateFromEditor(false);
            }
            return;
        }

        const node = range.startContainer;
        const offset = range.startOffset;

        // Handle active emoji search for this editor instance
        if (editorContext.isEmojiSearchActive) {
            const esi = editorContext.emojiSearchInfo;
            if (!esi || node !== esi.textNode || offset < esi.offset) {
                // Emoji search context lost (e.g., cursor moved before ':')
                if (editorContext._removeEmojiTriggerTextAndStateFromEditor) {
                    editorContext._removeEmojiTriggerTextAndStateFromEditor(false); // Don't remove colon if cursor before it
                }
                return;
            }
            if (node.nodeType === Node.TEXT_NODE) {
                const currentEmojiQuery = node.textContent.substring(esi.offset);
                if (filterEmojisInModal) filterEmojisInModal(currentEmojiQuery);
            } else { // Should not happen if esi is valid
                if (editorContext._removeEmojiTriggerTextAndStateFromEditor) {
                    editorContext._removeEmojiTriggerTextAndStateFromEditor(true);
                }
            }
            return; // Do not proceed to SCMD logic if emoji search is active
        }


        // Handle active slash command for this editor instance
        if (editorContext.isSlashCommandActive) {
            const scInfo = editorContext.slashCommandInfo;
            if (!scInfo || node !== scInfo.textNode || offset < scInfo.offset ) {
                editorContext.closeSlashCommandModal();
                searchQuery = ''; editorContext.slashCommandInfo = null;
                // Check for associated modals like embed, if they should also close
                if (editorContext.embedPageModal && editorContext.embedPageModal.style.display !== 'none' && editorContext.closeEmbedPageModal) {
                    // Potentially close, or let command handle it. SCMD closing implies command abandoned.
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
                 editorContext.closeSlashCommandModal();
                 searchQuery = ''; editorContext.slashCommandInfo = null;
            }
            return; 
        }
        
        // Trigger SCMD or Emoji search
        if (e.inputType === 'insertText' && (e.data === '/' || e.data === ':') && node.nodeType === Node.TEXT_NODE) {
            let isAtBlockStart = false;
            if (offset === 1) { 
                let textBeforeInBlock = "";
                const parentBlock = findCurrentBlock(node); 
                let currentSibling = node.previousSibling;
                while(currentSibling && parentBlock && parentBlock.contains(currentSibling)){
                    textBeforeInBlock = currentSibling.textContent + textBeforeInBlock;
                    currentSibling = currentSibling.previousSibling;
                }
                if (textBeforeInBlock.trim() === "") isAtBlockStart = true;
            }
            
            const editorIsEmpty = liveEditor.innerHTML.trim() === '<p><br></p>' || liveEditor.innerHTML.trim() === '' || liveEditor.innerHTML.trim() === '<br>';
            const charBeforeTrigger = (offset > 1) ? node.textContent[offset - 2] : null; 
            const isAfterSpace = charBeforeTrigger === ' ' || charBeforeTrigger === '\u00A0'; 

            if (isAtBlockStart || isAfterSpace || (editorIsEmpty && offset === 1) ) {
                const cursorPos = getCursorCoords();
                if (!cursorPos) return; 
                
                if (e.data === '/') { // SCMD Trigger
                    searchQuery = ''; 
                    selectedCommandIndex = 0;
                    editorContext.slashCommandInfo = { textNode: node, offset: offset };
                    updateCommandList(); 
                    positionModal(cursorPos);
                    slashCommandActive = true; // SCMD local active state
                    editorContext.isSlashCommandActive = true; // Context active state
                } else if (e.data === ':') { // Direct Emoji Trigger
                    editorContext.isEmojiSearchActive = true;
                    editorContext.emojiSearchInfo = { textNode: node, offset: offset }; // offset is char AFTER ':'
                    
                    if (openEmojiModal && editorContext._handleEmojiSelectedForEditor) {
                         openEmojiModal(
                            (selectedEmoji) => editorContext._handleEmojiSelectedForEditor(selectedEmoji.char), 
                            cursorPos, 
                            '' // Initial query for emoji modal
                        );
                    }
                    // Ensure SCMD is not active
                    if (editorContext.isSlashCommandActive) editorContext.closeSlashCommandModal();
                    searchQuery = ''; editorContext.slashCommandInfo = null;
                }
            }
        }
    });
 
    slashCommandModal.addEventListener('click', (e) => {
        if (slashCommandModal.contains(e.target)) {
            const commandItem = e.target.closest('li[data-command]');
            if (commandItem) executeCommand(commandItem.dataset.command);
        }
    });
    
    const handleDocumentClick = (e) => {
        // Click outside SCMD modal
        if (editorContext.isSlashCommandActive && !slashCommandModal.contains(e.target) && !liveEditor.contains(e.target)) {
            const embedM = editorContext.embedPageModal;
            if (embedM && embedM.style.display !== 'none' && embedM.contains(e.target)) return;

            // If an embed/emoji modal was open via this SCMD, its command should handle closure.
            // This click outside means user is abandoning the SCMD flow.
            if (editorContext.closeEmbedPageModal && embedM && embedM.style.display !== 'none') {
                 // SCMD for embed-page would have set its own state, this just closes SCMD part
            }
            editorContext.closeSlashCommandModal();
            searchQuery = ''; 
            editorContext.slashCommandInfo = null;
        }

        // Click outside Emoji modal (when emoji search is active for this editor)
        if (editorContext.isEmojiSearchActive && !liveEditor.contains(e.target)) {
            const emojiM = editorContext.emojiModal; // Global emoji modal
            if (emojiM && emojiM.style.display !== 'none' && emojiM.contains(e.target)) {
                // Click is inside emoji modal, let it handle.
                return;
            }
            // Clicked outside editor and outside emoji modal, during emoji search
            if (editorContext._removeEmojiTriggerTextAndStateFromEditor) {
                editorContext._removeEmojiTriggerTextAndStateFromEditor(true); // Remove ':', query, close modal, reset state
            }
        }
    };
    document.addEventListener('click', handleDocumentClick);
 
    liveEditor.addEventListener('keydown', (e) => {
        // Handle Emoji Search Mode first for this editor instance
        if (editorContext.isEmojiSearchActive) {
            const esi = editorContext.emojiSearchInfo;

            if (e.key === 'Escape') {
                e.preventDefault();
                if (editorContext._removeEmojiTriggerTextAndStateFromEditor) {
                    editorContext._removeEmojiTriggerTextAndStateFromEditor(true); // true to remove colon
                 }
                e.preventDefault();
                // Use editorContext.navigateEmojiInModal as it's correctly scoped if init order is fixed
                if (editorContext.navigateEmojiInModal) editorContext.navigateEmojiInModal('down');
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (editorContext.navigateEmojiInModal) editorContext.navigateEmojiInModal('up');
            } else if (e.key === 'Enter') {
                e.preventDefault();
                // Use editorContext.selectEmojiInModal
                if (editorContext.selectEmojiInModal) {
                    if (!editorContext.selectEmojiInModal()) { // If returns false (no selection/error or modal not ready)
                        if (editorContext._removeEmojiTriggerTextAndStateFromEditor) {
                            editorContext._removeEmojiTriggerTextAndStateFromEditor(true); // true to remove colon
                        }
                    }
                    // If selectEmojiInModal() is true, its callback (_handleEmojiSelectedForEditor) handles cleanup.
                } else { // selectEmojiInModal itself is not available (should not happen if init order fixed)
                    if (editorContext._removeEmojiTriggerTextAndStateFromEditor) {
                        editorContext._removeEmojiTriggerTextAndStateFromEditor(true); // true to remove colon
                    }
                }
            } else if (e.key === 'Backspace') {
                const sel = window.getSelection();
                // Check esi and esi.textNode before accessing properties
                if (sel && sel.rangeCount > 0 && esi && esi.textNode) {
                    const range = sel.getRangeAt(0);
                    const currentTextContent = esi.textNode.textContent || "";
                    const currentQuery = currentTextContent.substring(esi.offset);

                    // Special case: Cursor is immediately after ':' and the query is empty.
                    // In this case, Backspace should delete the ':' and close the emoji search.
                    if (range.collapsed &&
                        range.startContainer === esi.textNode &&
                        range.startOffset === esi.offset && // Cursor is at the start of the query (right after ':')
                        currentQuery.length === 0) {         // And the query is indeed empty

                        e.preventDefault(); // Prevent default Backspace, we are handling the trigger removal
                        if (editorContext._removeEmojiTriggerTextAndStateFromEditor) {
                            editorContext._removeEmojiTriggerTextAndStateFromEditor(true); // true to remove colon
                        }
                    }
                    // Else (Backspace within the query, or at the end of a non-empty query):
                    // Do NOT e.preventDefault(). Let the Backspace happen.
                    // The 'input' event listener will then pick up the text change and call filterEmojisInModal.
                }
                // If esi or esi.textNode is null, also don't preventDefault. Let Backspace try to clean up if possible.
            } else if (e.key.length > 1 && !['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
                // Prevent default for other function keys (F1-F12, Home, End, PageUp, PageDown, etc.)
                // Allow Modifiers, and Tab (for now, though it doesn't do anything specific in emoji modal by default)
                e.preventDefault();
             } else {
                // Allow character keys (e.key.length === 1), Tab, and Modifiers to fall through.
                // Their default action (typing character, changing focus for Tab) is desired for the editor input.
            }
            return; // Done with keydown if in emoji search mode
        }

        // Slash Command Mode for this editor instance
        if (!editorContext.isSlashCommandActive) return;

        if (e.key === 'Backspace' && editorContext.slashCommandInfo) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                if (range.collapsed && 
                    range.startContainer === editorContext.slashCommandInfo.textNode &&
                    range.startOffset === editorContext.slashCommandInfo.offset && 
                    searchQuery === '') { 
                    editorContext.closeSlashCommandModal();
                    // searchQuery and slashCommandInfo cleared by input event or next char.
                    // Let backspace proceed to delete '/'.
                    return; 
                }
            }
        }

        if (!['Escape', 'ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Backspace', 'Delete'].includes(e.key) && 
            (e.key.length > 1 && !e.ctrlKey && !e.metaKey && !e.altKey) ) { 
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Escape'].includes(e.key)) {
            e.preventDefault(); 

            if (e.key === 'Escape') {
                // Check if SCMD triggered embed modal; if so, it should handle its closure first.
                if (editorContext.embedPageModal && editorContext.embedPageModal.style.display !== 'none' && editorContext.closeEmbedPageModal) {
                    // This implies SCMD launched embed modal. Closing SCMD means abandoning that flow.
                    // Let embed modal command handle this scenario if it needs to.
                    // editorContext.closeEmbedPageModal(); // Maybe too aggressive.
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
        if (editorContext.isEmojiSearchActive || editorContext.isSlashCommandActive) {
            return; // Don't mess with content if a command interface is active
        }

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
                    try {
                        if (p.firstChild) range.setStartBefore(p.firstChild);
                        else range.setStart(p, 0);
                        range.collapse(true);
                        sel.removeAllRanges(); 
                        sel.addRange(range);
                    } catch (err) {
                        console.error("Error setting selection on focus:", err);
                    }
                }
            }
        }
    });

    return {
        destroy: () => {
            document.removeEventListener('click', handleDocumentClick);
            if (slashCommandModal) slashCommandModal.innerHTML = '';
        }
    };
}