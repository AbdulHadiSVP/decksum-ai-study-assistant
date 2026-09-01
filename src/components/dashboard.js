/**
 * DeckSum - Dashboard / Command Center Component
 */

import { api } from '../utils/api.js';

export async function renderDashboard(container, app) {
    // Render skeleton/loader first
    container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 60px 0; gap:16px;">
            <div class="loader-spinner" style="width:36px; height:36px;"></div>
            <p style="color:var(--text-muted); font-size:0.9rem;">Gathering stats from command center...</p>
        </div>
    `;

    try {
        // Fetch fresh metrics and notifications from backend
        const stats = await api.request('/api/analytics');
        const notifications = await api.request('/api/notifications');
        
        // Update local app state cache
        app.state.analytics.streakCount = stats.streakCount;
        app.state.analytics.dailyStudyMinutes = stats.dailyStudyMinutes;
        app.state.flashcards.length = stats.totalFlashcards; // simple cache length
        app.state.quizHistory = stats.quizHistory;
        
        const todayStr = new Date().toISOString().split('T')[0];
        const minutesToday = stats.dailyStudyMinutes[todayStr] || 0;
        const totalCards = stats.totalFlashcards;
        const dueCount = stats.dueFlashcardsCount;
        const streak = stats.streakCount;
        
        const activeDoc = app.state.documents.find(d => d.id === app.state.activeDocId);
        const username = api.getUsername();

        // Render main dashboard
        container.innerHTML = `
            <div class="dashboard-container" style="display: flex; flex-direction: column; gap: 24px;">
                
                <!-- Welcome Header Card -->
                <div class="glass-card" style="background: linear-gradient(135deg, var(--welcome-card-start) 0%, var(--welcome-card-end) 100%); border-color: var(--border-glow); position: relative; overflow: hidden; padding: 32px;">
                    <div style="max-width: 600px; z-index: 10; position: relative;">
                        <h2 style="font-size: 1.8rem; margin-bottom: 8px;">Welcome Back, ${username}!</h2>
                        <p style="color: var(--text-secondary); margin-bottom: 20px;">
                            ${dueCount > 0 ? 
                                `You have <strong style="color: var(--accent-secondary);">${dueCount}</strong> flashcards scheduled for review today. Keep your revision streak alive!` :
                                `Excellent job! You are fully caught up on your spaced repetition reviews. Upload new materials to expand your deck.`
                            }
                        </p>
                        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                            ${dueCount > 0 ? 
                                `<button class="btn-primary" id="dash-btn-review">Review Deck Now</button>` : 
                                `<button class="btn-primary" id="dash-btn-upload">Upload Study Materials</button>`
                            }
                            <button class="btn-rate" id="dash-btn-chat" style="background: rgba(255,255,255,0.05);">Ask Document Chat</button>
                        </div>
                    </div>
                    <!-- Decorative background elements -->
                    <div style="position: absolute; right: -20px; bottom: -20px; font-size: 140px; opacity: 0.04; transform: rotate(-12deg); pointer-events: none;">
                        <i data-lucide="brain"></i>
                    </div>
                </div>

                <!-- Notifications / Alerts Row (Module 6 Reminders) -->
                ${notifications.length > 0 ? `
                    <div class="glass-card" style="border-color: rgba(234, 179, 8, 0.3); background: rgba(234, 179, 8, 0.02); padding: 16px 20px;">
                        <div style="display:flex; align-items:center; gap:12px; justify-content:space-between; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <i data-lucide="alert-triangle" style="color:var(--color-warning); width:20px; height:20px;"></i>
                                <span style="font-size:0.9rem; color:var(--text-primary); font-weight:500;">${notifications[0].message}</span>
                            </div>
                            <button class="btn-primary" id="notif-btn-action" style="padding: 6px 16px; font-size:0.8rem; background:var(--color-warning); box-shadow:none;">Revise Now</button>
                        </div>
                    </div>
                ` : ''}

                <!-- Stats Metrics Row -->
                <div class="dashboard-row">
                    <div class="glass-card stat-card">
                        <div class="stat-icon pink"><i data-lucide="zap"></i></div>
                        <div>
                            <div class="stat-number" id="stat-streak">${streak} Days</div>
                            <div class="stat-label">Study Streak</div>
                        </div>
                    </div>
                    <div class="glass-card stat-card">
                        <div class="stat-icon violet"><i data-lucide="layers"></i></div>
                        <div>
                            <div class="stat-number">${dueCount} / ${totalCards}</div>
                            <div class="stat-label">Due Flashcards</div>
                        </div>
                    </div>
                    <div class="glass-card stat-card">
                        <div class="stat-icon cyan"><i data-lucide="clock"></i></div>
                        <div>
                            <div class="stat-number">${minutesToday} min</div>
                            <div class="stat-label">Studied Today</div>
                        </div>
                    </div>
                </div>

                <!-- Dashboard Subgrids -->
                <div class="dashboard-grid">
                    <!-- Left Main Column -->
                    <div style="display: flex; flex-direction: column; gap: 24px;">
                        <div class="glass-card">
                            <h3>Memory Deck Breakdown</h3>
                            <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 0.9rem;">
                                Your revision intervals adjust dynamically using the SuperMemo SM-2 algorithm.
                            </p>
                            
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px;">
                                <div style="text-align: center; padding: 16px; border-radius: var(--border-radius-md); background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.15);">
                                    <h4 style="color: var(--color-danger); font-size: 1.4rem;">${stats.cardBreakdown.hard}</h4>
                                    <p style="font-size: 0.8rem; color: var(--text-muted);">Needs Work (Hard)</p>
                                </div>
                                <div style="text-align: center; padding: 16px; border-radius: var(--border-radius-md); background: rgba(234, 179, 8, 0.05); border: 1px solid rgba(234, 179, 8, 0.15);">
                                    <h4 style="color: var(--color-warning); font-size: 1.4rem;">${stats.cardBreakdown.medium}</h4>
                                    <p style="font-size: 0.8rem; color: var(--text-muted);">Reviewing (Mod)</p>
                                </div>
                                <div style="text-align: center; padding: 16px; border-radius: var(--border-radius-md); background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.15);">
                                    <h4 style="color: var(--color-success); font-size: 1.4rem;">${stats.cardBreakdown.easy}</h4>
                                    <p style="font-size: 0.8rem; color: var(--text-muted);">Mastered (Easy)</p>
                                </div>
                            </div>

                            ${totalCards > 0 ? 
                                `<div style="display: flex; align-items: center; justify-content: space-between;">
                                    <span style="font-size: 0.9rem; color: var(--text-secondary);">Total Cards in Library: <strong>${totalCards}</strong></span>
                                    <button class="btn-primary" id="dash-btn-quiz" style="padding: 6px 14px; font-size: 0.8rem;">Practice Quiz</button>
                                </div>` :
                                `<div style="text-align: center; padding: 20px;">
                                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 12px;">No active cards. Let's upload a file to automatically generate terms.</p>
                                    <button class="btn-primary" id="dash-btn-upload-direct" style="padding: 6px 14px; font-size: 0.8rem;">Create Flashcards</button>
                                </div>`
                            }
                        </div>
                    </div>

                    <!-- Right Sidebar Column -->
                    <div style="display: flex; flex-direction: column; gap: 24px;">
                        <div class="glass-card">
                            <h3>Active Document</h3>
                            <div style="margin-top: 16px;">
                                ${activeDoc ? `
                                    <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;">
                                        <i data-lucide="file-text" style="color: var(--accent-secondary); width: 24px; height: 24px; flex-shrink:0;"></i>
                                        <div>
                                            <div style="font-weight: 600; font-size: 0.95rem; word-break: break-all;">${activeDoc.name}</div>
                                            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">Size: ${activeDoc.size} &bull; Date: ${activeDoc.addedDate}</div>
                                        </div>
                                    </div>
                                    <div style="display: flex; flex-direction: column; gap: 10px;">
                                        <button class="btn-rate" id="dash-btn-view-summary" style="width: 100%; text-align: left; padding: 10px 14px; display:flex; justify-content:space-between; align-items:center;">
                                            <span>View AI Summary</span>
                                            <i data-lucide="chevron-right" style="width:16px; height:16px;"></i>
                                        </button>
                                        <button class="btn-rate" id="dash-btn-chat-doc" style="width: 100%; text-align: left; padding: 10px 14px; display:flex; justify-content:space-between; align-items:center;">
                                            <span>Ask Questions</span>
                                            <i data-lucide="chevron-right" style="width:16px; height:16px;"></i>
                                        </button>
                                    </div>
                                ` : `
                                    <div style="text-align: center; padding: 20px 0;">
                                        <i data-lucide="info" style="color: var(--text-muted); width: 32px; height: 32px; margin-bottom: 8px;"></i>
                                        <p style="font-size: 0.85rem; color: var(--text-muted);">No document currently active for study sessions.</p>
                                        <button class="btn-primary" id="dash-btn-upload-active" style="padding: 6px 14px; font-size: 0.8rem; margin-top: 12px;">Add Document</button>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Hook events
        const reviewBtn = document.getElementById('dash-btn-review');
        if (reviewBtn) reviewBtn.addEventListener('click', () => app.navigateTo('flashcards'));

        const uploadBtn = document.getElementById('dash-btn-upload');
        if (uploadBtn) uploadBtn.addEventListener('click', () => app.navigateTo('upload'));

        const uploadBtnDirect = document.getElementById('dash-btn-upload-direct');
        if (uploadBtnDirect) uploadBtnDirect.addEventListener('click', () => app.navigateTo('upload'));

        const uploadBtnActive = document.getElementById('dash-btn-upload-active');
        if (uploadBtnActive) uploadBtnActive.addEventListener('click', () => app.navigateTo('upload'));

        const chatBtn = document.getElementById('dash-btn-chat');
        if (chatBtn) chatBtn.addEventListener('click', () => app.navigateTo('chat'));

        const chatDocBtn = document.getElementById('dash-btn-chat-doc');
        if (chatDocBtn) chatDocBtn.addEventListener('click', () => app.navigateTo('chat'));

        const summaryBtn = document.getElementById('dash-btn-view-summary');
        if (summaryBtn) summaryBtn.addEventListener('click', () => app.navigateTo('summary'));

        const quizBtn = document.getElementById('dash-btn-quiz');
        if (quizBtn) quizBtn.addEventListener('click', () => app.navigateTo('quiz'));
        
        const notifBtn = document.getElementById('notif-btn-action');
        if (notifBtn) notifBtn.addEventListener('click', () => app.navigateTo('flashcards'));

        if (window.lucide) window.lucide.createIcons();
    } catch (err) {
        console.error("Dashboard render failed:", err);
        container.innerHTML = `
            <div class="glass-card" style="border-color:var(--color-danger); text-align:center; padding:30px;">
                <i data-lucide="alert-octagon" style="color:var(--color-danger); width:40px; height:40px; margin-bottom:12px;"></i>
                <h3>Failed to load dashboard metrics</h3>
                <p style="color:var(--text-secondary); margin-top:6px;">${err.message}</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }
}
