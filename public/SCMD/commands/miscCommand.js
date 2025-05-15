// SCMD/commands/miscCommand.js

// Emoji command is now a definition that uses editorContext passed to it
export const emojiCommand = (editorContextInstance) => { // Receives the specific editor context
    return {
        command: 'emoji',
        short: ['emo', 'icon'], // Updated short commands
        icon: 'far',
        iconClass: 'fa-smile', // FontAwesome icon for emoji
        text: 'Emoji',
        description: 'Pick an emoji from a list. Type : for live search.',
        category: 'Insert', // Changed category to 'Insert' for better grouping

        canExecute: (editorCtx) => true, // editorCtx here is the one passed during canExecute check by SCMD core
        
        execute: async (editorCtx, options) => { // editorCtx is the one SCMD core passes for execution (same as editorContextInstance here)
            const {
                liveEditor,
                openEmojiModal,
                closeSlashCommandModal,
                _handleEmojiSelectedForEditor, // Helper from editorCtx for when emoji is actually picked
                removeSlashCommandTextFromEditor // SCMD's own text removal helper
            } = editorCtx; // Use the passed editorCtx

            const {
                slashCmdFinalRect,      // For positioning the emoji modal initially
                originalSlashCommandInfo, // Info about the original "/emoji" trigger
                currentSearchQuery,     // The text like "emoji" or "emo"
                range: initialRange     // The range of the SCMD trigger text. Crucial for replacement.
            } = options;

            if (!originalSlashCommandInfo || !initialRange) {
                console.error("emojiCommand: Missing originalSlashCommandInfo or initialRange. Cannot transform to ':' mode.");
                if (closeSlashCommandModal) closeSlashCommandModal();
                // Attempt to clean up the SCMD trigger if possible, though context is lacking
                if (originalSlashCommandInfo && currentSearchQuery && removeSlashCommandTextFromEditor) {
                     removeSlashCommandTextFromEditor(originalSlashCommandInfo, currentSearchQuery);
                }
                editorCtx.isSlashCommandActive = false;
                editorCtx.slashCommandInfo = null;
                return true; // Indicate normal cleanup happened or was attempted.
            }

            // 1. Transform "/emoji" text to ":"
            const { textNode, offset: slashOffset } = originalSlashCommandInfo; // slashOffset is position *after* '/'
            let colonPlacedSuccessfully = false;

            if (textNode && textNode.parentNode && textNode.textContent[slashOffset - 1] === '/') {
                const currentContent = textNode.textContent;
                const textBeforeSlash = currentContent.substring(0, slashOffset - 1);
                // The text after the SCMD query (e.g., "emoji")
                const textAfterCmdQuery = currentContent.substring(slashOffset + currentSearchQuery.length);

                textNode.textContent = textBeforeSlash + ":" + textAfterCmdQuery;
                colonPlacedSuccessfully = true;

                // Update selection to be right after the new ':'
                const sel = window.getSelection();
                if (sel) {
                    const newRange = document.createRange();
                    // New offset for cursor is where '/' was, which is now where ':' is.
                    // So, cursor goes *after* ':', which is (slashOffset - 1) + 1 = slashOffset
                    const newCursorPositionInNode = slashOffset; 
                    try {
                        newRange.setStart(textNode, Math.min(newCursorPositionInNode, textNode.textContent.length));
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                        
                        // Store info about the new colon for live emoji search
                        editorCtx.emojiSearchInfo = { textNode, offset: newCursorPositionInNode };
                    } catch (e) {
                        console.error("Error setting cursor after replacing /emoji with :", e);
                        colonPlacedSuccessfully = false; // Revert if cursor setting failed
                        textNode.textContent = currentContent; // Restore original text
                    }
                } else {
                    colonPlacedSuccessfully = false;
                }
            } else {
                console.warn("emojiCommand (from SCMD): Slash not found at expected position or invalid textNode.");
            }

            if (!colonPlacedSuccessfully) {
                console.error("emojiCommand: Failed to transform /emoji to ':' and set up emoji search mode.");
                if (closeSlashCommandModal) closeSlashCommandModal();
                if (removeSlashCommandTextFromEditor) { // Clean up the original /emoji
                     removeSlashCommandTextFromEditor(originalSlashCommandInfo, currentSearchQuery);
                }
                editorCtx.isSlashCommandActive = false;
                editorCtx.slashCommandInfo = null;
                return true; // Standard SCMD cleanup needed.
            }

            // 2. Activate emoji search mode on the editorContext
            editorCtx.isEmojiSearchActive = true;
            
            // 3. Close the SCMD modal (as we are transitioning to emoji modal)
            //    and reset SCMD active state for this editor.
            if (closeSlashCommandModal) closeSlashCommandModal();
            editorCtx.isSlashCommandActive = false; 
            editorCtx.slashCommandInfo = null;
            // The SCMD core's searchQuery (local to SCMD instance) will be reset on next trigger.

            // 4. Open the emoji modal for live search
            // The anchorRect can be the SCMD modal's last position or calculated from the new colon
            const anchorRect = slashCmdFinalRect || (() => {
                if (editorCtx.emojiSearchInfo) {
                    const range = document.createRange();
                    range.setStart(editorCtx.emojiSearchInfo.textNode, editorCtx.emojiSearchInfo.offset);
                    range.collapse(true);
                    const rects = range.getClientRects();
                    return rects.length > 0 ? rects[0] : null;
                }
                return null;
            })() || liveEditor.getBoundingClientRect(); // Fallback

            // The `currentSearchQuery` from SCMD (e.g., "emoji") is NOT passed as initial filter here,
            // because live filtering will now use the text typed *after* the ":" in the editor.
            if (openEmojiModal && _handleEmojiSelectedForEditor) {
                openEmojiModal(
                    (selectedEmoji) => _handleEmojiSelectedForEditor(selectedEmoji.char), 
                    anchorRect, 
                    '' // Initial emoji modal query is empty; filtering is live from editor
                );
            } else {
                console.error("emojiCommand: Emoji modal functions (openEmojiModal or _handleEmojiSelectedForEditor) not available on editorContext.");
                // If modal can't open, try to revert the ':' to avoid leaving editor in a weird state.
                // This is a bit complex, might be better to just log error and leave ':'
                if (editorCtx.emojiSearchInfo) {
                    const { textNode: tn, offset: colonOffset } = editorCtx.emojiSearchInfo;
                    tn.textContent = tn.textContent.substring(0, colonOffset - 1) + "/" + currentSearchQuery + tn.textContent.substring(colonOffset);
                }
                editorCtx.isEmojiSearchActive = false;
                editorCtx.emojiSearchInfo = null;
                liveEditor.focus();
                return true; // SCMD cleanup needed
            }
            
            // Return false to indicate SCMD core should not do its default SCMD text removal etc.
            // We've handled the transformation and transition to emoji search mode.
            return false; 
        }
    };
};