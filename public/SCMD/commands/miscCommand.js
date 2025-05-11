// SCMD/commands/emojiCommand.js

export const emojiCommand = {
    command: 'emoji',
    short: 'emo', // Optional short command
    icon: 'far fa-smile', // FontAwesome icon for emoji
    iconClass: '', // No specific class needed if using standard FA
    text: 'Emoji',
    description: 'Insert an emoji character.',
    category: 'misc',

    canExecute(appContext) {
        return true; // Emoji command is always available
    },

    async execute(appContext, options) {
        const { liveEditor } = appContext;
        const {
            slashCmdFinalRect,
            originalSlashCommandInfo,
            currentSearchQuery, // This is "emoji" or "emo"
            range: initialRange // EXPECTING THIS: The range where slash command was invoked / insertion should occur
        } = options;

        if (!initialRange) {
            // This is a critical issue if the slash command system is supposed to provide it.
            // The command's correct behavior for placement relies on initialRange.
            console.error(
                "emojiCommand: `initialRange` was not provided in options. " +
                "Emoji insertion will likely be misplaced. " +
                "This may indicate an issue with how the slash command is invoked or configured."
            );
            // Depending on desired strictness, you could prevent the modal from opening or show an error.
            // For this implementation, we'll allow it to proceed but with a warning,
            // and insertion will use a less reliable fallback for positioning.
        }

        const onEmojiSelect = (selectedEmoji) => {
            // 1. Close the emoji modal.
            // It's good practice to close specific modals before major DOM/selection changes.
            appContext.closeEmojiModal();

            // 2. Remove the slash command text (e.g., "/emoji") from the editor.
            // This function should ideally handle the removal cleanly.
            if (originalSlashCommandInfo && currentSearchQuery) {
                appContext.removeSlashCommandTextFromEditor(originalSlashCommandInfo, currentSearchQuery);
            } else {
                console.warn("emojiCommand: Missing originalSlashCommandInfo or currentSearchQuery; cannot remove slash command text.");
            }

            // 3. Focus the editor and restore the selection to the intended insertion point.
            liveEditor.focus();
            const sel = window.getSelection();

            if (!sel) {
                console.error("emojiCommand: window.getSelection() returned null. Cannot insert emoji.");
                // Perform necessary cleanup if we can't proceed with insertion
                appContext.closeSlashCommandModal();
                appContext.isSlashCommandActive = false;
                appContext.slashCommandInfo = null;
                return;
            }

            sel.removeAllRanges(); // Clear any current or potentially incorrect selection.

            if (initialRange) {
                // Restore selection to the range captured when the slash command was initiated.
                // This is the key step for correct placement, mirroring embedPageCommand.
                // Cloning the range is important as the original range object might be live or become invalid.
                sel.addRange(initialRange.cloneRange());
            } else {
                // Fallback if initialRange is missing (less ideal):
                // Attempt to position cursor at a sensible default, e.g., end of the editor content.
                // This situation should ideally be avoided by ensuring initialRange is always passed.
                console.warn("emojiCommand: initialRange not provided. Attempting fallback for cursor position (may be inaccurate).");
                const fallbackRange = document.createRange();
                
                // Try to place at the end of the editor's content
                if (liveEditor.lastChild) {
                    fallbackRange.setStartAfter(liveEditor.lastChild);
                } else {
                    fallbackRange.setStart(liveEditor, 0);
                }
                fallbackRange.collapse(true);
                sel.addRange(fallbackRange);
            }

            // 4. Insert the selected emoji character using the now hopefully correct selection.
            if (sel.rangeCount > 0) {
                const rangeToInsert = sel.getRangeAt(0);
                rangeToInsert.deleteContents(); // Clear the spot (e.g., if initialRange was a non-collapsed selection)

                const emojiTextNode = document.createTextNode(selectedEmoji.char);
                rangeToInsert.insertNode(emojiTextNode);

                // Move cursor to be after the inserted emoji.
                rangeToInsert.setStartAfter(emojiTextNode);
                rangeToInsert.collapse(true);
                sel.removeAllRanges(); // Clean up selection state again.
                sel.addRange(rangeToInsert); // Add the new, collapsed range for the final cursor position.
            } else {
                // This state (no range in selection) should ideally not be reached if the logic above,
                // including fallbacks, correctly establishes a range.
                console.error("emojiCommand: No valid range available for emoji insertion even after fallbacks.");
                // As an absolute last resort, append to the editor (though this is often the "wrong place").
                const p = document.createElement('p');
                p.appendChild(document.createTextNode(selectedEmoji.char));
                liveEditor.appendChild(p);
            }

            // 5. Close the main slash command modal itself.
            appContext.closeSlashCommandModal();

            // 6. Reset slash command state variables in appContext.
            appContext.isSlashCommandActive = false;
            appContext.slashCommandInfo = null;
            // The local `searchQuery` in slashCommand.js will be reset naturally on next activation.

            // 7. Dispatch an input event for the editor to recognize the change (e.g., for autosave, undo stack).
            liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        };

        // Open the emoji modal, passing the selection callback and positioning rectangle.
        appContext.openEmojiModal(onEmojiSelect, slashCmdFinalRect, '');

        // Return false to indicate that this command handles its own UI lifecycle
        // (closing modals, removing text, resetting state) and the main slash command
        // system should not perform its default cleanup.
        return false;
    }
};