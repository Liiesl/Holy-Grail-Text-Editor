// homePage.js
export function initHomepage(appContext) {
    appContext.displayHomepage = async () => {
        // ... (ensure main editor is cleared) ...
        appContext.liveEditor.innerHTML = '';
        appContext.liveEditor.contentEditable = 'false';
        appContext.liveEditor.classList.remove('is-empty');
        appContext.liveEditor.removeAttribute('data-placeholder');

        const homepageContainer = document.createElement('div');
        homepageContainer.id = 'homepage-content';

        let projectsData = null; // Initialize project data
        let projects = [];      // Initialize project name array

        if (appContext.currentUser) {
            if (appContext.fetchProjects) {
                console.log("Homepage: Attempting to refresh project list by calling appContext.fetchProjects().");
                try {
                    // Call fetchProjects to get data AND update sidebar DOM
                    projectsData = await appContext.fetchProjects();

                    if (projectsData && Array.isArray(projectsData)) {
                         // Extract project names from the returned data
                        projects = projectsData.map(proj => typeof proj === 'string' ? proj : proj.name);
                        console.log("Homepage: Using project data returned by fetchProjects().", projects);
                    } else if (projectsData === null) {
                        // Handle cases where fetchProjects returned null (error or no user)
                        console.warn("Homepage: fetchProjects returned null. Assuming no projects or error occurred.");
                        projects = [];
                    } else {
                         console.warn("Homepage: fetchProjects returned unexpected data type.", projectsData);
                         projects = [];
                    }

                } catch (error) {
                    console.error("Error calling appContext.fetchProjects() for homepage:", error);
                    appContext.showStatus('Failed to load project data for homepage.', 'error', 3000);
                    projects = []; // Ensure projects is empty on error
                }
            } else {
                console.warn("Homepage: appContext.fetchProjects is not available. Cannot load project list.");
                projects = []; // Ensure projects is empty if function is missing
            }

        } else { // No appContext.currentUser
             homepageContainer.innerHTML = `<h2>Welcome!</h2><p class="no-projects">Please log in to see your projects.</p>`;
             appContext.liveEditor.appendChild(homepageContainer);
             if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = 'Homepage';
             return;
        }

        // --- Rendering logic using the 'projects' array (no changes needed here) ---
        let contentHtml = '<h2>Your Projects</h2>';
        if (projects && projects.length > 0) {
            contentHtml += '<ul class="project-list">';
            projects.forEach(projectName => {
                // Ensure projectName is valid before creating HTML
                if (typeof projectName !== 'string' || projectName.trim() === '') {
                    console.warn("Homepage: Skipping invalid project name during rendering:", projectName);
                    return; // Skip this iteration
                }
                const escapedProjectName = CSS.escape(projectName);
                contentHtml += `
                    <li class="project-list-item">
                        <a href="#" class="project-link" data-project-name="${escapedProjectName}">
                            <div class="project-link-bg-top"></div>
                            <div class="project-link-bg-bottom"></div>
                            <div class="project-link-content">
                                <i class="fas fa-book project-icon"></i>
                                <span class="project-name-text">${projectName}</span>
                            </div>
                        </a>
                    </li>`;
            });
            contentHtml += '</ul>';
        } else {
            // Display message if projects array is empty (could be due to error, no projects, or not logged in)
            if (appContext.currentUser) {
                 contentHtml += '<p class="no-projects">No projects found. You can create a new one from the sidebar.</p>';
            } else {
                 contentHtml += '<p class="no-projects">Please log in to see your projects.</p>'; // Should be caught earlier, but safe fallback
            }
        }
        homepageContainer.innerHTML = contentHtml;
        appContext.liveEditor.appendChild(homepageContainer);

        if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = 'Homepage';
        if(appContext.savePageBtn) appContext.savePageBtn.disabled = true;

        // --- Event listeners (no changes needed here) ---
        homepageContainer.querySelectorAll('.project-link').forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const projectLinkElement = e.target.closest('.project-link');
                if (!projectLinkElement) return;

                const projectName = projectLinkElement.dataset.projectName;

                // ... (rest of the click handler remains the same) ...
                 if (appContext.currentProject === projectName && appContext.currentPageState) {
                    const projectItem = appContext.projectsContentArea?.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
                    const rootPageId = projectItem ? projectItem.dataset.rootPageId : null;
                    if (rootPageId && appContext.currentPageState.id === rootPageId) {
                        appContext.showStatus(`Project ${projectName} is already active and its main page is displayed.`, 'info', 2000);
                        return;
                    }
                }

                appContext.showStatus(`Loading project ${projectName}...`, 'info', 0);

                if (appContext.selectProject) {
                    const projectItemInSidebar = appContext.projectsContentArea?.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);

                    if (!projectItemInSidebar) {
                        console.error(`Homepage: Could not find project item for "${projectName}" in sidebar to select.`);
                        appContext.showStatus(`Could not switch to project "${projectName}". Sidebar item not found.`, 'error');
                         // Attempt to re-render homepage if we failed to navigate away
                        if (appContext.displayHomepage && !appContext.currentProject && !appContext.currentPageState) {
                             await appContext.displayHomepage();
                        }
                        return;
                    }
                    try {
                        await appContext.selectProject(projectName, projectItemInSidebar);
                    } catch (error) {
                        console.error(`Error selecting project ${projectName} from homepage:`, error);
                        appContext.showStatus(`Error loading project ${projectName}. ${error.message}`, 'error');
                        // Attempt to re-render homepage if we failed to navigate away
                        if (appContext.displayHomepage && !appContext.currentProject && !appContext.currentPageState) {
                           await appContext.displayHomepage();
                        }
                    }
                } else {
                    console.error("appContext.selectProject function not available.");
                    appContext.showStatus('Critical error: Cannot switch projects.', 'error');
                }
            });
        });
    };

    // ... (clearHomepage remains the same) ...
    appContext.clearHomepage = () => {
        const homepageContent = appContext.liveEditor.querySelector('#homepage-content');
        if (homepageContent) {
            homepageContent.remove();
        }
    };
}