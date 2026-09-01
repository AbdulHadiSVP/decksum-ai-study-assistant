/**
 * DeckSum - Document Context Chat Component
 */

import { api } from '../utils/api.js';

export function renderChat(container, app) {
    const activeDoc = app.state.documents.find(d => d.id === app.state.activeDocId);
    
    if (!activeDoc) {
        container.innerHTML = `
            <div class="glass-card empty-view">
                <i data-lucide="message-square" class="empty-view-icon"></i>
                <h2>No Active Study Material</h2>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">
                    Please select or upload a document to enable conversational Q&A chat.
                </p>
                <button class="btn-primary" id="chat-btn-upload">Go to Material Manager</button>
            </div>
        `;
        document.getElementById('chat-btn-upload').addEventListener('click', () => app.navigateTo('upload'));
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // Initialize chat history for this document in local memory if missing
    if (!activeDoc.chatHistory) {
        // Retrieve cached history if exists in sessionStorage/localStorage
        const cached = localStorage.getItem(`chat_history_${activeDoc.id}`);
        if (cached) {
            try {
                activeDoc.chatHistory = JSON.parse(cached);
            } catch (e) {
                activeDoc.chatHistory = null;
            }
        }
        
        if (!activeDoc.chatHistory) {
            activeDoc.chatHistory = [
                {
                    id: 'welcome',
                    sender: 'assistant',
                    text: `Hello! I have fully processed **"${activeDoc.name}"**. Ask me anything about this document and I will extract the answers for you.`,
                    citation: 'Tutor Assistant'
                }
            ];
            localStorage.setItem(`chat_history_${activeDoc.id}`, JSON.stringify(activeDoc.chatHistory));
        }
    }

    container.innerHTML = `
        <div class="chat-container glass-card" style="padding:0; display:flex; flex-direction:column;">
            <!-- Chat Header Badge -->
            <div style="padding: 16px 24px; border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; background: rgba(255,255,255,0.01);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i data-lucide="message-square" style="color:var(--accent-secondary); width:20px; height:20px;"></i>
                    <span style="font-weight:600; font-size:0.95rem;">Study Chat: ${activeDoc.name}</span>
                </div>
                <button class="btn-icon danger" id="btn-clear-chat" title="Clear Chat History"><i data-lucide="trash-2"></i></button>
            </div>

            <!-- Suggested prompts row -->
            <div style="padding: 12px 20px; display:flex; gap:8px; overflow-x:auto; border-bottom:1px solid var(--border-color); align-items:center; white-space:nowrap;" id="suggested-prompts-row">
                <span style="font-size:0.75rem; color:var(--text-muted);">Quick Prompts:</span>
                <span class="due-status-badge upcoming prompt-chip" style="cursor:pointer;">Summary of document</span>
                <span class="due-status-badge upcoming prompt-chip" style="cursor:pointer;">Define main terminology</span>
                <span class="due-status-badge upcoming prompt-chip" style="cursor:pointer;">What are key findings?</span>
            </div>

            <!-- Messages Area -->
            <div class="chat-messages" id="chat-messages-container">
                <!-- Dynamically populated -->
            </div>

            <!-- Chat Typing indicator -->
            <div id="chat-typing-indicator" style="display:none; padding: 12px 24px; align-self:flex-start; margin-left: 20px; margin-bottom: 10px;">
                <div style="display:flex; align-items:center; gap:8px; background:var(--bg-card); padding:10px 16px; border-radius:12px; border:1px solid var(--border-color);">
                    <div class="loader-spinner" style="width:16px; height:16px; border-width:2px;"></div>
                    <span style="font-size:0.8rem; color:var(--text-muted);">DeckSum is searching context...</span>
                </div>
            </div>

            <!-- Message Input Form -->
            <form class="chat-input-area" id="chat-form">
                <input type="text" id="chat-input-text" class="chat-input" placeholder="Ask a question about the document context..." autocomplete="off">
                <button type="submit" class="btn-primary" style="display:flex; align-items:center; gap:8px; padding: 12px 20px;">
                    Send <i data-lucide="send" style="width:16px; height:16px;"></i>
                </button>
            </form>
        </div>
    `;

    const messagesContainer = document.getElementById('chat-messages-container');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input-text');
    const typingIndicator = document.getElementById('chat-typing-indicator');
    const clearChatBtn = document.getElementById('btn-clear-chat');

    function scrollChatToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function renderMessages() {
        messagesContainer.innerHTML = activeDoc.chatHistory.map(msg => {
            const isUser = msg.sender === 'user';
            return `
                <div class="chat-bubble ${isUser ? 'user' : 'assistant'}">
                    <div style="font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap;">${msg.text}</div>
                    ${msg.citation ? `
                        <div class="chat-citation" style="color: ${isUser ? 'rgba(255,255,255,0.7)' : 'var(--accent-secondary)'};">
                            <i data-lucide="tag" style="width: 12px; height: 12px;"></i>
                            <span>${msg.citation}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
        if (window.lucide) window.lucide.createIcons();
        scrollChatToBottom();
    }

    renderMessages();

    // Suggested prompts selector
    document.querySelectorAll('.prompt-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chatInput.value = chip.textContent;
            chatInput.focus();
        });
    });

    // Handle Form Submit
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const queryText = chatInput.value.trim();
        if (!queryText) return;

        // 1. Add User message
        const userMsg = {
            id: `msg_user_${Date.now()}`,
            sender: 'user',
            text: queryText
        };
        activeDoc.chatHistory.push(userMsg);
        localStorage.setItem(`chat_history_${activeDoc.id}`, JSON.stringify(activeDoc.chatHistory));
        renderMessages();
        
        chatInput.value = '';
        typingIndicator.style.display = 'block';
        scrollChatToBottom();

        try {
            // 2. Call backend /api/chat with multi-turn history
            const result = await api.request('/api/chat', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    doc_id: activeDoc.id,
                    query: queryText,
                    chat_history: activeDoc.chatHistory
                })
            });
            
            // 3. Add assistant response
            const assistantMsg = {
                id: `msg_assistant_${Date.now()}`,
                sender: 'assistant',
                text: result.answer,
                citation: result.citation
            };
            
            activeDoc.chatHistory.push(assistantMsg);
            localStorage.setItem(`chat_history_${activeDoc.id}`, JSON.stringify(activeDoc.chatHistory));
            
        } catch (error) {
            console.error("Q&A search error:", error);
            activeDoc.chatHistory.push({
                id: `msg_error_${Date.now()}`,
                sender: 'assistant',
                text: `I encountered an error querying the study engine: ${error.message}. Please check settings.`,
                citation: 'System Error'
            });
            localStorage.setItem(`chat_history_${activeDoc.id}`, JSON.stringify(activeDoc.chatHistory));
        } finally {
            typingIndicator.style.display = 'none';
            renderMessages();
        }
    });

    // Clear chat
    clearChatBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear the conversation history for this document?")) {
            activeDoc.chatHistory = [
                {
                    id: 'welcome',
                    sender: 'assistant',
                    text: `Chat restarted. Ask me anything about **"${activeDoc.name}"**!`,
                    citation: 'Tutor Assistant'
                }
            ];
            localStorage.setItem(`chat_history_${activeDoc.id}`, JSON.stringify(activeDoc.chatHistory));
            renderMessages();
        }
    });
}
