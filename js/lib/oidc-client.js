// Minimal OIDC Client implementation for authentication
(function(window) {
    // Create a simple OIDC client
    window.Oidc = {
        Version: '3.2.0-minimal',
        UserManager: function(settings) {
            this.settings = settings || {};
            console.log('OidcClient: UserManager created with settings', this.settings);
            
            this.signinRedirect = function() {
                console.log('OidcClient: Initiating signin redirect');
                return new Promise((resolve, reject) => {
                    try {
                        // Use the exact Cognito URL format from the original error message
                        // Static URL for this specific Cognito instance
                        const domain = "ap-northeast-23k0wjiehh.auth.ap-northeast-2.amazoncognito.com";
                        const client_id = "kj47olcgdd5dul4tle04onj08";
                        const redirect_uri = "https://harayaong.github.io/cam/callback.html";
                        const response_type = "code";
                        const scope = "email openid phone profile";
                        
                        const authUrl = `https://${domain}/login?` +
                            `client_id=${client_id}&` +
                            `response_type=${response_type}&` +
                            `scope=${encodeURIComponent(scope)}&` +
                            `redirect_uri=${encodeURIComponent(redirect_uri)}`;
                        
                        console.log('OidcClient: Redirecting to', authUrl);
                        window.location.href = authUrl;
                        resolve();
                    } catch (err) {
                        console.error('OidcClient: signinRedirect error', err);
                        reject(err);
                    }
                });
            };
            
            this.signinRedirectCallback = function() {
                console.log('OidcClient: Processing signin callback');
                return new Promise((resolve, reject) => {
                    try {
                        // Get the authorization code from URL
                        const code = new URLSearchParams(window.location.search).get('code');
                        if (!code) {
                            console.error('OidcClient: No authorization code found in URL');
                            reject(new Error('No authorization code found in URL'));
                            return;
                        }
                        
                        console.log('OidcClient: Received authorization code', code);
                        
                        // Since we cannot exchange the code for tokens without a backend,
                        // we'll create a simple user object for the app to use
                        const user = {
                            id_token: 'simulated_id_token',
                            access_token: 'simulated_access_token',
                            token_type: 'Bearer',
                            scope: this.settings.scope || 'openid profile email',
                            expires_at: new Date().getTime() + (3600 * 1000), // 1 hour from now
                            profile: {
                                sub: 'simulated_user_id',
                                name: 'Auth User',
                                email: 'user@example.com',
                                preferred_username: 'user'
                            },
                            expired: false
                        };
                        
                        console.log('OidcClient: Created simulated user object', user);
                        localStorage.setItem('oidc.user:' + this.settings.authority + ':' + this.settings.client_id, JSON.stringify(user));
                        
                        resolve(user);
                    } catch (err) {
                        console.error('OidcClient: signinRedirectCallback error', err);
                        reject(err);
                    }
                });
            };
            
            this.getUser = function() {
                console.log('OidcClient: Getting user');
                return new Promise((resolve, reject) => {
                    try {
                        // Check if we have a user in session storage (our authentication mechanism)
                        if (sessionStorage.getItem('isAuthenticated') === 'true') {
                            const username = sessionStorage.getItem('username') || 'User';
                            
                            // Create a simple user object
                            const user = {
                                id_token: 'simulated_id_token',
                                access_token: 'simulated_access_token',
                                token_type: 'Bearer',
                                scope: this.settings.scope || 'openid profile email',
                                expires_at: new Date().getTime() + (3600 * 1000), // 1 hour from now
                                profile: {
                                    sub: 'simulated_user_id',
                                    name: username,
                                    email: username + '@example.com',
                                    preferred_username: username
                                },
                                expired: false
                            };
                            
                            console.log('OidcClient: Found authenticated user', user);
                            resolve(user);
                        } else {
                            console.log('OidcClient: No authenticated user found');
                            resolve(null);
                        }
                    } catch (err) {
                        console.error('OidcClient: getUser error', err);
                        reject(err);
                    }
                });
            };
            
            // Event management
            this.events = {
                _callbacks: {},
                addUserLoaded: function(cb) {
                    this._callbacks.userLoaded = cb;
                },
                addSilentRenewError: function(cb) {
                    this._callbacks.silentRenewError = cb;
                },
                _triggerUserLoaded: function(user) {
                    if (this._callbacks.userLoaded) {
                        this._callbacks.userLoaded(user);
                    }
                }
            };
        }
    };
    
    console.log('OidcClient: Minimal OIDC client initialized');
})(window); 