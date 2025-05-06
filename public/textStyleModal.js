// --- START OF FILE textStyleModal.js ---

export function initTextStyleModal(appContext) {
    const liveEditor = appContext.liveEditor;
    const modal = document.getElementById('text-style-modal');
    if (!liveEditor || !modal) {
        console.error("Text style modal or live editor not found.");
        return;
    }

    const buttons = modal.querySelectorAll('button[data-command]');
    // REMOVED: const formatSelect = modal.querySelector('select[data-command="formatBlock"]');

    function applyStyle(command, value = null) {
        liveEditor.focus(); // Ensure editor is focused before command
        document.execCommand(command, false, value);
        updateButtonStates(); // Update button states after applying style
        // Trigger input event for editArea.js to detect changes
        liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }

    buttons.forEach(button => {
        button.addEventListener('mousedown', (e) => { // mousedown to prevent editor losing selection
            e.preventDefault(); // Prevent editor blur
            const command = button.dataset.command;
            if (command === 'createLink') {
                const currentSelection = document.getSelection();
                if (!currentSelection.rangeCount) return;
                
                const range = currentSelection.getRangeAt(0);
                let existingLink = null;
                let linkNode = range.startContainer;
                if (linkNode.nodeType === Node.TEXT_NODE) {
                    linkNode = linkNode.parentNode;
                }
                // Traverse up if selection is inside an existing link's child elements
                while(linkNode && linkNode !== liveEditor && linkNode.nodeName !== 'A') {
                    linkNode = linkNode.parentNode;
                }
                if (linkNode && linkNode.nodeName === 'A') {
                    existingLink = linkNode;
                }

                if (existingLink) {
                    const currentUrl = existingLink.getAttribute('href');
                    const newUrl = prompt("Edit link URL:", currentUrl);
                    if (newUrl === null) return; 
                    if (newUrl === "") {
                         applyStyle('unlink');
                    } else {
                        // To modify existing link, ensure it's selected.
                        // execCommand 'createLink' on an existing selected link node can modify it.
                        currentSelection.removeAllRanges();
                        const newRange = document.createRange();
                        newRange.selectNodeContents(existingLink);
                        currentSelection.addRange(newRange);
                        applyStyle('createLink', newUrl);
                    }
                } else { 
                    const url = prompt("Enter link URL:", "https://");
                    if (url && url !== "https://") {
                        applyStyle(command, url);
                    }
                }
            } else {
                applyStyle(command);
            }
        });
    });

    // REMOVED: Event listener for formatSelect
    // if (formatSelect) {
    //     formatSelect.addEventListener('change', (e) => {
    //         liveEditor.focus();
    //         applyStyle('formatBlock', e.target.value);
    //         // No need to hide modal explicitly, selectionchange or blur will handle it.
    //     });
    //     formatSelect.addEventListener('mousedown', (e) => {
    //         e.stopPropagation(); 
    //     });
    // }

    function updateButtonStates() {
        if (modal.style.display === 'none') return;

        buttons.forEach(button => {
            const command = button.dataset.command;
            // queryCommandState is not always reliable for createLink as it depends on precise selection.
            // For simplicity, we won't make createLink button 'active'. Or a more complex check is needed.
            if (command !== 'createLink') { 
                try {
                    if (document.queryCommandState(command)) {
                        button.classList.add('active');
                    } else {
                        button.classList.remove('active');
                    }
                } catch (e) {
                    button.classList.remove('active');
                }
            }
        });

        // REMOVED: Logic to update formatSelect state
        // if (formatSelect) {
        //     try {
        //         let blockType = document.queryCommandValue('formatBlock').toUpperCase();
        //         if (blockType === "NORMAL") blockType = "P"; 
        //         const optionExists = Array.from(formatSelect.options).some(opt => opt.value.toUpperCase() === blockType);
        //         if (optionExists) {
        //             formatSelect.value = blockType;
        //         } else {
        //             const currentSelection = document.getSelection();
        //             if(currentSelection && currentSelection.rangeCount > 0) {
        //                 let parentNode = currentSelection.getRangeAt(0).commonAncestorContainer;
        //                 if(parentNode.nodeType === Node.TEXT_NODE) parentNode = parentNode.parentNode;
        //                 if (['LI', 'UL', 'OL'].includes(parentNode.nodeName)) {
        //                      formatSelect.value = "P"; 
        //                 } else {
        //                      formatSelect.value = "P"; 
        //                 }
        //             } else {
        //                 formatSelect.value = "P"; 
        //             }
        //         }
        //     } catch (e) {
        //         formatSelect.value = "P"; 
        //     }
        // }
    }

    function positionAndShowModal(selection) {
        const editorArea = liveEditor.closest('.editor-area');
        if (!editorArea) {
            console.error(".editor-area not found for modal positioning.");
            hideModal();
            return;
        }

        modal.style.display = 'flex'; // Make modal visible to get its dimensions

        const selectionRect = selection.getRangeAt(0).getBoundingClientRect(); // Viewport-relative
        const editorAreaRect = editorArea.getBoundingClientRect(); // Viewport-relative bounds of the scrollable area

        const modalHeight = modal.offsetHeight;
        const modalWidth = modal.offsetWidth;

        if ((modalHeight === 0 || modalWidth === 0) && modal.innerHTML.trim() !== '') {
            console.warn("Text style modal has zero dimensions. Hiding.");
            modal.style.display = 'none'; // Ensure it's hidden if dimensions are faulty
            return;
        }
         if (modalHeight === 0 && modalWidth === 0) { // If truly empty or styled to be 0x0
            modal.style.display = 'none';
            return;
        }

        // Calculate ideal position (modal top-center above selection middle-top)
        // All coordinates here are viewport-relative.
        let idealTop = selectionRect.top - modalHeight - 8; // 8px gap
        let idealLeft = selectionRect.left + (selectionRect.width / 2) - (modalWidth / 2);

        // If placing above makes it go above editorArea's visible top, or not enough space above selection within editorArea:
        if (idealTop < editorAreaRect.top || (selectionRect.top - modalHeight - 8) < editorAreaRect.top) {
            idealTop = selectionRect.bottom + 8; // Place below selection
        }
        
        // Clamp left position to be within the editorArea's visible horizontal space
        idealLeft = Math.max(editorAreaRect.left, idealLeft);
        idealLeft = Math.min(editorAreaRect.right - modalWidth, idealLeft);
        
        // Clamp top position to be within the editorArea's visible vertical space
        idealTop = Math.max(editorAreaRect.top, idealTop);
        idealTop = Math.min(editorAreaRect.bottom - modalHeight, idealTop);

        // Final adjustment for page scroll, as modal is child of body
        modal.style.top = `${idealTop + window.scrollY}px`;
        modal.style.left = `${idealLeft + window.scrollX}px`;

        updateButtonStates();
    }

    function hideModal() {
        if (modal.style.display !== 'none') {
            modal.style.display = 'none';
        }
    }

    let selectionTimeout;
    function handleModalVisibility() {
        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(() => {
            const selection = document.getSelection();
            let validSelectionInEditor = false;

            if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
                const range = selection.getRangeAt(0);
                if (liveEditor.contains(range.commonAncestorContainer)) {
                    validSelectionInEditor = true;
                }
            }

            const editorHasFocus = document.activeElement === liveEditor;
            const modalOrChildHasFocus = modal.contains(document.activeElement);

            if (validSelectionInEditor && (editorHasFocus || modalOrChildHasFocus)) {
                if (modal.style.display === 'none') {
                    // Modal is hidden, and we have a valid selection. Position and show it.
                    positionAndShowModal(selection);
                } else {
                    // Modal is already visible. Just update button states.
                    // Do NOT reposition.
                    updateButtonStates();
                }
            } else {
                // Conditions not met for showing/keeping modal. Hide it.
                hideModal();
            }
        }, 30); // Short delay to handle rapid selection changes (e.g., on mouseup)
    }

    document.addEventListener('selectionchange', handleModalVisibility);
    
    liveEditor.addEventListener('focus', handleModalVisibility);

    liveEditor.addEventListener('blur', (e) => {
        // If focus moves outside editor and not to the modal or its children, hide modal
        if (!modal.contains(e.relatedTarget)) {
             setTimeout(hideModal, 150); // Delay to allow click on modal buttons
        }
    });
    
    document.addEventListener('mousedown', (e) => {
        if (modal.style.display === 'flex' && !modal.contains(e.target) && e.target !== liveEditor && !liveEditor.contains(e.target)) {
            hideModal();
        }
    });
    
    liveEditor.addEventListener('keydown', (e) => {
        // For keys that typically disrupt a selection or editing flow, hide the modal.
        // Escape is handled globally in main.js
        if (['Enter', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            // Small delay to let the action (like selection collapse) happen, then re-evaluate.
            // handleModalVisibility will be triggered by selectionchange for arrows.
            // For Enter, Backspace, Delete, it's safer to hide, then let selectionchange potentially re-show.
            if (['Enter', 'Backspace', 'Delete'].includes(e.key)){
                setTimeout(hideModal, 10);
            }
            // For arrow keys, selectionchange will manage if selection collapses.
        }
    });
}
// --- END OF FILE textStyleModal.js ---