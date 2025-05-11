// SCMD/commands/mediaCommands.js

function findCurrentBlockForMedia(node, liveEditor) { // Simplified from slashCommand's version for context
    let block = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    while (block && block !== liveEditor && !['P', 'H1', 'H2', 'H3', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'TD', 'TH'].includes(block.tagName)) {
        block = block.parentNode;
    }
    return (block && block !== liveEditor) ? block : null;
}

function focusOnFirstCellOfTable(tableElement, selectionInstance, liveEditor) {
    if (!tableElement || tableElement.tagName !== 'TABLE') return;
    const firstCell = tableElement.querySelector('td');
    if (firstCell) {
        liveEditor.focus();
        const r = document.createRange();
        if (firstCell.innerHTML.toLowerCase() === '<br>') {
            firstCell.innerHTML = ''; // Clear it for better cursor placement
        }
        // Ensure there's a text node to place cursor, or create one
        if (!firstCell.firstChild || firstCell.firstChild.nodeType !== Node.TEXT_NODE) {
            const textNode = document.createTextNode('');
            firstCell.insertBefore(textNode, firstCell.firstChild);
        }
        r.setStart(firstCell.firstChild, 0);
        r.collapse(true);
        selectionInstance.removeAllRanges();
        selectionInstance.addRange(r);
    }
}


export const dividerCommand = {
    command: 'divider', short: ['hr', 'dv', 'div'], icon: 'command-icon', iconClass: 'fas fa-minus', text: 'Divider', description: 'Insert a horizontal line', category: 'Media',
    execute: (appContext, { selection, range }) => {
        const { liveEditor } = appContext;
        liveEditor.focus();
        if (selection && range) { selection.removeAllRanges(); selection.addRange(range); }
        document.execCommand('insertHorizontalRule', false);
        
        const sel = window.getSelection(); // Re-get selection after execCommand
        if (sel && sel.rangeCount) { 
            const currentRange = sel.getRangeAt(0);
            let hrNode = currentRange.startContainer;
            // Try to find the HR node that was just inserted
            if (hrNode.nodeType === Node.ELEMENT_NODE && hrNode.tagName === 'HR') {
                // Inserted into current container, hrNode is it.
            } else if (currentRange.startOffset > 0 && 
                       currentRange.startContainer.childNodes[currentRange.startOffset -1] && 
                       currentRange.startContainer.childNodes[currentRange.startOffset -1].tagName === 'HR') {
                 hrNode = currentRange.startContainer.childNodes[currentRange.startOffset -1];
            } else { // Fallback: find the last HR if specific one isn't easily identifiable
                hrNode = Array.from(liveEditor.querySelectorAll('hr')).pop();
            }

            if (hrNode && hrNode.tagName === 'HR' && (!hrNode.nextElementSibling || hrNode.nextElementSibling.tagName !== 'P')) {
                const p = document.createElement('p');
                p.innerHTML = '<br>'; 
                hrNode.parentNode.insertBefore(p, hrNode.nextSibling);
                const newRange = document.createRange();
                newRange.setStart(p, 0); 
                newRange.collapse(true);
                sel.removeAllRanges(); 
                sel.addRange(newRange); 
            }
        }
        return true;
    }
};

export const codeBlockCommand = {
    command: 'code-block', short: ['cb'], icon: 'command-icon', iconClass: 'fas fa-code', text: 'Code Block', description: 'Insert formatted code', category: 'Media',
    execute: (appContext, { currentBlock, selection, range }) => {
        const { liveEditor } = appContext;
        const pre = document.createElement('pre');
        pre.innerHTML = `<code> </code>`; // Start with a non-breaking space for cursor placement

        liveEditor.focus();
        if (selection && range) { 
            selection.removeAllRanges(); 
            selection.addRange(range); 
        }
        
        const blockToReplace = currentBlock || (range ? findCurrentBlockForMedia(range.startContainer, liveEditor) : null);

        if (blockToReplace && (blockToReplace.textContent.trim() === '' || blockToReplace.innerHTML.toLowerCase() === '<br>')) {
            blockToReplace.parentNode.replaceChild(pre, blockToReplace);
        } else {
            document.execCommand('insertHTML', false, pre.outerHTML);
        }

        setTimeout(() => { 
            const newCodeElements = liveEditor.querySelectorAll('pre code');
            if (newCodeElements.length > 0) {
                const newCode = newCodeElements[newCodeElements.length - 1]; 
                if (newCode) {
                    const r = document.createRange();
                    const sel = window.getSelection();
                    // Place cursor after the non-breaking space
                    if (newCode.firstChild && newCode.firstChild.nodeType === Node.TEXT_NODE && newCode.firstChild.textContent.includes('\u00A0')) {
                        r.setStart(newCode.firstChild, 1); 
                    } else { // Fallback if NBSP is not there or structure is different
                        r.selectNodeContents(newCode);
                    }
                    r.collapse(true);
                    sel.removeAllRanges(); 
                    sel.addRange(r);
                }
            }
        }, 0);
        return true;
    }
};

export const tableCommand = {
    command: 'table', short: ['tbl', 'tb'], icon: 'command-icon', iconClass: 'fas fa-table', text: 'Table', description: 'Insert a 2x2 table', category: 'Media',
    execute: (appContext, { currentBlock, selection, range }) => {
        const { liveEditor } = appContext;
        const table = document.createElement('table');
        const tbody = document.createElement('tbody');
        for (let i = 0; i < 2; i++) {
            const tr = document.createElement('tr');
            for (let j = 0; j < 2; j++) {
                const td = document.createElement('td');
                td.innerHTML = '<br>'; // Essential for cell structure and cursor
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        const tableHtml = table.outerHTML;

        liveEditor.focus();
        const sel = window.getSelection(); // Get current selection after focus
        if (sel && range) { // Restore original range if possible
             sel.removeAllRanges(); 
             sel.addRange(range); 
        }
        
        const blockToReplace = currentBlock || (range ? findCurrentBlockForMedia(range.startContainer, liveEditor) : null);
        let insertedTableNode;

        if (blockToReplace && 
            (blockToReplace.textContent.trim() === '' || blockToReplace.innerHTML.toLowerCase() === '<br>') && 
            !['LI', 'TD', 'TH'].includes(blockToReplace.tagName) ) {
            
            const fragment = document.createDocumentFragment();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = tableHtml;
            insertedTableNode = tempDiv.firstChild;
            fragment.appendChild(insertedTableNode);
            
            const pAfter = document.createElement('p');
            pAfter.innerHTML = '<br>';
            fragment.appendChild(pAfter);
            
            blockToReplace.parentNode.replaceChild(fragment, blockToReplace);
            focusOnFirstCellOfTable(insertedTableNode, sel, liveEditor);
        } else {
            document.execCommand('insertHTML', false, tableHtml + '<p><br></p>'); // Add paragraph after for flow
            // Find the inserted table (usually the last one)
            setTimeout(() => {
                const tablesInEditor = liveEditor.querySelectorAll('table');
                if (tablesInEditor.length > 0) {
                    insertedTableNode = tablesInEditor[tablesInEditor.length - 1];
                    focusOnFirstCellOfTable(insertedTableNode, sel, liveEditor);
                }
            }, 0);
        }
        return true;
    }
};