// --- START OF FILE slashCommand.js ---

export function initSlashCommand(appContext) {
    const {
        liveEditor,
        slashCommandModal,
        showStatus,
    } = appContext;

    let slashCommandActive = false;
    let selectedCommandIndex = 0;
    let filteredCommands = [];
    let searchQuery = '';
    
    const allCommands = [
        // ... (allCommands definition remains the same)
        // Basic blocks
        { command: 'paragraph', short: 'p', icon: 'command-icon-text', iconText: 'P', text: 'Paragraph', description: 'Basic text block', category: 'Basic' },
        { command: 'h1', short: 'h1', icon: 'command-icon-text', iconText: 'H1', text: 'Heading 1', description: 'Large heading', category: 'Basic' },
        { command: 'h2', short: 'h2', icon: 'command-icon-text', iconText: 'H2', text: 'Heading 2', description: 'Medium heading', category: 'Basic' },
        { command: 'h3', short: 'h3', icon: 'command-icon-text', iconText: 'H3', text: 'Heading 3', description: 'Small heading', category: 'Basic' },
        
        // Lists
        { command: 'bullet-list', short: 'bl', icon: 'command-icon', iconClass: 'fas fa-list-ul', text: 'Bullet List', description: 'Create a bulleted list', category: 'Lists' },
        { command: 'numbered-list', short: 'nl', icon: 'command-icon', iconClass: 'fas fa-list-ol', text: 'Numbered List', description: 'Create a numbered list', category: 'Lists' },
        { command: 'checklist', short: 'cl', icon: 'command-icon', iconClass: 'fas fa-tasks', text: 'Checklist', description: 'Create a task list', category: 'Lists' },
        
        // Media
        { command: 'divider', short: 'hr', icon: 'command-icon', iconClass: 'fas fa-minus', text: 'Divider', description: 'Insert a horizontal line', category: 'Media' },
        { command: 'code-block', short: 'cb', icon: 'command-icon', iconClass: 'fas fa-code', text: 'Code Block', description: 'Insert formatted code', category: 'Media' },
        { command: 'blockquote', short: 'bq', icon: 'command-icon', iconClass: 'fas fa-quote-left', text: 'Quote Block', description: 'Insert a blockquote', category: 'Media' },
        
        // Page operations
        { command: 'create-subpage', short: 'sp', icon: 'command-icon', iconClass: 'fas fa-file-plus', text: 'New Subpage', description: 'Create a new subpage and link it', category: 'Pages' },
    ];

    function getEditorArea() {
        return liveEditor.closest('.editor-area');
    }

    function getCursorCoords() {
        const sel = window.getSelection();
        if (!sel.rangeCount) {
            // console.log('[SlashCommand DEBUG] getCursorCoords: No selection range.');
            return null;
        }
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(true); 

        let rect = range.getClientRects()[0];
        if (!rect) {
            // console.log('[SlashCommand DEBUG] getCursorCoords: No initial rect, trying tempSpan.');
            const tempSpan = document.createElement('span');
            tempSpan.textContent = '\u200b'; // Zero-width space
            try {
                range.insertNode(tempSpan);
                rect = tempSpan.getBoundingClientRect();
                if (tempSpan.parentNode) {
                    tempSpan.parentNode.removeChild(tempSpan);
                }
            } catch (error) {
                // console.error('[SlashCommand DEBUG] getCursorCoords: Error with tempSpan:', error);
                if (tempSpan.parentNode) { try { tempSpan.parentNode.removeChild(tempSpan); } catch (e) {/*ignore*/} }
                return null;
            }
        }
        
        if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) ) { // More robust check for an empty/invalid rect
            // console.log('[SlashCommand DEBUG] getCursorCoords: rect is null or seems invalid even after tempSpan.', rect);
            return null;
        }
        // console.log('[SlashCommand DEBUG] getCursorCoords: Success. rect:', rect);
        return { 
            left: rect.left, 
            top: rect.top, 
            right: rect.right, 
            bottom: rect.bottom, 
            width: rect.width, 
            height: rect.height 
        };
    }

    function findCurrentBlock(node) {
        let block = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
        while (block && block !== liveEditor && !['P', 'H1', 'H2', 'H3', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE'].includes(block.tagName)) {
            block = block.parentNode;
        }
        return (block && block !== liveEditor) ? block : null;
    }

    function updateCommandList() {
        // ... (updateCommandList remains largely the same)
        const lowerSearchQuery = searchQuery.toLowerCase();
        filteredCommands = searchQuery
            ? allCommands.filter(cmd => 
                cmd.text.toLowerCase().includes(lowerSearchQuery) || 
                cmd.description.toLowerCase().includes(lowerSearchQuery) ||
                cmd.category.toLowerCase().includes(lowerSearchQuery) ||
                cmd.short?.toLowerCase().includes(lowerSearchQuery) 
            )
            : [...allCommands];
        
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
            // console.warn("[SlashCommand DEBUG] positionModal: cursorPos is null, cannot position modal. Hiding.");
            slashCommandModal.style.display = 'none';
            return;
        }

        // Make modal visible (but off-screen) to measure its dimensions
        slashCommandModal.style.visibility = 'hidden';
        slashCommandModal.style.display = 'block';
        const modalRect = slashCommandModal.getBoundingClientRect();
        // console.log('[SlashCommand DEBUG] positionModal: cursorPos:', JSON.stringify(cursorPos), 'Initial modalRect:', JSON.stringify(modalRect));


        // Default position: below the cursor (viewport-relative)
        let finalTop = cursorPos.bottom + 5;
        let finalLeft = cursorPos.left;

        // Adjust if modal goes off viewport bottom
        if (finalTop + modalRect.height > window.innerHeight - 10) { // 10px buffer
            finalTop = cursorPos.top - modalRect.height - 5; // Place above cursor
        }

        // Adjust if modal goes off viewport right
        if (finalLeft + modalRect.width > window.innerWidth - 10) { // 10px buffer
            finalLeft = window.innerWidth - modalRect.width - 10; // Align to right edge
        }

        // Ensure modal is not positioned off-screen (top or left)
        finalTop = Math.max(10, finalTop); // Min 10px from viewport top
        finalLeft = Math.max(10, finalLeft); // Min 10px from viewport left

        slashCommandModal.style.top = `${finalTop}px`;
        slashCommandModal.style.left = `${finalLeft}px`;
        
        slashCommandModal.style.visibility = 'visible'; // Make it visible at final position
        // console.log(`[SlashCommand DEBUG] positionModal: Final modal style top: ${finalTop}px, left: ${finalLeft}px. Window height: ${window.innerHeight}`);
        
        const selectedItem = slashCommandModal.querySelector('li.selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest' });
        }
    }

    appContext.createNewSubpage = async (subpageTitle) => {
        // ... (remains the same)
        if (!appContext.currentProject || !appContext.currentPageState) {
            showStatus('Cannot create subpage: No parent page loaded.', 'error');
            return;
        }
        try {
            const response = await fetch(`/api/project/${appContext.currentProject}/pages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: subpageTitle, parentId: appContext.currentPageState.id })
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json(); 

            liveEditor.focus();
            const linkHTML = `<a href="page://${result.newPageId}">${result.title}</a> `; 
            document.execCommand('insertHTML', false, linkHTML);

            showStatus(`Subpage "${result.title}" created and linked.`, 'success');
            
            if (appContext.fetchPageTree) {
                await appContext.fetchPageTree(appContext.currentProject);
            }
        } catch (error) {
            console.error('Error creating subpage:', error);
            showStatus(`Failed to create subpage: ${error.message}`, 'error');
        }
    };

    function removeSlashCharacter(appContextRef) {
        // ... (remains the same)
        const scInfo = appContextRef.slashCommandInfo;
        if (!scInfo || !scInfo.textNode || !scInfo.textNode.parentNode || scInfo.textNode.nodeType !== Node.TEXT_NODE) return;

        const { textNode, offset } = scInfo;
        if (offset === 0 || textNode.textContent.length < offset || textNode.textContent[offset - 1] !== '/') return;
        
        liveEditor.focus(); 
        const sel = window.getSelection();
        if (!sel) return;

        const rangeToDelete = document.createRange();
        try {
            rangeToDelete.setStart(textNode, offset - 1); 
            const endDeletionOffset = Math.min(offset + searchQuery.length, textNode.textContent.length);
            rangeToDelete.setEnd(textNode, endDeletionOffset); 
            
            rangeToDelete.deleteContents();

            sel.removeAllRanges();
            const newRange = document.createRange();
            newRange.setStart(rangeToDelete.startContainer, rangeToDelete.startOffset);
            newRange.collapse(true);
            sel.addRange(newRange);
        } catch (error) {
            console.error("Error removing slash command text:", error);
        }
    }

    const formatBlockTags = {
        paragraph: 'p', h1: 'h1', h2: 'h2', h3: 'h3', blockquote: 'blockquote'
    };

    function executeCommand(command) {
        const editorArea = getEditorArea();
        const scrollYBefore = editorArea ? editorArea.scrollTop : null;
        // console.log(`[SlashCommand DEBUG] executeCommand START for '${command}'. scrollYBefore: ${scrollYBefore}`);

        const commandUsesTimeoutForFocus = ['checklist', 'code-block'].includes(command);
        const commandManipulatesSelectionAfterHR = command === 'divider';


        if (appContext.slashCommandInfo) {
            removeSlashCharacter(appContext);
        }
        slashCommandModal.style.display = 'none';
        slashCommandActive = false;
        searchQuery = '';
        appContext.slashCommandInfo = null; 

        liveEditor.focus(); 

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            // console.log(`[SlashCommand DEBUG] executeCommand: No selection, dispatched input.`);
            return;
        }

        const range = sel.getRangeAt(0);
        let currentBlock = findCurrentBlock(range.startContainer); 

        if (currentBlock && 
            currentBlock !== liveEditor && 
            currentBlock.parentNode && 
            (currentBlock.innerHTML.trim() === '' || currentBlock.innerHTML.trim().toLowerCase() === '<br>')
        ) {
            const newStandardEmptyBlock = document.createElement('p');
            newStandardEmptyBlock.innerHTML = '<br>';
            currentBlock.parentNode.replaceChild(newStandardEmptyBlock, currentBlock);
            currentBlock = newStandardEmptyBlock;
            const newRange = document.createRange();
            newRange.setStart(currentBlock, 0); 
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
        
        if (formatBlockTags[command]) {
            // ... (block formatting logic remains the same)
            const newTagName = formatBlockTags[command];
            if (currentBlock &&
                currentBlock.parentNode &&
                currentBlock.tagName.toLowerCase() === 'p' &&
                (currentBlock.innerHTML.trim() === '' || currentBlock.innerHTML.trim().toLowerCase() === '<br>')
            ) {
                const newBlockElement = document.createElement(newTagName);
                newBlockElement.innerHTML = '<br>'; 
                currentBlock.parentNode.replaceChild(newBlockElement, currentBlock);
                const finalRange = document.createRange();
                finalRange.setStart(newBlockElement, 0);
                finalRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(finalRange);
            } else {
                document.execCommand('formatBlock', false, `<${newTagName}>`);
            }
        } else {
            switch (command) {
                // ... (other cases: create-subpage, bullet-list, numbered-list are fine)
                case 'create-subpage':
                    if (!appContext.currentPageState) {
                        showStatus('Please load a page first to create a subpage.', 'error');
                        break;
                    }
                    const subpageTitle = prompt('Enter title for the new subpage:');
                    if (subpageTitle && subpageTitle.trim()) {
                        appContext.createNewSubpage(subpageTitle.trim()); 
                    }
                    break;
                case 'bullet-list':
                    document.execCommand('insertUnorderedList', false);
                    break;
                case 'numbered-list':
                    document.execCommand('insertOrderedList', false);
                    break;
                case 'checklist':
                    insertChecklistItem(); // Uses setTimeout for focus
                    break;
                case 'divider':
                    insertHorizontalRule(); // Manipulates selection, potential scroll
                    break;
                case 'code-block':
                    insertCodeBlock(); // Uses setTimeout for focus
                    break;
                default:
                    console.warn(`Command not implemented: ${command}`);
            }
        }

        const performFinalActions = () => {
            // Dispatch input event first, as it might trigger other UI/state changes
            liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

            if (editorArea && scrollYBefore !== null) {
                const scrollYAfterCommand = editorArea.scrollTop;
                // console.log(`[SlashCommand DEBUG] performFinalActions for '${command}'. scrollYAfterCommand: ${scrollYAfterCommand}, scrollYBefore: ${scrollYBefore}`);
                if (scrollYAfterCommand < scrollYBefore) { // Only restore if it scrolled UP
                    editorArea.scrollTop = scrollYBefore;
                    // console.log(`[SlashCommand DEBUG] Scroll restored for '${command}' from ${scrollYAfterCommand} to ${scrollYBefore}`);
                } else if (scrollYAfterCommand > scrollYBefore) {
                    // console.log(`[SlashCommand DEBUG] Scrolled down for '${command}' from ${scrollYBefore} to ${scrollYAfterCommand}. Not restoring.`);
                } else {
                    // console.log(`[SlashCommand DEBUG] Scroll unchanged for '${command}'. Current: ${scrollYAfterCommand}`);
                }
            }
            // console.log(`[SlashCommand DEBUG] executeCommand END for '${command}'.`);
        };

        // Increase delay for commands using setTimeout for focus, or those that heavily manipulate selection
        // to give browser more time to process focus/selection changes and their scroll effects.
        const needsLongerDelayForScrollSettle = commandUsesTimeoutForFocus || commandManipulatesSelectionAfterHR;

        if (needsLongerDelayForScrollSettle) {
            setTimeout(() => {
                requestAnimationFrame(performFinalActions);
            }, 50); // Increased delay from 10ms to 50ms
        } else {
            requestAnimationFrame(performFinalActions);
        }
    }

    function insertChecklistItem() {
        // ... (insertChecklistItem remains the same - uses setTimeout for focus)
        const checklistItem = document.createElement('div');
        checklistItem.className = 'checklist-item';
        checklistItem.innerHTML = `<input type="checkbox" class="checklist-checkbox"><span class="checklist-label" contenteditable="true"> </span>`; 
        
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const currentBlock = findCurrentBlock(range.startContainer);
        
        if (currentBlock && (currentBlock.textContent.trim() === '' || currentBlock.innerHTML.toLowerCase() === '<br>')) {
            currentBlock.parentNode.replaceChild(checklistItem, currentBlock);
        } else {
            document.execCommand('insertHTML', false, checklistItem.outerHTML);
        }
        
        setTimeout(() => { 
            const newLabel = Array.from(liveEditor.querySelectorAll('.checklist-item .checklist-label')).pop();
            if (newLabel) {
                const r = document.createRange();
                r.selectNodeContents(newLabel); 
                r.collapse(false); 
                sel.removeAllRanges(); sel.addRange(r);
                newLabel.focus(); 
            }
        }, 0);
    }
    
    function insertHorizontalRule() {
        // ... (insertHorizontalRule remains the same - manipulates selection)
        document.execCommand('insertHorizontalRule', false);
        const sel = window.getSelection();
        if (sel.rangeCount) { 
            const range = sel.getRangeAt(0);
            let hrNode = range.startContainer;
             if (hrNode.nodeType === Node.ELEMENT_NODE && hrNode.tagName === 'HR') {
                // OK
            } else if (range.startOffset > 0 && range.startContainer.childNodes[range.startOffset -1] && range.startContainer.childNodes[range.startOffset -1].tagName === 'HR') {
                 hrNode = range.startContainer.childNodes[range.startOffset -1];
            } else { 
                hrNode = Array.from(liveEditor.querySelectorAll('hr')).pop();
            }

            if (hrNode && hrNode.tagName === 'HR' && (!hrNode.nextElementSibling || hrNode.nextElementSibling.tagName !== 'P')) {
                const p = document.createElement('p');
                p.innerHTML = '<br>'; 
                hrNode.parentNode.insertBefore(p, hrNode.nextSibling);
                const newRange = document.createRange();
                newRange.setStart(p, 0); newRange.collapse(true);
                sel.removeAllRanges(); sel.addRange(newRange); 
            }
        }
    }
    
    function insertCodeBlock() {
        // ... (insertCodeBlock remains the same - uses setTimeout for focus)
        const pre = document.createElement('pre');
        pre.innerHTML = `<code> </code>`; 
        
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const currentBlock = findCurrentBlock(range.startContainer);

        if (currentBlock && (currentBlock.textContent.trim() === '' || currentBlock.innerHTML.toLowerCase() === '<br>')) {
            currentBlock.parentNode.replaceChild(pre, currentBlock);
        } else {
            document.execCommand('insertHTML', false, pre.outerHTML);
        }

        setTimeout(() => { 
            const newCodeElements = liveEditor.querySelectorAll('pre code');
            if (newCodeElements.length > 0) {
                const newCode = newCodeElements[newCodeElements.length - 1]; 
                 if (newCode) {
                    const r = document.createRange();
                    if (newCode.firstChild && newCode.firstChild.nodeType === Node.TEXT_NODE) {
                        r.setStart(newCode.firstChild, newCode.firstChild.length > 0 ? 1 : 0); 
                        r.collapse(true);
                    } else {
                        r.selectNodeContents(newCode);
                        r.collapse(true); 
                    }
                    sel.removeAllRanges(); sel.addRange(r);
                 }
            }
        }, 0);
    }

    liveEditor.addEventListener('input', (e) => {
        // ... (input listener logic for activating/updating slash command remains the same)
        const sel = window.getSelection();
        if (!sel.rangeCount) {
             if (slashCommandActive) { 
                slashCommandModal.style.display = 'none';
                slashCommandActive = false; searchQuery = ''; appContext.slashCommandInfo = null;
             }
            return;
        }
        
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        const offset = range.startOffset;

        if (slashCommandActive) {
            const scInfo = appContext.slashCommandInfo;
            if (!scInfo || node !== scInfo.textNode || offset < scInfo.offset ) {
                if (!scInfo || node !== scInfo.textNode || offset < scInfo.offset) {
                    slashCommandModal.style.display = 'none';
                    slashCommandActive = false; searchQuery = ''; appContext.slashCommandInfo = null;
                    return; 
                }
            }

            if (node.nodeType === Node.TEXT_NODE) {
                const textAfterSlash = node.textContent.substring(scInfo.offset);
                if (textAfterSlash !== searchQuery) { 
                    searchQuery = textAfterSlash; 
                    selectedCommandIndex = 0;
                    updateCommandList(); 
                    if(slashCommandActive) positionModal(getCursorCoords());
                }
            } else { 
                 slashCommandModal.style.display = 'none';
                 slashCommandActive = false; searchQuery = ''; appContext.slashCommandInfo = null;
            }
            return; 
        }
        
        if (e.inputType === 'insertText' && e.data === '/' && node.nodeType === Node.TEXT_NODE) {
            const precedingChar = offset > 1 ? node.textContent[offset - 2] : null;
            let isAtBlockStart = false;
            if (offset === 1) { 
                let blockCheckNode = node;
                let textBeforeInBlock = "";
                const parentBlock = findCurrentBlock(node); // Check against parent block
                while(blockCheckNode.previousSibling && parentBlock && parentBlock.contains(blockCheckNode.previousSibling)){
                    textBeforeInBlock = blockCheckNode.previousSibling.textContent + textBeforeInBlock;
                    blockCheckNode = blockCheckNode.previousSibling;
                }
                if(textBeforeInBlock.trim() === ""){
                    isAtBlockStart = true;
                }
            }
            const editorIsEmpty = liveEditor.innerHTML.trim() === '<p><br></p>' || liveEditor.innerHTML.trim() === '';
            const isAfterSpace = precedingChar === ' ' || precedingChar === '\u00a0';

            if (isAtBlockStart || isAfterSpace || editorIsEmpty) {
                const cursorPos = getCursorCoords();
                if (!cursorPos) {
                    // console.warn("[SlashCommand DEBUG] Slash typed, but getCursorCoords returned null. Cannot open modal.");
                    return; 
                }
                
                searchQuery = ''; 
                selectedCommandIndex = 0;
                appContext.slashCommandInfo = { 
                    textNode: node, 
                    offset: offset, 
                };
                updateCommandList(); 
                positionModal(cursorPos);
                slashCommandActive = true;
            }
        }
    });
 
    slashCommandModal.addEventListener('click', (e) => {
        // ... (remains the same)
        const commandItem = e.target.closest('li[data-command]');
        if (commandItem) executeCommand(commandItem.dataset.command);
    });
    
    document.addEventListener('click', (e) => {
        // ... (remains the same)
        if (slashCommandActive && !slashCommandModal.contains(e.target) && !liveEditor.contains(e.target)) {
            slashCommandModal.style.display = 'none';
            slashCommandActive = false; searchQuery = ''; appContext.slashCommandInfo = null;
        }
    });
 
    liveEditor.addEventListener('keydown', (e) => {
        // ... (keydown listener logic for navigating/executing slash commands remains same)
        if (!slashCommandActive) return;

        if (e.key === 'Backspace' && appContext.slashCommandInfo) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                if (range.collapsed && 
                    range.startContainer === appContext.slashCommandInfo.textNode &&
                    range.startOffset === appContext.slashCommandInfo.offset) { 
                    
                    slashCommandModal.style.display = 'none';
                    slashCommandActive = false; searchQuery = ''; appContext.slashCommandInfo = null;
                    return; 
                }
            }
        }

        const keyMap = { 'Escape': 0, 'ArrowDown': 1, 'ArrowUp': 2, 'Tab': 3, 'Enter': 3 };
        const action = keyMap[e.key];

        if (action === undefined) {
            if (!(e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) {
                 e.preventDefault(); 
            }
            return; 
        }
        
        e.preventDefault(); 

        if (action === 0) { 
            slashCommandModal.style.display = 'none';
            slashCommandActive = false; searchQuery = ''; appContext.slashCommandInfo = null;
             liveEditor.focus(); 
        } else if (action === 1 && filteredCommands.length > 0) { 
            selectedCommandIndex = (selectedCommandIndex + 1) % filteredCommands.length;
            updateCommandList();
        } else if (action === 2 && filteredCommands.length > 0) { 
            selectedCommandIndex = (selectedCommandIndex - 1 + filteredCommands.length) % filteredCommands.length;
            updateCommandList();
        } else if (action === 3 && selectedCommandIndex >= 0 && selectedCommandIndex < filteredCommands.length) { 
            executeCommand(filteredCommands[selectedCommandIndex].command);
        }
    });

    liveEditor.addEventListener('focus', () => {
        // ... (focus listener to ensure initial paragraph exists remains same)
        const editorContent = liveEditor.innerHTML.trim().toLowerCase();
        const isEmptyEffectively = editorContent === '' || editorContent === '<p></p>' || editorContent === '<p><br></p>' || editorContent === '<br>' || editorContent === '<br/>';
        
        const hasNoBlockLevelChildren = !liveEditor.querySelector('p, h1, h2, h3, div, ul, ol, blockquote, pre, li, hr');

        if (isEmptyEffectively || (liveEditor.childNodes.length === 0) || (liveEditor.childNodes.length === 1 && liveEditor.firstChild.nodeName === 'BR') || (hasNoBlockLevelChildren && liveEditor.textContent.trim() !== '')) {
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
                        range.setStart(p.firstChild, 0);
                    } else { 
                        range.setStart(p, 0);
                    }
                    range.collapse(true);
                    sel.removeAllRanges(); sel.addRange(range);
                }
            }
        }
    });
}
// --- END OF FILE slashCommand.js ---