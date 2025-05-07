// js/tableEditor.js

export function initTableEditor(appContext) {
    const { liveEditor, showStatus, actionsModal } = appContext;

    let addRowLineBtn, addColLineBtn, rowMenuTriggerBtn, colMenuTriggerBtn, tableMenuTriggerBtn;
    let activeTable = null;
    let controlHideTimeout = null;

    const currentTableContext = { // For actions triggered from modal
        cell: null, row: null, table: null,
        actionColIndex: -1, actionRowIndex: -1 // Specific indices for action
    };

    const hoverContext = { // For positioning controls based on hover
        table: null, row: null, cell: null,
        hoverRowIndex: -1, // Index of row directly under mouse, or nearest for add line
        hoverColIndex: -1, // Index of col directly under mouse, or nearest for add line
        isOverTableTopEdge: false, isOverTableBottomEdge: false,
        isOverTableLeftEdge: false, isOverTableRightEdge: false,
        isOverRowDivider: false, isOverColDivider: false,
    };

    const THROTTLE_DELAY = 50;
    let lastMouseMoveTime = 0;

    function getCellElement(node) { return node ? node.closest('td, th') : null; }
    function getRowElement(node) { return node ? node.closest('tr') : null; }
    function getTableElement(node) { return node ? node.closest('table') : null; }
    function getColumnIndex(cell) {
        if (!cell || !cell.parentElement) return -1;
        return Array.from(cell.parentElement.children).indexOf(cell);
    }
    function getRowIndex(row) {
        if (!row || !row.parentElement || !row.parentElement.parentElement) return -1; //parentElement for tbody/thead, then table
        return Array.from(row.parentElement.parentElement.rows).indexOf(row); // This counts across thead and tbody if both exist
    }


    function createCell(type = 'td') {
        const cell = document.createElement(type);
        cell.appendChild(document.createElement('br')); // Makes empty cells editable
        return cell;
    }

    function focusCell(cell) {
        if (!cell) return;
        liveEditor.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        // Ensure cell has some content for selection, at least a <br>
        if (cell.innerHTML.trim() === "") cell.appendChild(document.createElement('br'));
        range.selectNodeContents(cell);
        range.collapse(false); // To end of cell
        if (document.activeElement === liveEditor || liveEditor.contains(document.activeElement)) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    function createTableControl(id, baseClass, iconClass, title, customClasses = []) {
        const btn = document.createElement('button');
        btn.id = `table-control-${id}`;
        btn.className = `${baseClass} ${customClasses.join(' ')}`;
        btn.title = title;
        btn.style.position = 'absolute'; // All controls are absolutely positioned
        btn.style.display = 'none'; // Initially hidden
        if (iconClass) {
            const icon = document.createElement('i');
            icon.className = iconClass;
            if (baseClass.includes('add-line')) { // Special structure for add-line icons
                const iconWrapper = document.createElement('span');
                iconWrapper.className = 'add-line-icon';
                iconWrapper.appendChild(icon);
                btn.appendChild(iconWrapper);
            } else {
                btn.appendChild(icon);
            }
        }
        document.body.appendChild(btn);
        return btn;
    }


    // --- Core Table Action Logic (Context is currentTableContext) ---
    function insertRow(above) {
        if (!currentTableContext.table) return;
        const table = currentTableContext.table;
        let referenceRow = currentTableContext.row;
        let targetRowIndex = currentTableContext.actionRowIndex; // This is the row to insert relative to

        if (table.rows.length === 0) { // Special case: inserting into an empty table
            const newRow = document.createElement('tr');
            const cellType = (table.querySelector('thead')) ? 'th' : 'td';
            newRow.appendChild(createCell(cellType));
            const tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
            tbody.appendChild(newRow);
            focusCell(newRow.cells[0]);
            return;
        }
        
        if (targetRowIndex === -1 && !above) { // Insert at the very beginning (special case for add line at top)
            referenceRow = table.rows[0];
        } else if (targetRowIndex === table.rows.length && above) { // Insert at the very end (special case for add line at bottom)
             referenceRow = table.rows[table.rows.length-1];
        } else if (targetRowIndex >= 0 && targetRowIndex < table.rows.length) {
            referenceRow = table.rows[targetRowIndex];
        } else {
            console.error("InsertRow: Invalid targetRowIndex or referenceRow.");
            return;
        }
        
        if (!referenceRow) { // Fallback if reference row couldn't be determined (e.g. targetRowIndex points beyond table.rows length after initial calc)
            referenceRow = table.rows.length > 0 ? (above ? table.rows[0] : table.rows[table.rows.length-1]) : null;
            if (!referenceRow && table.rows.length === 0) { // Should be caught by empty table case, but defensive
                 insertRow(false); // Call again to trigger empty table logic
                 return;
            }
        }


        const currentTBodyOrTHead = referenceRow.parentElement;
        const newRow = document.createElement('tr');
        const numCols = referenceRow.cells.length > 0 ? referenceRow.cells.length : 1; // Use reference row for num cols
        const cellType = (currentTBodyOrTHead.tagName.toLowerCase() === 'thead') ? 'th' : 'td';

        for (let i = 0; i < numCols; i++) newRow.appendChild(createCell(cellType));

        if (above) currentTBodyOrTHead.insertBefore(newRow, referenceRow);
        else currentTBodyOrTHead.insertBefore(newRow, referenceRow.nextSibling);

        const colToFocus = currentTableContext.cell ? getColumnIndex(currentTableContext.cell) : 0;
        const cellToFocus = newRow.cells[colToFocus] || newRow.cells[0];
        if (cellToFocus) focusCell(cellToFocus);
        liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }

    function insertColumn(before) {
        if (!currentTableContext.table) return;
        const table = currentTableContext.table;
        let referenceCell = currentTableContext.cell;
        let targetColIndex = currentTableContext.actionColIndex; // This is col to insert relative to

        if (table.rows.length === 0) { // Can't add column to empty table, add a row first.
            insertRow(false); // Add a row
            referenceCell = table.rows[0].cells[0]; // Now use this new cell
            targetColIndex = 0; // Will insert before or after this single cell
        } else if (table.rows[0].cells.length === 0 && table.rows.length > 0) { // Rows exist, but no cells
            const firstRow = table.rows[0];
            const cellType = (firstRow.parentElement.tagName.toLowerCase() === 'thead') ? 'th' : 'td';
            firstRow.appendChild(createCell(cellType));
            referenceCell = firstRow.cells[0];
            targetColIndex = 0;
        }


        if (targetColIndex === -1 && !before) { // Insert at very beginning
            referenceCell = table.rows[0].cells[0];
        } else if (table.rows.length > 0 && targetColIndex === table.rows[0].cells.length && before) { // Insert at very end
             referenceCell = table.rows[0].cells[table.rows[0].cells.length -1];
        } else if (table.rows.length > 0 && targetColIndex >= 0 && targetColIndex < table.rows[0].cells.length) {
             // Find a reference cell in any row at targetColIndex
            for(let row of table.rows) {
                if (row.cells[targetColIndex]) {
                    referenceCell = row.cells[targetColIndex];
                    break;
                }
            }
        } else {
            console.error("InsertColumn: Invalid targetColIndex or referenceCell.");
            return;
        }

        if (!referenceCell && table.rows.length > 0 && table.rows[0].cells.length > 0) { // Fallback if ref cell not found
            referenceCell = before ? table.rows[0].cells[0] : table.rows[0].cells[table.rows[0].cells.length - 1];
        } else if (!referenceCell) {
            console.error("Cannot determine reference cell for column insertion.");
            return;
        }


        Array.from(table.rows).forEach(row => {
            const cellType = (row.parentElement.tagName.toLowerCase() === 'thead') ? 'th' : 'td';
            const newCell = createCell(cellType);
            const actualRefCellInThisRow = row.cells[getColumnIndex(referenceCell)]; // Use col index from original ref cell
            
            if (before) {
                row.insertBefore(newCell, actualRefCellInThisRow || row.firstChild);
            } else {
                if (actualRefCellInThisRow) row.insertBefore(newCell, actualRefCellInThisRow.nextSibling);
                else row.appendChild(newCell); // If row is shorter or ref cell not in this row
            }
        });
        
        const rowToFocus = currentTableContext.row || table.rows[0];
        const newFocusColIndex = before ? getColumnIndex(referenceCell) : getColumnIndex(referenceCell) + 1;
        const cellToFocus = rowToFocus.cells[newFocusColIndex] || rowToFocus.cells[rowToFocus.cells.length -1];
        if (cellToFocus) focusCell(cellToFocus);
        liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }

    function deleteRow() {
        if (!currentTableContext.row || !currentTableContext.table) return;
        const table = currentTableContext.table;
        const currentRow = currentTableContext.row;
        if (table.rows.length <= 1) {
            deleteTable(); return;
        }
        let nextFocusRow = currentRow.nextElementSibling || currentRow.previousElementSibling;
        currentRow.remove();
        if (nextFocusRow && nextFocusRow.cells.length > 0) {
            const colIdx = currentTableContext.cell ? getColumnIndex(currentTableContext.cell) : 0;
            focusCell(nextFocusRow.cells[colIdx] || nextFocusRow.cells[0]);
        }
        liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }

    function deleteColumn() {
        if (!currentTableContext.table || currentTableContext.actionColIndex === -1) return;
        const table = currentTableContext.table;
        const colIndex = currentTableContext.actionColIndex;
        if (table.rows.length === 0 || table.rows[0].cells.length <= 1) {
            deleteTable(); return;
        }
        let nextFocusCell = null;
        if (currentTableContext.row && currentTableContext.row.cells[colIndex]) {
            nextFocusCell = currentTableContext.row.cells[colIndex].nextElementSibling || currentTableContext.row.cells[colIndex].previousElementSibling;
        }

        Array.from(table.rows).forEach(row => {
            if (row.cells[colIndex]) row.cells[colIndex].remove();
        });

        if (nextFocusCell) {
            focusCell(nextFocusCell);
        } else if (table.rows.length > 0 && table.rows[0].cells.length > 0) {
            focusCell(table.rows[0].cells[0]); // Fallback
        }
        liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }
    
    function toggleHeaderRow() {
        if (!currentTableContext.row || !currentTableContext.table) return;
        const currentRow = currentTableContext.row;
        const table = currentTableContext.table;
        const isCurrentlyHeader = Array.from(currentRow.cells).every(cell => cell.tagName.toLowerCase() === 'th');
        const newCellType = isCurrentlyHeader ? 'td' : 'th';
        const originalCellIndex = currentTableContext.cell ? getColumnIndex(currentTableContext.cell) : 0;

        Array.from(currentRow.cells).forEach(cell => {
            const newCell = createCell(newCellType);
            newCell.innerHTML = cell.innerHTML;
            cell.replaceWith(newCell);
        });
        const focusedCell = currentRow.cells[originalCellIndex] || currentRow.cells[0];

        let tHead = table.querySelector('thead');
        let tBody = table.querySelector('tbody');

        if (newCellType === 'th') { // Becoming a header row
            if (!tHead) {
                tHead = document.createElement('thead');
                table.insertBefore(tHead, table.firstChild); // Simplistic: always put thead at top
            }
             if (tBody && currentRow.parentElement === tBody) tBody.removeChild(currentRow);
            tHead.appendChild(currentRow);
        } else { // Becoming a body row
            if (!tBody) {
                tBody = document.createElement('tbody');
                if (tHead) tHead.after(tBody); else table.appendChild(tBody);
            }
            if (tHead && currentRow.parentElement === tHead) tHead.removeChild(currentRow);
            tBody.appendChild(currentRow); // Simplistic: append to body
        }

        if (tHead && tHead.rows.length === 0) tHead.remove();
        if (tBody && tBody.rows.length === 0) tBody.remove();
        if (focusedCell) focusCell(focusedCell);
        liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }


    function deleteTable() {
        if (!currentTableContext.table) return;
        currentTableContext.table.remove();
        showStatus('Table deleted.', 'info', 2000);
        hideAllTableControls();
        activeTable = null;
        liveEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }


    // --- UI Interaction & Control Positioning ---
    function positionAndShow(btn, x, y, width, height) {
        btn.style.left = `${x}px`;
        btn.style.top = `${y}px`;
        if (width !== undefined) btn.style.width = `${width}px`;
        if (height !== undefined) btn.style.height = `${height}px`;
        btn.style.display = 'flex';
        btn.classList.add('visible');
    }

    function hideAllTableControls() {
        [addRowLineBtn, addColLineBtn, rowMenuTriggerBtn, colMenuTriggerBtn, tableMenuTriggerBtn].forEach(btn => {
            if (btn) {
                btn.style.display = 'none';
                btn.classList.remove('visible');
            }
        });
    }

    function scheduleHideControls(delay = 300) {
        clearTimeout(controlHideTimeout);
        controlHideTimeout = setTimeout(() => {
            const anyControlHovered = [addRowLineBtn, addColLineBtn, rowMenuTriggerBtn, colMenuTriggerBtn, tableMenuTriggerBtn]
                .some(btn => btn && btn.matches(':hover'));
            if (!anyControlHovered && (!activeTable || !activeTable.matches(':hover'))) {
                hideAllTableControls();
                activeTable = null;
            }
        }, delay);
    }

    function updateHoverContext(e) {
        const target = e.target;
        hoverContext.table = getTableElement(target);
        hoverContext.row = getRowElement(target);
        hoverContext.cell = getCellElement(target);
        hoverContext.hoverRowIndex = hoverContext.row ? getRowIndex(hoverContext.row) : -1;
        hoverContext.hoverColIndex = hoverContext.cell ? getColumnIndex(hoverContext.cell) : -1;

        hoverContext.isOverTableTopEdge = false;
        hoverContext.isOverTableBottomEdge = false;
        hoverContext.isOverTableLeftEdge = false;
        hoverContext.isOverTableRightEdge = false;
        hoverContext.isOverRowDivider = false;
        hoverContext.isOverColDivider = false;
        
        if (!hoverContext.table) return;

        const tableRect = hoverContext.table.getBoundingClientRect();
        const sensitivity = 10; // pixels for edge detection
        const lineButtonOffset = 5; // Half of line button dimension (20px / 2)

        // Table Edges for Add Lines
        if (e.clientY < tableRect.top + sensitivity) hoverContext.isOverTableTopEdge = true;
        if (e.clientY > tableRect.bottom - sensitivity) hoverContext.isOverTableBottomEdge = true;
        if (e.clientX < tableRect.left + sensitivity) hoverContext.isOverTableLeftEdge = true;
        if (e.clientX > tableRect.right - sensitivity) hoverContext.isOverTableRightEdge = true;

        // Row/Col Dividers for Add Lines
        if (hoverContext.row) {
            const rowRect = hoverContext.row.getBoundingClientRect();
            if (Math.abs(e.clientY - rowRect.bottom) < sensitivity && hoverContext.hoverRowIndex < hoverContext.table.rows.length - 1) {
                hoverContext.isOverRowDivider = true; // For adding below current row
            }
        }
        if (hoverContext.cell) {
            const cellRect = hoverContext.cell.getBoundingClientRect();
            if (Math.abs(e.clientX - cellRect.right) < sensitivity && hoverContext.hoverColIndex < hoverContext.row.cells.length - 1) {
                 hoverContext.isOverColDivider = true; // For adding after current cell/column
            }
        }
    }


    function handleTableMouseMove(e) {
        const eventTarget = e.target;
        const currentHoverTable = getTableElement(eventTarget);

        if (currentHoverTable) {
            clearTimeout(controlHideTimeout);
            if (activeTable !== currentHoverTable) {
                hideAllTableControls();
                activeTable = currentHoverTable;
            }
            updateHoverContext(e); // Update hover context based on current event

            const tableRect = activeTable.getBoundingClientRect();
            const scrollX = window.pageXOffset;
            const scrollY = window.pageYOffset;
            const lineBtnDim = 20; // dimension of the add line button's hover area
            const menuBtnSize = 24;
            const margin = 5;


            // --- Position Add Row Line Button ---
            let showAddRow = false;
            if (hoverContext.isOverTableTopEdge) { // Add row at the very top
                positionAndShow(addRowLineBtn, tableRect.left + scrollX, tableRect.top - (lineBtnDim/2) + scrollY, tableRect.width, lineBtnDim);
                hoverContext.actionRowIndex = 0; // Indicates to insert before row 0
                hoverContext.actionInsertBefore = true;
                showAddRow = true;
            } else if (hoverContext.isOverRowDivider && hoverContext.row) { // Add row between rows
                const rowRect = hoverContext.row.getBoundingClientRect();
                positionAndShow(addRowLineBtn, tableRect.left + scrollX, rowRect.bottom - (lineBtnDim/2) + scrollY, tableRect.width, lineBtnDim);
                hoverContext.actionRowIndex = getRowIndex(hoverContext.row); // Insert after this row
                hoverContext.actionInsertBefore = false;
                showAddRow = true;
            } else if (hoverContext.isOverTableBottomEdge && activeTable.rows.length > 0) { // Add row at the very bottom
                positionAndShow(addRowLineBtn, tableRect.left + scrollX, tableRect.bottom - (lineBtnDim/2) + scrollY, tableRect.width, lineBtnDim);
                hoverContext.actionRowIndex = activeTable.rows.length -1; // Insert after last row
                hoverContext.actionInsertBefore = false;
                showAddRow = true;
            }
             if (!showAddRow) addRowLineBtn.style.display = 'none';


            // --- Position Add Col Line Button ---
            let showAddCol = false;
            if (hoverContext.isOverTableLeftEdge) { // Add col at the very left
                positionAndShow(addColLineBtn, tableRect.left - (lineBtnDim/2) + scrollX, tableRect.top + scrollY, lineBtnDim, tableRect.height);
                hoverContext.actionColIndex = 0; // Insert before col 0
                hoverContext.actionInsertBefore = true;
                showAddCol = true;
            } else if (hoverContext.isOverColDivider && hoverContext.cell) { // Add col between columns
                const cellRect = hoverContext.cell.getBoundingClientRect();
                positionAndShow(addColLineBtn, cellRect.right - (lineBtnDim/2) + scrollX, tableRect.top + scrollY, lineBtnDim, tableRect.height);
                hoverContext.actionColIndex = getColumnIndex(hoverContext.cell); // Insert after this col
                hoverContext.actionInsertBefore = false;
                showAddCol = true;
            } else if (hoverContext.isOverTableRightEdge && activeTable.rows.length > 0 && activeTable.rows[0].cells.length > 0) { // Add col at the very right
                positionAndShow(addColLineBtn, tableRect.right - (lineBtnDim/2) + scrollX, tableRect.top + scrollY, lineBtnDim, tableRect.height);
                hoverContext.actionColIndex = activeTable.rows[0].cells.length -1; // Insert after last col
                hoverContext.actionInsertBefore = false;
                showAddCol = true;
            }
            if (!showAddCol) addColLineBtn.style.display = 'none';

            // --- Position Row Menu Trigger ---
            if (hoverContext.row) {
                const rowRect = hoverContext.row.getBoundingClientRect();
                positionAndShow(rowMenuTriggerBtn, rowRect.left - menuBtnSize - margin + scrollX, rowRect.top + (rowRect.height / 2) - (menuBtnSize / 2) + scrollY);
            } else {
                rowMenuTriggerBtn.style.display = 'none';
            }

            // --- Position Column Menu Trigger ---
            if (hoverContext.cell && activeTable.rows.length > 0) { // Need at least one row for a column concept
                const firstCellInCol = activeTable.rows[0].cells[getColumnIndex(hoverContext.cell)];
                if (firstCellInCol) {
                    const firstCellRect = firstCellInCol.getBoundingClientRect();
                    positionAndShow(colMenuTriggerBtn, firstCellRect.left + (firstCellRect.width / 2) - (menuBtnSize / 2) + scrollX, tableRect.top - menuBtnSize - margin + scrollY);
                } else {
                     colMenuTriggerBtn.style.display = 'none';
                }
            } else {
                colMenuTriggerBtn.style.display = 'none';
            }
            
            // --- Position Table Menu Trigger ---
            positionAndShow(tableMenuTriggerBtn, tableRect.left - menuBtnSize - margin + scrollX, tableRect.top - menuBtnSize - margin + scrollY);


        } else { // Not over a table
            if (activeTable && !eventTarget.closest('.table-control-base, .table-control-add-line')) {
                scheduleHideControls();
            }
        }
    }

    function showTableActionsModal(event, type) {
        currentTableContext.table = activeTable;
        currentTableContext.row = hoverContext.row;
        currentTableContext.cell = hoverContext.cell;
        currentTableContext.actionRowIndex = hoverContext.row ? getRowIndex(hoverContext.row) : -1;
        currentTableContext.actionColIndex = hoverContext.cell ? getColumnIndex(hoverContext.cell) : -1;
        
        let actions = [];
        const targetButton = event.currentTarget;

        if (type === 'row' && currentTableContext.row) {
            actions = [
                { label: 'Insert Row Above', iconClass: 'fas fa-arrow-up', handler: () => insertRow(true) },
                { label: 'Insert Row Below', iconClass: 'fas fa-arrow-down', handler: () => insertRow(false) },
                { label: 'Delete Row', iconClass: 'fas fa-trash-alt', handler: deleteRow },
                { label: 'Toggle Header/Body Row', iconClass: 'fas fa-heading', handler: toggleHeaderRow },
                { label: 'Delete Table', iconClass: 'fas fa-table-tennis', handler: deleteTable }
            ];
        } else if (type === 'col' && currentTableContext.actionColIndex !== -1) {
            actions = [
                { label: 'Insert Column Left', iconClass: 'fas fa-arrow-left', handler: () => insertColumn(true) },
                { label: 'Insert Column Right', iconClass: 'fas fa-arrow-right', handler: () => insertColumn(false) },
                { label: 'Delete Column', iconClass: 'fas fa-trash-alt', handler: deleteColumn },
                { label: 'Delete Table', iconClass: 'fas fa-table-tennis', handler: deleteTable }
            ];
        } else if (type === 'table') {
             actions = [
                { label: 'Add Row to End', iconClass: 'fas fa-plus', handler: () => { currentTableContext.actionRowIndex = activeTable.rows.length-1; insertRow(false); } },
                { label: 'Add Column to End', iconClass: 'fas fa-plus', handler: () => { currentTableContext.actionColIndex = activeTable.rows.length > 0 ? activeTable.rows[0].cells.length-1 : 0; insertColumn(false); } },
                { label: 'Delete Table', iconClass: 'fas fa-table-tennis', handler: deleteTable }
            ];
        }


        const actionsModalList = actionsModal.querySelector('#actions-modal-list');
        actionsModalList.innerHTML = ''; // Clear previous actions

        actions.forEach(action => {
            const li = document.createElement('li');
            if (action.iconClass) {
                const icon = document.createElement('i');
                icon.className = `${action.iconClass} modal-action-icon`;
                li.appendChild(icon);
            }
            li.appendChild(document.createTextNode(` ${action.label}`));
            li.addEventListener('click', () => {
                action.handler();
                actionsModal.style.display = 'none';
            });
            actionsModalList.appendChild(li);
        });

        if (actions.length > 0) {
            const modalContent = actionsModal.querySelector('.modal-content');
            const targetRect = targetButton.getBoundingClientRect();
            const scrollX = window.pageXOffset;
            const scrollY = window.pageYOffset;
            
            actionsModal.style.display = 'block'; // Show modal to get its dimensions
            const modalRect = modalContent.getBoundingClientRect();

            let top = targetRect.bottom + scrollY + 5;
            let left = targetRect.left + scrollX;

            if (top + modalRect.height > window.innerHeight + scrollY) {
                top = targetRect.top + scrollY - modalRect.height - 5;
            }
            if (left + modalRect.width > window.innerWidth + scrollX) {
                left = window.innerWidth + scrollX - modalRect.width - 10;
            }
             if (left < scrollX + 10) {
                left = scrollX + 10;
            }
            modalContent.style.top = `${top}px`;
            modalContent.style.left = `${left}px`;
        } else {
            actionsModal.style.display = 'none';
        }
    }


    function setupControlListeners() {
        addRowLineBtn.addEventListener('click', () => {
            if (!activeTable) return;
            currentTableContext.table = activeTable;
            // actionRowIndex and actionInsertBefore are set by hoverContext in mousemove
            const insertAbove = hoverContext.actionInsertBefore;
            currentTableContext.actionRowIndex = hoverContext.actionRowIndex;
             // If table is empty, actionRowIndex might be 0, insertBefore true. insertRow handles empty table.
            if (activeTable.rows.length === 0) {
                 insertRow(false); // Special call for empty table
            } else {
                insertRow(insertAbove);
            }
            handleTableMouseMove({ target: activeTable.querySelector('td,th') || activeTable });
        });

        addColLineBtn.addEventListener('click', () => {
            if (!activeTable) return;
            currentTableContext.table = activeTable;
            const insertBefore = hoverContext.actionInsertBefore;
            currentTableContext.actionColIndex = hoverContext.actionColIndex;
            currentTableContext.row = activeTable.rows[0] || null; // Need some row context for cell
            currentTableContext.cell = currentTableContext.row ? (currentTableContext.row.cells[hoverContext.actionColIndex] || currentTableContext.row.cells[0]) : null;

            if (activeTable.rows.length === 0 || (activeTable.rows[0] && activeTable.rows[0].cells.length === 0)) {
                insertColumn(false); // Special call for empty table/row
            } else {
                insertColumn(insertBefore);
            }
            handleTableMouseMove({ target: activeTable.querySelector('td,th') || activeTable });
        });

        rowMenuTriggerBtn.addEventListener('click', (e) => showTableActionsModal(e, 'row'));
        colMenuTriggerBtn.addEventListener('click', (e) => showTableActionsModal(e, 'col'));
        tableMenuTriggerBtn.addEventListener('click', (e) => showTableActionsModal(e, 'table'));

        [addRowLineBtn, addColLineBtn, rowMenuTriggerBtn, colMenuTriggerBtn, tableMenuTriggerBtn].forEach(btn => {
            btn.addEventListener('mouseenter', () => clearTimeout(controlHideTimeout));
            btn.addEventListener('mouseleave', (e) => {
                if (activeTable && !activeTable.contains(e.relatedTarget) && !liveEditor.contains(e.relatedTarget) && !e.relatedTarget.closest('.table-control-base, .table-control-add-line, #actions-modal')) {
                    scheduleHideControls(100); // Quick hide if leaving area
                }
            });
        });
    }

    // --- Initialization ---
    addRowLineBtn = createTableControl('add-row-line', 'table-control-add-line', 'fas fa-plus', 'Add Row', ['table-control-add-line-h']);
    addColLineBtn = createTableControl('add-col-line', 'table-control-add-line', 'fas fa-plus', 'Add Column', ['table-control-add-line-v']);
    rowMenuTriggerBtn = createTableControl('row-menu', 'table-control-base table-control-menu-trigger', 'fas fa-ellipsis-h', 'Row Actions');
    colMenuTriggerBtn = createTableControl('col-menu', 'table-control-base table-control-menu-trigger', 'fas fa-ellipsis-v', 'Column Actions');
    tableMenuTriggerBtn = createTableControl('table-menu', 'table-control-base table-control-menu-trigger', 'fas fa-grip-horizontal', 'Table Actions');

    setupControlListeners();

    liveEditor.addEventListener('mousemove', (e) => {
        const now = Date.now();
        if (now - lastMouseMoveTime < THROTTLE_DELAY) return;
        lastMouseMoveTime = now;
        handleTableMouseMove(e);
    });

    liveEditor.addEventListener('mouseleave', (e) => {
        if (!e.relatedTarget || !e.relatedTarget.closest || 
            (!e.relatedTarget.closest('.table-control-base, .table-control-add-line, #actions-modal') && e.target === liveEditor)
           ) {
             scheduleHideControls(100);
        }
    });
    
    document.addEventListener('click', (e) => { // Global click to hide
        const isControl = e.target.closest('.table-control-base, .table-control-add-line');
        const isModal = e.target.closest('#actions-modal');
        const isTable = getTableElement(e.target);
        if (!isControl && !isTable && !isModal && (activeTable || document.querySelector('.table-control-base.visible, .table-control-add-line.visible'))) {
            hideAllTableControls();
            if (actionsModal.style.display !== 'none') actionsModal.style.display = 'none';
            activeTable = null;
        }
    }, true);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (actionsModal.style.display !== 'none') {
                actionsModal.style.display = 'none';
                 e.stopPropagation(); // Prevent main.js from also handling if modal was for table
            } else if (activeTable || document.querySelector('.table-control-base.visible, .table-control-add-line.visible')) {
                hideAllTableControls();
                activeTable = null;
            }
        }
    });
}