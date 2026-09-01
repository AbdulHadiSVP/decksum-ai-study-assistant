/**
 * DeckSum - Document Manager & Uploader Component
 */

import { api } from '../utils/api.js';

export function renderUpload(container, app) {
    container.innerHTML = `
        <div class="upload-container">
            <div class="glass-card">
                <h2>Upload Study Materials</h2>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">
                    Upload your lecture notes, textbook chapters, or articles (PDF, DOCX, or TXT). 
                    Our backend PyMuPDF parser will extract clean text content and build summaries, flashcards, quizzes, and chat engines.
                </p>
                
                <div class="drop-zone" id="file-drop-zone">
                    <i data-lucide="upload-cloud" class="upload-icon"></i>
                    <h3>Drag & drop your file here</h3>
                    <p>Or click to browse from your device</p>
                    <p style="font-size: 0.8rem; opacity: 0.7;">Supports: .pdf, .docx, .txt (Max 15MB)</p>
                    <input type="file" id="file-selector" class="file-input" accept=".pdf,.docx,.txt,.md">
                </div>

                <div class="form-group" style="margin-top: 20px;">
                    <label class="form-label" for="custom-topic-input">Custom Focus / Study Topic (Optional)</label>
                    <input type="text" id="custom-topic-input" class="form-input" placeholder="e.g. Photosynthesis, Data Structures lecture 3...">
                </div>

                <div id="upload-progress-container" style="display: none; margin-top: 20px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 6px;">
                        <span id="progress-status-text">Uploading study material...</span>
                        <span id="progress-percent">0%</span>
                    </div>
                    <div class="parse-progress-bar">
                        <div class="parse-progress-fill" id="progress-bar-fill"></div>
                    </div>
                </div>
            </div>

            <div class="glass-card">
                <h2>Your Study Library</h2>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">Select a document to set it as active for study sessions.</p>
                
                <div class="uploaded-files-list" id="library-files-list">
                    <!-- Loaded dynamically -->
                </div>
            </div>
        </div>
    `;

    const dropZone = document.getElementById('file-drop-zone');
    const fileSelector = document.getElementById('file-selector');
    const customTopicInput = document.getElementById('custom-topic-input');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressStatusText = document.getElementById('progress-status-text');
    const progressPercentText = document.getElementById('progress-percent');

    // Drag and drop handlers
    dropZone.addEventListener('click', () => fileSelector.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    fileSelector.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    async function handleFileUpload(file) {
        progressContainer.style.display = 'block';
        progressBarFill.style.width = '10%';
        progressPercentText.textContent = '10%';
        progressStatusText.textContent = `Uploading ${file.name} to server...`;

        try {
            // Build Form Data
            const formData = new FormData();
            formData.append("file", file);
            formData.append("customTopic", customTopicInput.value.trim());

            progressBarFill.style.width = '30%';
            progressPercentText.textContent = '30%';
            progressStatusText.textContent = `Extracting text & running AI processing pipeline...`;

            // Call API
            const token = api.getToken();
            const response = await fetch('/api/documents/upload', {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || `Server returned status ${response.status}`);
            }

            const result = await response.json();
            progressBarFill.style.width = '100%';
            progressPercentText.textContent = '100%';
            progressStatusText.textContent = `Study Material Processed!`;

            // Reload documents from server
            app.state.documents = await api.request('/api/documents');
            app.state.flashcards = await api.request('/api/flashcards');
            app.setActiveDocument(result.document_id);

            setTimeout(() => {
                progressContainer.style.display = 'none';
                app.navigateTo('dashboard');
            }, 1000);

        } catch (error) {
            console.error("Document parsing/generation failed:", error);
            progressStatusText.textContent = `Error: ${error.message}`;
            progressBarFill.style.backgroundColor = 'var(--color-danger)';
            progressBarFill.style.width = '100%';
            progressPercentText.textContent = 'Error';
        }
    }

    renderLibraryList();

    function renderLibraryList() {
        const listContainer = document.getElementById('library-files-list');
        if (app.state.documents.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-view">
                    <i data-lucide="folder" class="empty-view-icon"></i>
                    <p>Your library is empty. Upload your first document above!</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        listContainer.innerHTML = app.state.documents.map(doc => {
            const isActive = doc.id === app.state.activeDocId;
            const fileExt = doc.name.split('.').pop().toLowerCase();
            let iconName = 'file-text';
            if (fileExt === 'pdf') iconName = 'file-digit';
            else if (fileExt === 'docx') iconName = 'file-edit';

            return `
                <div class="file-card ${isActive ? 'active-doc' : ''}" style="${isActive ? 'border-color: var(--accent-primary); background: var(--active-doc-bg);' : ''}">
                    <div class="file-details">
                        <i data-lucide="${iconName}" class="file-icon"></i>
                        <div>
                            <div class="file-name">${doc.name}</div>
                            <div class="file-size">Added: ${doc.addedDate} &bull; Size: ${doc.size}</div>
                        </div>
                    </div>
                    <div class="file-actions">
                        ${isActive ? 
                            `<span class="due-status-badge upcoming" style="display:inline-flex; align-items:center; height:32px; font-size:0.75rem;">Active</span>` : 
                            `<button class="btn-primary" data-select-id="${doc.id}" style="padding: 6px 14px; font-size: 0.8rem;">Activate</button>`
                        }
                        <button class="btn-icon" data-rename-id="${doc.id}" title="Rename Document"><i data-lucide="edit-2"></i></button>
                        <button class="btn-icon danger" data-delete-id="${doc.id}" title="Delete Document"><i data-lucide="trash-2"></i></button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach action handlers
        listContainer.querySelectorAll('[data-select-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const docId = btn.getAttribute('data-select-id');
                app.setActiveDocument(docId);
            });
        });

        listContainer.querySelectorAll('[data-rename-id]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const docId = btn.getAttribute('data-rename-id');
                const doc = app.state.documents.find(d => d.id === docId);
                const newName = prompt(`Enter new name for "${doc.name}":`, doc.name);
                if (newName && newName.trim()) {
                    try {
                        await api.request(`/api/documents/${docId}/rename`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: newName.trim() })
                        });
                        doc.name = newName.trim();
                        renderLibraryList();
                        app.renderHeaderActions();
                    } catch (err) {
                        alert(`Failed to rename document: ${err.message}`);
                    }
                }
            });
        });

        listContainer.querySelectorAll('[data-delete-id]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const docId = btn.getAttribute('data-delete-id');
                const doc = app.state.documents.find(d => d.id === docId);
                if (confirm(`Are you sure you want to delete "${doc.name}"? This will delete all generated quizzes, study records, and flashcards associated with this document.`)) {
                    try {
                        await api.request(`/api/documents/${docId}`, { method: "DELETE" });
                        
                        // Remove document locally
                        app.state.documents = app.state.documents.filter(d => d.id !== docId);
                        app.state.flashcards = app.state.flashcards.filter(fc => fc.docId !== docId);
                        
                        // Reset active document if active was deleted
                        if (app.state.activeDocId === docId) {
                            app.state.activeDocId = app.state.documents.length > 0 ? app.state.documents[0].id : null;
                            if (app.state.activeDocId) {
                                localStorage.setItem('decksum_active_doc_id', app.state.activeDocId);
                            } else {
                                localStorage.removeItem('decksum_active_doc_id');
                            }
                        }
                        
                        renderLibraryList();
                        app.renderHeaderActions();
                    } catch (err) {
                        alert(`Failed to delete document: ${err.message}`);
                    }
                }
            });
        });

        if (window.lucide) window.lucide.createIcons();
    }
}
