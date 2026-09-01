/**
 * DeckSum - Scholar Settings & Profile Component
 */

import { api } from '../utils/api.js';

export async function renderSettings(container, app) {
    // Render loading spinner
    container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 60px 0; gap:16px;">
            <div class="loader-spinner" style="width:36px; height:36px;"></div>
            <p style="color:var(--text-muted); font-size:0.9rem;">Synching scholar settings...</p>
        </div>
    `;

    try {
        // Fetch current profile preferences
        const profile = await api.request('/api/auth/profile');
        const username = profile.username;
        const preferences = profile.preferences || {};
        const currentQuestion = profile.security_question || "";

        const PREDEFINED_QUESTIONS = [
            "What was the name of your first school?",
            "What is the name of your favorite pet?",
            "In what city or town did your parents meet?",
            "What was your favorite childhood book?",
            "What is your mother's maiden name?",
            "What was the make and model of your first car?"
        ];
        
        let selectQuestionVal = "";
        let customQuestionVal = "";
        if (currentQuestion) {
            if (PREDEFINED_QUESTIONS.includes(currentQuestion)) {
                selectQuestionVal = currentQuestion;
            } else {
                selectQuestionVal = "custom";
                customQuestionVal = currentQuestion;
            }
        }
        
        const subjects = preferences.subjects || ["General"];
        const difficulty = preferences.difficulty || "medium";
        const provider = preferences.provider || "mock";
        const apiKey = preferences.apiKey || "";
        const customUrl = preferences.customUrl || "http://localhost:11434/v1";
        const customModel = preferences.customModel || "llama3";

        // Standard subject tags list
        const ALL_SUBJECTS = ["Computer Science", "Mathematics", "Biology", "Chemistry", "Physics", "History", "Literature", "Art", "Medicine", "Languages"];

        container.innerHTML = `
            <div class="settings-container" style="display:flex; flex-direction:column; gap:24px; max-width: 650px; margin: 0 auto;">
                
                <!-- Scholar Profile & Subject Preferences (Module 1) -->
                <div class="glass-card">
                    <h3 style="margin-bottom: 8px; display:flex; align-items:center; gap:8px;">
                        <i data-lucide="user" style="color:var(--accent-tertiary);"></i>
                        Scholar Profile & Preferences
                    </h3>
                    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 20px;">
                        Personalize your learning profiles and preferences. Subject choices help tailor terminology extractions.
                    </p>

                    <div class="form-group">
                        <label class="form-label">Username</label>
                        <input type="text" class="form-input" value="${username}" disabled style="opacity: 0.6; cursor: not-allowed; width: 100%;">
                    </div>

                    <div class="form-group">
                        <label class="form-label" style="margin-bottom: 8px;">Favorite / Target Study Subjects</label>
                        <div id="subject-tags-container" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom: 8px;">
                            ${ALL_SUBJECTS.map(subj => {
                                const isSelected = subjects.includes(subj);
                                return `
                                    <span class="due-status-badge ${isSelected ? 'upcoming' : ''}" 
                                          style="cursor:pointer; padding:6px 12px; font-size:0.8rem; user-select:none; border-color:${isSelected ? 'var(--color-success)' : 'var(--border-color)'}; opacity:${isSelected ? 1 : 0.6};"
                                          data-subject="${subj}">
                                        ${subj}
                                    </span>
                                `;
                            }).join('')}
                        </div>
                        <span class="form-help">Click to toggle your favorite academic subject tags.</span>
                    </div>

                    <div class="form-group" style="margin-top: 16px;">
                        <label class="form-label" for="difficulty-select">Quiz Custom Difficulty Level</label>
                        <select id="difficulty-select" class="form-select">
                            <option value="easy" ${difficulty === 'easy' ? 'selected' : ''}>Easy - Basic terms and definitions</option>
                            <option value="medium" ${difficulty === 'medium' ? 'selected' : ''}>Medium - Conceptual & intermediate evaluations</option>
                            <option value="hard" ${difficulty === 'hard' ? 'selected' : ''}>Hard - Complex scenarios and deep details</option>
                        </select>
                    </div>
                </div>

                <!-- Security Settings Recovery (Forgot Password recovery) -->
                <div class="glass-card">
                    <h3 style="margin-bottom: 8px; display:flex; align-items:center; gap:8px;">
                        <i data-lucide="shield-check" style="color:var(--accent-secondary);"></i>
                        Security Recovery Settings
                    </h3>
                    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 20px;">
                        Configure your password recovery question and answer.
                    </p>

                    <div class="form-group">
                        <label class="form-label" for="settings-question-select">Security Question</label>
                        <select id="settings-question-select" class="form-select" style="width: 100%;">
                            <option value="" disabled ${!selectQuestionVal ? 'selected' : ''}>Select a security question...</option>
                            ${PREDEFINED_QUESTIONS.map(q => `
                                <option value="${q}" ${selectQuestionVal === q ? 'selected' : ''}>${q}</option>
                            `).join('')}
                            <option value="custom" ${selectQuestionVal === 'custom' ? 'selected' : ''}>Custom Question...</option>
                        </select>
                    </div>

                    <div class="form-group" id="settings-custom-question-group" style="display: ${selectQuestionVal === 'custom' ? 'flex' : 'none'}; margin-top: 12px;">
                        <label class="form-label" for="settings-custom-question">Custom Security Question</label>
                        <input type="text" id="settings-custom-question" class="form-input" placeholder="Enter custom security question..." value="${customQuestionVal}" style="width: 100%;">
                    </div>

                    <div class="form-group" style="margin-top: 12px;">
                        <label class="form-label" for="settings-security-answer">Security Answer</label>
                        <input type="text" id="settings-security-answer" class="form-input" placeholder="Enter security answer..." style="width: 100%;">
                        <span class="form-help">Enter the answer to configure or change your question recovery options.</span>
                    </div>

                    <div style="margin-top: 24px; display:flex; justify-content:space-between; align-items:center;">
                        <span id="save-security-status-msg" style="font-size:0.85rem; color:var(--color-success); opacity:0; transition:opacity var(--transition-fast);">
                            Security settings updated!
                        </span>
                        <button class="btn-primary" id="btn-save-security">Update Security</button>
                    </div>
                </div>

                <!-- AI Engine Configuration (Module 3 & 5) -->
                <div class="glass-card">
                    <h3 style="margin-bottom: 8px; display:flex; align-items:center; gap:8px;">
                        <i data-lucide="cpu" style="color:var(--accent-primary);"></i>
                        AI Generation Engines
                    </h3>
                    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 20px;">
                        Configure API pipelines. Choose between the high-fidelity offline analyzer or external APIs.
                    </p>

                    <div class="form-group">
                        <label class="form-label" for="provider-select">AI Generation Provider</label>
                        <select id="provider-select" class="form-select">
                            <option value="mock" ${provider === 'mock' ? 'selected' : ''}>Simulated AI Engine (Offline - Free)</option>
                            <option value="openai" ${provider === 'openai' ? 'selected' : ''}>OpenAI API (GPT-4o-mini)</option>
                            <option value="gemini" ${provider === 'gemini' ? 'selected' : ''}>Google Gemini API (Gemini 2.0 / 1.5 Flash)</option>
                            <option value="custom" ${provider === 'custom' ? 'selected' : ''}>Custom OpenAI-Compatible API (e.g. Ollama, Claude)</option>
                        </select>
                    </div>

                    <div class="form-group" id="api-key-group" style="display: ${provider === 'mock' ? 'none' : 'flex'};">
                        <label class="form-label" for="api-key-input">API Secret Key</label>
                        <div style="position:relative;">
                            <input type="password" id="api-key-input" class="form-input" placeholder="Paste your API key here..." value="${apiKey || ''}" style="width:100%; padding-right:40px;">
                            <button type="button" id="btn-toggle-key-visibility" class="btn-icon" style="position:absolute; right:8px; top:5px; width:32px; height:32px;" title="Show/Hide Key">
                                <i data-lucide="eye"></i>
                            </button>
                        </div>
                        <span class="form-help" id="key-help-text">
                            ${provider === 'custom' ? 'Enter your custom API secret key (leave blank if not required).' : (provider === 'openai' ? 'Enter your OpenAI API secret key (starts with <code style="color:var(--accent-secondary)">sk-...</code>).' : 'Enter your Google Gemini API key.')}
                        </span>
                    </div>

                    <div class="form-group" id="custom-url-group" style="display: ${provider === 'custom' ? 'flex' : 'none'};">
                        <label class="form-label" for="custom-url-input">Custom API Base URL</label>
                        <input type="text" id="custom-url-input" class="form-input" placeholder="e.g. http://localhost:11434/v1" value="${customUrl}" style="width:100%;">
                        <span class="form-help">Enter the base endpoint of your custom LLM provider (e.g. <code>http://localhost:11434/v1</code> for Ollama).</span>
                    </div>

                    <div class="form-group" id="custom-model-group" style="display: ${provider === 'custom' ? 'flex' : 'none'};">
                        <label class="form-label" for="custom-model-input">Custom Model Name</label>
                        <input type="text" id="custom-model-input" class="form-input" placeholder="e.g. llama3" value="${customModel}" style="width:100%;">
                        <span class="form-help">Enter the model name (e.g. <code>llama3</code>, <code>mistral</code>, etc.).</span>
                    </div>

                    <div style="margin-top: 24px; display:flex; justify-content:space-between; align-items:center;">
                        <span id="save-status-msg" style="font-size:0.85rem; color:var(--color-success); opacity:0; transition:opacity var(--transition-fast);">
                            Profile & settings updated!
                        </span>
                        <button class="btn-primary" id="btn-save-settings">Save Config</button>
                    </div>
                </div>

                <!-- Danger Zone Card (Module 6 database management) -->
                <div class="glass-card" style="border-color: rgba(239, 68, 68, 0.3);">
                    <h3 style="margin-bottom: 8px; display:flex; align-items:center; gap:8px; color:var(--color-danger);">
                        <i data-lucide="alert-triangle"></i>
                        Reset & Storage
                    </h3>
                    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 20px;">
                        Manage database wipes or reschedule spaced study logs.
                    </p>

                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding: 12px; background:rgba(255,255,255,0.01); border-radius:var(--border-radius-sm); border:1px solid var(--border-color);">
                            <div>
                                <div style="font-weight:600; font-size:0.9rem;">Reset Flashcard Intervals</div>
                                <div style="font-size:0.75rem; color:var(--text-muted);">Resets Leitner ease scores and sets repetitions to 0.</div>
                            </div>
                            <button class="btn-rate hard" id="btn-reset-intervals" style="padding:6px 12px; font-size:0.8rem;">Reset</button>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; padding: 12px; background:rgba(239, 68, 68, 0.02); border-radius:var(--border-radius-sm); border: 1px solid rgba(239, 68, 68, 0.15);">
                            <div>
                                <div style="font-weight:600; font-size:0.9rem; color:var(--color-danger);">Wipe All Personal Data</div>
                                <div style="font-size:0.75rem; color:var(--text-muted);">Deletes your entire study library, history logs, and card decks.</div>
                            </div>
                            <button class="btn-primary" id="btn-wipe-storage" style="background:var(--color-danger); box-shadow:none; padding:6px 12px; font-size:0.8rem;">Wipe Data</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Handle subject tag toggling
        const selectedSubjects = [...subjects];
        const subjectTags = document.querySelectorAll('#subject-tags-container [data-subject]');
        subjectTags.forEach(tag => {
            tag.addEventListener('click', () => {
                const subj = tag.getAttribute('data-subject');
                const idx = selectedSubjects.indexOf(subj);
                if (idx !== -1) {
                    if (selectedSubjects.length > 1) { // keep at least one
                        selectedSubjects.splice(idx, 1);
                        tag.classList.remove('upcoming');
                        tag.style.borderColor = 'var(--border-color)';
                        tag.style.opacity = '0.6';
                    }
                } else {
                    selectedSubjects.push(subj);
                    tag.classList.add('upcoming');
                    tag.style.borderColor = 'var(--color-success)';
                    tag.style.opacity = '1';
                }
            });
        });

        const providerSelect = document.getElementById('provider-select');
        const apiKeyGroup = document.getElementById('api-key-group');
        const apiKeyInput = document.getElementById('api-key-input');
        const toggleKeyVisBtn = document.getElementById('btn-toggle-key-visibility');
        const difficultySelect = document.getElementById('difficulty-select');
        const saveBtn = document.getElementById('btn-save-settings');
        const saveStatusMsg = document.getElementById('save-status-msg');

        const resetIntervalsBtn = document.getElementById('btn-reset-intervals');
        const wipeStorageBtn = document.getElementById('btn-wipe-storage');

        // Toggle API Key input and Custom URL/Model visibility
        providerSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            const customUrlGroup = document.getElementById('custom-url-group');
            const customModelGroup = document.getElementById('custom-model-group');
            
            if (val === 'mock') {
                apiKeyGroup.style.display = 'none';
                customUrlGroup.style.display = 'none';
                customModelGroup.style.display = 'none';
            } else {
                apiKeyGroup.style.display = 'flex';
                const helpText = document.getElementById('key-help-text');
                if (val === 'openai') {
                    helpText.innerHTML = `Enter your OpenAI API secret key (starts with <code style="color:var(--accent-secondary)">sk-...</code>).`;
                    customUrlGroup.style.display = 'none';
                    customModelGroup.style.display = 'none';
                } else if (val === 'gemini') {
                    helpText.innerHTML = `Enter your Google Gemini API key.`;
                    customUrlGroup.style.display = 'none';
                    customModelGroup.style.display = 'none';
                } else if (val === 'custom') {
                    helpText.innerHTML = `Enter your custom API secret key (leave blank if not required).`;
                    customUrlGroup.style.display = 'flex';
                    customModelGroup.style.display = 'flex';
                }
            }
        });

        // Toggle Password Masking
        toggleKeyVisBtn.addEventListener('click', () => {
            const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
            apiKeyInput.setAttribute('type', type);
            const iconName = type === 'password' ? 'eye' : 'eye-off';
            toggleKeyVisBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
            if (window.lucide) window.lucide.createIcons();
        });

        // Save preferences
        saveBtn.addEventListener('click', async () => {
            try {
                const customUrlInput = document.getElementById('custom-url-input');
                const customModelInput = document.getElementById('custom-model-input');
                
                const updatedPref = {
                    subjects: selectedSubjects,
                    difficulty: difficultySelect.value,
                    provider: providerSelect.value,
                    apiKey: apiKeyInput.value.trim(),
                    customUrl: customUrlInput ? customUrlInput.value.trim() : '',
                    customModel: customModelInput ? customModelInput.value.trim() : ''
                };

                const result = await api.request('/api/auth/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ preferences: updatedPref })
                });

                // Update runtime app settings cache
                app.state.settings.provider = result.preferences.provider;
                app.state.settings.apiKey = result.preferences.apiKey;
                app.state.settings.customUrl = result.preferences.customUrl;
                app.state.settings.customModel = result.preferences.customModel;

                saveStatusMsg.style.opacity = '1';
                setTimeout(() => {
                    saveStatusMsg.style.opacity = '0';
                }, 2500);

            } catch (err) {
                alert(`Failed to save configuration: ${err.message}`);
            }
        });

        // Security Settings Event Handlers
        const settingsQuestionSelect = document.getElementById('settings-question-select');
        const settingsCustomQuestionGroup = document.getElementById('settings-custom-question-group');
        const settingsCustomQuestionInput = document.getElementById('settings-custom-question');
        const settingsSecurityAnswerInput = document.getElementById('settings-security-answer');
        const saveSecurityBtn = document.getElementById('btn-save-security');
        const saveSecurityStatusMsg = document.getElementById('save-security-status-msg');

        if (settingsQuestionSelect) {
            settingsQuestionSelect.addEventListener('change', (e) => {
                if (e.target.value === 'custom') {
                    settingsCustomQuestionGroup.style.display = 'flex';
                } else {
                    settingsCustomQuestionGroup.style.display = 'none';
                    if (settingsCustomQuestionInput) settingsCustomQuestionInput.value = '';
                }
            });
        }

        if (saveSecurityBtn) {
            saveSecurityBtn.addEventListener('click', async () => {
                try {
                    let question = settingsQuestionSelect.value;
                    if (question === 'custom') {
                        question = settingsCustomQuestionInput.value.trim();
                    }
                    const answer = settingsSecurityAnswerInput.value.trim();

                    if (!question) {
                        alert("Please select or specify a security question.");
                        return;
                    }
                    if (!answer) {
                        alert("Security answer is required to update security recovery settings.");
                        return;
                    }

                    await api.request('/api/auth/security', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            security_question: question,
                            security_answer: answer
                        })
                    });

                    saveSecurityStatusMsg.style.opacity = '1';
                    settingsSecurityAnswerInput.value = '';
                    setTimeout(() => {
                        saveSecurityStatusMsg.style.opacity = '0';
                    }, 2500);

                } catch (err) {
                    alert(`Failed to save security configuration: ${err.message}`);
                }
            });
        }

        // Reset Spaced Repetition Intervals
        resetIntervalsBtn.addEventListener('click', async () => {
            if (confirm("Reset Leitner difficulty ratings and repetitions for all flashcards in your deck? Card content will remain intact.")) {
                try {
                    const res = await api.request('/api/flashcards/reset', { method: 'POST' });
                    // Re-sync flashcards locally
                    app.state.flashcards = await api.request('/api/flashcards');
                    alert(res.message);
                } catch (err) {
                    alert(`Failed to reset flashcard intervals: ${err.message}`);
                }
            }
        });

        // Wipe Database
        wipeStorageBtn.addEventListener('click', async () => {
            if (confirm("Wipe DeckSum data? This completely deletes your uploaded documents, study statistics, and flashcard decks. This is irreversible.")) {
                try {
                    await api.request('/api/auth/wipe', { method: 'POST' });
                    api.logout(); // Logout on wipe
                } catch (err) {
                    alert(`Failed to wipe personal data: ${err.message}`);
                }
            }
        });

        if (window.lucide) window.lucide.createIcons();

    } catch (err) {
        console.error("Settings render failed:", err);
        container.innerHTML = `
            <div class="glass-card" style="border-color:var(--color-danger); text-align:center; padding:30px;">
                <i data-lucide="alert-octagon" style="color:var(--color-danger); width:40px; height:40px; margin-bottom:12px;"></i>
                <h3>Failed to load settings panel</h3>
                <p style="color:var(--text-secondary); margin-top:6px;">${err.message}</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }
}
