
// public/auth_client.js

export function initAuth(appContext) {
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterLink = document.getElementById('show-register-link');
    const showLoginLink = document.getElementById('show-login-link');
    const logoutButton = document.getElementById('logout-btn');
    const loggedInUserDisplay = document.getElementById('logged-in-user');
    const authStatusMessage = document.getElementById('auth-status-message');


    function showAuthStatus(message, type = 'info', duration = 3000) {
        if (!authStatusMessage) return;
        authStatusMessage.textContent = message;
        authStatusMessage.className = `status-${type}`; // e.g. status-error, status-success
        if (authStatusMessage._timeoutId) clearTimeout(authStatusMessage._timeoutId);
        if (duration > 0) {
            authStatusMessage._timeoutId = setTimeout(() => {
                authStatusMessage.textContent = '';
                authStatusMessage.className = '';
            }, duration);
        }
    }

    appContext.showLoginScreen = () => {
        if(authContainer) authContainer.style.display = 'block';
        if(appContainer) appContainer.style.display = 'none';
        if(loginForm) loginForm.style.display = 'block';
        if(registerForm) registerForm.style.display = 'none';
        if(loggedInUserDisplay) loggedInUserDisplay.textContent = '';
        if(logoutButton) logoutButton.style.display = 'none';
        
        // When showing login screen, perform a full clear of editor and project state.
        appContext.currentProject = null; 
        appContext.currentPageState = null;
        if (appContext.clearEditor) appContext.clearEditor(true); // Pass true for fullClear

        if (appContext.pageTreeContainer) appContext.pageTreeContainer.innerHTML = '';
        // Clear any existing project/page state
        appContext.showStatus('Please log in to continue.', 'info', 0);
    };

    function showAppScreen(user) {
        if(authContainer) authContainer.style.display = 'none';
        if(appContainer) appContainer.style.display = 'block';
        if(loggedInUserDisplay) loggedInUserDisplay.textContent = `Logged in as: ${user.username}`;
        if(logoutButton) logoutButton.style.display = 'inline-block';
        appContext.currentUser = user;
        appContext.showStatus(`Welcome, ${user.username}!`, 'success');
        if (appContext.fetchProjects) appContext.fetchProjects(); // Load user's projects
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = loginForm.username.value;
            const password = loginForm.password.value;
            showAuthStatus('Logging in...', 'info', 0);
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Login failed');
                
                localStorage.setItem('authToken', data.token);
                showAuthStatus('Login successful!', 'success', 1500);
                showAppScreen(data.user);
            } catch (error) {
                console.error('Login error:', error);
                showAuthStatus(error.message, 'error');
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = registerForm.username.value;
            const email = registerForm.email.value;
            const password = registerForm.password.value;
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
                showAuthStatus('Registration successful! Logging in...', 'success', 1500);
                showAppScreen(data.user);
            } catch (error) {
                console.error('Registration error:', error);
                showAuthStatus(error.message, 'error');
            }
        });
    }

    if (showRegisterLink) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            if(loginForm) loginForm.style.display = 'none';
            if(registerForm) registerForm.style.display = 'block';
            showAuthStatus('');
        });
    }
    
    if (showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            if(registerForm) registerForm.style.display = 'none';
            if(loginForm) loginForm.style.display = 'block';
            showAuthStatus('');
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            showAuthStatus('Logging out...', 'info', 0);
            const token = localStorage.getItem('authToken');
            // Optional: Call server logout endpoint if it does anything (e.g. token blacklisting)
            try {
                await appContext.fetchWithAuth('/api/auth/logout', { method: 'POST' });
            } catch (error) {
                // Ignore errors on logout API call, as client-side logout is primary
            }
            localStorage.removeItem('authToken');
            appContext.currentUser = null;
            showAuthStatus('Logged out.', 'success', 1500);
            appContext.showLoginScreen(); // This will call clearEditor(true) internally
        });
    }

    appContext.checkAuthStatus = async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            appContext.showLoginScreen();
            return;
        }
        try {
            const response = await appContext.fetchWithAuth('/api/auth/status'); // fetchWithAuth handles token
            if (!response.ok) { // fetchWithAuth should throw for 401/403, this is belt-and-suspenders
                 const errData = await response.json().catch(() => ({})); // Try to parse error
                 throw new Error(errData.error || `Auth status check failed: ${response.status}`);
            }
            const data = await response.json();
            if (data.loggedIn) {
                showAppScreen(data.user);
            } else {
                localStorage.removeItem('authToken'); // Token was invalid server-side
                appContext.showLoginScreen();
            }
        } catch (error) { // This catch is important for when fetchWithAuth throws
            console.error('Auth status check error:', error);
            localStorage.removeItem('authToken');
            appContext.showLoginScreen();
            showAuthStatus('Session expired or invalid. Please log in.', 'warn');
        }
    };
}