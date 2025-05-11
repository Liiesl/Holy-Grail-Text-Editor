// SCMD/commands/basicBlockCommands.js

const formatBlock = (appContext, tagName, { currentBlock, selection, range }) => {
    const { liveEditor } = appContext;
    liveEditor.focus(); // Ensure editor is focused

    // If selection and range are available, use them
    if (selection && range) {
        selection.removeAllRanges();
        selection.addRange(range);
    }
    
    // If the current block is an empty paragraph (or similar empty block that's not LI, TD, TH),
    // replace it instead of wrapping/formatting.
    if (currentBlock &&
        currentBlock.parentNode &&
        currentBlock.tagName.toLowerCase() === 'p' && // Could be more generic if needed
        (currentBlock.innerHTML.trim() === '' || currentBlock.innerHTML.trim().toLowerCase() === '<br>') &&
        !['li', 'td', 'th'].includes(currentBlock.tagName.toLowerCase())
    ) {
        const newBlockElement = document.createElement(tagName);
        newBlockElement.innerHTML = '<br>'; // Ensure it's not collapsed
        currentBlock.parentNode.replaceChild(newBlockElement, currentBlock);
        
        const finalRange = document.createRange();
        // Try to set cursor inside the new block
        if (newBlockElement.firstChild) {
             finalRange.setStart(newBlockElement.firstChild, 0);
        } else {
            finalRange.setStart(newBlockElement, 0);
        }
        finalRange.collapse(true);
        
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(finalRange);
        } else { // Fallback if selection object wasn't available earlier
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(finalRange);
        }
    } else {
        document.execCommand('formatBlock', false, `<${tagName}>`);
    }
    return true; // Command executed
};

export const paragraphCommand = {
    command: 'paragraph', short: ['p', 'pg'], icon: 'command-icon-text', iconText: 'P', text: 'Paragraph', description: 'Basic text block', category: 'Basic',
    execute: (appContext, options) => formatBlock(appContext, 'p', options)
};

export const h1Command = {
    command: 'h1', short: ['h1', 'header'], icon: 'command-icon-text', iconText: 'H1', text: 'Heading 1', description: 'Large heading', category: 'Basic',
    execute: (appContext, options) => formatBlock(appContext, 'h1', options)
};

export const h2Command = {
    command: 'h2', short: ['h2', 'header'], icon: 'command-icon-text', iconText: 'H2', text: 'Heading 2', description: 'Medium heading', category: 'Basic',
    execute: (appContext, options) => formatBlock(appContext, 'h2', options)
};

export const h3Command = {
    command: 'h3', short: ['h3', 'header'], icon: 'command-icon-text', iconText: 'H3', text: 'Heading 3', description: 'Small heading', category: 'Basic',
    execute: (appContext, options) => formatBlock(appContext, 'h3', options)
};

export const blockquoteCommand = {
    command: 'blockquote', short: ['bq', 'qb', 'quote', 'q'], icon: 'command-icon', iconClass: 'fas fa-quote-left', text: 'Quote Block', description: 'Insert a blockquote', category: 'Media', // Category was basic, but fits Media better
    execute: (appContext, options) => formatBlock(appContext, 'blockquote', options)
};