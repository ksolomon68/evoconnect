/**
 * Authentication Module
 * Handles login, registration, and session management (client-side demo)
 */

console.log('WorkForce Connect: Auth module initialized.');

// Helper to check if localStorage is available
function isStorageAvailable() {
    try {
        const test = '__storage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch (e) {
        console.error('WorkForce Connect: Local storage is not available. Persistence features will be disabled.', e);
        return false;
    }
}

// Simulated user database (in production, this would be server-side)
const users = {
    "small businesses": [],
    "agencies": []
};

const API_URL = window.APP_CONFIG ? window.APP_CONFIG.API_URL : '/api';

// Check if user is logged in
function isLoggedIn() {
    return localStorage.getItem('wfc_user') !== null;
}

// Get current user
function getCurrentUser() {
    const userJson = localStorage.getItem('wfc_user');
    return userJson ? JSON.parse(userJson) : null;
}

// Helper to safely parse JSON or handle common non-JSON server errors
async function safeParseJson(response) {
    const contentType = response.headers.get("content-type");
    try {
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await response.json();
        } else {
            const text = await response.text();
            console.warn('Non-JSON response received:', text.substring(0, 1000));

            if (response.status === 404) {
                return { error: `Endpoint not found (404). Check API_URL: ${API_URL}` };
            }

            // Capture specific server errors or blank pages
            if (response.status === 503) {
                if (text.includes("Database Connection Error")) {
                    return { error: "Database Connection Error: The server could not connect to its data storage. This is likely a configuration issue on Hostinger." };
                }
                return { error: `Server API is currently unavailable (Status: 503). Server Response: ${text.substring(0, 200)}...` };
            }

            if (text.includes("It works!") || text.includes("<!DOCTYPE html>")) {
                return { error: `Server API is returning a static HTML page instead of JSON. (Status: ${response.status}). This often means the custom domain is not correctly routing to the Node.js application.` };
            }

            return { error: text.substring(0, 300) || 'Server returned an invalid response.' };
        }
    } catch (e) {
        console.error('Parsing error:', e);
        return { error: 'Failed to process server response.' };
    }
}

// Login function
async function login(email, password) {
    console.log('WorkForce Connect: Attempting login for:', email);
    const finalUrl = `${API_URL}/auth/login`;
    try {
        console.log('WorkForce Connect: Fetching URL:', finalUrl);

        const response = await fetch(finalUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await safeParseJson(response);

        if (!response.ok || data.success === false) {
            let errorMsg = data.message || data.error || `Server Error (${response.status})`;
            if (data.details) errorMsg += `: ${data.details}`;
            if (data.hint) errorMsg += `\n\nHint: ${data.hint}`;

            const error = new Error(errorMsg);
            if (data.debug) error.debug = data.debug;
            throw error;
        }

        const userData = data.user || data; // Handle both nested and flat for safety
        localStorage.setItem('wfc_user', JSON.stringify(userData));
        // Store JWT token for authenticated API calls
        if (data.token) {
            localStorage.setItem('caltrans_token', data.token);
        }
        console.log('WorkForce Connect: User logged in:', userData.email);
        return userData;
    } catch (error) {
        console.error('WorkForce Connect Login error detail:', error);

        // Handle specific network errors
        if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('NetworkError'))) {
            throw new Error(`Connection Error: Unable to reach the authentication server at ${finalUrl}. Please ensure the API server is running on port 3001.`);
        }

        if (window.location.protocol === 'https:' && API_URL.startsWith('http:')) {
            throw new Error('Security Error: Mixed content blocked. The dashboard is on HTTPS but trying to connect to an insecure HTTP API.');
        }

        throw error;
    }
}

// Logout function - clears session and calls API
window.handleLogout = async function() {
    try {
        // Call server API to clear server-side session
        await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include' // Include cookies if using session auth
        });
    } catch (error) {
        console.warn('WorkForce Connect: Logout API call failed (continuing anyway):', error);
    }

    // Clear all client-side storage
    localStorage.removeItem('wfc_user');
    localStorage.removeItem('caltrans_token');
    localStorage.removeItem('userId');
    localStorage.removeItem('userType');
    sessionStorage.clear();

    console.log('WorkForce Connect: User session cleared');
    // Redirect to login page
    window.location.href = 'login.html';
}

// Keep backward compatibility
window.logout = window.handleLogout;

// Register small business
async function registerSmallBusiness(formData) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...formData, type: 'small_business' }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        const data = await safeParseJson(response);

        if (!response.ok || data.success === false) {
            throw new Error(data.message || data.error || 'Registration failed');
        }

        const user = data.user || data;
        localStorage.setItem('wfc_user', JSON.stringify(user));
        if (data.token) localStorage.setItem('caltrans_token', data.token);
        console.log('WorkForce Connect: Small Business registered:', user.businessName || user.email);
        return user;
    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            throw new Error('Registration timed out. The server is taking too long to respond. Please try again or contact us at CaltransBizSupport@dot.ca.gov for assistance.');
        }
        // Mock fallback if API is unreachable
        if (error.message.includes('Failed to fetch') || error.message.includes('Server API is not responding')) {
            console.warn('API Unreachable. Triggering Mock Fallback.');
            const mockUser = {
                id: 'v-' + Date.now(),
                ...formData,
                type: 'small_business',
                password: null
            };
            localStorage.setItem('wfc_user', JSON.stringify(mockUser));
            return mockUser;
        }
        throw error;
    }
}

// Register prime contractor
async function registerPrimeContractor(formData) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...formData, type: 'agency' }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        const data = await safeParseJson(response);

        if (!response.ok || data.success === false) {
            throw new Error(data.message || data.error || 'Registration failed');
        }

        const user = data.user || data;
        localStorage.setItem('wfc_user', JSON.stringify(user));
        if (data.token) localStorage.setItem('caltrans_token', data.token);
        console.log('WorkForce Connect: Prime Contractor registered:', user.organizationName || user.email);
        return user;
    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            throw new Error('Registration timed out. The server is taking too long to respond. Please try again or contact us at CaltransBizSupport@dot.ca.gov for assistance.');
        }
        // Mock fallback if API is unreachable
        if (error.message.includes('Failed to fetch') || error.message.includes('Server API is not responding')) {
            console.warn('API Unreachable. Triggering Mock Fallback.');
            const mockUser = {
                id: 'a-' + Date.now(),
                ...formData,
                type: 'agency',
                password: null
            };
            localStorage.setItem('wfc_user', JSON.stringify(mockUser));
            return mockUser;
        }
        throw error;
    }
}

// Redirect based on user type
function redirectToDashboard(user) {
    if (user.type === 'admin') {
        window.location.href = 'dashboard-admin.html';
    } else if (user.type === 'small_business') {
        window.location.href = 'dashboard-worker.html';
    } else if (user.type === 'agency') {
        window.location.href = 'dashboard-prime-contractor.html';
    }
}

// Login form handler
document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('loginForm');

    if (loginForm) {
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            // Validate
            if (!email || !password) {
                showErrorMessage('Please complete all required fields.', loginForm.parentElement);
                return;
            }

            if (!validateEmail(email)) {
                showErrorMessage('Please enter a valid email address.', loginForm.parentElement);
                return;
            }

            // Attempt login
            try {
                login(email, password)
                    .then(user => redirectToDashboard(user))
                    .catch(error => {
                        showErrorMessage(error.message, loginForm.parentElement);
                    });
            } catch (error) {
                showErrorMessage('Invalid email or password. Please try again.', loginForm.parentElement);
            }
        });
    }

    // Small Business registration form handler
    const smallBusinessRegForm = document.getElementById('vendorRegistrationForm');

    if (smallBusinessRegForm) {
        smallBusinessRegForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const submitBtn = smallBusinessRegForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating Account...';

            // Gather Data (Matching HTML IDs)
            const formData = {
                businessName: document.getElementById('businessName').value,
                legalStructure: document.getElementById('legalStructure').value,
                ein: document.getElementById('ein') ? document.getElementById('ein').value : null,
                businessAddress: document.getElementById('businessAddress').value,
                city: document.getElementById('city').value,
                zipCode: document.getElementById('zipCode').value,
                businessPhone: document.getElementById('businessPhone').value,
                website: document.getElementById('businessWebsite').value,
                contactName: `${document.getElementById('firstName').value} ${document.getElementById('lastName').value}`,
                title: document.getElementById('title').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                password: document.getElementById('password').value,
                confirmPassword: document.getElementById('confirmPassword').value,
                isSBE: document.getElementById('isSBECertified').checked,
                certificationNumber: document.getElementById('sbeNumber') ? document.getElementById('sbeNumber').value : null
            };

            if (formData.password !== formData.confirmPassword) {
                showErrorMessage('Passwords do not match.', smallBusinessRegForm.parentElement);
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }

            registerSmallBusiness(formData)
                .then(user => {
                    alert('Account created successfully! Redirecting...');
                    window.location.href = 'dashboard-worker.html';
                })
                .catch(error => {
                    showErrorMessage(error.message, smallBusinessRegForm.parentElement);
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                });
        });
    }

    // Prime Contractor registration form handler
    const primeContractorRegForm = document.getElementById('agencyRegistrationForm');

    if (primeContractorRegForm) {
        primeContractorRegForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const submitBtn = primeContractorRegForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating Account...';

            // Gather Data (Matching HTML IDs)
            const formData = {
                organizationType: document.getElementById('organizationType').value,
                organizationName: document.getElementById('organizationName').value,
                website: document.getElementById('website').value,
                district: document.getElementById('district') ? document.getElementById('district').value : null,
                address: document.getElementById('address').value,
                city: document.getElementById('city').value,
                zipCode: document.getElementById('zipCode').value,
                businessPhone: document.getElementById('phone').value,
                contactName: `${document.getElementById('firstName').value} ${document.getElementById('lastName').value}`,
                title: document.getElementById('title').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('contactPhone').value,
                password: document.getElementById('password').value,
                confirmPassword: document.getElementById('confirmPassword').value
            };

            if (formData.password !== formData.confirmPassword) {
                showErrorMessage('Passwords do not match.', primeContractorRegForm.parentElement);
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }

            registerPrimeContractor(formData)
                .then(user => {
                    alert('Account created successfully! Redirecting...');
                    window.location.href = 'dashboard-prime-contractor.html';
                })
                .catch(error => {
                    showErrorMessage(error.message, primeContractorRegForm.parentElement);
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                });
        });
    }
});

// Protect dashboard pages
function protectPage(requiredType) {
    const user = getCurrentUser();

    if (!user) {
        window.location.href = 'login.html';
        return null;
    }

    if (requiredType && user.type !== requiredType) {
        window.location.href = 'login.html';
        return null;
    }

    return user;
}

// Sync navigation header based on auth state
function syncNavHeader() {
    const user = getCurrentUser();
    const navUl = document.querySelector('.main-nav ul');
    if (!navUl) return;

    const loginBtn = navUl.querySelector('a[href="login.html"]');
    if (user && loginBtn) {
        const li = loginBtn.parentElement;
        let dashboardUrl = 'dashboard-worker.html';
        if (user.type === 'agency') dashboardUrl = 'dashboard-prime-contractor.html';
        if (user.type === 'admin') dashboardUrl = 'dashboard-admin.html';

        li.innerHTML = `
            <div style="display: flex; gap: var(--space-sm); align-items: center;">
                <a href="${dashboardUrl}" class="btn btn-primary btn-small">Dashboard</a>
                <a href="#" onclick="logout(); return false;" class="btn btn-outline btn-small">Log Out</a>
            </div>
        `;
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', function () {
    syncNavHeader();

    // If on login page and already logged in, redirect
    if (window.location.pathname.endsWith('login.html') && isLoggedIn()) {
        console.log('WorkForce Connect: Already logged in, redirecting to dashboard.');
        redirectToDashboard(getCurrentUser());
    }

    if (!isStorageAvailable()) {
        const warning = document.createElement('div');
        warning.className = 'alert alert-error';
        warning.style.margin = '20px';
        warning.innerHTML = '<strong>Warning:</strong> Local storage is disabled in your browser. Your login and profile changes will not be saved. Please enable site data / cookies to use this prototype.';
        document.body.prepend(warning);
    }
});
// Export module globally
window.Auth = {
    isLoggedIn,
    getUser: getCurrentUser,
    getToken: () => localStorage.getItem('caltrans_token'),
    login,
    logout: window.logout,
    registerSmallBusiness,
    registerPrimeContractor,
    redirectToDashboard,
    protectPage,
    syncNavHeader
};
