/**
 * DeckSum - Performance Analytics Component
 */

import { api } from '../utils/api.js';

export async function renderAnalytics(container, app) {
    // Show spinner
    container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 60px 0; gap:16px;">
            <div class="loader-spinner" style="width:36px; height:36px;"></div>
            <p style="color:var(--text-muted); font-size:0.9rem;">Fetching performance analytics...</p>
        </div>
    `;

    try {
        const stats = await api.request('/api/analytics');
        
        const history = stats.quizHistory || [];
        const totalQuizzes = history.length;
        const avgAccuracy = totalQuizzes > 0 
            ? Math.round(history.reduce((sum, h) => sum + h.accuracy, 0) / totalQuizzes) 
            : 0;
            
        const easyCount = stats.cardBreakdown.easy;
        const mediumCount = stats.cardBreakdown.medium;
        const hardCount = stats.cardBreakdown.hard;
        const streak = stats.streakCount;
        const totalCards = stats.totalFlashcards;

        container.innerHTML = `
            <div class="analytics-container" style="display:flex; flex-direction:column; gap:24px;">
                <!-- Top Summary metrics -->
                <div class="dashboard-row" style="margin-bottom:0;">
                    <div class="glass-card stat-card">
                        <div class="stat-icon pink"><i data-lucide="zap"></i></div>
                        <div>
                            <div class="stat-number" id="stat-streak">${streak} Days</div>
                            <div class="stat-label">Study Streak</div>
                        </div>
                    </div>
                    <div class="glass-card stat-card">
                        <div class="stat-icon cyan"><i data-lucide="check-square"></i></div>
                        <div>
                            <div class="stat-number">${avgAccuracy}%</div>
                            <div class="stat-label">Avg Quiz Accuracy (${totalQuizzes} taken)</div>
                        </div>
                    </div>
                    <div class="glass-card stat-card">
                        <div class="stat-icon violet"><i data-lucide="award"></i></div>
                        <div>
                            <div class="stat-number">${totalCards}</div>
                            <div class="stat-label">Total Active Cards</div>
                        </div>
                    </div>
                </div>

                <!-- Charts row 1: Study time & quiz accuracies -->
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px; min-height: 300px;">
                    <div class="glass-card">
                        <h3 style="margin-bottom: 16px;">Daily Study Activity</h3>
                        <div style="position:relative; height: 220px; width:100%;">
                            <canvas id="study-time-chart"></canvas>
                        </div>
                    </div>
                    <div class="glass-card">
                        <h3 style="margin-bottom: 16px;">Quiz Performance</h3>
                        <div style="position:relative; height: 220px; width:100%;">
                            <canvas id="quiz-scores-chart"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Charts row 2: Flashcards breakdown & logs -->
                <div style="display:grid; grid-template-columns: 2fr 1.2fr; gap:24px;">
                    <!-- Table of recent quizzes -->
                    <div class="glass-card" style="display:flex; flex-direction:column;">
                        <h3 style="margin-bottom: 16px;">Practice History Logs</h3>
                        <div style="overflow-x:auto; flex-grow:1;">
                            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                                <thead>
                                    <tr style="border-bottom: 2px solid var(--border-color); color:var(--text-muted); font-weight:600;">
                                        <th style="padding: 10px;">Date</th>
                                        <th style="padding: 10px;">Study Material</th>
                                        <th style="padding: 10px; text-align: center;">Score</th>
                                        <th style="padding: 10px; text-align: right;">Accuracy</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${history.length > 0 ? 
                                        history.slice().reverse().slice(0, 5).map(record => {
                                            const dateStr = new Date(record.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
                                            return `
                                                <tr style="border-bottom: 1px solid var(--border-color);">
                                                    <td style="padding: 12px 10px; color: var(--text-muted);">${dateStr}</td>
                                                    <td style="padding: 12px 10px; font-weight: 500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:250px;">${record.docName}</td>
                                                    <td style="padding: 12px 10px; text-align: center;">${record.score} / ${record.total}</td>
                                                    <td style="padding: 12px 10px; text-align: right; font-weight:600; color: ${record.accuracy >= 80 ? 'var(--color-success)' : record.accuracy >= 50 ? 'var(--color-warning)' : 'var(--color-danger)'}">${record.accuracy}%</td>
                                                </tr>
                                            `;
                                        }).join('') :
                                        `<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted);">No quiz data recorded yet. Take a quiz to begin tracking performance.</td></tr>`
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Doughnut Chart for mastery levels -->
                    <div class="glass-card">
                        <h3 style="margin-bottom: 16px;">Memory Deck Mastery</h3>
                        <div style="position:relative; height: 180px; width:100%;">
                            <canvas id="card-mastery-chart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (window.Chart) {
            initStudyTimeChart(stats.dailyStudyMinutes);
            initQuizScoresChart(history);
            initCardMasteryChart(easyCount, mediumCount, hardCount);
        }

        if (window.lucide) window.lucide.createIcons();

    } catch (err) {
        console.error("Failed to load analytics dashboard:", err);
        container.innerHTML = `
            <div class="glass-card" style="border-color:var(--color-danger); text-align:center; padding:30px;">
                <i data-lucide="alert-octagon" style="color:var(--color-danger); width:40px; height:40px; margin-bottom:12px;"></i>
                <h3>Failed to load analytics</h3>
                <p style="color:var(--text-secondary); margin-top:6px;">${err.message}</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }
}

function initStudyTimeChart(dailyMinutes) {
    const ctx = document.getElementById('study-time-chart').getContext('2d');
    
    // Fetch theme colors
    const style = getComputedStyle(document.body);
    const accentPrimary = style.getPropertyValue('--accent-primary').trim() || '#d9a030';
    const accentSecondary = style.getPropertyValue('--accent-secondary').trim() || '#22c55e';
    const textMuted = style.getPropertyValue('--text-muted').trim() || 'rgba(255,255,255,0.5)';
    const borderColorVal = style.getPropertyValue('--border-color').trim() || 'rgba(255,255,255,0.05)';
    
    const labels = [];
    const studyData = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().split('T')[0];
        
        labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
        studyData.push(dailyMinutes[dayStr] || 0);
    }

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Study Minutes',
                data: studyData,
                borderColor: accentPrimary,
                backgroundColor: accentPrimary.includes('hsl') ? accentPrimary.replace(')', ', 0.12)').replace('hsl', 'hsla') : 'rgba(217, 160, 48, 0.12)',
                fill: true,
                tension: 0.35,
                borderWidth: 2,
                pointBackgroundColor: accentSecondary
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: borderColorVal },
                    ticks: { color: textMuted }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textMuted }
                }
            }
        }
    });
}

function initQuizScoresChart(history) {
    const ctx = document.getElementById('quiz-scores-chart').getContext('2d');
    const recentHistory = history.slice(-6);
    
    const style = getComputedStyle(document.body);
    const accentSecondary = style.getPropertyValue('--accent-secondary').trim() || '#22c55e';
    const textMuted = style.getPropertyValue('--text-muted').trim() || 'rgba(255,255,255,0.5)';
    const borderColorVal = style.getPropertyValue('--border-color').trim() || 'rgba(255,255,255,0.05)';
    
    const labels = recentHistory.map((_, i) => `Run ${i + 1}`);
    const scoreData = recentHistory.map(h => h.accuracy);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length > 0 ? labels : ['No Runs'],
            datasets: [{
                label: 'Quiz Accuracy %',
                data: scoreData.length > 0 ? scoreData : [0],
                backgroundColor: accentSecondary.includes('hsl') ? accentSecondary.replace(')', ', 0.65)').replace('hsl', 'hsla') : 'rgba(22, 197, 94, 0.65)',
                borderColor: accentSecondary,
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: borderColorVal },
                    ticks: { color: textMuted }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textMuted }
                }
            }
        }
    });
}

function initCardMasteryChart(easy, medium, hard) {
    const ctx = document.getElementById('card-mastery-chart').getContext('2d');
    
    const style = getComputedStyle(document.body);
    const textMuted = style.getPropertyValue('--text-muted').trim() || 'rgba(255,255,255,0.6)';
    const borderColorVal = style.getPropertyValue('--border-color').trim() || 'rgba(255,255,255,0.05)';
    
    const hasData = easy > 0 || medium > 0 || hard > 0;

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Mastered (Easy)', 'Reviewing (Moderate)', 'Needs Work (Hard)'],
            datasets: [{
                data: hasData ? [easy, medium, hard] : [1, 0, 0],
                backgroundColor: hasData 
                    ? ['rgba(34, 197, 94, 0.7)', 'rgba(234, 179, 8, 0.7)', 'rgba(239, 68, 68, 0.7)']
                    : [borderColorVal, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)'],
                borderColor: borderColorVal,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: textMuted, font: { size: 11 } }
                }
            },
            cutout: '65%'
        }
    });
}
