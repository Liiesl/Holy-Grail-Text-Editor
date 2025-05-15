// public/auth_client.js

export function initAuth(appContext) {
    // --- Get Elements ---
    const authPage = document.getElementById('auth-page'); // Changed from auth-container
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterLink = document.getElementById('show-register-link');
    const showLoginLink = document.getElementById('show-login-link');
    const logoutButton = document.getElementById('logout-btn');
    const loggedInUserDisplay = document.getElementById('logged-in-user'); // In app-container now
    const authStatusMessage = document.getElementById('auth-status-message');
    
    // Select submit buttons and loaders (assuming unique within forms if needed, but class is fine here)
    const loginSubmitBtn = loginForm?.querySelector('.auth-submit-btn');
    const registerSubmitBtn = registerForm?.querySelector('.auth-submit-btn');
    const loginLoader = loginSubmitBtn?.querySelector('.btn-loader');
    const registerLoader = registerSubmitBtn?.querySelector('.btn-loader');

    // --- Helper Functions ---

    function setButtonLoading(button, loader, isLoading) {
        if (!button || !loader) return;
        button.disabled = isLoading;
        loader.style.display = isLoading ? 'inline-block' : 'none';
        // Optionally hide text, handled by CSS :disabled rule now
        // const text = button.querySelector('.btn-text');
        // if (text) text.style.display = isLoading ? 'none' : 'inline-block';
    }

    function showAuthStatus(message, type = 'info', duration = 3000) {
        if (!authStatusMessage) return;
        authStatusMessage.textContent = message;
        authStatusMessage.className = `status-${type}`; // e.g. status-error, status-success
        
        // Ensure message is visible even if previously empty
        authStatusMessage.style.display = message ? 'block' : 'none'; 

        if (authStatusMessage._timeoutId) clearTimeout(authStatusMessage._timeoutId);
        if (duration > 0 && message) { // Only set timeout if there's a message
            authStatusMessage._timeoutId = setTimeout(() => {
                authStatusMessage.textContent = '';
                authStatusMessage.className = '';
                authStatusMessage.style.display = 'none';
            }, duration);
        } else if (!message) {
             // Clear immediately if message is empty
             authStatusMessage.textContent = '';
             authStatusMessage.className = '';
             authStatusMessage.style.display = 'none';
        }
    }

    // --- Screen Switching ---

    appContext.showLoginScreen = () => {
        if (authPage) {
            authPage.style.display = 'flex'; // Use flex for centering
            requestAnimationFrame(() => { // Trigger transition
                 authPage.classList.add('visible');
            });
        }
        if(appContainer) appContainer.style.display = 'none';
        if(loginForm) loginForm.style.display = 'flex'; // Use flex for column layout
        if(registerForm) registerForm.style.display = 'none';
        if(loggedInUserDisplay) loggedInUserDisplay.textContent = ''; // Clear user in main app header
        if(logoutButton) logoutButton.style.display = 'none'; // Hide logout in main app header

        // Clear status on screen switch
        showAuthStatus('', 'info', 0); 

        // When showing login screen, perform a full clear of editor and project state.
        appContext.currentUser = null; 
        appContext.currentProject = null; 
        appContext.currentPageState = null;
        if (appContext.clearEditor) appContext.clearEditor(true); // Pass true for fullClear

        if (appContext.pageTreeContainer) appContext.pageTreeContainer.innerHTML = '';
        // Clear any existing project/page state in the main app status
        if (appContext.showStatus) appContext.showStatus('Please log in to continue.', 'info', 0); 
    };

    function showAppScreen(user) {
       if (authPage) {
            authPage.classList.remove('visible');
            // Wait for transition before hiding completely
            setTimeout(() => {
                 authPage.style.display = 'none';
            }, 300); // Match CSS transition duration
       }
        if(appContainer) appContainer.style.display = 'block'; // Or 'flex' if it uses flex
        
        // Update user display in the main app header (sidebar)
        if(loggedInUserDisplay) loggedInUserDisplay.textContent = `Logged in as: ${user.username}`;
        if(logoutButton) logoutButton.style.display = 'inline-block'; // Show logout in main app header

        appContext.currentUser = user;
        if (appContext.showStatus) appContext.showStatus(`Welcome, ${user.username}!`, 'success');
        if (appContext.fetchProjects) appContext.fetchProjects(); // Load user's projects
    }

    // --- Event Listeners ---

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = loginForm.username.value;
            const password = loginForm.password.value;

            setButtonLoading(loginSubmitBtn, loginLoader, true);
            showAuthStatus('Logging in...', 'info', 0); // Keep message until result

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Login failed');
                
                localStorage.setItem('authToken', data.token);
                // Don't show success message here, showAppScreen handles welcome message
                // showAuthStatus('Login successful!', 'success', 1500); 
                showAppScreen(data.user);
            } catch (error) {
                console.error('Login error:', error);
                showAuthStatus(error.message, 'error');
            } finally {
                // Ensure button is re-enabled even if showAppScreen wasn't called (due to error)
                 setButtonLoading(loginSubmitBtn, loginLoader, false);
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = registerForm.username.value;
            const email = registerForm.email.value;
            const password = registerForm.password.value;

            setButtonLoading(registerSubmitBtn, registerLoader, true);
            showAuthStatus('Registering...', 'info', 0);

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Registration failed');

                localStorage.setItem('authToken', data.token);
                // showAuthStatus('Registration successful! Logging in...', 'success', 1500);
                showAppScreen(data.user);
            } catch (error) {
                console.error('Registration error:', error);
                showAuthStatus(error.message, 'error');
            } finally {
                 setButtonLoading(registerSubmitBtn, registerLoader, false);
            }
        });
    }

    if (showRegisterLink) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            if(loginForm) loginForm.style.display = 'none';
            if(registerForm) registerForm.style.display = 'flex'; // Use flex
            showAuthStatus(''); // Clear status message
        });
    }
    
    if (showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            if(registerForm) registerForm.style.display = 'none';
            if(loginForm) loginForm.style.display = 'flex'; // Use flex
            showAuthStatus(''); // Clear status message
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            // Show status in the main app area, not the auth screen
            if(appContext.showStatus) appContext.showStatus('Logging out...', 'info', 0); 
            
            const token = localStorage.getItem('authToken');
            try {
                // Don't necessarily need fetchWithAuth here if logout doesn't require auth strictly
                 if (token && appContext.fetchWithAuth) {
                    await appContext.fetchWithAuth('/api/auth/logout', { method: 'POST' });
                 } else if (token) {
                     // Basic fetch if fetchWithAuth not available or needed
                     await fetch('/api/auth/logout', { 
                         method: 'POST',
                         headers: { 'Authorization': `Bearer ${token}` } 
                     });
                 }
            } catch (error) {
                 console.warn('Logout API call failed (might be expected):', error);
                // Ignore errors on logout API call, client-side logout is primary
            } finally {
                localStorage.removeItem('authToken');
                appContext.currentUser = null;
                // showAuthStatus('Logged out.', 'success', 1500); // Auth screen not visible
                appContext.showLoginScreen(); // This handles clearing state and showing login
                // Status message updated by showLoginScreen's call to showStatus
            }
        });
    }

    // --- Initial Auth Check ---
    appContext.checkAuthStatus = async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            appContext.showLoginScreen();
            return;
        }
        try {
            // Ensure fetchWithAuth is available before calling
             if (!appContext.fetchWithAuth) {
                 console.error("fetchWithAuth is not defined on appContext. Cannot check auth status.");
                 throw new Error("Client setup error");
             }

            const response = await appContext.fetchWithAuth('/api/auth/status'); 
            // fetchWithAuth should throw on 401/403, but check response.ok for other errors
            if (!response.ok) { 
                 const errData = await response.json().catch(() => ({})); 
                 throw new Error(errData.error || `Auth status check failed: ${response.status}`);
            }
            const data = await response.json();
            if (data.loggedIn && data.user) { // Ensure user data is present
                showAppScreen(data.user);
            } else {
                // Server says not logged in, even with a token (token invalid/expired)
                localStorage.removeItem('authToken'); 
                appContext.showLoginScreen();
                 // Show message on the auth screen itself
                 showAuthStatus('Session expired. Please log in again.', 'warn', 5000);
            }
        } catch (error) { // Catch errors from fetchWithAuth (like 401) or network errors
            console.error('Auth status check error:', error);
            localStorage.removeItem('authToken');
            appContext.showLoginScreen();
            // Show message on the auth screen itself
            showAuthStatus('Your session may have expired. Please log in.', 'warn', 5000);
        }
    };
}