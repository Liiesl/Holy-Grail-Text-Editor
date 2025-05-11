// SCMD/commands/listCommands.js

function findCurrentBlockForList(node, liveEditor) { // Simplified from slashCommand's version for context
    let block = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    while (block && block !== liveEditor && !['P', 'H1', 'H2', 'H3', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE'].includes(block.tagName)) {
        block = block.parentNode;
    }
    return (block && block !== liveEditor) ? block : null;
}

export const bulletListCommand = {
    command: 'bullet-list', short: ['bl', 'b'], icon: 'command-icon', iconClass: 'fas fa-list-ul', text: 'Bullet List', description: 'Create a bulleted list', category: 'Lists',
    execute: (appContext, { selection, range }) => {
        appContext.liveEditor.focus();
        if (selection && range) { selection.removeAllRanges(); selection.addRange(range); }
        document.execCommand('insertUnorderedList', false);
        return true;
    }
};

export const numberedListCommand = {
    command: 'numbered-list', short: ['nl', 'num'], icon: 'command-icon', iconClass: 'fas fa-list-ol', text: 'Numbered List', description: 'Create a numbered list', category: 'Lists',
    execute: (appContext, { selection, range }) => {
        appContext.liveEditor.focus();
        if (selection && range) { selection.removeAllRanges(); selection.addRange(range); }
        document.execCommand('insertOrderedList', false);
        return true;
    }
};

export const checklistCommand = {
    command: 'checklist', short: ['cl', 'check'], icon: 'command-icon', iconClass: 'fas fa-tasks', text: 'Checklist', description: 'Create a task list', category: 'Lists',
    execute: (appContext, { currentBlock, selection, range }) => {
        const { liveEditor } = appContext;
        const checklistItem = document.createElement('div');
        checklistItem.className = 'checklist-item';
        checklistItem.innerHTML = `<input type="checkbox" class="checklist-checkbox"><span class="checklist-label" contenteditable="true"> </span>`; 
        
        liveEditor.focus();
        if (selection && range) { 
            selection.removeAllRanges(); 
            selection.addRange(range); 
        }

        const blockToReplace = currentBlock || (range ? findCurrentBlockForList(range.startContainer, liveEditor) : null);

        if (blockToReplace && (blockToReplace.textContent.trim() === '' || blockToReplace.innerHTML.toLowerCase() === '<br>')) {
            blockToReplace.parentNode.replaceChild(checklistItem, blockToReplace);
        } else {
            document.execCommand('insertHTML', false, checklistItem.outerHTML);
        }
        
        setTimeout(() => { 
            const newLabel = Array.from(liveEditor.querySelectorAll('.checklist-item .checklist-label')).pop();
            if (newLabel) {
                const r = document.createRange();
                // Place cursor inside the span, after the non-breaking space if it exists
                if (newLabel.firstChild && newLabel.firstChild.nodeType === Node.TEXT_NODE) {
                     r.setStart(newLabel.firstChild, newLabel.firstChild.length);
                } else {
                    r.selectNodeContents(newLabel); 
                }
                r.collapse(true); 
                
                const sel = window.getSelection();
                sel.removeAllRanges(); 
                sel.addRange(r);
                newLabel.focus(); 
            }
        }, 0);
        return true;
    }
};