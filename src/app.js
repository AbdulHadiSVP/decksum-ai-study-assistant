/**
 * DeckSum - Application Coordinator (Core Controller)
 * Manages global state, routing, component mounting, and JWT authentication.
 */

import { api } from './utils/api.js';

// Import views
import { renderDashboard } from './components/dashboard.js';
import { renderUpload } from './components/upload.js';
import { renderSummary } from './components/summary.js';
import { renderFlashcards } from './components/flashcards.js';
import { renderQuiz } from './components/quiz.js';
import { renderChat } from './components/chat.js';
import { renderAnalytics } from './components/analytics.js';
import { renderSettings } from './components/settings.js';
import { renderAdmin } from './components/admin.js';

class DeckSumApp {
    constructor() {
        this.state = {
            documents: [],          // Parsed document details
            activeDocId: localStorage.getItem('decksum_active_doc_id') || null,      // Active document for study
            flashcards: [],         // All flashcards
            quizHistory: [],        // Records of all quizzes taken
            settings: {
                provider: 'mock',
                apiKey: '',
                theme: localStorage.getItem('decksum_theme') || 'dark'
            },
            analytics: {
                dailyStudyMinutes: {},
                streakCount: 0,
                lastActiveDate: null
            },
            currentTab: 'dashboard',
            notifications: []       // Toast reminders
        };
        
        this.sessionStart = Date.now();
        this.initTheme();
        this.trackTimeInterval = null;
        this.notificationPollInterval = null;
        
        // Listen to auth changes
        window.addEventListener('auth_change', () => {
            this.handleAuthChange();
        });
    }

    initTheme() {
        document.body.className = this.state.settings.theme === 'light' ? 'light-theme' : 'dark-theme';
    }

    toggleTheme() {
        this.state.settings.theme = this.state.settings.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('decksum_theme', this.state.settings.theme);
        this.initTheme();
        this.renderHeaderActions();
    }


    startStudyTimer() {
        if (this.trackTimeInterval) clearInterval(this.trackTimeInterval);
        
        if (!api.isAuthenticated()) return;
        
        this.trackTimeInterval = setInterval(async () => {
            try {
                await api.request('/api/analytics/study-time', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ minutes: 1 })
                });
                
                // If currently on analytics, refresh analytics values
                if (this.state.currentTab === 'analytics') {
                    const statsStreak = document.getElementById('stat-streak');
                    if (statsStreak) {
                        // Silently load analytics data and update
                        const data = await api.request('/api/analytics');
                        this.state.analytics.dailyStudyMinutes = data.dailyStudyMinutes;
                        this.state.analytics.streakCount = data.streakCount;
                        renderAnalytics(document.getElementById('main-content-body'), this);
                    }
                }
            } catch (err) {
                console.error("Failed to sync study minutes:", err);
            }
        }, 60000); // Sync study duration every minute
    }

    startNotificationPoller() {
        if (this.notificationPollInterval) clearInterval(this.notificationPollInterval);
        
        if (!api.isAuthenticated()) return;
        
        const checkNotifications = async () => {
            try {
                const data = await api.request('/api/notifications');
                this.state.notifications = data;
                this.displayNotifications();
            } catch (err) {
                console.error("Failed to load notifications:", err);
            }
        };

        // Run once immediately and poll every 5 minutes
        checkNotifications();
        this.notificationPollInterval = setInterval(checkNotifications, 300000);
    }

    displayNotifications() {
        const existingToast = document.getElementById('toast-notification-panel');
        if (existingToast) existingToast.remove();

        if (this.state.notifications.length === 0) return;

        const notif = this.state.notifications[0]; // Take primary reminder
        const appRoot = document.getElementById('app');
        if (!appRoot) return;

        const toast = document.createElement('div');
        toast.id = 'toast-notification-panel';
        toast.className = 'glass-card';
        toast.style.position = 'fixed';
        toast.style.bottom = '24px';
        toast.style.right = '24px';
        toast.style.zIndex = '1000';
        toast.style.width = '350px';
        toast.style.borderLeft = '5px solid var(--color-warning)';
        toast.style.padding = '16px 20px';
        toast.style.boxShadow = 'var(--shadow-md)';
        toast.style.animation = 'slideUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
        
        toast.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
                <div style="display:flex; gap:8px;">
                    <i data-lucide="bell" style="color:var(--color-warning); width:20px; height:20px; flex-shrink:0; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; font-size:0.9rem; color:var(--text-primary);">Revision Reminder</div>
                        <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px; line-height:1.4;">${notif.message}</div>
                    </div>
                </div>
                <button class="btn-icon" id="btn-close-toast" style="width:24px; height:24px; color:var(--text-muted); margin-top:-4px;"><i data-lucide="x"></i></button>
            </div>
        `;

        appRoot.appendChild(toast);
        
        document.getElementById('btn-close-toast').addEventListener('click', () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    setActiveDocument(docId) {
        this.state.activeDocId = docId;
        if (docId) {
            localStorage.setItem('decksum_active_doc_id', docId);
        } else {
            localStorage.removeItem('decksum_active_doc_id');
        }
        this.renderHeaderActions();
        this.render();
    }

    navigateTo(tabId) {
        this.state.currentTab = tabId;
        this.render();
    }

    async handleAuthChange() {
        if (api.isAuthenticated()) {
            await this.loadStateFromServer();
            if (this.state.isAdmin && this.state.currentTab === 'dashboard') {
                this.state.currentTab = 'admin';
            }
            this.initLayout();
            this.render();
            this.startStudyTimer();
            this.startNotificationPoller();
        } else {
            if (this.trackTimeInterval) clearInterval(this.trackTimeInterval);
            if (this.notificationPollInterval) clearInterval(this.notificationPollInterval);
            this.state.currentTab = 'dashboard';
            this.renderLoginScreen();
        }
    }

    async loadStateFromServer() {
        try {
            // Load user profile & preferences
            const profile = await api.request('/api/auth/profile');
            this.state.settings.provider = profile.preferences.provider || 'mock';
            this.state.settings.apiKey = profile.preferences.apiKey || '';
            this.state.isAdmin = !!profile.is_admin;
            
            // Load documents list
            this.state.documents = await api.request('/api/documents');
            
            // Ensure active doc id is valid, if not fallback to first document or null
            if (this.state.activeDocId && !this.state.documents.some(d => d.id === this.state.activeDocId)) {
                this.state.activeDocId = this.state.documents.length > 0 ? this.state.documents[0].id : null;
            } else if (!this.state.activeDocId && this.state.documents.length > 0) {
                this.state.activeDocId = this.state.documents[0].id;
            }
            
            // Load flashcards
            this.state.flashcards = await api.request('/api/flashcards');

            // Load analytics dashboard metrics
            const analyticsData = await api.request('/api/analytics');
            this.state.analytics.dailyStudyMinutes = analyticsData.dailyStudyMinutes;
            this.state.analytics.streakCount = analyticsData.streakCount;
            this.state.quizHistory = analyticsData.quizHistory;
            
        } catch (err) {
            console.error("Failed to load user state from server:", err);
        }
    }

    // Main layouts
    initLayout() {
        const appRoot = document.getElementById('app');
        appRoot.innerHTML = `
            <div class="glow-orb orb-1"></div>
            <div class="glow-orb orb-2"></div>
            
            <div class="app-container">
                <!-- Sidebar Nav -->
                <aside class="app-sidebar">
                    <div class="sidebar-brand">
                        <div class="sidebar-logo">
                            <i data-lucide="graduation-cap"></i>
                        </div>
                        <div class="sidebar-title">DeckSum</div>
                    </div>
                    
                    <nav class="sidebar-nav">
                        ${!this.state.isAdmin ? `
                        <a class="nav-item" data-tab="dashboard">
                            <i data-lucide="layout-dashboard" class="nav-icon"></i>
                            Dashboard
                        </a>
                        <a class="nav-item" data-tab="upload">
                            <i data-lucide="upload-cloud" class="nav-icon"></i>
                            Study Material
                        </a>
                        <a class="nav-item" data-tab="summary">
                            <i data-lucide="book-open" class="nav-icon"></i>
                            AI Summary
                        </a>
                        <a class="nav-item" data-tab="flashcards">
                            <i data-lucide="layers" class="nav-icon"></i>
                            Flashcards
                        </a>
                        <a class="nav-item" data-tab="quiz">
                            <i data-lucide="check-square" class="nav-icon"></i>
                            Practice Quizzes
                        </a>
                        <a class="nav-item" data-tab="chat">
                            <i data-lucide="message-square" class="nav-icon"></i>
                            Document Q&A
                        </a>
                        <a class="nav-item" data-tab="analytics">
                            <i data-lucide="bar-chart-3" class="nav-icon"></i>
                            Analytics
                        </a>
                        <a class="nav-item" data-tab="settings">
                            <i data-lucide="settings" class="nav-icon"></i>
                            Settings
                        </a>
                        ` : ''}
                        ${this.state.isAdmin ? `
                        <a class="nav-item" data-tab="admin">
                            <i data-lucide="shield-check" class="nav-icon"></i>
                            Admin Control
                        </a>
                        ` : ''}
                    </nav>
                    
                    <div class="sidebar-footer">
                        <div class="user-profile glass-card" style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:12px; overflow:hidden;">
                                <div class="avatar" id="sidebar-user-avatar">AS</div>
                                <div class="user-info">
                                    <div class="user-name" id="sidebar-user-name">Active Student</div>
                                    <div class="user-role">${this.state.isAdmin ? 'Administrator' : 'Scholar'}</div>
                                </div>
                            </div>
                            <button class="btn-icon danger" id="btn-logout" title="Sign Out" style="width:28px; height:28px;"><i data-lucide="log-out"></i></button>
                        </div>
                    </div>
                </aside>
                
                <!-- Main Content Pane -->
                <main class="app-main">
                    <header class="app-header">
                        <div class="header-title-container">
                            <h1 id="header-tab-title">Dashboard</h1>
                        </div>
                        <div class="header-actions">
                            <div id="active-document-badge"></div>
                            <button class="btn-theme-toggle" id="theme-toggle" title="Toggle Theme">
                                <!-- Dynamic icon -->
                            </button>
                        </div>
                    </header>
                    
                    <div class="content-body" id="main-content-body">
                        <!-- Dynamic View Content goes here -->
                    </div>
                </main>
            </div>
        `;

        // User profile customization
        const username = api.getUsername();
        document.getElementById('sidebar-user-name').textContent = username;
        const initials = username.substring(0, 2).toUpperCase();
        document.getElementById('sidebar-user-avatar').textContent = initials;

        // Register Navigation Click Event listeners
        const navLinks = document.querySelectorAll('.nav-item');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const tabId = link.getAttribute('data-tab');
                this.navigateTo(tabId);
            });
        });

        // Theme Switcher Hook
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Logout Hook
        document.getElementById('btn-logout').addEventListener('click', () => {
            if (confirm("Are you sure you want to sign out?")) {
                api.logout();
            }
        });
    }

    renderLoginScreen() {
        const appRoot = document.getElementById('app');
        appRoot.innerHTML = `
            <div class="glow-orb orb-1"></div>
            <div class="glow-orb orb-2"></div>
            
            <div style="display:flex; justify-content:center; align-items:center; min-height:100vh; width:100vw; padding:20px; z-index:10; position:relative;">
                <div class="glass-card" id="auth-card" style="width:100%; max-width:440px; padding:36px; border-radius:var(--border-radius-lg); text-align:center; box-shadow:var(--shadow-md); transition: all 0.3s ease;">
                    <!-- Content will be rendered dynamically -->
                </div>
            </div>
        `;
        
        let authState = 'login'; // 'login', 'register', 'forgot-username', 'forgot-reset'
        let resetUsername = '';
        let resetQuestion = '';
        
        const PREDEFINED_QUESTIONS = [
            "What was the name of your first school?",
            "What is the name of your favorite pet?",
            "In what city or town did your parents meet?",
            "What was your favorite childhood book?",
            "What is your mother's maiden name?",
            "What was the make and model of your first car?"
        ];

        const updateUI = () => {
            const card = document.getElementById('auth-card');
            if (!card) return;
            
            if (authState === 'login') {
                card.innerHTML = `
                    <div class="sidebar-logo" style="margin: 0 auto 20px; width:52px; height:52px; border-radius:12px;">
                        <i data-lucide="graduation-cap" style="width:28px; height:28px;"></i>
                    </div>
                    <h2 style="font-size:1.8rem; margin-bottom:8px;">Welcome to DeckSum</h2>
                    <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:28px;">Sign in to sync your study deck and analytics.</p>
                    
                    <div id="auth-error-msg" style="display:none; padding:12px; margin-bottom:18px; border-radius:var(--border-radius-sm); font-size:0.85rem; text-align:left; background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.25); color:var(--color-danger); animation:slideUp 0.2s ease;"></div>
                    
                    <form id="auth-form" style="display:flex; flex-direction:column; gap:16px;">
                        <div class="form-group" style="text-align:left; margin-bottom:0;">
                            <label class="form-label" for="auth-username">Username</label>
                            <input type="text" id="auth-username" class="form-input" placeholder="Enter username..." required autocomplete="username">
                        </div>
                        
                        <div class="form-group" style="text-align:left; margin-bottom:0;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <label class="form-label" for="auth-password" style="margin-bottom:0;">Password</label>
                                <a href="#" id="auth-forgot-link" style="color:var(--accent-primary); font-size:0.75rem; text-decoration:none; font-weight:500;">Forgot password?</a>
                            </div>
                            <input type="password" id="auth-password" class="form-input" placeholder="Enter password..." required autocomplete="current-password">
                        </div>
                        
                        <button type="submit" class="btn-primary" id="btn-auth-submit" style="width:100%; padding:14px; margin-top:10px;">Sign In</button>
                    </form>
                    
                    <div style="margin-top:24px; font-size:0.85rem; color:var(--text-secondary);">
                        <span>Don't have an account?</span>
                        <a href="#" id="auth-toggle-register" style="color:var(--accent-primary); font-weight:600; text-decoration:none; margin-left:4px;">Register here</a>
                    </div>
                `;
            } else if (authState === 'register') {
                card.innerHTML = `
                    <div class="sidebar-logo" style="margin: 0 auto 20px; width:52px; height:52px; border-radius:12px;">
                        <i data-lucide="graduation-cap" style="width:28px; height:28px;"></i>
                    </div>
                    <h2 style="font-size:1.8rem; margin-bottom:8px;">Create Account</h2>
                    <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:24px;">Sign up to track and optimize your spaced repetitions.</p>
                    
                    <div id="auth-error-msg" style="display:none; padding:12px; margin-bottom:18px; border-radius:var(--border-radius-sm); font-size:0.85rem; text-align:left; background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.25); color:var(--color-danger); animation:slideUp 0.2s ease;"></div>
                    
                    <form id="auth-form" style="display:flex; flex-direction:column; gap:16px;">
                        <div class="form-group" style="text-align:left; margin-bottom:0;">
                            <label class="form-label" for="auth-username">Username</label>
                            <input type="text" id="auth-username" class="form-input" placeholder="Choose a username..." required autocomplete="username">
                        </div>
                        
                        <div class="form-group" style="text-align:left; margin-bottom:0;">
                            <label class="form-label" for="auth-password">Password</label>
                            <input type="password" id="auth-password" class="form-input" placeholder="Create a password..." required autocomplete="new-password">
                        </div>

                        <div class="form-group" style="text-align:left; margin-bottom:0;">
                            <label class="form-label" for="auth-security-question">Security Question</label>
                            <select id="auth-security-question" class="form-select" style="width:100%;" required>
                                <option value="" disabled selected>Select a recovery question...</option>
                                ${PREDEFINED_QUESTIONS.map(q => `<option value="${q}">${q}</option>`).join('')}
                                <option value="custom">Custom Question...</option>
                            </select>
                        </div>

                        <div class="form-group" id="auth-custom-question-group" style="text-align:left; margin-bottom:0; display:none;">
                            <label class="form-label" for="auth-custom-question">Custom Security Question</label>
                            <input type="text" id="auth-custom-question" class="form-input" placeholder="Enter custom question...">
                        </div>

                        <div class="form-group" style="text-align:left; margin-bottom:0;">
                            <label class="form-label" for="auth-security-answer">Security Answer</label>
                            <input type="text" id="auth-security-answer" class="form-input" placeholder="Enter security answer..." required>
                        </div>
                        
                        <button type="submit" class="btn-primary" id="btn-auth-submit" style="width:100%; padding:14px; margin-top:10px;">Create Account</button>
                    </form>
                    
                    <div style="margin-top:24px; font-size:0.85rem; color:var(--text-secondary);">
                        <span>Already registered?</span>
                        <a href="#" id="auth-toggle-login" style="color:var(--accent-primary); font-weight:600; text-decoration:none; margin-left:4px;">Sign in here</a>
                    </div>
                `;
                
                // Show/hide custom question input
                const questionSelect = document.getElementById('auth-security-question');
                const customGroup = document.getElementById('auth-custom-question-group');
                const customInput = document.getElementById('auth-custom-question');
                questionSelect.addEventListener('change', (e) => {
                    if (e.target.value === 'custom') {
                        customGroup.style.display = 'block';
                        customInput.required = true;
                    } else {
                        customGroup.style.display = 'none';
                        customInput.required = false;
                        customInput.value = '';
                    }
                });
            } else if (authState === 'forgot-username') {
                card.innerHTML = `
                    <div class="sidebar-logo" style="margin: 0 auto 20px; width:52px; height:52px; border-radius:12px;">
                        <i data-lucide="graduation-cap" style="width:28px; height:28px;"></i>
                    </div>
                    <h2 style="font-size:1.8rem; margin-bottom:8px;">Reset Password</h2>
                    <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:28px;">Enter your username to fetch your security question.</p>
                    
                    <div id="auth-error-msg" style="display:none; padding:12px; margin-bottom:18px; border-radius:var(--border-radius-sm); font-size:0.85rem; text-align:left; background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.25); color:var(--color-danger); animation:slideUp 0.2s ease;"></div>
                    
                    <form id="auth-form" style="display:flex; flex-direction:column; gap:16px;">
                        <div class="form-group" style="text-align:left; margin-bottom:0;">
                            <label class="form-label" for="auth-username">Username</label>
                            <input type="text" id="auth-username" class="form-input" placeholder="Enter username..." required autocomplete="username">
                        </div>
                        
                        <button type="submit" class="btn-primary" id="btn-auth-submit" style="width:100%; padding:14px; margin-top:10px;">Next</button>
                    </form>
                    
                    <div style="margin-top:24px; font-size:0.85rem; color:var(--text-secondary);">
                        <a href="#" id="auth-toggle-login" style="color:var(--accent-primary); font-weight:600; text-decoration:none;">Back to Sign In</a>
                    </div>
                `;
            } else if (authState === 'forgot-reset') {
                card.innerHTML = `
                    <div class="sidebar-logo" style="margin: 0 auto 20px; width:52px; height:52px; border-radius:12px;">
                        <i data-lucide="graduation-cap" style="width:28px; height:28px;"></i>
                    </div>
                    <h2 style="font-size:1.8rem; margin-bottom:8px;">Reset Password</h2>
                    <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:20px;">Answering security question for scholar <strong>${resetUsername}</strong></p>
                    
                    <div id="auth-error-msg" style="display:none; padding:12px; margin-bottom:18px; border-radius:var(--border-radius-sm); font-size:0.85rem; text-align:left; background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.25); color:var(--color-danger); animation:slideUp 0.2s ease;"></div>
                    
                    <div class="glass-card" style="padding:16px; margin-bottom:16px; text-align:left; background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:var(--border-radius-sm);">
                        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600; margin-bottom:4px;">Security Question</div>
                        <div style="font-size:0.9rem; color:var(--text-primary); font-weight:500; line-height:1.4;">${resetQuestion}</div>
                    </div>

                    <form id="auth-form" style="display:flex; flex-direction:column; gap:16px;">
                        <div class="form-group" style="text-align:left; margin-bottom:0;">
                            <label class="form-label" for="auth-security-answer">Your Answer</label>
                            <input type="text" id="auth-security-answer" class="form-input" placeholder="Enter answer..." required>
                        </div>

                        <div class="form-group" style="text-align:left; margin-bottom:0;">
                            <label class="form-label" for="auth-password">New Password</label>
                            <input type="password" id="auth-password" class="form-input" placeholder="At least 6 characters..." required autocomplete="new-password">
                        </div>

                        <div class="form-group" style="text-align:left; margin-bottom:0;">
                            <label class="form-label" for="auth-confirm-password">Confirm Password</label>
                            <input type="password" id="auth-confirm-password" class="form-input" placeholder="Confirm new password..." required autocomplete="new-password">
                        </div>
                        
                        <button type="submit" class="btn-primary" id="btn-auth-submit" style="width:100%; padding:14px; margin-top:10px;">Reset Password</button>
                    </form>
                    
                    <div style="margin-top:24px; font-size:0.85rem; color:var(--text-secondary);">
                        <a href="#" id="auth-toggle-login" style="color:var(--accent-primary); font-weight:600; text-decoration:none;">Cancel and Sign In</a>
                    </div>
                `;
            }

            if (window.lucide) window.lucide.createIcons();
            
            // Wire up event listeners
            const form = document.getElementById('auth-form');
            const submitBtn = document.getElementById('btn-auth-submit');
            const errorMsg = document.getElementById('auth-error-msg');
            
            // Toggle buttons mapping
            const toggleLogin = document.getElementById('auth-toggle-login');
            if (toggleLogin) {
                toggleLogin.addEventListener('click', (e) => {
                    e.preventDefault();
                    authState = 'login';
                    updateUI();
                });
            }
            
            const toggleRegister = document.getElementById('auth-toggle-register');
            if (toggleRegister) {
                toggleRegister.addEventListener('click', (e) => {
                    e.preventDefault();
                    authState = 'register';
                    updateUI();
                });
            }

            const forgotLink = document.getElementById('auth-forgot-link');
            if (forgotLink) {
                forgotLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    authState = 'forgot-username';
                    updateUI();
                });
            }

            // Form Submit handler
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                errorMsg.style.display = 'none';
                submitBtn.disabled = true;
                
                if (authState === 'login') {
                    submitBtn.textContent = "Signing In...";
                    const username = document.getElementById('auth-username').value.trim();
                    const password = document.getElementById('auth-password').value;
                    try {
                        await api.login(username, password);
                    } catch (err) {
                        errorMsg.style.display = 'block';
                        errorMsg.textContent = err.message;
                        submitBtn.disabled = false;
                        submitBtn.textContent = "Sign In";
                    }
                } else if (authState === 'register') {
                    submitBtn.textContent = "Creating Account...";
                    const username = document.getElementById('auth-username').value.trim();
                    const password = document.getElementById('auth-password').value;
                    
                    const questionSelect = document.getElementById('auth-security-question');
                    let question = questionSelect.value;
                    if (question === 'custom') {
                        question = document.getElementById('auth-custom-question').value.trim();
                    }
                    const answer = document.getElementById('auth-security-answer').value.trim();
                    
                    if (!question) {
                        errorMsg.style.display = 'block';
                        errorMsg.textContent = "Please select or write a security question.";
                        submitBtn.disabled = false;
                        submitBtn.textContent = "Create Account";
                        return;
                    }
                    if (!answer) {
                        errorMsg.style.display = 'block';
                        errorMsg.textContent = "Security answer is required.";
                        submitBtn.disabled = false;
                        submitBtn.textContent = "Create Account";
                        return;
                    }

                    try {
                        await api.register(username, password, question, answer);
                        alert("Account created successfully! Please sign in.");
                        authState = 'login';
                        updateUI();
                    } catch (err) {
                        errorMsg.style.display = 'block';
                        errorMsg.textContent = err.message;
                        submitBtn.disabled = false;
                        submitBtn.textContent = "Create Account";
                    }
                } else if (authState === 'forgot-username') {
                    submitBtn.textContent = "Fetching Question...";
                    const username = document.getElementById('auth-username').value.trim();
                    try {
                        const res = await fetch(`/api/auth/forgot-password/question`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ username })
                        });
                        if (!res.ok) {
                            const err = await res.json().catch(() => ({ detail: "Not Found" }));
                            if (res.status === 404 && err.detail === "Not Found") {
                                throw new Error("API Endpoint not found. Please restart your backend server to load the new changes.");
                            }
                            throw new Error(err.detail || "Failed to fetch question.");
                        }
                        const data = await res.json();
                        resetUsername = username;
                        resetQuestion = data.security_question;
                        authState = 'forgot-reset';
                        updateUI();
                    } catch (err) {
                        errorMsg.style.display = 'block';
                        errorMsg.textContent = err.message;
                        submitBtn.disabled = false;
                        submitBtn.textContent = "Next";
                    }
                } else if (authState === 'forgot-reset') {
                    const answer = document.getElementById('auth-security-answer').value.trim();
                    const newPassword = document.getElementById('auth-password').value;
                    const confirmPassword = document.getElementById('auth-confirm-password').value;
                    
                    if (newPassword !== confirmPassword) {
                        errorMsg.style.display = 'block';
                        errorMsg.textContent = "Passwords do not match.";
                        submitBtn.disabled = false;
                        return;
                    }
                    if (newPassword.length < 6) {
                        errorMsg.style.display = 'block';
                        errorMsg.textContent = "Password must be at least 6 characters.";
                        submitBtn.disabled = false;
                        return;
                    }
                    
                    submitBtn.textContent = "Resetting Password...";
                    try {
                        const res = await fetch(`/api/auth/forgot-password/reset`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                username: resetUsername,
                                security_answer: answer,
                                new_password: newPassword
                            })
                        });
                        if (!res.ok) {
                            const err = await res.json().catch(() => ({ detail: "Not Found" }));
                            if (res.status === 404 && err.detail === "Not Found") {
                                throw new Error("API Endpoint not found. Please restart your backend server to load the new changes.");
                            }
                            throw new Error(err.detail || "Failed to reset password.");
                        }
                        const data = await res.json();
                        alert(data.message || "Password successfully reset! Please sign in.");
                        authState = 'login';
                        updateUI();
                    } catch (err) {
                        errorMsg.style.display = 'block';
                        errorMsg.textContent = err.message;
                        submitBtn.disabled = false;
                        submitBtn.textContent = "Reset Password";
                    }
                }
            });
        };

        updateUI();
    }

    renderHeaderActions() {
        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            const iconName = this.state.settings.theme === 'light' ? 'moon' : 'sun';
            toggleBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
        }

        const badgeContainer = document.getElementById('active-document-badge');
        if (badgeContainer) {
            const activeDoc = this.state.documents.find(d => d.id === this.state.activeDocId);
            if (activeDoc) {
                badgeContainer.innerHTML = `
                    <div class="doc-selector-badge" id="header-doc-badge">
                        <div class="badge-dot"></div>
                        <span>Studying: ${activeDoc.name.length > 25 ? activeDoc.name.substring(0, 25) + '...' : activeDoc.name}</span>
                    </div>
                `;
                document.getElementById('header-doc-badge').addEventListener('click', () => {
                    this.navigateTo('upload');
                });
            } else if (this.state.currentTab === 'admin') {
                badgeContainer.innerHTML = '';
            } else {
                badgeContainer.innerHTML = `
                    <div class="doc-selector-badge" style="border-color: var(--color-warning);" id="header-doc-badge">
                        <div class="badge-dot" style="background: var(--color-warning); box-shadow: 0 0 8px var(--color-warning);"></div>
                        <span>No Document Active</span>
                    </div>
                `;
                document.getElementById('header-doc-badge').addEventListener('click', () => {
                    this.navigateTo('upload');
                });
            }
        }

        // Reinitialize icons in header
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    render() {
        if (!api.isAuthenticated()) {
            this.renderLoginScreen();
            return;
        }

        if (this.state.isAdmin && this.state.currentTab === 'dashboard') {
            this.state.currentTab = 'admin';
        }

        document.body.setAttribute('data-active-tab', this.state.currentTab);

        // Highlight active nav item
        const navLinks = document.querySelectorAll('.nav-item');
        navLinks.forEach(link => {
            if (link.getAttribute('data-tab') === this.state.currentTab) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Set Tab Title
        const titleMap = {
            dashboard: 'Study Command Center',
            upload: 'Document Manager',
            summary: 'AI Insights & Summaries',
            flashcards: 'Spaced Repetition Deck',
            quiz: 'Practice Assessments',
            chat: 'Interact with Context',
            analytics: 'Study Analytics & Performance',
            settings: 'System Configurations',
            admin: 'Admin Control Center'
        };
        const titleEl = document.getElementById('header-tab-title');
        if (titleEl) {
            titleEl.textContent = titleMap[this.state.currentTab] || 'DeckSum';
        }

        this.renderHeaderActions();

        // Render Active Tab Content
        const contentContainer = document.getElementById('main-content-body');
        if (!contentContainer) return;

        contentContainer.innerHTML = '';

        switch (this.state.currentTab) {
            case 'dashboard':
                renderDashboard(contentContainer, this);
                break;
            case 'upload':
                renderUpload(contentContainer, this);
                break;
            case 'summary':
                renderSummary(contentContainer, this);
                break;
            case 'flashcards':
                renderFlashcards(contentContainer, this);
                break;
            case 'quiz':
                renderQuiz(contentContainer, this);
                break;
            case 'chat':
                renderChat(contentContainer, this);
                break;
            case 'analytics':
                renderAnalytics(contentContainer, this);
                break;
            case 'settings':
                if (this.state.isAdmin) {
                    this.state.currentTab = 'admin';
                    this.render();
                } else {
                    renderSettings(contentContainer, this);
                }
                break;
            case 'admin':
                renderAdmin(contentContainer, this);
                break;
            default:
                renderDashboard(contentContainer, this);
        }

        // Initialize newly rendered icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}

// Bootstrap Application
document.addEventListener('DOMContentLoaded', async () => {
    const app = new DeckSumApp();
    window.DeckSum = app;

    if (api.isAuthenticated()) {
        await app.loadStateFromServer();
        app.initLayout();
        app.render();
        app.startStudyTimer();
        app.startNotificationPoller();
    } else {
        app.renderLoginScreen();
    }
});
