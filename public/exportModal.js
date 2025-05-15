// exportModal.js

export function createExportModalHTML() {
    return `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Export Options</h3>
                <button class="close-btn" data-action="close-export-modal" title="Close">×</button>
            </div>
            <div class="modal-body">
                <form id="export-settings-form">
                    <div class="form-group">
                        <label for="export-format-select">Format:</label>
                        <select name="export-format" id="export-format-select" class="modal-select">
                            <option value="md" selected>.md (Markdown)</option>
                            <option value="pdf">.pdf</option>
                            <option value="html">.html</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="export-content-select">Content:</label>
                        <select name="export-content" id="export-content-select" class="modal-select">
                            <option value="everything" selected>Everything</option>
                            <option value="text-only">Text Only</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="export-type-select">Type:</label>
                        <select name="export-type" id="export-type-select" class="modal-select">
                            <option value="current-page" selected>Current Page</option>
                            <option value="project">Entire Project</option>
                        </select>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" data-action="close-export-modal">Cancel</button>
                <button id="confirm-export-btn" class="btn btn-primary">Export</button>
            </div>
        </div>
    `;
}

export function initExportModal(appContext) {
    let exportModal = document.getElementById('export-modal');
    if (!exportModal) {
        exportModal = document.createElement('div');
        exportModal.id = 'export-modal';
        exportModal.className = 'modal-overlay'; // Assumes a general modal overlay style
        exportModal.style.display = 'none';
        exportModal.innerHTML = createExportModalHTML();
        document.body.appendChild(exportModal);
    }
    appContext.exportModal = exportModal;

    const form = exportModal.querySelector('#export-settings-form');
    const confirmExportBtn = exportModal.querySelector('#confirm-export-btn');
    const closeButtons = exportModal.querySelectorAll('[data-action="close-export-modal"]');

    appContext.openExportModal = () => {
        if (!appContext.currentPageState || !appContext.currentPageState.id) {
            appContext.showStatus('No active page to export.', 'warn');
            return;
        }

        form.reset(); // Resets selects to their HTML 'selected' option or first option.

        // Dynamically enable/disable project export option
        const typeSelect = form.elements['export-type']; // Get the select element
        const projectOption = typeSelect.querySelector('option[value="project"]'); // Get the "project" option

        if (projectOption) {
            projectOption.disabled = !appContext.currentProject;
        }

        // If project option is disabled and was somehow selected (e.g., if it was default and no current project),
        // ensure 'current-page' is selected. form.reset() should handle this if 'current-page' has `selected` attr.
        if (projectOption && projectOption.disabled && typeSelect.value === 'project') {
            typeSelect.value = 'current-page';
        }

        exportModal.style.display = 'flex'; // Use 'flex' for centering if overlay is display:flex
    };

    appContext.closeExportModal = () => {
        exportModal.style.display = 'none';
    };

    closeButtons.forEach(btn => btn.addEventListener('click', appContext.closeExportModal));

    exportModal.addEventListener('click', (event) => {
        if (event.target === exportModal) { // Click on overlay itself
            appContext.closeExportModal();
        }
    });

    confirmExportBtn.addEventListener('click', async () => {
        const format = form.elements['export-format'].value;
        const content = form.elements['export-content'].value;
        const type = form.elements['export-type'].value;

        console.log('Exporting with settings:', { format, content, type });

        if (format === 'md' && content === 'everything' && type === 'current-page') {
            if (!appContext.currentPageState || !appContext.currentPageState.id) {
                appContext.showStatus('No current page selected to export.', 'error');
                appContext.closeExportModal();
                return;
            }
            try {
                let markdownContent = appContext.currentPageState.originalMarkdown;
                // If originalMarkdown isn't a string (e.g. null/undefined) or if there are unsaved changes, get from editor
                if (typeof markdownContent !== 'string' || appContext.hasUnsavedChanges) {
                    if (appContext.liveEditor && appContext.htmlToMarkdown) {
                        markdownContent = appContext.htmlToMarkdown(appContext.liveEditor.innerHTML);
                        if(appContext.hasUnsavedChanges){
                            appContext.showStatus('Exporting current unsaved editor content as Markdown.', 'info', 2000);
                        } else {
                            appContext.showStatus('Exporting current editor content as Markdown.', 'info', 1500);
                        }
                    } else {
                        appContext.showStatus('Cannot get page content for export.', 'error');
                        appContext.closeExportModal();
                        return;
                    }
                }

                const baseTitle = appContext.currentPageState.title || 'exported_page';
                let filename = baseTitle.replace(/\s+/g, '_').replace(/[^\w.-]/g, ''); // Sanitize
                if (!filename) {
                    filename = 'exported_page';
                }
                filename += '.md';

                const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                appContext.showStatus(`Page "${appContext.currentPageState.title}" exported as ${filename}`, 'success');
            } catch (error) {
                console.error('Error exporting current page as MD:', error);
                appContext.showStatus('Error exporting page. See console for details.', 'error');
            }
        } else if (type === 'project') {
             appContext.showStatus('Project export is not yet implemented.', 'info', 3000);
        } else if (format === 'pdf') {
             appContext.showStatus('PDF export is not yet implemented.', 'info', 3000);
        } else if (format === 'html') {
             appContext.showStatus('HTML export is not yet implemented.', 'info', 3000);
        } else if (content === 'text-only') {
            appContext.showStatus('Text-only export is not yet implemented.', 'info', 3000);
        }
         else {
            appContext.showStatus(`Selected export option (${format}, ${content}, ${type}) is not implemented yet.`, 'info', 3000);
        }

        appContext.closeExportModal();
    });
}