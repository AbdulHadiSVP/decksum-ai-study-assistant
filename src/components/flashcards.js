/**
 * DeckSum - Spaced Repetition Flashcards Review Component
 */

import { api } from '../utils/api.js';

export async function renderFlashcards(container, app) {
    // Show loading spinner first
    container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 60px 0; gap:16px;">
            <div class="loader-spinner" style="width:36px; height:36px;"></div>
            <p style="color:var(--text-muted); font-size:0.9rem;">Synching spaced repetition deck...</p>
        </div>
    `;

    try {
        // Fetch latest flashcard states from backend
        app.state.flashcards = await api.request('/api/flashcards');
    } catch (err) {
        console.error("Failed to fetch flashcards from server:", err);
    }

    let mode = 'due'; // 'due' | 'all'
    let filterScope = 'active'; // 'active' | 'all_docs'
    let currentIndex = 0;
    let deck = [];

    // Ratings map to SM-2 grades
    const ReviewGrades = {
        AGAIN: 0,
        HARD: 3,
        GOOD: 4,
        EASY: 5
    };

    function filterDueCards(cards) {
        const now = new Date();
        return cards.filter(card => new Date(card.dueDate) <= now);
    }

    function sortCardsByDue(cards) {
        return [...cards].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    }

    function rebuildDeck() {
        let sourceCards = [...app.state.flashcards];
        
        // 1. Filter by document scope
        if (filterScope === 'active' && app.state.activeDocId) {
            sourceCards = sourceCards.filter(c => c.docId === app.state.activeDocId);
        }
        
        // 2. Filter by due state or study mode
        if (mode === 'due') {
            deck = filterDueCards(sourceCards);
            deck = sortCardsByDue(deck);
        } else {
            deck = sourceCards; // Practice Mode
        }
        
        currentIndex = 0;
    }

    function renderShell() {
        container.innerHTML = `
            <div class="flashcards-container">
                <!-- Top controls & stats card -->
                <div class="glass-card" style="width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; flex-wrap: wrap; gap: 12px;">
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-rate ${filterScope === 'active' ? 'active' : ''}" id="btn-scope-active" style="padding: 6px 12px; font-size: 0.8rem; border-color: ${filterScope === 'active' ? 'var(--accent-primary)' : 'var(--border-color)'};">Active Document</button>
                        <button class="btn-rate ${filterScope === 'all_docs' ? 'active' : ''}" id="btn-scope-all" style="padding: 6px 12px; font-size: 0.8rem; border-color: ${filterScope === 'all_docs' ? 'var(--accent-primary)' : 'var(--border-color)'};">Entire Library</button>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-rate ${mode === 'due' ? 'active' : ''}" id="btn-mode-due" style="padding: 6px 12px; font-size: 0.8rem; border-color: ${mode === 'due' ? 'var(--accent-primary)' : 'var(--border-color)'};">Due Today Only</button>
                        <button class="btn-rate ${mode === 'all' ? 'active' : ''}" id="btn-mode-all" style="padding: 6px 12px; font-size: 0.8rem; border-color: ${mode === 'all' ? 'var(--accent-primary)' : 'var(--border-color)'};">Cram/Practice All</button>
                    </div>
                </div>
 
                <!-- Deck Workspace -->
                <div id="flashcard-workspace" style="width: 100%;">
                    <!-- Populated dynamically -->
                </div>
            </div>
        `;

        // Bind top panel controls
        document.getElementById('btn-scope-active').addEventListener('click', () => {
            filterScope = 'active';
            rebuildDeck();
            renderShell();
            renderActiveCard();
        });
        document.getElementById('btn-scope-all').addEventListener('click', () => {
            filterScope = 'all_docs';
            rebuildDeck();
            renderShell();
            renderActiveCard();
        });
        document.getElementById('btn-mode-due').addEventListener('click', () => {
            mode = 'due';
            rebuildDeck();
            renderShell();
            renderActiveCard();
        });
        document.getElementById('btn-mode-all').addEventListener('click', () => {
            mode = 'all';
            rebuildDeck();
            renderShell();
            renderActiveCard();
        });
    }

    function renderActiveCard() {
        const workspace = document.getElementById('flashcard-workspace');
        if (!workspace) return;

        if (deck.length === 0) {
            const hasAnyCards = app.state.flashcards.length > 0;
            workspace.innerHTML = `
                <div class="glass-card empty-view">
                    <i data-lucide="layers" class="empty-view-icon"></i>
                    <h2>No Cards Scheduled</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">
                        ${hasAnyCards ? 
                            "All caught up! You don't have any flashcards due for review. You can switch to 'Cram/Practice All' above to study anyway." :
                            "Your flashcard library is currently empty. Upload study materials to auto-generate review cards."
                        }
                    </p>
                    ${!hasAnyCards ? `<button class="btn-primary" id="fc-btn-upload">Upload Material</button>` : ''}
                </div>
            `;
            if (!hasAnyCards) {
                document.getElementById('fc-btn-upload').addEventListener('click', () => app.navigateTo('upload'));
            }
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const card = deck[currentIndex];
        
        workspace.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 24px;">
                <!-- Card Count progress bar -->
                <div style="width: 100%; display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-secondary);">
                    <span>Card ${currentIndex + 1} of ${deck.length}</span>
                    <span>Repetitions: ${card.repetitions || 0}</span>
                </div>
                <div class="parse-progress-bar" style="height: 4px; margin-top: -12px; margin-bottom: 8px;">
                    <div class="parse-progress-fill" style="width: ${((currentIndex + 1) / deck.length) * 100}%"></div>
                </div>

                <!-- Flip Card Frame -->
                <div class="flashcard-wrapper" id="active-flashcard">
                    <div class="flashcard-inner">
                        <!-- Front Card Face -->
                        <div class="flashcard-front">
                            <span class="flashcard-tag">${card.category}</span>
                            <div class="flashcard-text">${card.question}</div>
                            <span class="flashcard-tip"><i data-lucide="refresh-cw" style="width:12px; height:12px; vertical-align:middle; margin-right:4px;"></i> Click Card to Flip</span>
                        </div>
                        
                        <!-- Back Card Face -->
                        <div class="flashcard-back">
                            <span class="flashcard-tag">${card.category}</span>
                            <div class="flashcard-text" style="font-size: 1.15rem; max-height:220px; overflow-y:auto; padding-right:6px;">${card.answer}</div>
                            <span class="flashcard-tip" style="color: var(--accent-primary);"><i data-lucide="eye" style="width:12px; height:12px; vertical-align:middle; margin-right:4px;"></i> Answer Side</span>
                        </div>
                    </div>
                </div>

                <!-- Self-assessment Control Row -->
                <div class="flashcard-controls" id="card-controls" style="visibility: hidden;">
                    <div style="text-align: left;">
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 6px;">How well did you recall this?</div>
                        <div class="flashcard-rating-buttons">
                            <button class="btn-rate hard" data-grade="AGAIN">Again</button>
                            <button class="btn-rate medium" data-grade="HARD">Hard</button>
                            <button class="btn-rate active" style="border-color: var(--accent-primary); color: var(--accent-primary);" data-grade="GOOD">Good</button>
                            <button class="btn-rate easy" data-grade="EASY">Easy</button>
                        </div>
                    </div>
                    <button class="btn-primary" id="btn-next-card" style="align-self: flex-end;">Next Card &rarr;</button>
                </div>
            </div>
        `;

        // Card flip toggling
        const cardFrame = document.getElementById('active-flashcard');
        const cardControls = document.getElementById('card-controls');
        
        cardFrame.addEventListener('click', () => {
            cardFrame.classList.toggle('flipped');
            if (cardFrame.classList.contains('flipped')) {
                cardControls.style.visibility = 'visible';
            }
        });

        // Set grade click handlers
        let selectedGrade = ReviewGrades.GOOD;
        const rateButtons = cardControls.querySelectorAll('[data-grade]');
        rateButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                rateButtons.forEach(b => {
                    b.style.background = 'var(--bg-card)';
                    b.style.borderColor = 'var(--border-color)';
                });

                const gradeKey = btn.getAttribute('data-grade');
                selectedGrade = ReviewGrades[gradeKey];
                
                btn.style.background = 'var(--bg-card-hover)';
                if (gradeKey === 'EASY') btn.style.borderColor = 'var(--color-success)';
                else if (gradeKey === 'GOOD') btn.style.borderColor = 'var(--accent-primary)';
                else if (gradeKey === 'HARD') btn.style.borderColor = 'var(--color-warning)';
                else if (gradeKey === 'AGAIN') btn.style.borderColor = 'var(--color-danger)';
            });
        });

        // Next Card Handler
        document.getElementById('btn-next-card').addEventListener('click', async () => {
            const targetId = card.id;
            
            try {
                // Post review to backend database (updates SM-2 calculations)
                const updated = await api.request(`/api/flashcards/${targetId}/review`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ grade: selectedGrade })
                });
                
                // Cache back updated state parameters locally
                app.state.flashcards = app.state.flashcards.map(c => c.id === targetId ? { ...c, ...updated } : c);
            } catch (err) {
                console.error("Failed to sync card review:", err);
            }

            if (currentIndex < deck.length - 1) {
                currentIndex++;
                renderActiveCard();
            } else {
                renderCompletionState();
            }
        });

        if (window.lucide) window.lucide.createIcons();
    }

    function renderCompletionState() {
        const workspace = document.getElementById('flashcard-workspace');
        if (!workspace) return;

        workspace.innerHTML = `
            <div class="glass-card" style="text-align: center; padding: 48px; display: flex; flex-direction: column; align-items: center; gap: 20px; border-color: var(--color-success);">
                <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(34, 197, 94, 0.1); border: 1px solid var(--color-success); display:flex; align-items:center; justify-content:center; color: var(--color-success);">
                    <i data-lucide="check" style="width: 40px; height: 40px;"></i>
                </div>
                <h2>Deck Completed!</h2>
                <p style="color: var(--text-secondary); max-width: 450px;">
                    Great job! You have completed all scheduled flashcards. Your knowledge levels have been logged, and cards have been rescheduled.
                </p>
                <div style="display: flex; gap: 12px; margin-top: 10px;">
                    <button class="btn-primary" id="btn-complete-dash">Back to Dashboard</button>
                    <button class="btn-rate" id="btn-complete-cram" style="background: rgba(255,255,255,0.05);">Practice Session</button>
                </div>
            </div>
        `;

        document.getElementById('btn-complete-dash').addEventListener('click', () => app.navigateTo('dashboard'));
        document.getElementById('btn-complete-cram').addEventListener('click', () => {
            mode = 'all';
            rebuildDeck();
            renderShell();
            renderActiveCard();
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // Initialize View
    rebuildDeck();
    renderShell();
    renderActiveCard();
}
