/**
 * DeckSum - Practice Quiz Component
 */

import { api } from '../utils/api.js';

export async function renderQuiz(container, app) {
    const activeDoc = app.state.documents.find(d => d.id === app.state.activeDocId);
    
    if (!activeDoc) {
        container.innerHTML = `
            <div class="glass-card empty-view">
                <i data-lucide="check-square" class="empty-view-icon"></i>
                <h2>No Active Quiz</h2>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">
                    Practice quizzes are generated automatically from your study materials. 
                    Please select or upload a document.
                </p>
                <button class="btn-primary" id="quiz-btn-upload">Go to Material Manager</button>
            </div>
        `;
        document.getElementById('quiz-btn-upload').addEventListener('click', () => app.navigateTo('upload'));
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // Render loading spinner
    container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 60px 0; gap:16px;">
            <div class="loader-spinner" style="width:36px; height:36px;"></div>
            <p style="color:var(--text-muted); font-size:0.9rem;">Synching quiz questions...</p>
        </div>
    `;

    let quizzes = [];
    try {
        quizzes = await api.request(`/api/quizzes?doc_id=${activeDoc.id}`);
    } catch (err) {
        console.error("Failed to fetch quizzes:", err);
    }
    
    if (quizzes.length === 0) {
        container.innerHTML = `
            <div class="glass-card empty-view">
                <i data-lucide="alert-circle" class="empty-view-icon"></i>
                <h2>Quiz Questions Unavailable</h2>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">
                    We could not generate practice quizzes from this document. The text might be too short or contains low detail.
                </p>
                <button class="btn-primary" id="quiz-btn-reupload">Try Another File</button>
            </div>
        `;
        document.getElementById('quiz-btn-reupload').addEventListener('click', () => app.navigateTo('upload'));
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    let currentQuestionIdx = 0;
    let selectedOption = null;
    let isAnswerLocked = false;
    let correctCount = 0;
    const userAnswers = []; // Records user's selected letters

    function renderQuestionShell() {
        const questionObj = quizzes[currentQuestionIdx];
        const progressPercent = ((currentQuestionIdx) / quizzes.length) * 100;
        
        container.innerHTML = `
            <div class="quiz-container">
                <!-- Quiz Progress Bar -->
                <div class="glass-card" style="padding: 16px 24px;">
                    <div class="quiz-progress" style="margin-bottom: 8px;">
                        <span>Question ${currentQuestionIdx + 1} of ${quizzes.length}</span>
                        <span>Accuracy: ${currentQuestionIdx > 0 ? Math.round((correctCount / currentQuestionIdx) * 100) : 100}%</span>
                    </div>
                    <div class="quiz-progress-bar">
                        <div class="quiz-progress-fill" style="width: ${progressPercent}%;"></div>
                    </div>
                </div>

                <!-- Quiz Main Card -->
                <div class="glass-card" style="display: flex; flex-direction: column; gap: 20px;">
                    <div class="quiz-question">
                        <strong>Q${currentQuestionIdx + 1}:</strong> ${questionObj.question}
                    </div>

                    <div class="quiz-options" id="quiz-options-container">
                        ${questionObj.options.map(opt => `
                            <div class="quiz-option" data-letter="${opt.letter}">
                                <div class="quiz-option-letter">${opt.letter}</div>
                                <div style="font-size: 0.95rem;">${opt.text}</div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Dynamic explanation segment -->
                    <div id="explanation-workspace" style="display: none;"></div>

                    <button class="btn-primary" id="btn-quiz-action" style="align-self: flex-end; display: none;">
                        Next Question &rarr;
                    </button>
                </div>
            </div>
        `;

        // Bind clicks on option nodes
        const optionCards = document.querySelectorAll('.quiz-option');
        optionCards.forEach(card => {
            card.addEventListener('click', () => {
                if (isAnswerLocked) return;
                
                const letter = card.getAttribute('data-letter');
                selectedOption = letter;
                isAnswerLocked = true;
                
                revealAnswer(questionObj, letter);
            });
        });
    }

    function revealAnswer(questionObj, selection) {
        const isCorrect = selection === questionObj.correctAnswer;
        userAnswers.push(selection);
        
        if (isCorrect) correctCount++;

        const optionCards = document.querySelectorAll('.quiz-option');
        optionCards.forEach(card => {
            const letter = card.getAttribute('data-letter');
            
            if (letter === questionObj.correctAnswer) {
                card.classList.add('correct');
            } else if (letter === selection) {
                card.classList.add('incorrect');
            }
            
            card.style.cursor = 'default';
        });

        // Reveal explanation
        const explanationBox = document.getElementById('explanation-workspace');
        explanationBox.style.display = 'block';
        explanationBox.innerHTML = `
            <div class="quiz-explanation-box">
                <h4 style="color: ${isCorrect ? 'var(--color-success)' : 'var(--color-danger)'}; display:flex; align-items:center; gap:8px; margin-bottom: 6px;">
                    <i data-lucide="${isCorrect ? 'check-circle' : 'x-circle'}" style="width:18px; height:18px;"></i>
                    ${isCorrect ? 'Correct Answer!' : 'Incorrect Answer'}
                </h4>
                <p style="font-size: 0.9rem; color: var(--text-secondary);">${questionObj.explanation}</p>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();

        // Reveal Action button
        const actionBtn = document.getElementById('btn-quiz-action');
        actionBtn.style.display = 'block';
        
        const isLastQuestion = currentQuestionIdx === quizzes.length - 1;
        actionBtn.textContent = isLastQuestion ? 'Complete Quiz & View Score' : 'Next Question \u2192';

        actionBtn.addEventListener('click', () => {
            if (isLastQuestion) {
                renderScorecard();
            } else {
                currentQuestionIdx++;
                selectedOption = null;
                isAnswerLocked = false;
                renderQuestionShell();
            }
        });
    }

    async function renderScorecard() {
        const percentage = Math.round((correctCount / quizzes.length) * 100);
        
        // Log to global analytics history in SQLite database
        const newRecord = {
            docId: activeDoc.id,
            docName: activeDoc.name,
            score: correctCount,
            total: quizzes.length,
            accuracy: percentage
        };
        
        try {
            await api.request('/api/quizzes/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newRecord)
            });
            // Update local cache
            app.state.quizHistory.push({
                ...newRecord,
                date: new Date().toISOString()
            });
        } catch (err) {
            console.error("Failed to save quiz score:", err);
        }

        let reviewMsg = "Need some review! Try parsing summary sheets or chat with the AI helper to clarify hard concepts.";
        let boundaryColor = 'var(--color-danger)';
        if (percentage >= 80) {
            reviewMsg = "Excellent! You have a solid grasp of this study material. Ready to move forward!";
            boundaryColor = 'var(--color-success)';
        } else if (percentage >= 50) {
            reviewMsg = "Good job! A few more reviews will lock these concepts in memory. Try spaced revision cards.";
            boundaryColor = 'var(--color-warning)';
        }

        container.innerHTML = `
            <div class="quiz-container">
                <div class="glass-card quiz-scorecard">
                    <div class="score-circle" style="border-color: ${boundaryColor};">
                        ${percentage}%
                    </div>
                    
                    <h2 style="margin-top: 10px;">Practice Completed!</h2>
                    <p style="font-size: 1.05rem; color: var(--text-primary);">You scored <strong>${correctCount}</strong> out of <strong>${quizzes.length}</strong> questions correct.</p>
                    <p style="color: var(--text-secondary); max-width: 480px; line-height:1.5;">${reviewMsg}</p>
                    
                    <div style="display: flex; gap: 12px; margin-top: 10px;">
                        <button class="btn-primary" id="btn-quiz-done">Dashboard</button>
                        <button class="btn-rate" id="btn-quiz-retry" style="background: rgba(255,255,255,0.05);">Retake Quiz</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btn-quiz-done').addEventListener('click', () => app.navigateTo('dashboard'));
        document.getElementById('btn-quiz-retry').addEventListener('click', () => {
            currentQuestionIdx = 0;
            selectedOption = null;
            isAnswerLocked = false;
            correctCount = 0;
            renderQuestionShell();
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // Begin quiz
    renderQuestionShell();
}
