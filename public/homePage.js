// homePage.js
export function initHomepage(appContext) {
    appContext.displayHomepage = async () => {
        // Ensure main editor is cleared of any page content and non-editable for homepage
        appContext.liveEditor.innerHTML = '';
        appContext.liveEditor.contentEditable = 'false';
        appContext.liveEditor.classList.remove('is-empty'); // Remove editor placeholder appearance
        appContext.liveEditor.removeAttribute('data-placeholder');

        const homepageContainer = document.createElement('div');
        homepageContainer.id = 'homepage-content';
        
        let projects = []; // Initialize with an empty array

        if (appContext.currentUser) {
            if (appContext.fetchProjects) {
                console.log("Homepage: Attempting to refresh project list by calling appContext.fetchProjects().");
                try {
                    // Always call fetchProjects to ensure the sidebar DOM is up-to-date before scraping.
                    // This will update appContext.projectsContentArea (which is the element with id="pageTreeContainer").
                    await appContext.fetchProjects(); 
                    
                    // Now, scrape the (presumably) updated projectsContentArea.
                    if (appContext.projectsContentArea) { // Corrected from pageTreeContainer to projectsContentArea
                        const projectItems = appContext.projectsContentArea.querySelectorAll('.project-item[data-project-name]');
                        projectItems.forEach(item => {
                            if (item.dataset.projectName) {
                                projects.push(item.dataset.projectName);
                            }
                        });

                        if (projects.length > 0) {
                            console.log("Homepage: Found projects by scraping sidebar DOM after explicit fetchProjects() call.", projects);
                        } else {
                            console.warn("Homepage: No projects found after explicit fetchProjects() call and scraping. User might have no projects, or fetchProjects failed to update DOM correctly.");
                        }
                    } else {
                        console.warn("Homepage: appContext.projectsContentArea not available for scraping after attempting fetchProjects().");
                    }
                } catch (error) {
                    console.error("Error calling appContext.fetchProjects() for homepage:", error);
                    appContext.showStatus('Failed to load project data for homepage.', 'error', 3000);
                    // projects array remains empty in case of error
                }
            } else {
                console.warn("Homepage: appContext.fetchProjects is not available. Cannot load project list.");
                // projects array remains empty
            }
            
        } else { // No appContext.currentUser
             homepageContainer.innerHTML = `<h2>Welcome!</h2><p class="no-projects">Please log in to see your projects.</p>`;
             appContext.liveEditor.appendChild(homepageContainer);
             if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = 'Homepage';
             return;
        }

        let contentHtml = '<h2>Your Projects</h2>';
        if (projects && projects.length > 0) {
            contentHtml += '<ul class="project-list">';
            projects.forEach(projectName => {
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
            contentHtml += '<p class="no-projects">No projects found. You can create a new one from the sidebar.</p>';
        }
        homepageContainer.innerHTML = contentHtml;
        appContext.liveEditor.appendChild(homepageContainer);

        if(appContext.currentPageDisplay) appContext.currentPageDisplay.textContent = 'Homepage';
        if(appContext.savePageBtn) appContext.savePageBtn.disabled = true; // No saving on homepage

        // Add event listeners for project links
        homepageContainer.querySelectorAll('.project-link').forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const projectLinkElement = e.target.closest('.project-link');
                if (!projectLinkElement) return;

                const projectName = projectLinkElement.dataset.projectName;

                if (appContext.currentProject === projectName && appContext.currentPageState) {
                    // Use projectsContentArea here as well for consistency and correctness
                    const projectItem = appContext.projectsContentArea?.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
                    const rootPageId = projectItem ? projectItem.dataset.rootPageId : null;
                    if (rootPageId && appContext.currentPageState.id === rootPageId) {
                        appContext.showStatus(`Project ${projectName} is already active and its main page is displayed.`, 'info', 2000);
                        return;
                    }
                }

                appContext.showStatus(`Loading project ${projectName}...`, 'info', 0);
                
                if (appContext.selectProject) {
                    // Use projectsContentArea here as well for consistency and correctness
                    const projectItemInSidebar = appContext.projectsContentArea?.querySelector(`.project-item[data-project-name="${CSS.escape(projectName)}"]`);
                    
                    if (!projectItemInSidebar) {
                        console.error(`Homepage: Could not find project item for "${projectName}" in sidebar to select.`);
                        appContext.showStatus(`Could not switch to project "${projectName}". Sidebar item not found.`, 'error');
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

    appContext.clearHomepage = () => {
        const homepageContent = appContext.liveEditor.querySelector('#homepage-content');
        if (homepageContent) {
            homepageContent.remove();
        }
    };
}