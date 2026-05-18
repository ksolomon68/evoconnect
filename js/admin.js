/**
 * Admin Logic Module
 * Handles administrative data management (simulated for demo)
 */

const ADMIN_DATA_KEY = 'wfc_admin_data';

// Initialize admin data from server
async function initAdminDataFromServer() {
    const API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_URL : '/api';
    const user = getCurrentUser();

    try {
        // Fetch admin dashboard data
        const response = await fetch(`${API_BASE}/admin/dashboard`, {
            headers: {
                'X-Admin-Email': user ? user.email : 'admin@test.com'
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch admin data');
        }
        const data = await response.json();

        localStorage.setItem(ADMIN_DATA_KEY, JSON.stringify(data));
        return data;
    } catch (error) {
        console.error('Error fetching admin data:', error);
        
        // Fallback to simulated data
        const fallbackData = {
            stats: {
                totalSmallBusinesses: 142,
                totalPrimeContractors: 28,
                pendingApprovals: 3,
                siteUptime: '99.9%'
            },
            recentActivity: [
                { type: 'user_reg', user: 'BuildIt Corp', time: '2 hours ago' },
                { type: 'opp_post', user: 'District 4', time: '4 hours ago' }
            ],
            pendingOpportunities: []
        };
        
        localStorage.setItem(ADMIN_DATA_KEY, JSON.stringify(fallbackData));
        return fallbackData;
    }
}

function initAdminData() {
    // Initialize with fallback data if not exists
    if (!localStorage.getItem(ADMIN_DATA_KEY)) {
        const fallbackData = {
            stats: {
                totalSmallBusinesses: 142,
                totalPrimeContractors: 28,
                pendingApprovals: 0,
                siteUptime: '99.9%'
            },
            recentActivity: [],
            pendingOpportunities: []
        };
        localStorage.setItem(ADMIN_DATA_KEY, JSON.stringify(fallbackData));
    }
}

function getAdminData() {
    initAdminData();
    return JSON.parse(localStorage.getItem(ADMIN_DATA_KEY));
}

async function approveOpportunity(id) {
    const API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_URL : '/api';

    try {
        const response = await fetch(`${API_BASE}/opportunities/${id}/approve`, {
            method: 'POST'
        });

        if (response.ok) {
            console.log('Opportunity approved:', id);
            return true;
        }
    } catch (error) {
        console.error('Error approving opportunity:', error);
    }
    return false;
}

// Global initialization
document.addEventListener('DOMContentLoaded', initAdminDataFromServer);
