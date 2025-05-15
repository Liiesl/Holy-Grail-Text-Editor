// userSettingsModal.js
export function initUserSettingsModal(appContext) {
    let modal = document.getElementById('user-settings-modal');
    let headerProfileIcon, headerUsername, closeBtn;
    let sidePanelList, contentArea;
    let currentActiveCategory = 'account'; // Default category

    // *** Updated categories ***
    const categories = [
        { id: 'account', label: 'Account', icon: 'fa-user-cog' },
        { id: 'appearance', label: 'Appearance', icon: 'fa-palette' }, // Added
        // { id: 'comingSoon', label: 'Coming Soon', icon: 'fa-hourglass-half' }, // Can keep or remove
        // Add more categories here in the future
        // { id: 'notifications', label: 'Notifications', icon: 'fa-bell' },
    ];

    // ... (rest of the modal creation/finding logic remains the same) ...
     if (!modal) {
        modal = document.createElement('div');
        modal.id = 'user-settings-modal';
        modal.classList.add('user-settings-modal');

        const modalContent = document.createElement('div');
        modalContent.classList.add('user-settings-modal-content');

        // Header
        const modalHeader = document.createElement('div');
        modalHeader.classList.add('user-settings-modal-header');

        const profileInfoContainer = document.createElement('div');
        profileInfoContainer.classList.add('usp-profile-info');

        headerProfileIcon = document.createElement('div');
        headerProfileIcon.classList.add('usp-header-profile-icon');

        headerUsername = document.createElement('span');
        headerUsername.classList.add('usp-header-username');

        profileInfoContainer.appendChild(headerProfileIcon);
        profileInfoContainer.appendChild(headerUsername);

        closeBtn = document.createElement('button');
        closeBtn.classList.add('close-btn');
        closeBtn.title = 'Close';
        closeBtn.innerHTML = '×';

        modalHeader.appendChild(profileInfoContainer);
        modalHeader.appendChild(closeBtn);

        // Body (Side Panel + Content Area)
        const modalBody = document.createElement('div');
        modalBody.classList.add('user-settings-modal-body');

        const sidePanel = document.createElement('div');
        sidePanel.classList.add('usm-side-panel');
        sidePanelList = document.createElement('ul');
        sidePanelList.classList.add('usm-side-panel-list');
        sidePanel.appendChild(sidePanelList);

        contentArea = document.createElement('div');
        contentArea.classList.add('usm-content-area');

        modalBody.appendChild(sidePanel);
        modalBody.appendChild(contentArea);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(modalBody);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    } else {
        headerProfileIcon = modal.querySelector('.usp-header-profile-icon');
        headerUsername = modal.querySelector('.usp-header-username');
        closeBtn = modal.querySelector('.user-settings-modal-header .close-btn');
        sidePanelList = modal.querySelector('.usm-side-panel-list');
        contentArea = modal.querySelector('.usm-content-area');
    }

    if (!modal || !closeBtn || !sidePanelList || !contentArea || !headerProfileIcon || !headerUsername) {
        console.error("User settings modal elements could not be created or found. Modal will not function.");
        appContext.openUserSettingsModal = () => console.error("User settings modal not initialized.");
        appContext.closeUserSettingsModal = () => console.error("User settings modal not initialized.");
        return;
    }

    appContext.userSettingsModal = modal;

    // ... (populateHeaderUserInfo function remains the same) ...
    function populateHeaderUserInfo() {
        if (appContext.currentUser) {
            headerProfileIcon.textContent = appContext.currentUser.username ? appContext.currentUser.username.charAt(0).toUpperCase() : '?';
            headerUsername.textContent = appContext.currentUser.username || 'User';
            headerProfileIcon.style.display = '';
            headerUsername.style.display = '';
        } else {
            headerProfileIcon.textContent = '?';
            headerUsername.textContent = 'User Not Identified';
        }
    }


    // ... (renderSidePanel function remains the same) ...
    function renderSidePanel() {
        sidePanelList.innerHTML = ''; // Clear previous items
        categories.forEach(category => {
            const li = document.createElement('li');
            li.classList.add('usm-side-panel-item');
            li.dataset.categoryId = category.id;

            const iconEl = document.createElement('i');
            iconEl.classList.add('fas', category.icon || 'fa-cog');
            li.appendChild(iconEl);
            li.appendChild(document.createTextNode(category.label));

            if (category.id === currentActiveCategory) {
                li.classList.add('usm-active');
            }

            li.addEventListener('click', () => {
                currentActiveCategory = category.id;
                renderSidePanel(); // Re-render to update active class
                renderContentForCategory(category.id);
            });
            sidePanelList.appendChild(li);
        });
    }


    // *** Updated renderContentForCategory ***
    function renderContentForCategory(categoryId) {
        contentArea.innerHTML = ''; // Clear previous content
        const contentList = document.createElement('ul');
        contentList.classList.add('usm-content-list');

        switch (categoryId) {
            case 'account':
                const accountActions = [
                    {
                        label: 'Logout',
                        icon: 'fa-sign-out-alt',
                        handler: () => {
                            if (appContext.logoutUser) {
                                appContext.logoutUser();
                            }
                            closeModal();
                        }
                    },
                    // Add more account-specific settings here
                ];
                populateActionList(contentList, accountActions);
                contentArea.appendChild(contentList); // Append list for account
                break;

            case 'appearance':
                // No list needed, just render the controls directly
                renderAppearanceSettings(contentArea);
                break; // Don't append the empty contentList

            // case 'comingSoon': // Keep or remove as needed
            //     const placeholder = document.createElement('div');
            //     placeholder.classList.add('usm-placeholder-content');
            //     placeholder.textContent = 'More settings and features are coming soon!';
            //     contentArea.appendChild(placeholder);
            //     break;

            default:
                const defaultText = document.createElement('p');
                defaultText.textContent = 'Select a category to see settings.';
                defaultText.style.padding = '20px';
                defaultText.style.color = 'var(--text-secondary)';
                contentArea.appendChild(defaultText);
                break; // Don't append the empty contentList
        }
        // Only append contentList if it was used (e.g., for 'account')
        // if (contentList.hasChildNodes()) {
        //     contentArea.appendChild(contentList);
        // }
    }

    // *** NEW function to render appearance settings ***
    function renderAppearanceSettings(container) {
        container.innerHTML = ''; // Clear container first
        const sectionTitle = document.createElement('h3');
        sectionTitle.textContent = 'Theme';
        sectionTitle.classList.add('usm-content-title'); // Add class for styling

        const themeOptionsDiv = document.createElement('div');
        themeOptionsDiv.classList.add('usm-theme-options');

        const themes = ['light', 'dark'];
        let currentTheme = appContext.userSettings?.theme || 'light'; // Get current theme from context

        themes.forEach(theme => {
            const button = document.createElement('button');
            button.textContent = theme.charAt(0).toUpperCase() + theme.slice(1); // Capitalize
            button.dataset.theme = theme;
            button.classList.add('usm-theme-button');
            if (theme === currentTheme) {
                button.classList.add('usm-active');
            }

            button.addEventListener('click', async () => {
                const selectedTheme = button.dataset.theme;
                if (selectedTheme === currentTheme) return; // No change

                // Visually update buttons immediately
                themeOptionsDiv.querySelectorAll('.usm-theme-button').forEach(btn => {
                    btn.classList.remove('usm-active');
                });
                button.classList.add('usm-active');
                currentTheme = selectedTheme; // Update local state

                // Apply theme visually immediately
                if (appContext.applyTheme) {
                    appContext.applyTheme(selectedTheme);
                }

                // Save setting to backend
                try {
                    const response = await appContext.fetchWithAuth('/api/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ theme: selectedTheme })
                    });
                    if (!response.ok) {
                        throw new Error(`Failed to save theme: ${response.statusText}`);
                    }
                    const result = await response.json();
                    // Update context if necessary (applyTheme already does this)
                     if (appContext.userSettings) {
                         appContext.userSettings.theme = result.settings.theme;
                     }
                    // Optional: Show success status
                     if(appContext.showStatus) appContext.showStatus("Theme updated.", "success", 1500);

                } catch (error) {
                    console.error("Error saving theme:", error);
                    if(appContext.showStatus) appContext.showStatus(`Error saving theme: ${error.message}`, "error");
                    // Revert visual state if save failed? Or let user retry?
                    // For simplicity, we'll leave the visual state as selected for now.
                     // Revert buttons:
                     // themeOptionsDiv.querySelectorAll('.usm-theme-button').forEach(btn => {
                     //     btn.classList.toggle('usm-active', btn.dataset.theme === (appContext.userSettings?.theme || 'light'));
                     // });
                     // currentTheme = appContext.userSettings?.theme || 'light';
                     // appContext.applyTheme(currentTheme); // Revert theme
                }
            });
            themeOptionsDiv.appendChild(button);
        });

        container.appendChild(sectionTitle);
        container.appendChild(themeOptionsDiv);
    }


    // ... (populateActionList function remains the same) ...
    function populateActionList(listElement, actions) {
        if (actions.length === 0) {
            const li = document.createElement('li');
            li.classList.add('usm-content-item');
            li.textContent = "No actions available in this section.";
            li.style.cursor = "default";
            li.style.textAlign = "center";
            li.style.color = "var(--text-secondary)";
            listElement.appendChild(li);
        } else {
            actions.forEach(action => {
                const li = document.createElement('li');
                li.classList.add('usm-content-item');
                const iconEl = document.createElement('i');
                iconEl.classList.add('fas', action.icon || 'fa-cog');
                li.appendChild(iconEl);
                li.appendChild(document.createTextNode(action.label));
                li.addEventListener('click', () => {
                    action.handler();
                });
                listElement.appendChild(li);
            });
        }
    }


    // ... (openModal, closeModal, event listeners remain the same) ...
    function openModal() {
        if (!appContext.currentUser) {
             console.warn("Cannot open user settings modal: User not logged in.");
             if (appContext.showStatus) appContext.showStatus("Please log in to access settings.", "error");
             return; // Don't open if not logged in
        }
        populateHeaderUserInfo();
        currentActiveCategory = 'account'; // Reset to default category
        renderSidePanel();
        renderContentForCategory(currentActiveCategory);
        modal.style.display = 'block';
        modal.setAttribute('tabindex', '-1');
        modal.focus();
    }

    function closeModal() {
        modal.style.display = 'none';
        modal.removeAttribute('tabindex');
    }

    appContext.openUserSettingsModal = openModal;
    appContext.closeUserSettingsModal = closeModal;

    closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });
}