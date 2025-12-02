// Nutri Chat Interface

// Configuration for GitHub Pages deployment:
// 1. Run the backend locally: .\start.bat
// 2. Check the Ngrok window for your public URL (https://....ngrok-free.app)
// 3. Paste it below as NGROK_URL (replace the existing URL)
// 4. Push to GitHub Pages
const NGROK_URL = "https://optatively-dreich-scot.ngrok-free.dev"; 

// API Base - uses NGROK_URL for production, localhost for local dev
const API_BASE = NGROK_URL ? NGROK_URL.replace(/\/$/, '') : 'http://localhost:8000';
let chatHistory = [];

// Session management
let sessionId = localStorage.getItem('nutri_session_id');
if (!sessionId) {
    sessionId = generateUUID();
    localStorage.setItem('nutri_session_id', sessionId);
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    
    // Enter key to send
    document.getElementById('userInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
});

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function setInput(text) {
    const input = document.getElementById('userInput');
    input.value = text;
    input.focus();
    autoResize(input);
}

async function sendMessage() {
    const input = document.getElementById('userInput');
    const text = input.value.trim();
    const useHybrid = document.getElementById('hybridToggle').checked;
    
    if (!text) return;
    
    // Extract all form field values
    const dislikes = document.getElementById('dislikes')?.value.trim() || 'none';
    const dietaryConstraints = document.getElementById('dietaryConstraints')?.value.trim() || 'none';
    const goal = document.getElementById('goal')?.value.trim() || 'meal';
    const innovationLevel = parseInt(document.getElementById('innovationLevel')?.value || '1');
    
    // Clear input
    input.value = '';
    input.style.height = 'auto';
    
    // Add user message
    appendMessage('user', text);
    
    // Show loading
    const loadingId = showLoading();
    
    try {
        let response;
        let data;
        
        // Determine mode: Search vs Recipe Generation
        if (text.toLowerCase().startsWith('search:')) {
            // Search Mode
            const query = text.substring(7).trim();
            response = await fetch(`${API_BASE}/api/hybrid_search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, k: 5, use_hybrid: useHybrid })
            });
            
            data = await response.json();
            removeMessage(loadingId);
            
            if (data.success) {
                const answer = `Here are the top results for "${query}":`;
                appendMessage('assistant', answer, data.recipes);
            } else {
                appendMessage('assistant', `Error: ${data.error}`);
            }
            
        } else {
            // Recipe Generation Mode - Include all fields
            response = await fetch(`${API_BASE}/api/recipe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingredients: text,
                    dislikes: dislikes,
                    dietary_constraints: dietaryConstraints,
                    goal: goal,
                    innovation_level: innovationLevel,
                    session_id: sessionId  // Include session ID
                })
            });
            
            data = await response.json();
            removeMessage(loadingId);
            
            if (data.success) {
                appendMessage('assistant', data.reply, data.retrieved_recipes);
                // Update session ID if server provided a new one
                if (data.session_id) {
                    sessionId = data.session_id;
                    localStorage.setItem('nutri_session_id', sessionId);
                }
            } else {
                const errorMsg = data.error || data.refusal_message || 'Unknown error - check console';
                appendMessage('assistant', `I couldn't generate a recipe. ${errorMsg}`);
            }
        }
        
        // Save to history (local storage for now)
        saveToHistory(text);
        
    } catch (e) {
        removeMessage(loadingId);
        console.error('API Error:', e);
        appendMessage('assistant', `❌ **Connection Error**\n\nCouldn't reach the backend. Make sure:\n1. Backend is running (\`start.bat\`)\n2. Ngrok URL in chat.js is current\n3. Check browser console (F12)\n\nError: ${e.message}`);
    }
}

function appendMessage(role, text, sources = null) {
    const chatDiv = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    
    // Validate text input to prevent marked.js errors
    if (!text || text === null || text === undefined) {
        text = 'No response received';
    }
    text = String(text); // Ensure it's a string
    
    const icon = role === 'user' ? 'fa-user' : 'fa-robot';
    
    let html = `
        <div class="avatar"><i class="fa-solid ${icon}"></i></div>
        <div class="content">
            ${marked.parse(text)}
    `;
    
    // Append sources if available
    if (sources && sources.length > 0) {
        html += `<div class="sources-container">
            <div class="sources-title"><i class="fa-solid fa-book-open"></i> Sources Used</div>`;
            
        sources.forEach((src, idx) => {
            const score = src.confidence || src.score || 0;
            const percentage = (score * 100).toFixed(0);
            let snippet = src.snippet;
            if (!snippet && src.text) {
                snippet = src.text.substring(0, 150) + '...';
            }
            if (!snippet) snippet = 'No preview available';
            
            html += `
                <div class="source-card">
                    <div class="source-header">
                        <span class="source-title">#${idx + 1} ${src.title || 'Unknown Source'}</span>
                        <span class="source-score">${percentage}% match</span>
                    </div>
                    <div class="source-snippet">"${snippet}"</div>
                    <div class="confidence-bar">
                        <div class="confidence-fill" style="width: ${percentage}%"></div>
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    html += `</div>`;
    msgDiv.innerHTML = html;
    
    chatDiv.appendChild(msgDiv);
    scrollToBottom();
    
    // Simulate streaming effect for assistant
    if (role === 'assistant' && !sources) {
        // Simple fade in is handled by CSS, but we could do character-by-character here if requested.
        // For now, the CSS fade-in is "smooth" enough for the prompt requirements.
    }
}

function showLoading() {
    const chatDiv = document.getElementById('chatMessages');
    const id = 'loading-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';
    msgDiv.id = id;
    
    msgDiv.innerHTML = `
        <div class="avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="content">
            <div class="typing-indicator">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        </div>
    `;
    
    chatDiv.appendChild(msgDiv);
    scrollToBottom();
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function scrollToBottom() {
    const chatDiv = document.getElementById('chatMessages');
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

function startNewChat() {
    const chatDiv = document.getElementById('chatMessages');
    // Keep only the first welcome message
    const welcome = chatDiv.firstElementChild;
    chatDiv.innerHTML = '';
    if (welcome) chatDiv.appendChild(welcome);
    
    // Clear conversation memory on server
    clearMemory();
}

async function clearMemory() {
    try {
        // Generate new session ID
        sessionId = generateUUID();
        localStorage.setItem('nutri_session_id', sessionId);
        console.log('Conversation memory cleared, new session:', sessionId);
    } catch (e) {
        console.error('Failed to clear memory:', e);
    }
}

function saveToHistory(text) {
    // Simple local session history
    const list = document.getElementById('historyList');
    const item = document.createElement('div');
    item.className = 'history-item';
    item.textContent = text;
    item.onclick = () => setInput(text);
    list.prepend(item);
}

function loadHistory() {
    // Placeholder for loading from localStorage if implemented
}

// Mode switching
function switchMode(mode) {
    const recipeForm = document.getElementById('recipeForm');
    const chatForm = document.getElementById('chatForm');
    const recipeBtn = document.getElementById('recipeMode');
    const chatBtn = document.getElementById('chatMode');
    
    if (mode === 'recipe') {
        recipeForm.style.display = 'block';
        chatForm.style.display = 'none';
        recipeBtn.classList.add('active');
        chatBtn.classList.remove('active');
    } else {
        recipeForm.style.display = 'none';
        chatForm.style.display = 'block';
        recipeBtn.classList.remove('active');
        chatBtn.classList.add('active');
    }
}

// Chat message handler
async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    // Clear input
    input.value = '';
    input.style.height = 'auto';
    
    // Add user message
    appendMessage('user', text);
    
    // Show loading
    const loadingId = showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                session_id: sessionId
            })
        });
        
        const data = await response.json();
        removeMessage(loadingId);
        
        if (data.success) {
            appendMessage('assistant', data.reply);
            // Update session ID if server provided a new one
            if (data.session_id) {
                sessionId = data.session_id;
                localStorage.setItem('nutri_session_id', sessionId);
            }
        } else {
            appendMessage('assistant', `Error: ${data.error || 'Failed to get response'}`);
        }
    } catch (error) {
        removeMessage(loadingId);
        appendMessage('assistant', `Network error: ${error.message}. Make sure the server is running.`);
    }
}
