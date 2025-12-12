// Nutri Chat Interface

// Configuration for GitHub Pages deployment:
// 1. Run the backend locally: .\start.bat
// 2. Check the Ngrok window for your public URL (https://....ngrok-free.app)
// 3. Paste it below as NGROK_URL (replace the existing URL)
// 4. Push to GitHub Pages
// 3. Paste it below as NGROK_URL (replace the existing URL)
// 4. Push to GitHub Pages
const NGROK_URL = "https://d688d8b9ce1bcf.lhr.life";

// API Base - uses NGROK_URL if set, otherwise localhost
const API_BASE = NGROK_URL;

console.log('API Base URL:', API_BASE);

let chatHistory = [];

// Session management
let sessionId = localStorage.getItem('nutri_session_id');
if (!sessionId) {
    sessionId = generateUUID();
    localStorage.setItem('nutri_session_id', sessionId);
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadHistory();

    // Enter key to send
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }
});

// Auto-resize textarea (elastic 1-4 lines)
function autoResize(textarea) {
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 48), 120);
    textarea.style.height = newHeight + 'px';

    // Auto-scroll to keep textarea in view
    textarea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Unified function to call the API
async function callApi(payload) {
    try {
        console.log('Sending request to:', `${API_BASE}/api/chat`);
        console.log('Payload:', payload);

        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log('Received response:', data);
        return data;
    } catch (error) {
        console.error('API Call Failed:', error);
        throw error;
    }
}

async function sendMessage() {
    const input = document.getElementById('userInput');
    const text = input.value.trim();

    if (!text) return;

    // Extract all form field values
    const dislikes = document.getElementById('dislikes')?.value.trim() || '';
    const dietaryConstraints = document.getElementById('dietaryConstraints')?.value.trim() || '';
    const goal = document.getElementById('goal')?.value.trim() || 'meal';
    const innovationLevel = parseInt(document.getElementById('innovationLevel')?.value || '1');

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Add user message
    appendMessage('user', `**Ingredients:** ${text}\n**Goal:** ${goal}`);

    // Show loading
    const loadingId = showLoading();

    try {
        // Construct message for the LLM
        const userMessage = `Create a ${goal} recipe using these ingredients: ${text}.`;

        const payload = {
            session_id: sessionId,
            message: userMessage,
            ingredients: text,
            dislikes: dislikes,
            dietary_constraints: dietaryConstraints,
            goal: goal,
            innovation_level: innovationLevel
        };

        const data = await callApi(payload);
        removeMessage(loadingId);

        // Handle response
        if (data && data.answer) {
            appendMessage('assistant', data.answer, data.sources || data.facts_used);
            if (data.session_id) {
                sessionId = data.session_id;
                localStorage.setItem('nutri_session_id', sessionId);
            }
        } else {
            appendMessage('assistant', 'Received empty response from server.');
        }

    } catch (e) {
        removeMessage(loadingId);
        appendMessage('assistant', `❌ **Connection Error**\n\n${e.message}\n\nCheck console (F12) for details.`);
    }
}

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
        const payload = {
            session_id: sessionId,
            message: text,
            // Pass empty constraints for general chat, or grab them if you want persistent preferences
            ingredients: "",
            dislikes: "",
            dietary_constraints: "",
            goal: "chat",
            innovation_level: 1
        };

        const data = await callApi(payload);
        removeMessage(loadingId);

        if (data && data.answer) {
            appendMessage('assistant', data.answer, data.sources || data.facts_used);
            if (data.session_id) {
                sessionId = data.session_id;
                localStorage.setItem('nutri_session_id', sessionId);
            }
        } else {
            appendMessage('assistant', 'Received empty response from server.');
        }
    } catch (error) {
        removeMessage(loadingId);
        appendMessage('assistant', `❌ **Connection Error**\n\n${error.message}`);
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
            // Handle different source formats (RAG vs Branded)
            let title = src.title || src.brand_name || 'Unknown Source';
            let snippet = src.snippet || src.directions || src.ingredients || '';
            let score = src.score || src.confidence || 0;

            // If it's a branded food result
            if (src.type === 'branded' || src.brand_name) {
                title = `${src.brand_name} (${src.brand_owner || 'Unknown'})`;
                snippet = src.ingredients || '';
                score = 1.0; // Assume high confidence for direct database hits
            }

            const percentage = (score * 100).toFixed(0);

            if (typeof snippet === 'string' && snippet.length > 150) {
                snippet = snippet.substring(0, 150) + '...';
            }
            if (!snippet) snippet = 'No preview available';

            html += `
                <div class="source-card">
                    <div class="source-header">
                        <span class="source-title">#${idx + 1} ${title}</span>
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

        // Notify backend
        await fetch(`${API_BASE}/api/session/clear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
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

// Helper to set input from suggestions
function setInput(text) {
    if (text.startsWith('search:')) {
        // Switch to chat mode for search
        switchMode('chat');
        const chatInput = document.getElementById('chatInput');
        chatInput.value = text.substring(7).trim(); // Remove 'search:' prefix
        sendChatMessage();
    } else {
        // Determine if it's a recipe request or chat
        // For simplicity, use recipe mode for ingredient lists
        switchMode('recipe');
        const userInput = document.getElementById('userInput');
        userInput.value = text;
    }
}

// Accordion toggle for mobile
function toggleAccordion(accordionId) {
    const accordion = document.getElementById(accordionId);
    if (accordion) {
        accordion.classList.toggle('open');
    }
}
