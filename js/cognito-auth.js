// Import the UserManager from oidc-client-ts
// In a module environment, you'd use: import { UserManager } from "oidc-client-ts";
// For script tag inclusion, we'll access it from the global scope

// AWS Cognito Configuration
const cognitoConfig = {
    authority: "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_3k0WJiEHh",
    domain: "ap-northeast-23k0wjiehh.auth.ap-northeast-2.amazoncognito.com",
    client_id: "kj47olcgdd5dul4tle04onj08", 
    redirect_uri: "https://harayaong.github.io/cam/callback.html",
    response_type: "code",
    scope: "email openid phone profile" 
};

// Create UserManager instance once oidc-client-ts is loaded
let userManager = null;

// Initialize the UserManager once the script is loaded
function initializeUserManager() {
    // Check if oidc-client-ts is loaded
    if (typeof Oidc !== 'undefined') {
        userManager = new Oidc.UserManager({
            authority: cognitoConfig.authority,
            client_id: cognitoConfig.client_id,
            redirect_uri: cognitoConfig.redirect_uri,
            response_type: cognitoConfig.response_type,
            scope: cognitoConfig.scope,
            filterProtocolClaims: true,
            loadUserInfo: true
        });

        console.log("UserManager initialized with:", {
            authority: cognitoConfig.authority,
            client_id: cognitoConfig.client_id,
            redirect_uri: cognitoConfig.redirect_uri,
            response_type: cognitoConfig.response_type,
            scope: cognitoConfig.scope
        });

        // Log any OIDC events for debugging
        userManager.events.addUserLoaded(() => {
            console.log("User loaded event");
        });

        userManager.events.addSilentRenewError((e) => {
            console.error("Silent renew error", e);
        });
    } else {
        console.error("OIDC library not loaded. Make sure to include the oidc-client-ts script.");
    }
}

// Check if user is signed in
function checkAuthState() {
    // First check session storage for authentication state
    if (sessionStorage.getItem('isAuthenticated') === 'true') {
        console.log("User is authenticated according to session storage");
        const username = sessionStorage.getItem('username') || 'User';
        updateUIForLoggedInUser(username);
        return;
    }

    if (!userManager) {
        initializeUserManager();
    }

    if (userManager) {
        userManager.getUser().then(user => {
            if (user && !user.expired) {
                // User is logged in
                updateUIForLoggedInUser(user.profile.name || user.profile.email || user.profile.preferred_username);
            } else {
                // User is not logged in
                showLoginModal();
            }
        }).catch(err => {
            console.error("Error getting user:", err);
            showLoginModal();
        });
    } else {
        // Fallback to show login if OIDC is not available
        showLoginModal();
    }
}

// Function to handle login form submission
function handleLogin(event) {
    event.preventDefault();
    
    const userId = document.getElementById('userId').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('loginErrorMessage');
    
    // Clear previous error message
    errorMessage.textContent = '';
    errorMessage.style.display = 'none';
    
    // Basic validation
    if (!userId || !password) {
        errorMessage.textContent = '아이디와 비밀번호를 모두 입력해 주세요.';
        errorMessage.style.display = 'block';
        return;
    }
    
    // Store username temporarily (not secure for production)
    sessionStorage.setItem('temp_username', userId);
    
    // Initiate Cognito authentication using the hosted UI
    initiateAuth();
}

// Function to initiate authentication with Cognito
function initiateAuth() {
    console.log("Initiating authentication with Cognito");
    
    if (!userManager) {
        console.log("UserManager not initialized, doing it now");
        initializeUserManager();
    }

    if (userManager) {
        console.log("Calling signinRedirect");
        userManager.signinRedirect().catch(function(err) {
            console.error("Error during signin redirect:", err);
            
            // Fallback to direct redirect
            console.log("Falling back to direct redirect");
            const authUrl = `https://${cognitoConfig.domain}/login?` +
                `client_id=${cognitoConfig.client_id}&` +
                `response_type=${cognitoConfig.response_type}&` +
                `scope=${encodeURIComponent(cognitoConfig.scope)}&` +
                `redirect_uri=${encodeURIComponent(cognitoConfig.redirect_uri)}`;
            
            console.log("Redirecting to:", authUrl);
            window.location.href = authUrl;
        });
    } else {
        // Fallback for direct redirect to Cognito hosted UI
        console.log("UserManager not available, using direct redirect");
        const authUrl = `https://${cognitoConfig.domain}/login?` +
            `client_id=${cognitoConfig.client_id}&` +
            `response_type=${cognitoConfig.response_type}&` +
            `scope=${encodeURIComponent(cognitoConfig.scope)}&` +
            `redirect_uri=${encodeURIComponent(cognitoConfig.redirect_uri)}`;
        
        console.log("Redirecting to:", authUrl);
        window.location.href = authUrl;
    }
}

// Function to handle the callback after authentication
function handleAuthCallback() {
    console.log("Handling auth callback from Cognito");
    
    if (!userManager) {
        console.log("UserManager not initialized, doing it now");
        initializeUserManager();
    }

    // Set a timeout for stalled auth processing
    const authTimeoutId = setTimeout(function() {
        console.warn("Auth callback processing timed out");
        const errorDisplay = document.getElementById('error-display');
        if (errorDisplay) {
            errorDisplay.textContent = "Authentication process timed out. Try a manual redirect.";
        }
        
        // Show debug button and add the manual redirect button
        const debugButton = document.getElementById('debug-button');
        if (debugButton) {
            debugButton.style.display = 'inline-block';
        }
        
        // Add manual redirect option
        const container = document.querySelector('div[style*="text-align: center"]');
        if (container && !document.getElementById('manual-redirect')) {
            const redirectButton = document.createElement('button');
            redirectButton.id = 'manual-redirect';
            redirectButton.textContent = 'Return to Home Page';
            redirectButton.style.marginTop = '20px';
            redirectButton.style.padding = '10px 20px';
            redirectButton.addEventListener('click', function() {
                // Save authentication state (maybe the token exchange was successful but UI update failed)
                sessionStorage.setItem('isAuthenticated', 'true');
                window.location.href = 'index.html';
            });
            container.appendChild(redirectButton);
        }
    }, 15000); // 15 seconds timeout

    if (userManager) {
        console.log("Calling signinRedirectCallback");
        userManager.signinRedirectCallback().then(function(user) {
            // Clear the timeout since we got a response
            clearTimeout(authTimeoutId);
            
            console.log("User successfully logged in:", user);
            
            // Save authentication state to session storage
            sessionStorage.setItem('isAuthenticated', 'true');
            if (user && user.profile) {
                const username = user.profile.name || user.profile.email || user.profile.preferred_username;
                sessionStorage.setItem('username', username);
                
                // Add debug info
                const debugInfo = document.getElementById('debug-info');
                if (debugInfo) {
                    debugInfo.innerHTML += `<p>User authenticated: ${username}</p>`;
                    debugInfo.innerHTML += `<p>Access token received: ${user.access_token ? 'Yes' : 'No'}</p>`;
                }
            }
            
            // Update UI
            updateUIForLoggedInUser(user.profile.name || user.profile.email || user.profile.preferred_username);
            
            // Clean up the URL
            console.log("Cleaning up URL");
            if (window.history && window.history.replaceState) {
                window.history.replaceState({}, document.title, 'index.html');
            }
            
            // Reload the page to ensure everything is fresh - use index.html explicitly
            console.log("Redirecting to index page");
            window.location.href = 'index.html';
        }).catch(function(err) {
            // Clear the timeout since we got a response (even though it's an error)
            clearTimeout(authTimeoutId);
            
            console.error("Error handling auth callback:", err);
            
            // Display error to user
            const errorDisplay = document.getElementById('error-display');
            if (errorDisplay) {
                errorDisplay.textContent = `Authentication error: ${err.message || err}`;
            }
            
            // Show debug button
            const debugButton = document.getElementById('debug-button');
            if (debugButton) {
                debugButton.style.display = 'inline-block';
            }
            
            // Add details to debug info
            const debugInfo = document.getElementById('debug-info');
            if (debugInfo) {
                debugInfo.innerHTML += `<p>Error during authentication: ${err.message || err}</p>`;
                if (err.stack) {
                    debugInfo.innerHTML += `<pre>${err.stack}</pre>`;
                }
            }
            
            // Clear authentication state 
            sessionStorage.removeItem('isAuthenticated');
            sessionStorage.removeItem('username');
            
            // Add manual redirect option
            const container = document.querySelector('div[style*="text-align: center"]');
            if (container && !document.getElementById('manual-redirect')) {
                const redirectButton = document.createElement('button');
                redirectButton.id = 'manual-redirect';
                redirectButton.textContent = 'Return to Login';
                redirectButton.style.marginTop = '20px';
                redirectButton.style.padding = '10px 20px';
                redirectButton.addEventListener('click', function() {
                    window.location.href = 'index.html';
                });
                container.appendChild(redirectButton);
            }
        });
    } else {
        // Clear the timeout if we're going to fallback
        clearTimeout(authTimeoutId);
        
        console.error("OIDC library not loaded during callback.");
        
        // Display error to user
        const errorDisplay = document.getElementById('error-display');
        if (errorDisplay) {
            errorDisplay.textContent = "Authentication library not loaded";
        }
        
        // Add manual redirect option
        const container = document.querySelector('div[style*="text-align: center"]');
        if (container && !document.getElementById('manual-redirect')) {
            const redirectButton = document.createElement('button');
            redirectButton.id = 'manual-redirect';
            redirectButton.textContent = 'Return to Login';
            redirectButton.style.marginTop = '20px';
            redirectButton.style.padding = '10px 20px';
            redirectButton.addEventListener('click', function() {
                window.location.href = 'index.html';
            });
            container.appendChild(redirectButton);
        }
    }
}

// Function to handle logout
function handleLogout() {
    console.log("Initiating logout");
    
    // Always clear session storage first (this will work regardless of Cognito)
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('temp_username');
    
    try {
        // Direct logout approach for Cognito
        const clientId = cognitoConfig.client_id;
        const logoutUrl = "https://harayaong.github.io/cam/index.html"; // Using absolute URL
        const cognitoDomain = `https://${cognitoConfig.domain}`;
        
        // Cognito uses "logout_uri" parameter according to AWS docs
        const signoutUrl = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUrl)}`;
        
        console.log("Redirecting to logout URL:", signoutUrl);
        window.location.href = signoutUrl;
    } catch (error) {
        console.error("Error during logout:", error);
        // If we can't redirect to Cognito, at least make sure we're logged out locally
        window.location.href = 'index.html';
    }
}

// Make handleLogout globally available
window.handleLogout = handleLogout;

// Function to show login modal
function showLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'flex';
        loginModal.classList.add('show');
    }
}

// Function to update UI for logged in user
function updateUIForLoggedInUser(username) {
    // Hide login modal
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'none';
        loginModal.classList.remove('show');
    }
    
    // Update header to show user ID and add logout button
    const headerRight = document.querySelector('.header-right');
    
    // Check if user info is already displayed
    if (!document.getElementById('userInfo')) {
        const userInfo = document.createElement('div');
        userInfo.id = 'userInfo';
        userInfo.style.display = 'flex';
        userInfo.style.alignItems = 'center';
        
        userInfo.innerHTML = `
            <span style="margin-right: 10px; font-size: 14px;">${username}</span>
            <a href="#" onclick="handleLogout()" class="shortcut-link">Logout</a>
        `;
        
        headerRight.appendChild(userInfo);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the OIDC UserManager
    initializeUserManager();
    
    // Attach event handlers for login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Check if we're handling a callback from Cognito
    if (window.location.search.includes('code=')) {
        handleAuthCallback();
    } else {
        // Check authentication state
        checkAuthState();
    }
}); 