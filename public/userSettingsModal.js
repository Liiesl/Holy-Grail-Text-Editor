// userSettingsModal.js
export function initUserSettingsModal(appContext) {
    let modal = document.getElementById('user-settings-modal');
    let headerProfileIcon, headerUsername, closeBtn;
    let sidePanelList, contentArea;
    let currentActiveCategory = 'account'; // Default category

    const categories = [
        { id: 'account', label: 'Account', icon: 'fa-user-cog' },
        { id: 'comingSoon', label: 'Coming Soon', icon: 'fa-hourglass-half' },
        // Add more categories here in the future
        // { id: 'appearance', label: 'Appearance', icon: 'fa-palette' },
        // { id: 'notifications', label: 'Notifications', icon: 'fa-bell' },
    ];

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
        // Populated by populateHeaderUserInfo

        headerUsername = document.createElement('span');
        headerUsername.classList.add('usp-header-username');
        // Populated by populateHeaderUserInfo

        profileInfoContainer.appendChild(headerProfileIcon);
        profileInfoContainer.appendChild(headerUsername);

        closeBtn = document.createElement('button');
        closeBtn.classList.add('close-btn');
        closeBtn.title = 'Close';
        closeBtn.innerHTML = '×'; // Using times symbol for close

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
        // Content list will be created/managed by renderContentForCategory

        modalBody.appendChild(sidePanel);
        modalBody.appendChild(contentArea);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(modalBody);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    } else {
        // Modal already exists, find its parts
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

    function populateHeaderUserInfo() {
        if (appContext.currentUser) {
            headerProfileIcon.textContent = appContext.currentUser.username ? appContext.currentUser.username.charAt(0).toUpperCase() : '?';
            headerUsername.textContent = appContext.currentUser.username || 'User';
            headerProfileIcon.style.display = '';
            headerUsername.style.display = '';
        } else {
            headerProfileIcon.textContent = '?';
            headerUsername.textContent = 'User Not Identified';
            // Optionally hide or style them differently if no user
            // headerProfileIcon.style.display = 'none';
            // headerUsername.style.display = 'none';
        }
    }

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
                break;
            case 'comingSoon':
                const placeholder = document.createElement('div');
                placeholder.classList.add('usm-placeholder-content');
                placeholder.textContent = 'More settings and features are coming soon!';
                contentArea.appendChild(placeholder);
                return; // No list for placeholder
            // Add cases for other categories
            // case 'appearance':
            //     // populate appearance settings
            //     break;
            default:
                const defaultText = document.createElement('p');
                defaultText.textContent = 'Select a category to see settings.';
                defaultText.style.padding = '20px';
                defaultText.style.color = 'var(--text-secondary)';
                contentArea.appendChild(defaultText);
                return;
        }
        contentArea.appendChild(contentList);
    }

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


    function openModal() {
        populateHeaderUserInfo();
        currentActiveCategory = 'account'; // Reset to default category
        renderSidePanel();
        renderContentForCategory(currentActiveCategory);
        modal.style.display = 'block';
        // Focus the first interactive element or the modal itself for accessibility
        modal.setAttribute('tabindex', '-1'); // Make modal focusable
        modal.focus();
    }

    function closeModal() {
        modal.style.display = 'none';
        modal.removeAttribute('tabindex'); // Clean up
    }

    appContext.openUserSettingsModal = openModal;
    appContext.closeUserSettingsModal = closeModal;

    // Event Listeners
    closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (event) => {
        if (event.target === modal) { // Click outside the modal content
            closeModal();
        }
    });

    // Escape key is handled globally in main.js and will call appContext.closeUserSettingsModal
}