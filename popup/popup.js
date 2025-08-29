// Check for user session at startup and clear localStorage if none exists
(function checkSessionAtStartup() {
    chrome.storage.local.get(['supabaseSession'], (result) => {
        const session = result.supabaseSession || null;
        if (!session || !session.access_token) {
            // User is not logged in, clear any stale localStorage data
            try {
                console.log('[OF Assistant] No active session found, clearing localStorage user data');
                localStorage.removeItem('of_user_email');
                localStorage.removeItem('of_user_id');
            } catch (err) {
                console.error('[OF Assistant] Error clearing localStorage at startup:', err);
            }
        } else {
            console.log('[OF Assistant] Found active session at startup');
        }
    });
})();

document.addEventListener('DOMContentLoaded', function() {
    // Handle Auto Mode (yes-btn) click
    document.querySelector('.yes-btn').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'startAutoScrape' });
            window.close();
        });
    });

    // Supabase login logic
    const SUPABASE_URL = 'https://lukruajlqwxzklipmtzs.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1a3J1YWpscXd4emtsaXBtdHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4OTA5OTIsImV4cCI6MjA2MjQ2Njk5Mn0.4TueT6cJuDJxzxYKehKra_JCJ_yTJgWvnNvhqjxYsRc';
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const mainUI = document.getElementById('main-ui');
    const loginModal = document.getElementById('login-modal');
    const logoutBtn = document.getElementById('logout-btn');
    const showSignupLink = document.getElementById('show-signup-link');

    // Helper to hide all modals
    function hideAllModals() {
        loginModal.style.display = 'none';
    }
    // Utility: Show/hide UI based on auth
    function showMainUI() {
        mainUI.style.display = 'block';
        hideAllModals();
        logoutBtn.style.display = 'block';
        // Show user email in dashboard
        const userEmail = localStorage.getItem('of_user_email') || '';
        let emailDiv = document.getElementById('user-email');
        if (!emailDiv) {
            emailDiv = document.createElement('div');
            emailDiv.id = 'user-email';
            emailDiv.className = 'glass-secondary';
            emailDiv.style = 'margin: 12px 0; padding: 8px; border-radius: 6px; text-align: center; color: #fff; font-size: 1em;';
            mainUI.querySelector('.glass-card').insertBefore(emailDiv, mainUI.querySelector('.glass-card').children[1]);
        }
        emailDiv.textContent = userEmail ? `Logged in as: ${userEmail}` : '';
        // Add auto mode toggle if not present
        let toggleDiv = document.getElementById('auto-mode-toggle');
        if (!toggleDiv) {
            toggleDiv = document.createElement('div');
            toggleDiv.id = 'auto-mode-toggle';
            toggleDiv.style = 'margin: 18px 0; text-align: center;';
            toggleDiv.innerHTML = `
                <label style="color:#fff;font-size:1em;">Auto Mode: <input type='checkbox' id='auto-mode-switch' /></label>
                <span id='auto-mode-status' style='margin-left:10px;color:#fff;'></span>
            `;
            mainUI.querySelector('.glass-card').appendChild(toggleDiv);
            document.getElementById('auto-mode-switch').addEventListener('change', handleAutoModeToggle);
        }
        // Add session stats placeholder
        let statsDiv = document.getElementById('session-stats');
        if (!statsDiv) {
            statsDiv = document.createElement('div');
            statsDiv.id = 'session-stats';
            statsDiv.className = 'glass-secondary';
            statsDiv.style = 'margin: 18px 0; padding: 10px; border-radius: 6px; text-align: center; color: #fff; font-size: 0.95em;';
            statsDiv.textContent = 'Session stats will appear here.';
            mainUI.querySelector('.glass-card').appendChild(statsDiv);
        }
    }
    // Auto mode toggle logic
    let autoMode = false;
    function handleAutoModeToggle(e) {
        autoMode = e.target.checked;
        const status = document.getElementById('auto-mode-status');
        if (autoMode) {
            status.textContent = 'ON';
            status.style.color = '#7c3aed';
            // Trigger bot logic
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'startAutoScrape' });
            });
        } else {
            status.textContent = 'OFF';
            status.style.color = '#fff';
            // Optionally send stop command
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'stopAutoScrape' });
            });
        }
    }
    function showLoginModal() {
        mainUI.style.display = 'none';
        hideAllModals();
        loginModal.style.display = 'flex';
        logoutBtn.style.display = 'none';
    }

    // Utility: Save/load session from chrome.storage
    function saveSession(session) {
        chrome.storage.local.set({ supabaseSession: session });
        
        // Also save user email to localStorage for persistence
        try {
            // Check all possible places where user data might be in the session object
            const user = session?.user;
            
            if (user && user.email) {
                localStorage.setItem('of_user_email', user.email);
                localStorage.setItem('of_user_id', user.id);
                console.log('[OF Assistant] Saved user email to localStorage:', user.email);
            } else {
                // Try getting the user from the session.data
                const dataUser = session?.data?.user;
                if (dataUser && dataUser.email) {
                    localStorage.setItem('of_user_email', dataUser.email);
                    localStorage.setItem('of_user_id', dataUser.id);
                    console.log('[OF Assistant] Saved user email from data.user to localStorage:', dataUser.email);
                } else {
                    console.warn('[OF Assistant] Could not find user email in session object:', session);
                }
            }
        } catch (err) {
            console.error('[OF Assistant] Error saving user email to localStorage:', err);
        }
    }
    function clearSession() {
        chrome.storage.local.remove('supabaseSession');
        
        // Also clear user email from localStorage
        try {
            localStorage.removeItem('of_user_email');
            localStorage.removeItem('of_user_id');
            console.log('[OF Assistant] Cleared user email from localStorage');
        } catch (err) {
            console.error('[OF Assistant] Error clearing user email from localStorage:', err);
        }
    }
    function loadSession() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['supabaseSession'], (result) => {
                resolve(result.supabaseSession || null);
            });
        });
    }

    // On popup load, check for existing session
    (async function checkAuthOnLoad() {
        const session = await loadSession();
        if (session && session.access_token) {
            // Restore session in Supabase
            await supabaseClient.auth.setSession({
                access_token: session.access_token,
                refresh_token: session.refresh_token
            });
            // Get user and check access
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (user) {
                showMainUI();
            } else {
                showLoginModal();
            }
        } else {
            showLoginModal();
        }
    })();

    // Login handler
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const errorDiv = document.getElementById('login-error');
            errorDiv.textContent = '';
            loginBtn.disabled = true;
            loginBtn.textContent = 'Logging in...';

            if (!email || !password) {
                errorDiv.textContent = 'Please enter both email and password.';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Login';
                return;
            }

            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) {
                errorDiv.textContent = error.message;
                loginBtn.disabled = false;
                loginBtn.textContent = 'Login';
            } else {
                // Save session
                saveSession(data.session);
                // Insert into users table if not already present
                if (data.user) {
                    const { id, email, user_metadata } = data.user;
                    // Check if user already exists in your users table
                    const { data: existing } = await supabaseClient
                        .from('users')
                        .select('id')
                        .eq('id', id)
                        .single();
                    if (!existing) {
                        // Use display_name from user_metadata if available, else fallback to email
                        const displayName = user_metadata?.display_name || email;
                        await supabaseClient.from('users').insert({ id, email, onlyfans_username: displayName });
                    }
                }
                showMainUI();
                loginBtn.disabled = false;
                loginBtn.textContent = 'Login';
            }
        });
    }

    // Logout handler
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            clearSession();
            showLoginModal();
        });
    }

    // Listen for login success from login.html (if used)
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'supabase-login-success') {
            alert('Login successful! Welcome, ' + (event.data.user.email || 'user'));
            // Save session if provided
            if (event.data.session) saveSession(event.data.session);
            showMainUI();
        }
    });

    // Show sign-up modal
    if (showSignupLink) {
        showSignupLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.open('https://ofagents.ai/', '_blank');
        });
    }

    // Utility: Check if user has an active plan
    async function hasActivePlan(userId) {
        const { data: user } = await supabaseClient
            .from('users')
            .select('is_paid, subscription_status, expires_at')
            .eq('id', userId)
            .single();
        if (!user) return false;
        const now = new Date();
        const expiresAt = user.expires_at ? new Date(user.expires_at) : null;
        return (
            user.is_paid === true &&
            (user.subscription_status === 'active' || user.subscription_status === 'trial') &&
            expiresAt && expiresAt > now
        );
    }

    // Main check before scraping
    async function canScrapeAndUpload() {
        const session = await loadSession();
        if (!session || !session.access_token) {
            alert('Please log in first.');
            return false;
        }
        await supabaseClient.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token
        });
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            alert('Session expired. Please log in again.');
            return false;
        }
        const allowed = await hasActivePlan(user.id);
        if (!allowed) {
            alert('You need an active subscription to use this feature.');
            return false;
        }
        return true;
    }

    // We've already attached the click handler at the top of the file
    // No need for duplicate event listener here
});