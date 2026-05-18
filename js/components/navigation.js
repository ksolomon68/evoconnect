/**
 * WorkForce Connect Navigation Component (Refactored)
 * Dynamically renders sidebars and headers based on user roles.
 * Updated for WCAG 2.1 AA (44x44px targets), secure session management, and Express routing.
 */

const Navigation = {
    // Role configurations — keys must match Navigation.init() call values
    config: {
        small_business: {
            title: 'Small Business Portal',
            items: [
                { label: 'Dashboard',             href: '/labor/dashboard',       icon: '🏠' },
                { label: 'Search Opportunities',  href: '/labor/search',          icon: '🔍' },
                { label: 'My Applications',       href: '/labor/applications',    icon: '📋' },
                { label: 'Saved Items',           href: '/labor/saved',           icon: '⭐' },
                { label: 'Messages',              href: '/labor/messages',        icon: '✉️' },
                { label: 'My Profile',            href: '/labor/profile',         icon: '👤' },
                { label: 'Checklist',             href: '/labor/checklist',       icon: '✅' },
                { label: 'Settings',              href: '/labor/settings',        icon: '⚙️' },
                { label: 'Resources',             href: '/labor/resources',       icon: '📚' },
                { label: 'Help & FAQ',            href: '/labor/faq',             icon: '❓' }
            ]
        },
        agency: {
            title: 'Prime Contractor Portal',
            items: [
                { label: 'Dashboard',               href: '/prime/dashboard',         icon: '🏠' },
                { label: 'Post Opportunity',        href: '/prime/post-opportunity',  icon: '➕' },
                { label: 'Manage Postings',         href: '/prime/opportunities',     icon: '📂' },
                { label: 'View Applications',       href: '/prime/applications',      icon: '📝' },
                { label: 'Search Small Businesses', href: '/prime/search',            icon: '🔍' },
                { label: 'Messages',                href: '/prime/messages',          icon: '📬' },
                { label: 'Analytics',               href: '/prime/analytics',         icon: '📈' },
                { label: 'My Profile',              href: '/prime/profile',           icon: '👤' },
                { label: 'Settings',                href: '/prime/settings',          icon: '⚙️' },
                { label: 'Help & FAQ',              href: '/prime/faq',               icon: '❓' }
            ]
        },
        admin: {
            title: 'Admin Console',
            items: [
                { label: 'Dashboard',            href: '/admin/dashboard',        icon: '🏠' },
                { label: 'User Management',      href: '/admin/users',            icon: '👥' },
                { label: 'Opportunity Approval', href: '/admin/opportunities',    icon: '✅' },
                { label: 'Analytics',            href: '/admin/analytics',        icon: '📊' },
                { label: 'Content Management',   href: '/admin/cms',              icon: '🖊️' },
                { label: 'Report Issue',         href: '/admin/issues',           icon: '🚨' },
                { label: 'Admin Guide',          href: '/admin/tutorial',         icon: '📖' },
                { label: 'Help & FAQ',           href: '/admin/faq',              icon: '❓' }
            ]
        },
        staff: {
            title: 'Caltrans Staff Portal',
            items: [
                { label: 'Overview',                href: '/admin/dashboard',         icon: '🏠' },
                { label: 'Manage Opportunities',    href: '/admin/opportunities',     icon: '📂' },
                { label: 'Search Small Businesses', href: '/admin/search',            icon: '🔍' },
                { label: 'Analytics',               href: '/admin/analytics',         icon: '📈' },
                { label: 'Support Services',        href: '/admin/support',           icon: '🎧' },
                { label: 'Content Management',      href: '/admin/cms',               icon: '🖊️' },
                { label: 'Resources',               href: '/admin/resources',         icon: '📚' },
                { label: 'Report Issue',            href: '/admin/issues',            icon: '🚨' },
                { label: 'CMS Guide',               href: '/admin/tutorial',          icon: '📖' },
                { label: 'Help & FAQ',              href: '/admin/faq',               icon: '❓' }
            ]
        }
    },

    // Map legacy DB role values to config keys
    _normalizeRole(role) {
        const map = {
            'worker': 'small_business',
            'vendor': 'small_business',
            'prime': 'agency',
            'prime_contractor': 'agency',
            'wfc_admin': 'staff',
            'admin': 'admin'
        };
        return map[role] || role;
    },

    _isMobile() {
        return window.innerWidth <= 1024;
    },

    init(role) {
        // Fallback to localStorage if no role provided
        if (!role) {
            const user = JSON.parse(localStorage.getItem('wfc_user'));
            role = user ? user.type : 'worker';
        }

        role = this._normalizeRole(role);

        this.renderSidebar(role);
        this.renderHeader(role);
        this.setupMobileToggle();
        this.initNotifications();
        
        window._navInitialized = true;
    },

    // Handle logout: clear local storage and redirect to backend logout route
    handleLogout() {
        localStorage.removeItem('wfc_user');
        window.location.href = '/auth/logout';
    },

    renderSidebar(role) {
        const sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
        if (!sidebar) return;

        const config = this.config[role] || this.config['small_business'];
        const currentPath = window.location.pathname;

        let html = `
            <div class="sidebar-brand" style="display: flex; justify-content: flex-end;">
                <button class="sidebar-close-btn" aria-label="Close menu" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: var(--color-text-secondary);">&times;</button>
            </div>
            <nav class="sidebar-nav" style="padding: 1rem 0; flex: 1; overflow-y: auto;">
                <div style="padding: 0 1.5rem 0.5rem; font-size: 0.75rem; text-transform: uppercase; color: var(--color-text-secondary); font-weight: 700;">
                    ${config.title}
                </div>
        `;

        config.items.forEach(item => {
            const isActive = currentPath.includes(item.href) ? 'active' : '';
            const ariaCurrent = isActive ? 'aria-current="page"' : '';
            html += `
                <a href="${item.href}" class="nav-item ${isActive}" ${ariaCurrent} style="
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.875rem 1.5rem;
                    min-height: 44px;
                    color: var(--color-text-primary);
                    text-decoration: none;
                    background: ${isActive ? 'var(--color-bg-tertiary)' : 'transparent'};
                    border-left: 4px solid ${isActive ? 'var(--color-primary)' : 'transparent'};
                    font-weight: ${isActive ? '600' : '500'};
                    transition: all 0.2s ease;
                ">
                    <span aria-hidden="true" style="font-size: 1.25rem;">${item.icon}</span>
                    <span>${item.label}</span>
                </a>
            `;
        });

        html += `
            </nav>
            <div class="sidebar-footer">
                <a href="/" class="sidebar-footer-link" style="min-height: 44px; display: flex; align-items: center; gap: 0.75rem; text-decoration: none; color: var(--color-text-secondary);">
                    <span style="font-size: 1.25rem;">🌐</span> Back to Public Site
                </a>
                <button onclick="Navigation.handleLogout()"
                    class="sidebar-footer-link sidebar-signout-btn" style="min-height: 44px; display: flex; align-items: center; gap: 0.75rem; width: 100%; background: none; border: none; cursor: pointer; color: var(--color-text-secondary); text-align: left; padding: 0;">
                    <span style="font-size: 1.25rem;">🚪</span> Sign Out
                </button>
            </div>
        `;

        sidebar.innerHTML = html;
        sidebar.className = 'sidebar';

        // Close button inside sidebar (mobile only)
        const closeBtn = sidebar.querySelector('.sidebar-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeSidebar());
        }
    },

    renderHeader(role) {
        const header = document.getElementById('header-top') || document.querySelector('.header-top');
        if (!header) return;

        const user = JSON.parse(localStorage.getItem('wfc_user')) || { name: 'Portal User' };
        const userName = user.business_name || user.organization_name || user.contact_name || user.name || 'User';
        const config = this.config[role] || this.config['small_business'];

        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem;">
                <button id="mobile-toggle" class="mobile-toggle-btn" aria-label="Open navigation menu" aria-expanded="false" aria-controls="sidebar" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; padding: 0; background: transparent; border: none; cursor: pointer; color: var(--color-text-secondary);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <line x1="4" y1="12" x2="20" y2="12"></line>
                        <line x1="4" y1="6" x2="20" y2="6"></line>
                        <line x1="4" y1="18" x2="20" y2="18"></line>
                    </svg>
                </button>
                <div class="header-logo" style="display: flex; align-items: center;">
                    <a href="/labor/dashboard" style="text-decoration: none; display: flex; align-items: center; min-height: 44px;" aria-label="WorkForce Connect Dashboard">
                        <img src="/images/caltrans-logo.png" alt="Caltrans logo" style="height: 32px; width: auto; display: block;" onerror="this.src='/images/favicon.png';">
                        <span style="font-weight: 700; color: var(--color-primary); font-size: 1.1rem; letter-spacing: -0.01em; margin-left: 0.5rem; border-left: 1px solid var(--color-border); padding-left: 0.5rem;">EvoConnect</span>
                    </a>
                </div>
                <span class="header-portal-title" aria-hidden="true" style="font-size: 0.85rem; color: var(--color-text-secondary); margin-left: 0.5rem; display: none;">${config.title}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
                
                <!-- Notification Bell -->
                <div class="notification-container" style="position: relative; margin-right: 10px;">
                    <button id="notification-bell" class="btn btn-outline btn-small" style="position: relative; border-radius: 50%; width: 44px; height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--color-border);" aria-label="Notifications" aria-expanded="false" aria-controls="notification-dropdown" aria-haspopup="true">
                        <span aria-hidden="true" style="font-size: 1.2rem;">🔔</span>
                        <span id="notification-badge" role="status" aria-live="polite" class="badge" style="position: absolute; top: -5px; right: -5px; background: var(--color-error); color: white; display: none; padding: 2px 6px; border-radius: 10px; font-size: 0.7rem; min-width: 18px; text-align: center;">0</span>
                    </button>
                    <div id="notification-dropdown" role="menu" aria-label="Notifications" class="notification-dropdown" style="display: none; position: absolute; top: 100%; right: 0; width: 300px; background: var(--card-bg, #fff); border: 1px solid var(--color-border, #ddd); border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 1000; max-height: 400px; overflow-y: auto; margin-top: 8px;">
                        <div style="padding: 10px; border-bottom: 1px solid var(--color-border, #ddd); font-weight: bold;">Notifications</div>
                        <div id="notification-list" aria-live="polite" style="padding: 10px;">Loading...</div>
                    </div>
                </div>

                <div class="header-user-info" style="display: none;">
                    <div style="font-weight: 600; font-size: 0.9rem; color: var(--color-text-primary);">${userName}</div>
                    <div style="font-size: 0.75rem; color: var(--color-text-secondary); text-transform: capitalize;">${config.title}</div>
                </div>
                <div class="header-avatar" style="width: 44px; height: 44px; border-radius: 50%; background: var(--color-primary-light); color: var(--color-primary); display: flex; align-items: center; justify-content: center; font-weight: bold;">
                    ${userName.charAt(0).toUpperCase()}
                </div>
                <button class="mobile-signout-btn" onclick="Navigation.handleLogout()" aria-label="Sign Out" title="Sign Out" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; font-size: 1.25rem;">
                    🚪
                </button>
            </div>
        `;

        // Update display logic for tablet/desktop
        if (!this._isMobile()) {
            const portalTitle = header.querySelector('.header-portal-title');
            const userInfo = header.querySelector('.header-user-info');
            if (portalTitle) portalTitle.style.display = 'inline';
            if (userInfo) userInfo.style.display = 'block';
        }
    },

    openSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.add('active');
        if (overlay) overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    },

    setupMobileToggle() {
        const toggle = document.getElementById('mobile-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                const isOpen = document.querySelector('.sidebar')?.classList.contains('active');
                if (isOpen) {
                    this.closeSidebar();
                    toggle.setAttribute('aria-expanded', 'false');
                    toggle.setAttribute('aria-label', 'Open navigation menu');
                } else {
                    this.openSidebar();
                    toggle.setAttribute('aria-expanded', 'true');
                    toggle.setAttribute('aria-label', 'Close navigation menu');
                }
            });
        }

        // Esc key closes the sidebar and restores focus
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar && sidebar.classList.contains('active')) {
                    this.closeSidebar();
                    const toggle = document.getElementById('mobile-toggle');
                    if (toggle) {
                        toggle.setAttribute('aria-expanded', 'false');
                        toggle.setAttribute('aria-label', 'Open navigation menu');
                        toggle.focus();
                    }
                }
            }
        });

        // Create overlay for closing sidebar when clicked outside
        if (!document.getElementById('sidebar-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'sidebar-overlay';
            overlay.className = 'sidebar-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            overlay.addEventListener('click', () => this.closeSidebar());
            document.body.appendChild(overlay);
        }
    },

    initNotifications() {
        const user = JSON.parse(localStorage.getItem('wfc_user'));
        if (!user || !user.id) return;
        
        const bell = document.getElementById('notification-bell');
        const dropdown = document.getElementById('notification-dropdown');
        if (!bell || !dropdown) return;

        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.style.display !== 'none';
            dropdown.style.display = isOpen ? 'none' : 'block';
            bell.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!bell.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
                bell.setAttribute('aria-expanded', 'false');
            }
        });

        // Esc key closes dropdown
        dropdown.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                dropdown.style.display = 'none';
                bell.setAttribute('aria-expanded', 'false');
                bell.focus();
            }
        });

        // Start recursive polling
        this.pollNotifications(user.id);
    },

    pollNotifications(userId) {
        this.fetchNotifications(userId).finally(() => {
            this._pollingTimeout = setTimeout(() => {
                this.pollNotifications(userId);
            }, 30000); // 30 seconds
        });
    },

    async fetchNotifications(userId) {
        try {
            const url = window.APP_CONFIG ? window.APP_CONFIG.API_URL : '';
            // Make request without Authorization header initially since it uses session cookies
            const res = await fetch(`${url}/api/notifications`, {
                headers: { 
                    'x-user-id': userId
                }
            });
            
            const list = document.getElementById('notification-list');
            
            if (!res.ok) {
                if (list && list.innerHTML.includes('Loading')) {
                    list.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 10px;">No new notifications</div>';
                }
                return;
            }
            
            const notifications = await res.json();
            const badge = document.getElementById('notification-badge');
            
            if (badge) {
                if (notifications.length > 0) {
                    badge.textContent = notifications.length;
                    badge.style.display = 'block';
                } else {
                    badge.style.display = 'none';
                }
            }

            if (list) {
                if (notifications.length === 0) {
                    list.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 10px;">No new notifications</div>';
                } else {
                    list.innerHTML = notifications.map(n => `
                        <div class="notification-item" style="padding: 10px; border-bottom: 1px solid var(--color-border); cursor: pointer;" onclick="Navigation.markNotificationRead('${n.id}', '${n.message_id || ''}', '${userId}')">
                            <div style="font-size: 0.8rem; color: var(--color-primary); font-weight: bold;">${n.message_type ? n.message_type.toUpperCase() : 'NEW MESSAGE'}</div>
                            <div style="font-size: 0.9rem;">From: ${n.sender_business_name || 'System'}</div>
                            <div style="font-size: 0.8rem; color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${n.subject || 'No subject'}</div>
                            <div style="font-size: 0.7rem; color: var(--color-text-muted); margin-top: 4px;">${new Date(n.created_at).toLocaleString()}</div>
                        </div>
                    `).join('');
                }
            }
        } catch (e) {
            console.error('Failed to fetch notifications', e);
            const list = document.getElementById('notification-list');
            if (list && list.textContent === 'Loading...') {
                list.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 10px;">No new notifications</div>';
            }
        }
    },

    async markNotificationRead(id, messageId, userId) {
        try {
            const url = window.APP_CONFIG ? window.APP_CONFIG.API_URL : '';
            await fetch(`${url}/api/notifications/${id}/read`, {
                method: 'POST',
                headers: { 
                    'x-user-id': userId
                }
            });
            // Map legacy message URL if applicable
            window.location.href = `/labor/messages${messageId ? '?id=' + messageId : ''}`;
        } catch (e) {
            console.error(e);
        }
    }
};

// Global init trigger — fires if page doesn't call Navigation.init() explicitly
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('wfc_user'));
    if (user && user.type && !window._navInitialized) {
        Navigation.init(user.type);
    }
});
