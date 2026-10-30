/**
 * EVOConnected Navigation Component (Caltrans Parity)
 * Dynamically renders sidebars, top headers, and notifications for all 4 portal roles:
 * worker (Labor), business (Small Business), prime (Prime Contractor), and admin (Admin Console).
 */

const Navigation = {
    escapeText(value) {
        return String(value ?? '').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
    },
    config: {
        worker: {
            title: 'Labor Portal',
            dashboardHref: '/labor/dashboard',
            messagesHref: '/labor/messages',
            items: [
                { label: 'Small Business Directory', href: '/labor/directory/business', icon: '🔗' },
                { label: 'Dashboard',             href: '/labor/dashboard',       icon: '🏠' },
                { label: 'Find Jobs',  href: '/labor/search',          icon: '🔍' },
                { label: 'My Applications',       href: '/labor/applications',    icon: '📋' },
                { label: 'Saved Opportunities',   href: '/labor/saved',           icon: '⭐' },
                { label: 'Connection Requests',   href: '/labor/connections',     icon: '🤝' },
                { label: 'Messages',              href: '/labor/messages',        icon: '✉️' },
                { label: 'My Profile',            href: '/labor/profile',         icon: '👤' },
                { label: 'Readiness Checklist',   href: '/labor/checklist',       icon: '✅' },
                { label: 'Resources',             href: '/labor/resources',       icon: '📚' },
                { label: 'Settings',              href: '/labor/settings',        icon: '⚙️' },
                { label: 'Help & FAQ',            href: '/labor/faq',             icon: '❓' }
            ]
        },
        business: {
            title: 'Small Business Portal',
            dashboardHref: '/business/dashboard',
            messagesHref: '/business/messages',
            items: [
                { label: 'Post a Job', href: '/business/post-job', icon: '🔗' },
                { label: 'Manage Jobs', href: '/business/jobs', icon: '🔗' },
                { label: 'Review Job Applications', href: '/business/job-applications', icon: '🔗' },
                { label: 'Labor Directory', href: '/business/directory/worker', icon: '🔗' },
                { label: 'Prime Directory', href: '/business/directory/prime', icon: '🔗' },
                { label: 'Dashboard',             href: '/business/dashboard',            icon: '🏠' },
                { label: 'Search Opportunities',  href: '/business/search',               icon: '🔍' },
                { label: 'My Applications',       href: '/business/applications',         icon: '📋' },
                { label: 'Saved Opportunities',   href: '/business/saved',                icon: '⭐' },
                { label: 'Connection Requests',   href: '/business/connections',          icon: '🤝' },
                { label: 'Messages',              href: '/business/messages',             icon: '✉️' },
                { label: 'My Profile',            href: '/business/profile',              icon: '👤' },
                { label: 'Readiness Checklist',   href: '/business/checklist',            icon: '✅' },
                { label: 'Resources',             href: '/business/resources',            icon: '📚' },
                { label: 'Settings',              href: '/business/settings',             icon: '⚙️' },
                { label: 'Help & FAQ',            href: '/business/faq',                  icon: '❓' }
            ]
        },
        prime: {
            title: 'Prime Contractor Portal',
            dashboardHref: '/prime/dashboard',
            messagesHref: '/prime/messages',
            items: [
                { label: 'Dashboard',               href: '/prime/dashboard',          icon: '🏠' },
                { label: 'Post RFQ',                href: '/prime/post-rfq',   icon: '➕' },
                { label: 'Manage RFQs',             href: '/prime/opportunities',      icon: '📂' },
                { label: 'View Applications',       href: '/prime/applications',       icon: '📝' },
                { label: 'Search Small Businesses', href: '/prime/search/businesses',  icon: '🏢' },
                { label: 'Connections',             href: '/prime/connections',        icon: '🤝' },
                { label: 'Messages',                href: '/prime/messages',           icon: '📬' },
                { label: 'Analytics',               href: '/prime/analytics',          icon: '📈' },
                { label: 'My Profile',              href: '/prime/profile/edit',       icon: '👤' },
                { label: 'Settings',                href: '/prime/settings',           icon: '⚙️' },
                { label: 'Help & FAQ',              href: '/prime/faq',                icon: '❓' }
            ]
        },
        admin: {
            title: 'Admin Console',
            dashboardHref: '/admin/dashboard',
            messagesHref: '/admin/messages',
            items: [
                { label: 'Dashboard',            href: '/admin/dashboard',      icon: '🏠' },
                { label: 'User Management',      href: '/admin/users',          icon: '👥' },
                { label: 'Prime Approvals',      href: '/admin/approvals',      icon: '🛡️' },
                { label: 'Opportunity Manager',  href: '/admin/opportunities',  icon: '💼' },
                { label: 'NAICS Codes',          href: '/admin/naics',          icon: '🏷️' },
                { label: 'Resource Library',     href: '/admin/resources',      icon: '📚' },
                { label: 'Announcements',        href: '/admin/announcements',  icon: '📢' },
                { label: 'Analytics',            href: '/admin/analytics',      icon: '📊' },
                { label: 'Messages',             href: '/admin/messages',       icon: '📬' },
                { label: 'Content Management',   href: '/admin-cms',            icon: '🖊️' },
                { label: 'Reported Issues',      href: '/admin/issues',         icon: '🚨' },
                { label: 'Admin Guide',          href: '/admin/tutorial',       icon: '📘' },
                { label: 'CMS Guide',            href: '/admin/cms-tutorial',   icon: '📝' }
            ]
        }
    },

    _normalizeRole(role) {
        const map = {
            'worker': 'worker',
            'labor': 'worker',
            'business': 'business',
            'businesse': 'business',
            'small_business': 'business',
            'vendor': 'business',
            'prime': 'prime',
            'prime_contractor': 'prime',
            'agency': 'prime',
            'admin': 'admin',
            'wfc_admin': 'admin',
            'staff': 'admin'
        };
        return map[role] || 'worker';
    },

    _isMobile() {
        return window.innerWidth <= 1024;
    },

    init(role) {
        if (!role) {
            try {
                const user = JSON.parse(localStorage.getItem('wfc_user'));
                role = user ? user.type : 'worker';
            } catch {
                role = 'worker';
            }
        }

        role = this._normalizeRole(role);
        this._currentRole = role;

        this.renderSidebar(role);
        this.renderHeader(role);
        this.setupMobileToggle();
        this.initNotifications(role);

        window._navInitialized = true;
    },

    handleLogout() {
        localStorage.removeItem('wfc_user');
        localStorage.removeItem('caltrans_user');
        localStorage.removeItem('caltrans_token');
        window.location.href = '/logout';
    },

    renderSidebar(role) {
        const sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
        if (!sidebar || sidebar.children.length > 0) return;

        const config = this.config[role] || this.config['worker'];
        const currentPath = window.location.pathname;

        let html = `
            <div class="sidebar-brand" style="display: flex; justify-content: flex-end;">
                <button class="sidebar-close-btn" aria-label="Close menu">&times;</button>
            </div>
            <nav class="sidebar-nav" style="padding: 1rem 0; flex: 1; overflow-y: auto;">
                <div style="padding: 0 1.5rem 0.5rem; font-size: 0.75rem; text-transform: uppercase; color: var(--color-text-secondary); font-weight: 700;">
                    ${config.title}
                </div>
        `;

        config.items.forEach(item => {
            const isExact = currentPath === item.href;
            const isSub = item.href !== config.dashboardHref && currentPath.startsWith(item.href);
            const isActive = (isExact || isSub) ? 'active' : '';
            const ariaCurrent = isActive ? 'aria-current="page"' : '';
            html += `
                <a href="${item.href}" class="nav-item ${isActive}" ${ariaCurrent}>
                    <span aria-hidden="true" style="font-size: 1.2rem;">${item.icon}</span>
                    <span>${item.label}</span>
                </a>
            `;
        });

        html += `
            </nav>
            <div class="sidebar-footer">
                <a href="/?public=1" class="sidebar-footer-link">
                    <span style="font-size: 1.2rem;">🌐</span> Back to Public Site
                </a>
                <a href="/logout" onclick="localStorage.removeItem('wfc_user');" class="sidebar-footer-link sidebar-signout-btn">
                    <span style="font-size: 1.2rem;">🚪</span> Sign Out
                </a>
            </div>
        `;

        sidebar.innerHTML = html;
        sidebar.className = 'sidebar';

        const closeBtn = sidebar.querySelector('.sidebar-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeSidebar());
        }
    },

    renderHeader(role) {
        const header = document.getElementById('header-top') || document.querySelector('.header-top');
        if (!header || header.children.length > 0) return;

        let user = { name: 'Portal User' };
        try {
            user = JSON.parse(localStorage.getItem('wfc_user')) || user;
        } catch {}
        const userName = user.business_name || user.organization_name || user.contact_name || user.name || 'User';
        const config = this.config[role] || this.config['worker'];

        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem;">
                <button id="mobile-toggle" class="mobile-toggle-btn" aria-label="Open navigation menu" aria-expanded="false" aria-controls="sidebar">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <line x1="4" y1="12" x2="20" y2="12"></line>
                        <line x1="4" y1="6" x2="20" y2="6"></line>
                        <line x1="4" y1="18" x2="20" y2="18"></line>
                    </svg>
                </button>
                <div class="header-logo" style="display: flex; align-items: center;">
                    <a href="/" style="text-decoration: none; display: flex; align-items: center; min-height: 44px;" aria-label="EVOConnected Home">
                        <img src="/images/logo.png" alt="EVOConnected logo" style="height: 32px; width: auto; display: block;" onerror="this.src='/images/favicon.png';">
                        <span style="font-weight: 700; color: var(--color-primary); font-size: 1.1rem; letter-spacing: -0.01em; margin-left: 0.5rem; border-left: 1px solid var(--color-border); padding-left: 0.5rem;">EVOConnected</span>
                    </a>
                </div>
                <span class="header-portal-title" aria-hidden="true" style="font-size: 0.85rem; color: var(--color-text-secondary); margin-left: 0.5rem;">${config.title}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <a href="/logout" onclick="localStorage.removeItem('wfc_user');" class="btn btn-sm btn-secondary">🚪 Sign Out</a>
            </div>
        `;
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
        if (this._mobileSetupDone) return;
        this._mobileSetupDone = true;

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

        if (!document.getElementById('sidebar-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'sidebar-overlay';
            overlay.className = 'sidebar-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            overlay.addEventListener('click', () => this.closeSidebar());
            document.body.appendChild(overlay);
        }
    },

    initNotifications(role) {
        if (this._notifSetupDone) return;
        this._notifSetupDone = true;

        let user = null;
        try { user = JSON.parse(localStorage.getItem('wfc_user')); } catch {}
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

        document.addEventListener('click', (e) => {
            if (!bell.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
                bell.setAttribute('aria-expanded', 'false');
            }
        });

        dropdown.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                dropdown.style.display = 'none';
                bell.setAttribute('aria-expanded', 'false');
                bell.focus();
            }
        });

        this.pollNotifications(user.id, role);
    },

    pollNotifications(userId, role) {
        this.fetchNotifications(userId, role).finally(() => {
            this._pollingTimeout = setTimeout(() => {
                this.pollNotifications(userId, role);
            }, 30000);
        });
    },

    async fetchNotifications(userId, role) {
        try {
            const res = await fetch('/api/notifications', {
                credentials: 'include',
                headers: { 'x-user-id': userId }
            });

            const list = document.getElementById('notification-list');
            if (!res.ok) {
                if (list) list.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 10px;">No new notifications</div>';
                return;
            }

            const notifications = await res.json();
            const unread = Array.isArray(notifications) ? notifications.filter(n => !n.is_read) : [];
            const badge = document.getElementById('notification-badge');

            if (badge) {
                if (unread.length > 0) {
                    badge.textContent = unread.length;
                    badge.style.display = 'block';
                } else {
                    badge.style.display = 'none';
                }
            }

            // Announce only when unread count goes up, so screen reader users
            // aren't told "no new notifications" on every 30s poll.
            const announcer = document.getElementById('notification-announcer');
            if (announcer && typeof this._lastUnreadCount === 'number' && unread.length > this._lastUnreadCount) {
                announcer.textContent = unread.length === 1
                    ? '1 new notification'
                    : `${unread.length} new notifications`;
            }
            this._lastUnreadCount = unread.length;

            if (list) {
                if (!Array.isArray(notifications) || notifications.length === 0) {
                    list.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 10px;">No new notifications</div>';
                } else {
                    list.innerHTML = notifications.map(n => `
                        <div class="notification-item" style="padding: 10px; border-bottom: 1px solid var(--color-border, #eee); cursor: pointer;" onclick="Navigation.markNotificationRead('${n.id}', '${n.message_id || ''}')">
                            <div style="font-size: 0.75rem; color: var(--color-primary); font-weight: 700;">${this.escapeText(String(n.type || n.message_type || 'NOTIFICATION').toUpperCase())}</div>
                            <div style="font-size: 0.85rem; color: var(--color-text-secondary);">${this.escapeText(n.message || n.subject || 'New platform update')}</div>
                            <div style="font-size: 0.7rem; color: var(--color-text-muted); margin-top: 4px;">${n.created_at ? new Date(n.created_at).toLocaleString() : ''}</div>
                        </div>
                    `).join('');
                }
            }
        } catch (e) {
            const list = document.getElementById('notification-list');
            if (list) list.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 10px;">No new notifications</div>';
        }
    },

    async markNotificationRead(id, messageId) {
        const config = this.config[this._currentRole] || this.config['worker'];
        try {
            await fetch(`/api/notifications/${id}/read`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (e) {}
        window.location.href = `${config.messagesHref}${messageId ? '?id=' + messageId : ''}`;
    }
};
