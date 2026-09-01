/**
 * DeckSum - Spaced Repetition Utility
 * Implements the SuperMemo SM-2 algorithm to schedule flashcard reviews.
 */

// Ratings map to SM-2 grades (0 to 5)
export const ReviewGrades = {
    AGAIN: 0,  // Blackout/Forgot
    HARD: 3,   // Correct with serious difficulty
    GOOD: 4,   // Correct after hesitation
    EASY: 5    // Perfect response
};

/**
 * Initializes a new flashcard with scheduling parameters.
 */
export function createFlashcard(id, question, answer, category = 'General', docId = null) {
    return {
        id: id || `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        docId,
        question: question.trim(),
        answer: answer.trim(),
        category: category.trim(),
        repetitions: 0,
        interval: 0, // In days; 0 means review immediately
        easeFactor: 2.5,
        dueDate: new Date().toISOString(), // Default: due right now
        lastReviewed: null,
        history: [] // Study logs
    };
}

/**
 * Updates flashcard statistics based on the grade received (SM-2 algorithm).
 * @param {Object} card - The flashcard object
 * @param {Number} grade - Value from 0 to 5 representing quality of recall
 * @returns {Object} The updated flashcard
 */
export function scheduleFlashcard(card, grade) {
    const updated = { ...card };
    const dateNow = new Date();
    
    // Ensure safety bounds for grade
    const score = Math.max(0, Math.min(5, grade));
    
    // SM-2 algorithm implementation
    if (score >= 3) {
        // Correct response
        if (updated.repetitions === 0) {
            updated.interval = 1;
        } else if (updated.repetitions === 1) {
            updated.interval = 6;
        } else {
            updated.interval = Math.round(updated.interval * updated.easeFactor);
        }
        updated.repetitions += 1;
    } else {
        // Incorrect response - reset interval and repetitions
        updated.repetitions = 0;
        updated.interval = 1;
    }
    
    // Adjust ease factor (EF)
    updated.easeFactor = updated.easeFactor + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02));
    if (updated.easeFactor < 1.3) {
        updated.easeFactor = 1.3;
    }
    
    // Calculate new due date
    const dueDate = new Date();
    dueDate.setDate(dateNow.getDate() + updated.interval);
    
    updated.dueDate = dueDate.toISOString();
    updated.lastReviewed = dateNow.toISOString();
    
    // Log history
    updated.history.push({
        date: dateNow.toISOString(),
        grade: score,
        interval: updated.interval,
        easeFactor: updated.easeFactor
    });
    
    return updated;
}

/**
 * Filter list of cards that are due for review (due date <= now)
 */
export function filterDueCards(cards) {
    const now = new Date();
    return cards.filter(card => {
        return new Date(card.dueDate) <= now;
    });
}

/**
 * Sorts cards so that overdue/earliest due cards are shown first
 */
export function sortCardsByDue(cards) {
    return [...cards].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}
