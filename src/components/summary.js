/**
 * DeckSum - AI Summary View Component
 */

export function renderSummary(container, app) {
    const activeDoc = app.state.documents.find(d => d.id === app.state.activeDocId);
    
    if (!activeDoc) {
        container.innerHTML = `
            <div class="glass-card empty-view">
                <i data-lucide="book-open" class="empty-view-icon"></i>
                <h2>No Active Document</h2>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">
                    Please select or upload a document in the Study Material tab to generate summaries.
                </p>
                <button class="btn-primary" id="sum-btn-upload">Go to Material Manager</button>
            </div>
        `;
        document.getElementById('sum-btn-upload').addEventListener('click', () => app.navigateTo('upload'));
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const { summary } = activeDoc;
    const title = summary.title || "Document Summary";
    const overview = summary.overview || "No overview available.";
    const takeaways = summary.keyTakeaways || [];
    const vocabulary = summary.vocabulary || [];

    container.innerHTML = `
        <div class="summary-container">
            <!-- Main Summary Column -->
            <div class="summary-main">
                <!-- Overview glass card -->
                <div class="glass-card" style="border-left: 4px solid var(--accent-primary);">
                    <h2 style="margin-bottom: 12px; font-size: 1.5rem; color: var(--accent-primary);">${title}</h2>
                    <p style="font-size: 1.05rem; line-height: 1.7; color: var(--text-primary);">${overview}</p>
                </div>

                <!-- Key Takeaways card -->
                <div class="glass-card">
                    <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                        <i data-lucide="award" style="color: var(--accent-tertiary);"></i>
                        Key Concepts & Takeaways
                    </h3>
                    <div class="summary-points">
                        ${takeaways.map(point => `
                            <div class="summary-point-card glass-card" style="padding: 16px; background: rgba(255,255,255,0.02); margin-bottom: 12px;">
                                <p style="font-size: 0.95rem; color: var(--text-primary);">${point}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Vocabulary Glossary Sidebar -->
            <div class="summary-sidebar">
                <div class="glass-card" style="height: 100%; display: flex; flex-direction: column; gap: 16px;">
                    <h3>Core Terminology</h3>
                    <p style="color: var(--text-secondary); font-size: 0.85rem;">Vocabulary terms extracted from your study material.</p>
                    
                    <!-- Terminology Search bar -->
                    <div style="position: relative;">
                        <input type="text" id="vocab-search" class="form-input" placeholder="Search terms..." style="width: 100%; padding-left: 36px; height: 38px; font-size: 0.85rem;">
                        <i data-lucide="search" style="position: absolute; left: 12px; top: 11px; width: 16px; height: 16px; color: var(--text-muted);"></i>
                    </div>

                    <div class="vocab-list" id="summary-vocab-list" style="overflow-y: auto; max-height: 400px; padding-right: 4px;">
                        <!-- Rendered dynamically -->
                    </div>
                </div>
            </div>
        </div>
    `;

    const vocabListContainer = document.getElementById('summary-vocab-list');
    const searchInput = document.getElementById('vocab-search');

    // Render terms function
    function renderVocab(filterQuery = '') {
        const filtered = vocabulary.filter(v => 
            v.term.toLowerCase().includes(filterQuery.toLowerCase()) ||
            v.definition.toLowerCase().includes(filterQuery.toLowerCase())
        );

        if (filtered.length === 0) {
            vocabListContainer.innerHTML = `
                <div style="text-align: center; padding: 20px 0; color: var(--text-muted); font-size: 0.85rem;">
                    No matching terms found.
                </div>
            `;
            return;
        }

        vocabListContainer.innerHTML = filtered.map(v => `
            <div class="vocab-item" style="margin-bottom: 14px; padding-bottom: 12px;">
                <div class="vocab-term">${v.term}</div>
                <div class="vocab-def" style="margin-top: 4px; line-height: 1.4;">${v.definition}</div>
            </div>
        `).join('');
    }

    // Initialize list
    renderVocab();

    // Attach search event
    searchInput.addEventListener('input', (e) => {
        renderVocab(e.target.value);
    });

    if (window.lucide) window.lucide.createIcons();
}
