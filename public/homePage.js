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
            // Attempt 1: Scrape projects from the existing sidebar DOM.
            if (appContext.pageTreeContainer) {
                const projectItems = appContext.pageTreeContainer.querySelectorAll('.project-item[data-project-name]');
                projectItems.forEach(item => {
                    if (item.dataset.projectName) {
                        projects.push(item.dataset.projectName);
                    }
                });
                if (projects.length > 0) {
                    console.log("Homepage: Found projects by scraping existing sidebar DOM.", projects);
                }
            }

            // Attempt 2: If no projects found from the initial scrape, AND fetchProjects function exists,
            if (projects.length === 0 && appContext.fetchProjects) {
                console.log("Homepage: No projects from initial DOM scrape. Calling appContext.fetchProjects().");
                try {
                    await appContext.fetchProjects(); 
                    
                    if (appContext.pageTreeContainer) {
                        const projectItems = appContext.pageTreeContainer.querySelectorAll('.project-item[data-project-name]');
                        projectItems.forEach(item => {
                            if (item.dataset.projectName) {
                                projects.push(item.dataset.projectName);
                            }
                        });

                        if (projects.length > 0) {
                            console.log("Homepage: Found projects by scraping sidebar DOM after calling fetchProjects().", projects);
                        } else {
                            console.warn("Homepage: Still no projects found after explicitly calling fetchProjects() and scraping. User might have no projects.");
                        }
                    }
                } catch (error) {
                    console.error("Error calling appContext.fetchProjects() for homepage:", error);
                    appContext.showStatus('Failed to load project data for homepage.', 'error', 3000);
                    projects = []; 
                }
            } else if (projects.length === 0 && !appContext.fetchProjects) {
                console.warn("Homepage: No projects from initial DOM scrape, and appContext.fetchProjects is not available to attempt a refresh.");
                projects = []; 
            }
            
        } else if (!appContext.currentUser) {
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
                // Updated HTML structure for each project item
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
                // Traverse up to the link if a child element was clicked (icon or text)
                const projectLinkElement = e.target.closest('.project-link');
                if (!projectLinkElement) return;

                const projectName = projectLinkElement.dataset.projectName;

                if (appContext.currentProject === projectName && appContext.currentPageState) {
                    // Check if the current page is the root page of this project
                    const projectItem = document.querySelector(`#page-tree .project-item[data-project-name="${CSS.escape(projectName)}"]`);
                    const rootPageId = projectItem ? projectItem.dataset.rootPageId : null;
                    if (rootPageId && appContext.currentPageState.id === rootPageId) {
                        appContext.showStatus(`Project ${projectName} is already active and its main page is displayed.`, 'info', 2000);
                        return;
                    }
                }

                appContext.showStatus(`Loading project ${projectName}...`, 'info', 0);
                
                if (appContext.selectProject) {
                    // Find the corresponding project LI element in the sidebar
                    const projectItemInSidebar = document.querySelector(`#page-tree .project-item[data-project-name="${CSS.escape(projectName)}"]`);
                    
                    if (!projectItemInSidebar) {
                        console.error(`Homepage: Could not find project item for "${projectName}" in sidebar to select.`);
                        appContext.showStatus(`Could not switch to project "${projectName}". Sidebar item not found.`, 'error');
                        if (appContext.displayHomepage && !appContext.currentProject && !appContext.currentPageState) {
                             appContext.displayHomepage();
                        }
                        return;
                    }
                    try {
                        await appContext.selectProject(projectName, projectItemInSidebar);
                    } catch (error) {
                        console.error(`Error selecting project ${projectName} from homepage:`, error);
                        appContext.showStatus(`Error loading project ${projectName}. ${error.message}`, 'error');
                        if (appContext.displayHomepage && !appContext.currentProject && !appContext.currentPageState) {
                             appContext.displayHomepage();
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