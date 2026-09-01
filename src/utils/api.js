/**
 * DeckSum - Client HTTP API Wrapper
 * Manages secure fetch requests, token attachment, register, and login.
 */

const API_BASE = ""; // Empty string because backend serves static assets on same port

export const api = {
    // Session token retrieval
    getToken() {
        return localStorage.getItem("decksum_token");
    },

    setToken(token) {
        if (token) {
            localStorage.setItem("decksum_token", token);
        } else {
            localStorage.removeItem("decksum_token");
        }
    },

    getUsername() {
        return localStorage.getItem("decksum_username") || "Student";
    },

    setUsername(username) {
        if (username) {
            localStorage.setItem("decksum_username", username);
        } else {
            localStorage.removeItem("decksum_username");
        }
    },

    isAuthenticated() {
        return !!this.getToken();
    },

    logout() {
        this.setToken(null);
        this.setUsername(null);
        // Dispatch event so app can listen and reload
        window.dispatchEvent(new Event("auth_change"));
    },

    async login(username, password) {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Authentication failed.");
        }
        
        const data = await response.json();
        this.setToken(data.token);
        this.setUsername(data.username);
        window.dispatchEvent(new Event("auth_change"));
        return data;
    },

    async register(username, password, securityQuestion = null, securityAnswer = null) {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                username, 
                password,
                security_question: securityQuestion,
                security_answer: securityAnswer
            })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Registration failed.");
        }
        
        return await response.json();
    },

    // Authenticated request helper
    async request(endpoint, options = {}) {
        const token = this.getToken();
        
        // Setup headers
        const headers = options.headers || {};
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        
        const finalOptions = {
            ...options,
            headers
        };

        const response = await fetch(`${API_BASE}${endpoint}`, finalOptions);
        
        if (response.status === 401) {
            // Unauthorized / Token expired - force logout
            this.logout();
            throw new Error("Session expired. Please log in again.");
        }
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Request failed with status ${response.status}`);
        }
        
        return await response.json();
    }
};
