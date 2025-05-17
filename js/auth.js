/**
 * auth.js - Authentication wrapper for the Playtag application
 * 
 * This file serves as a wrapper around the Cognito authentication implementation
 * to provide a cleaner interface and easier maintenance.
 */

// Check if the user is authenticated
function isAuthenticated() {
    // Defer to the Cognito auth implementation
    return new Promise((resolve, reject) => {
        if (typeof Oidc === 'undefined') {
            console.error("OIDC library not loaded");
            resolve(false);
            return;
        }

        // Initialize UserManager if not already done
        if (!window.userManager) {
            initializeUserManager();
        }

        if (window.userManager) {
            window.userManager.getUser().then(user => {
                if (user && !user.expired) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            }).catch(err => {
                console.error("Error getting user:", err);
                resolve(false);
            });
        } else {
            resolve(false);
        }
    });
}

// Login function
function login() {
    try {
        console.log("Auth.login called - redirecting to Cognito login");
        
        // First, try to access the cognitoConfig directly
        let config = null;
        try {
            // Try to access from the window object
            if (typeof window.cognitoConfig !== 'undefined') {
                config = window.cognitoConfig;
                console.log("Found cognitoConfig in window:", config);
            } else if (typeof cognitoConfig !== 'undefined') {
                config = cognitoConfig;
                console.log("Found cognitoConfig in current scope:", config);
            } else {
                // If we can't find it, create a minimal version based on what we know
                console.warn("No cognitoConfig found, creating a minimal version");
                config = {
                    domain: "ap-northeast-23k0wjiehh.auth.ap-northeast-2.amazoncognito.com",
                    client_id: "kj47olcgdd5dul4tle04onj08",
                    redirect_uri: "https://harayaong.github.io/cam/callback.html",
                    response_type: "code",
                    scope: "openid email profile"
                };
                console.log("Created config:", config);
            }
        } catch (configError) {
            console.error("Error accessing cognitoConfig:", configError);
        }
        
        // Call initiateAuth directly instead of going through handleLogin
        // since our login form doesn't collect credentials
        if (typeof initiateAuth === 'function') {
            console.log("Calling initiateAuth directly");
            
            // Add a small delay to ensure logs appear before redirect
            setTimeout(function() {
                initiateAuth();
            }, 100);
        } else {
            // If initiateAuth is not available, show error
            console.error("initiateAuth function not found. Make sure cognito-auth.js is loaded properly.");
            
            // Try to directly construct and redirect to the auth URL
            if (config) {
                try {
                    console.log("Attempting manual redirect to Cognito");
                    const authUrl = `https://${config.domain}/login?` +
                        `client_id=${config.client_id}&` +
                        `response_type=${config.response_type}&` +
                        `scope=${encodeURIComponent(config.scope)}&` +
                        `redirect_uri=${encodeURIComponent(config.redirect_uri)}`;
                    
                    console.log("Redirecting to:", authUrl);
                    window.location.href = authUrl;
                } catch (redirectError) {
                    console.error("Manual redirect failed:", redirectError);
                    showLoginError("Authentication redirect failed");
                }
            } else {
                console.error("No configuration available for manual redirect");
                showLoginError("Authentication configuration missing");
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        showLoginError('로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
}

// Helper function to show login errors
function showLoginError(message) {
    const errorMessage = document.getElementById('loginErrorMessage');
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }
}

// Logout function
function logout() {
    console.log("Auth.logout called");
    
    // Always clear session storage first (this works regardless of Cognito)
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('temp_username');
    
    // Direct logout approach for Cognito
    try {
        // Try to get configuration
        let config = null;
        if (typeof window.cognitoConfig !== 'undefined') {
            config = window.cognitoConfig;
        } else if (typeof cognitoConfig !== 'undefined') {
            config = cognitoConfig;
        } else {
            // Fallback configuration if needed
            config = {
                domain: "ap-northeast-23k0wjiehh.auth.ap-northeast-2.amazoncognito.com",
                client_id: "kj47olcgdd5dul4tle04onj08",
                redirect_uri: "https://harayaong.github.io/cam/callback.html"
            };
        }
        
        // Use absolute URL for logout
        const logoutUrl = "https://harayaong.github.io/cam/index.html";
        const cognitoDomain = `https://${config.domain}`;
        
        // Cognito uses "logout_uri" parameter according to AWS docs
        const signoutUrl = `${cognitoDomain}/logout?client_id=${config.client_id}&logout_uri=${encodeURIComponent(logoutUrl)}`;
        
        console.log("Redirecting to logout URL:", signoutUrl);
        window.location.href = signoutUrl;
    } catch (error) {
        console.error("Error during logout:", error);
        
        // If we can't redirect to Cognito, at least make sure we're logged out locally
        window.location.href = 'index.html';
    }
}

// Get current user information
function getCurrentUser() {
    return new Promise((resolve, reject) => {
        if (typeof Oidc === 'undefined') {
            reject(new Error("OIDC library not loaded"));
            return;
        }

        // Initialize UserManager if not already done
        if (!window.userManager) {
            initializeUserManager();
        }

        if (window.userManager) {
            window.userManager.getUser().then(user => {
                if (user && !user.expired) {
                    resolve({
                        username: user.profile.name || user.profile.email || user.profile.preferred_username,
                        email: user.profile.email,
                        isAuthenticated: true
                    });
                } else {
                    resolve({
                        isAuthenticated: false
                    });
                }
            }).catch(err => {
                reject(err);
            });
        } else {
            reject(new Error("UserManager not initialized"));
        }
    });
}

// Helper function to handle auth callback (used in callback.html)
function handleAuthCallback() {
    console.log("Auth.handleAuthCallback called - processing Cognito response");
    
    // Check if we have Oidc library and user manager
    if (typeof Oidc === 'undefined') {
        console.error("OIDC library not loaded");
        return;
    }
    
    // Initialize UserManager if not already done
    if (!window.userManager) {
        if (typeof initializeUserManager === 'function') {
            console.log("Initializing UserManager for callback");
            initializeUserManager();
        } else {
            console.error("initializeUserManager function not found");
            return;
        }
    }
    
    if (window.userManager) {
        console.log("Processing sign-in callback with UserManager");
        window.userManager.signinRedirectCallback().then(function(user) {
            console.log("User successfully authenticated:", user);
            
            // Save authentication state to session storage as a fallback mechanism
            sessionStorage.setItem('isAuthenticated', 'true');
            if (user && user.profile) {
                const username = user.profile.name || user.profile.email || user.profile.preferred_username;
                sessionStorage.setItem('username', username);
            }
            
            // Update UI
            if (typeof updateUIForLoggedInUser === 'function') {
                const username = user.profile.name || user.profile.email || user.profile.preferred_username;
                updateUIForLoggedInUser(username);
            } else {
                // Manual fallback for updating UI
                console.log("updateUIForLoggedInUser not available, using fallback");
                const loginModal = document.getElementById('loginModal');
                if (loginModal) {
                    loginModal.style.display = 'none';
                    loginModal.classList.remove('show');
                }
            }
            
            // Clean up the URL
            console.log("Cleaning up URL after callback");
            if (window.history && window.history.replaceState) {
                window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
            }
            
            // Reload the page to ensure everything is fresh
            console.log("Reloading page to refresh state");
            setTimeout(function() {
                window.location.reload();
            }, 500);
        }).catch(function(err) {
            console.error("Error processing sign-in callback:", err);
            sessionStorage.removeItem('isAuthenticated');
            sessionStorage.removeItem('username');
            
            // Try to show login modal
            if (typeof showLoginModal === 'function') {
                showLoginModal();
            }
        });
    } else {
        console.error("UserManager not available for callback processing");
        
        // Try to show login modal
        if (typeof showLoginModal === 'function') {
            showLoginModal();
        }
    }
}

// Show login modal function
function showLoginModal() {
    // Don't show login modal if we're authenticated
    if (sessionStorage.getItem('isAuthenticated') === 'true') {
        console.log("Already authenticated, not showing login modal");
        return;
    }
    
    console.log("Showing login modal");
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'flex';
        loginModal.classList.add('show');
    } else {
        console.error("Login modal element not found");
    }
}

// Expose the auth functions globally
window.Auth = {
    isAuthenticated,
    login,
    logout,
    getCurrentUser,
    handleAuthCallback,
    showLoginModal,
    
    // Initialize auth on page load
    init: function() {
        console.log("Auth.init called - checking authentication state");
        
        // Check if we're handling a callback from Cognito (code parameter in URL)
        if (window.location.search.includes('code=')) {
            console.log("Auth code detected in URL - processing callback");
            handleAuthCallback();
        } 
        // Check if we have a saved authentication state
        else if (sessionStorage.getItem('isAuthenticated') === 'true') {
            console.log("Found saved authentication state - user already logged in");
            if (typeof updateUIForLoggedInUser === 'function') {
                updateUIForLoggedInUser(sessionStorage.getItem('username') || 'User');
            }
        }
        // Otherwise check authentication state with Cognito
        else {
            console.log("Checking authentication state with Cognito");
            if (typeof checkAuthState === 'function') {
                checkAuthState();
            } else {
                console.error("checkAuthState function not found");
                showLoginModal();
            }
        }
    }
};

// Auto-initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.Auth.init();
    
    // Add event listener to login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(event) {
            event.preventDefault();
            window.Auth.login();
        });
    }
}); 