import os
import json
import time
import hmac
import hashlib
import base64
import sqlite3
import datetime
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Depends, Header, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import fitz  # PyMuPDF
import docx  # python-docx
from passlib.context import CryptContext

# Configuration
DATABASE_FILE = "database.db"
SECRET_KEY = "decksum-super-secret-key-12345"
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

app = FastAPI(title="DeckSum Backend")

# Enable CORS for local development (if needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Initialize Database
def get_db():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with sqlite3.connect(DATABASE_FILE) as conn:
        cursor = conn.cursor()
        
        # Users Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                preferences TEXT,  -- JSON string
                created_at TEXT NOT NULL,
                is_admin INTEGER DEFAULT 0,
                security_question TEXT,
                security_answer_hash TEXT
            )
        """)
        
        # Migration: Add columns if they don't exist
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        if "is_admin" not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")
        if "security_question" not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN security_question TEXT")
        if "security_answer_hash" not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN security_answer_hash TEXT")
        
        # Documents Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                size TEXT NOT NULL,
                added_date TEXT NOT NULL,
                text TEXT NOT NULL,
                summary_title TEXT,
                summary_overview TEXT,
                summary_takeaways TEXT, -- JSON
                summary_vocab TEXT,     -- JSON
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)
        
        # Flashcards Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS flashcards (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                doc_id TEXT NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                category TEXT NOT NULL,
                repetitions INTEGER DEFAULT 0,
                interval INTEGER DEFAULT 0,
                ease_factor REAL DEFAULT 2.5,
                due_date TEXT NOT NULL,
                last_reviewed TEXT,
                history TEXT, -- JSON array
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (doc_id) REFERENCES documents (id) ON DELETE CASCADE
            )
        """)
        
        # Quizzes Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS quizzes (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                doc_id TEXT NOT NULL,
                question TEXT NOT NULL,
                options TEXT NOT NULL, -- JSON array of {letter, text}
                correct_answer TEXT NOT NULL,
                explanation TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (doc_id) REFERENCES documents (id) ON DELETE CASCADE
            )
        """)
        
        # Quiz History Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS quiz_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                doc_id TEXT NOT NULL,
                doc_name TEXT NOT NULL,
                date TEXT NOT NULL,
                score INTEGER NOT NULL,
                total INTEGER NOT NULL,
                accuracy INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)
        
        # Study Time Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS study_time (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                date TEXT NOT NULL, -- YYYY-MM-DD
                minutes INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                UNIQUE(user_id, date)
            )
        """)
        
        # Notifications / Reminders log (Optional, but helps satisfying Module 6)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)

        conn.commit()

init_db()


# Custom JWT Helpers
def generate_jwt(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    signature = hmac.new(SECRET_KEY.encode(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    return f"{header_b64}.{payload_b64}.{sig_b64}"

def verify_jwt(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        header_pad = header_b64 + "=" * (4 - len(header_b64) % 4)
        payload_pad = payload_b64 + "=" * (4 - len(payload_b64) % 4)
        
        # Re-compute signature
        signature = hmac.new(SECRET_KEY.encode(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256).digest()
        recomputed_sig_b64 = base64.urlsafe_b64encode(signature).decode().rstrip("=")
        
        if not hmac.compare_digest(sig_b64, recomputed_sig_b64):
            return None
            
        payload = json.loads(base64.urlsafe_b64decode(payload_pad).decode())
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None

# Dependency to get current user
def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token")
    token = authorization.split(" ")[1]
    payload = verify_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token is invalid or expired")
    return payload

# Pydantic Schemas
class RegisterSchema(BaseModel):
    username: str
    password: str
    security_question: Optional[str] = None
    security_answer: Optional[str] = None

class LoginSchema(BaseModel):
    username: str
    password: str

class ProfileUpdateSchema(BaseModel):
    preferences: dict

class ReviewSchema(BaseModel):
    grade: int

class ChatSchema(BaseModel):
    doc_id: str
    query: str
    chat_history: Optional[List[dict]] = []

class StudyTimeUpdateSchema(BaseModel):
    minutes: int

class GatewayConfigSchema(BaseModel):
    provider: str
    apiKey: Optional[str] = ""
    customUrl: Optional[str] = ""
    customModel: Optional[str] = ""
    useGatewayFallback: Optional[bool] = False

class ForgotPasswordQuestionSchema(BaseModel):
    username: str

class ResetPasswordSchema(BaseModel):
    username: str
    security_answer: str
    new_password: str

class SecurityUpdateSchema(BaseModel):
    security_question: str
    security_answer: str


# =========================================================================
# Auth & Profile Endpoints
# =========================================================================

@app.post("/api/auth/register")
def register(user: RegisterSchema):
    username = user.username.strip()
    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(user.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Username already exists")
            
        password_hash = pwd_context.hash(user.password)
        
        # Hash security answer if provided
        sec_question = user.security_question.strip() if user.security_question else None
        sec_answer_hash = None
        if user.security_answer and user.security_answer.strip():
            sec_answer_hash = pwd_context.hash(user.security_answer.strip().lower())
            
        default_pref = json.dumps({
            "subjects": ["General"],
            "difficulty": "medium",
            "provider": "mock",
            "apiKey": "",
            "customUrl": "http://localhost:11434/v1",
            "customModel": "llama3"
        })
        created_at = datetime.datetime.utcnow().isoformat()
        
        cursor.execute("SELECT COUNT(id) FROM users")
        user_count = cursor.fetchone()[0]
        is_admin = 1 if (user_count == 0 or username.lower() == "admin") else 0
        
        cursor.execute(
            "INSERT INTO users (username, password_hash, preferences, created_at, is_admin, security_question, security_answer_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (username, password_hash, default_pref, created_at, is_admin, sec_question, sec_answer_hash)
        )
        conn.commit()
        return {"message": "User registered successfully"}
    finally:
        conn.close()

@app.post("/api/auth/login")
def login(credentials: LoginSchema):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM users WHERE username = ?", (credentials.username.strip(),))
        user = cursor.fetchone()
        if not user or not pwd_context.verify(credentials.password, user["password_hash"]):
            raise HTTPException(status_code=400, detail="Invalid username or password")
            
        payload = {
            "user_id": user["id"],
            "username": user["username"],
            "exp": time.time() + 86400  # 24 hours
        }
        token = generate_jwt(payload)
        
        preferences = json.loads(user["preferences"]) if user["preferences"] else {}
        
        return {
            "token": token,
            "username": user["username"],
            "preferences": preferences,
            "is_admin": bool(user["is_admin"])
        }
    finally:
        conn.close()

@app.get("/api/auth/profile")
def get_profile(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT username, preferences, is_admin, security_question FROM users WHERE id = ?", (current_user["user_id"],))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "username": user["username"],
            "preferences": json.loads(user["preferences"]) if user["preferences"] else {},
            "is_admin": bool(user["is_admin"]),
            "security_question": user["security_question"]
        }
    finally:
        conn.close()

@app.post("/api/auth/forgot-password/question")
def get_security_question(data: ForgotPasswordQuestionSchema):
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required.")
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT security_question FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Username not found.")
        
        question = row["security_question"]
        if not question:
            raise HTTPException(status_code=400, detail="No security question has been set for this account. Please register a new account.")
        
        return {"username": username, "security_question": question}
    finally:
        conn.close()

@app.post("/api/auth/forgot-password/reset")
def reset_password(data: ResetPasswordSchema):
    username = data.username.strip()
    security_answer = data.security_answer.strip().lower()
    new_password = data.new_password
    
    if not username or not security_answer or not new_password:
        raise HTTPException(status_code=400, detail="All fields are required.")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")
        
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, security_answer_hash FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Username not found.")
        
        stored_hash = row["security_answer_hash"]
        if not stored_hash:
            raise HTTPException(status_code=400, detail="No security question set. Cannot reset password.")
            
        if not pwd_context.verify(security_answer, stored_hash):
            raise HTTPException(status_code=400, detail="Incorrect answer to the security question.")
            
        new_password_hash = pwd_context.hash(new_password)
        cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_password_hash, row["id"]))
        conn.commit()
        return {"message": "Password successfully reset. You can now log in with your new password."}
    finally:
        conn.close()

@app.put("/api/auth/security")
def update_security(data: SecurityUpdateSchema, current_user: dict = Depends(get_current_user)):
    security_question = data.security_question.strip()
    security_answer = data.security_answer.strip().lower()
    
    if not security_question or not security_answer:
        raise HTTPException(status_code=400, detail="Security question and answer are required.")
        
    conn = get_db()
    cursor = conn.cursor()
    try:
        security_answer_hash = pwd_context.hash(security_answer)
        cursor.execute(
            "UPDATE users SET security_question = ?, security_answer_hash = ? WHERE id = ?",
            (security_question, security_answer_hash, current_user["user_id"])
        )
        conn.commit()
        return {"message": "Security question updated successfully."}
    finally:
        conn.close()

@app.put("/api/auth/profile")
def update_profile(profile_data: ProfileUpdateSchema, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT preferences FROM users WHERE id = ?", (current_user["user_id"],))
        existing_user = cursor.fetchone()
        if not existing_user:
            raise HTTPException(status_code=404, detail="User not found")
            
        existing_pref = json.loads(existing_user["preferences"]) if existing_user["preferences"] else {}
        # Merge updates
        new_pref = {**existing_pref, **profile_data.preferences}
        
        cursor.execute("UPDATE users SET preferences = ? WHERE id = ?", (json.dumps(new_pref), current_user["user_id"]))
        conn.commit()
        return {"preferences": new_pref}
    finally:
        conn.close()

# =========================================================================
# AI Offline Heuristic Generator (translated from JS)
# =========================================================================

STOP_WORDS = {
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'about', 'against', 'between', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'out',
    'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can',
    'will', 'just', 'don', 'should', 'now', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
    'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself',
    'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs',
    'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'has',
    'have', 'had', 'do', 'does', 'did', 'doing', 'would', 'could'
}

def extract_keywords(text: str, count=12) -> List[str]:
    # Clean text and split
    words = "".join(c if c.isalnum() or c.isspace() or c == "-" else "" for c in text.lower()).split()
    freqs = {}
    for w in words:
        if len(w) > 3 and w not in STOP_WORDS and not w.isdigit():
            freqs[w] = freqs.get(w, 0) + 1
            
    sorted_words = sorted(freqs.items(), key=lambda x: x[1], reverse=True)
    return [w for w, _ in sorted_words[:count]]

def extract_key_sentences(text: str, keywords: List[str], count=6) -> List[str]:
    # Simple split by punctuation
    import re
    sentences = re.split(r'[.!?]\s+', text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20]
    
    scored_sentences = []
    for sentence in sentences:
        words = sentence.lower().split()
        score = sum(1 for w in words if w in keywords)
        
        # Penalize length
        if len(words) > 40 or len(words) < 8:
            score *= 0.5
            
        scored_sentences.append((sentence, score))
        
    scored_sentences.sort(key=lambda x: x[1], reverse=True)
    return [s for s, _ in scored_sentences[:count]]

def generate_offline_heuristic(text: str, custom_topic="") -> dict:
    keywords = extract_keywords(text, 15)
    key_sentences = extract_key_sentences(text, keywords, 8)
    
    cap_keywords = [w.capitalize() for w in keywords]
    
    # Vocab
    vocab = []
    for i, word in enumerate(cap_keywords[:6]):
        matching_sentence = next((s for s in key_sentences if word.lower() in s.lower()), "")
        definition = matching_sentence if matching_sentence else "A core concept and subject of study related to the document context."
        if len(definition) > 120:
            definition = definition[:120] + "..."
        vocab.append({"term": word, "definition": definition})
        
    takeaways = key_sentences[:5]
    if not takeaways:
        takeaways = ["Ensure your document contains readable text for analysis."]
        
    summary = {
        "title": custom_topic if custom_topic else "Document Summary & Insights",
        "overview": f"This study guide summarizes the uploaded materials focusing primarily on: {', '.join(cap_keywords[:4])}. It covers critical concepts, terminology, and foundational structures from the text.",
        "keyTakeaways": takeaways,
        "vocabulary": vocab
    }
    
    # Flashcards
    flashcards = []
    for i, word in enumerate(cap_keywords[:8]):
        assoc_sentence = next((s for s in key_sentences if word.lower() in s.lower()), text[:200])
        flashcards.append({
            "id": f"fc_{int(time.time()*1000)}_{i}",
            "question": f"Explain the concept and significance of \"{word}\" as detailed in the document.",
            "answer": assoc_sentence,
            "category": word
        })
        
    # Quizzes
    quizzes = []
    for i, word in enumerate(cap_keywords[:5]):
        matching_sentence = next((s for s in key_sentences if word.lower() in s.lower()), "")
        main_concept = matching_sentence if matching_sentence else f"The text presents key details regarding {word}."
        
        other_terms = [w for w in cap_keywords if w != word]
        distractor1 = other_terms[0] if len(other_terms) > 0 else 'Unrelated structural concepts'
        distractor2 = other_terms[1] if len(other_terms) > 1 else 'Alternative theoretical frameworks'
        distractor3 = other_terms[2] if len(other_terms) > 2 else 'External context and applications'
        
        correct_text = f"Correct explanation detailing: {main_concept}"
        options_list = [
            {"key": "A", "text": correct_text},
            {"key": "B", "text": f"Primary analysis focusing on {distractor1}"},
            {"key": "C", "text": f"Secondary methodology surrounding {distractor2}"},
            {"key": "D", "text": f"Incidental effects concerning {distractor3}"}
        ]
        
        # Shuffle in Python
        import random
        random.shuffle(options_list)
        
        letters = ["A", "B", "C", "D"]
        options = []
        correct_letter = "A"
        for idx, opt in enumerate(options_list):
            letter = letters[idx]
            options.append({"letter": letter, "text": opt["text"]})
            if opt["text"] == correct_text:
                correct_letter = letter
                
        quizzes.append({
            "id": f"q_{int(time.time()*1000)}_{i}",
            "question": f"Which of the following best describes the role or concept of \"{word}\" according to the uploaded study materials?",
            "options": options,
            "correctAnswer": correct_letter,
            "explanation": f"Based on the text: \"{main_concept}\". This directly confirms that the correct option is {correct_letter}."
        })
        
    return {
        "summary": summary,
        "flashcards": flashcards,
        "quizzes": quizzes
    }

# =========================================================================
# Live API Generation Handlers (OpenAI & Gemini via httpx)
# =========================================================================

async def generate_with_openai(text: str, api_key: str, custom_topic: str) -> dict:
    system_prompt = """You are DeckSum, an expert academic AI. Generate a study package based on the document text. You must respond in valid JSON format.
Your JSON response must contain exactly:
{
  "summary": {
    "title": "A descriptive title based on the topic",
    "overview": "A detailed 2-3 sentence overview of the document content",
    "keyTakeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3", "Takeaway 4", "Takeaway 5"],
    "vocabulary": [
      { "term": "Term 1", "definition": "Clear concise definition" },
      { "term": "Term 2", "definition": "Clear concise definition" }
    ]
  },
  "flashcards": [
    { "question": "Question here", "answer": "Answer here", "category": "TopicName" }
  ],
  "quizzes": [
    {
      "question": "Question here",
      "options": [
        { "letter": "A", "text": "Option text" },
        { "letter": "B", "text": "Option text" },
        { "letter": "C", "text": "Option text" },
        { "letter": "D", "text": "Option text" }
      ],
      "correctAnswer": "A",
      "explanation": "Why this answer is correct based on the text."
    }
  ]
}
Generate 5-8 flashcards and 5-8 quizzes. Ensure the questions test core understanding, not trivial formatting."""

    user_prompt = f"Document topic/guideline: {custom_topic if custom_topic else 'General Summary'}\n\nDocument Text:\n{text[:15000]}"
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            json={
                "model": "gpt-4o-mini",
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.3
            },
            timeout=60.0
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"OpenAI error: {response.text}")
            
        data = response.json()
        study_package = json.loads(data["choices"][0]["message"]["content"])
        
        # Inject IDs
        for idx, fc in enumerate(study_package.get("flashcards", [])):
            fc["id"] = f"fc_openai_{int(time.time()*1000)}_{idx}"
        for idx, q in enumerate(study_package.get("quizzes", [])):
            q["id"] = f"q_openai_{int(time.time()*1000)}_{idx}"
            
        return study_package

async def query_gemini_api(prompt: str, api_key: str, temperature: float = 0.4, is_json: bool = False) -> str:
    import asyncio
    models = [
        "gemini-3.5-flash",
        "gemini-2.5-flash",
        "gemini-flash-latest",
        "gemini-2.0-flash-lite",
        "gemini-2.0-flash",
        "gemini-1.5-flash"
    ]
    last_error = None
    
    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        json_payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature
            }
        }
        if is_json:
            json_payload["generationConfig"]["responseMimeType"] = "application/json"
            
        for attempt in range(3):
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        url,
                        headers={"Content-Type": "application/json"},
                        json=json_payload,
                        timeout=30.0
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        return data["candidates"][0]["content"]["parts"][0]["text"]
                    
                    last_error = f"Gemini API returned status {response.status_code}: {response.text}"
                    if response.status_code in [429, 502, 503, 504]:
                        await asyncio.sleep(0.5 * (attempt + 1))
                        continue
                    else:
                        break
            except httpx.RequestError as exc:
                last_error = f"HTTP request failed: {str(exc)}"
                await asyncio.sleep(0.5 * (attempt + 1))
                continue
                
    raise HTTPException(status_code=503, detail=f"Failed to query Gemini API after retries and fallbacks. Last error: {last_error}")

async def generate_with_gemini(text: str, api_key: str, custom_topic: str) -> dict:
    prompt = f"""You are DeckSum, an expert academic AI. Generate a study package based on the document text. You must respond in valid JSON format ONLY. 
Do not include markdown wraps like ```json. Return a single JSON object matching this structure:
{{
  "summary": {{
    "title": "A descriptive title based on the topic",
    "overview": "A detailed 2-3 sentence overview of the document content",
    "keyTakeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3", "Takeaway 4", "Takeaway 5"],
    "vocabulary": [
      {{ "term": "Term 1", "definition": "Clear concise definition" }}
    ]
  }},
  "flashcards": [
    {{ "question": "Question here", "answer": "Answer here", "category": "TopicName" }}
  ],
  "quizzes": [
    {{
      "question": "Question here",
      "options": [
        {{ "letter": "A", "text": "Option text" }},
        {{ "letter": "B", "text": "Option text" }},
        {{ "letter": "C", "text": "Option text" }},
        {{ "letter": "D", "text": "Option text" }}
      ],
      "correctAnswer": "A",
      "explanation": "Why this answer is correct based on the text."
    }}
  ]
}}

Document topic/guideline: {custom_topic if custom_topic else 'General Summary'}
Document Text:
{text[:20000]}"""

    json_text = await query_gemini_api(prompt, api_key, temperature=0.3, is_json=True)
    study_package = json.loads(json_text)
    
    # Inject IDs
    for idx, fc in enumerate(study_package.get("flashcards", [])):
        fc["id"] = f"fc_gemini_{int(time.time()*1000)}_{idx}"
    for idx, q in enumerate(study_package.get("quizzes", [])):
        q["id"] = f"q_gemini_{int(time.time()*1000)}_{idx}"
        
    return study_package

async def generate_with_custom(text: str, api_key: str, custom_url: str, custom_model: str, custom_topic: str) -> dict:
    system_prompt = """You are DeckSum, an expert academic AI. Generate a study package based on the document text. You must respond in valid JSON format.
Your JSON response must contain exactly:
{
  "summary": {
    "title": "A descriptive title based on the topic",
    "overview": "A detailed 2-3 sentence overview of the document content",
    "keyTakeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3", "Takeaway 4", "Takeaway 5"],
    "vocabulary": [
      { "term": "Term 1", "definition": "Clear concise definition" },
      { "term": "Term 2", "definition": "Clear concise definition" }
    ]
  },
  "flashcards": [
    { "question": "Question here", "answer": "Answer here", "category": "TopicName" }
  ],
  "quizzes": [
    {
      "question": "Question here",
      "options": [
        { "letter": "A", "text": "Option text" },
        { "letter": "B", "text": "Option text" },
        { "letter": "C", "text": "Option text" },
        { "letter": "D", "text": "Option text" }
      ],
      "correctAnswer": "A",
      "explanation": "Why this answer is correct based on the text."
    }
  ]
}
Generate 5-8 flashcards and 5-8 quizzes. Ensure the questions test core understanding, not trivial formatting."""

    user_prompt = f"Document topic/guideline: {custom_topic if custom_topic else 'General Summary'}\n\nDocument Text:\n{text[:15000]}"
    
    url = custom_url.strip() if custom_url else "http://localhost:11434/v1"
    if not url.endswith("/chat/completions"):
        if url.endswith("/"):
            url = url + "chat/completions"
        else:
            url = url + "/chat/completions"

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            headers=headers,
            json={
                "model": custom_model if custom_model else "llama3",
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.3
            },
            timeout=60.0
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Custom provider error: {response.text}")
            
        data = response.json()
        study_package = json.loads(data["choices"][0]["message"]["content"])
        
        # Inject IDs
        for idx, fc in enumerate(study_package.get("flashcards", [])):
            fc["id"] = f"fc_custom_{int(time.time()*1000)}_{idx}"
        for idx, q in enumerate(study_package.get("quizzes", [])):
            q["id"] = f"q_custom_{int(time.time()*1000)}_{idx}"
            
        return study_package

async def generate_study_package(text: str, user_pref: dict, custom_topic="") -> dict:
    provider = user_pref.get("provider", "mock")
    api_key = user_pref.get("apiKey", "")
    custom_url = user_pref.get("customUrl", "")
    custom_model = user_pref.get("customModel", "")
        
    try:
        if provider == "openai" and api_key:
            return await generate_with_openai(text, api_key, custom_topic)
        elif provider == "gemini" and api_key:
            return await generate_with_gemini(text, api_key, custom_topic)
        elif provider == "custom":
            return await generate_with_custom(text, api_key, custom_url, custom_model, custom_topic)
        else:
            return generate_offline_heuristic(text, custom_topic)
    except Exception as e:
        print(f"[AI ENGINE FALLBACK] Provider '{provider}' failed: {str(e)}. Falling back to offline heuristic.")
        pkg = generate_offline_heuristic(text, custom_topic)
        pkg["summary"]["overview"] = f"(Note: Live AI API was unavailable; using offline heuristic. Error: {str(e)}) " + pkg["summary"]["overview"]
        return pkg


# =========================================================================
# Document Endpoints (Module 2 Parser & Upload)
# =========================================================================

def format_bytes(size_bytes):
    if size_bytes == 0:
        return "0 Bytes"
    import math
    sizes = ["Bytes", "KB", "MB", "GB"]
    i = int(math.floor(math.log(size_bytes) / math.log(1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {sizes[i]}"

@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    customTopic: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    filename = file.filename
    file_ext = filename.split(".")[-1].lower()
    
    if file_ext not in ["pdf", "docx", "txt", "md"]:
        raise HTTPException(status_code=400, detail="Unsupported file extension. Upload PDF, DOCX, TXT, or MD.")
        
    # Read file content
    contents = await file.read()
    file_size = len(contents)
    
    # Save temporary file inside workspace to parse
    temp_path = f"temp_{int(time.time())}_{filename}"
    with open(temp_path, "wb") as f:
        f.write(contents)
        
    extracted_text = ""
    try:
        # Extract text using PyMuPDF / python-docx / txt decoding
        if file_ext == "pdf":
            doc = fitz.open(temp_path)
            for page in doc:
                extracted_text += page.get_text() + "\n"
        elif file_ext == "docx":
            doc = docx.Document(temp_path)
            for para in doc.paragraphs:
                extracted_text += para.text + "\n"
        else: # TXT / MD
            extracted_text = contents.decode("utf-8", errors="ignore")
            
        if len(extracted_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="No readable text content extracted from file. Verify format.")
            
    except HTTPException:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=f"Failed to parse document: {str(e)}")
        
    # Clean up temp file
    if os.path.exists(temp_path):
        os.remove(temp_path)
        
    # Fetch user preferences for AI generation
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT preferences FROM users WHERE id = ?", (current_user["user_id"],))
        user_row = cursor.fetchone()
        preferences = json.loads(user_row["preferences"]) if user_row and user_row["preferences"] else {}
        
        # Trigger AI Generation
        study_package = await generate_study_package(extracted_text, preferences, customTopic)
        
        # Write records
        doc_id = f"doc_{int(time.time()*1000)}"
        summary = study_package["summary"]
        quizzes = study_package["quizzes"]
        flashcards = study_package["flashcards"]
        
        # Insert document record
        cursor.execute(
            """INSERT INTO documents (
                id, user_id, name, size, added_date, text,
                summary_title, summary_overview, summary_takeaways, summary_vocab
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc_id,
                current_user["user_id"],
                filename,
                format_bytes(file_size),
                datetime.date.today().strftime("%m/%d/%Y"),
                extracted_text,
                summary.get("title", ""),
                summary.get("overview", ""),
                json.dumps(summary.get("keyTakeaways", [])),
                json.dumps(summary.get("vocabulary", []))
            )
        )
        
        # Insert quizzes
        for q in quizzes:
            cursor.execute(
                "INSERT INTO quizzes (id, user_id, doc_id, question, options, correct_answer, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    q.get("id", f"q_{int(time.time()*1000)}"),
                    current_user["user_id"],
                    doc_id,
                    q["question"],
                    json.dumps(q["options"]),
                    q["correctAnswer"],
                    q["explanation"]
                )
            )
            
        # Insert flashcards (Module 6)
        for fc in flashcards:
            cursor.execute(
                """INSERT INTO flashcards (
                    id, user_id, doc_id, question, answer, category,
                    repetitions, interval, ease_factor, due_date, history
                ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 2.5, ?, ?)""",
                (
                    fc.get("id", f"fc_{int(time.time()*1000)}"),
                    current_user["user_id"],
                    doc_id,
                    fc["question"],
                    fc["answer"],
                    fc.get("category", "General"),
                    datetime.datetime.utcnow().isoformat(), # Due right now
                    json.dumps([])
                )
            )
            
        conn.commit()
        return {"document_id": doc_id, "message": "Document parsed and study package loaded!"}
        
    finally:
        conn.close()

@app.get("/api/documents")
def get_documents(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name, size, added_date, summary_title, summary_overview, summary_takeaways, summary_vocab FROM documents WHERE user_id = ?", (current_user["user_id"],))
        rows = cursor.fetchall()
        result = []
        for r in rows:
            result.append({
                "id": r["id"],
                "name": r["name"],
                "size": r["size"],
                "addedDate": r["added_date"],
                "summary": {
                    "title": r["summary_title"],
                    "overview": r["summary_overview"],
                    "keyTakeaways": json.loads(r["summary_takeaways"]) if r["summary_takeaways"] else [],
                    "vocabulary": json.loads(r["summary_vocab"]) if r["summary_vocab"] else []
                }
            })
        return result
    finally:
        conn.close()

@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM documents WHERE id = ? AND user_id = ?", (doc_id, current_user["user_id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Document not found or access denied")
            
        cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        # cascading deletes will wipe quizzes and flashcards automatically in foreign key sqlite (if enabled, let's execute explicitly)
        cursor.execute("DELETE FROM flashcards WHERE doc_id = ?", (doc_id,))
        cursor.execute("DELETE FROM quizzes WHERE doc_id = ?", (doc_id,))
        cursor.execute("DELETE FROM quiz_history WHERE doc_id = ?", (doc_id,))
        conn.commit()
        return {"message": "Document and associated study materials deleted successfully"}
    finally:
        conn.close()

@app.put("/api/documents/{doc_id}/rename")
def rename_document(doc_id: str, name_data: dict, current_user: dict = Depends(get_current_user)):
    new_name = name_data.get("name", "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="New name cannot be empty")
        
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM documents WHERE id = ? AND user_id = ?", (doc_id, current_user["user_id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Document not found or access denied")
            
        cursor.execute("UPDATE documents SET name = ? WHERE id = ?", (new_name, doc_id))
        conn.commit()
        return {"message": "Document renamed successfully"}
    finally:
        conn.close()

# =========================================================================
# Flashcards & Spaced Repetition (Module 4 & 6 SM-2)
# =========================================================================

@app.get("/api/flashcards")
def get_flashcards(doc_id: Optional[str] = None, due_only: bool = False, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        query = "SELECT * FROM flashcards WHERE user_id = ?"
        params = [current_user["user_id"]]
        
        if doc_id:
            query += " AND doc_id = ?"
            params.append(doc_id)
            
        if due_only:
            now_iso = datetime.datetime.utcnow().isoformat()
            query += " AND due_date <= ?"
            params.append(now_iso)
            
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        result = []
        for r in rows:
            result.append({
                "id": r["id"],
                "docId": r["doc_id"],
                "question": r["question"],
                "answer": r["answer"],
                "category": r["category"],
                "repetitions": r["repetitions"],
                "interval": r["interval"],
                "easeFactor": r["ease_factor"],
                "dueDate": r["due_date"],
                "lastReviewed": r["last_reviewed"],
                "history": json.loads(r["history"]) if r["history"] else []
            })
        return result
    finally:
        conn.close()

@app.post("/api/flashcards/{card_id}/review")
def review_flashcard(card_id: str, review: ReviewSchema, current_user: dict = Depends(get_current_user)):
    grade = review.grade
    if grade < 0 or grade > 5:
        raise HTTPException(status_code=400, detail="Quality rating grade must be between 0 and 5")
        
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM flashcards WHERE id = ? AND user_id = ?", (card_id, current_user["user_id"]))
        card = cursor.fetchone()
        if not card:
            raise HTTPException(status_code=404, detail="Flashcard not found")
            
        # Current SM-2 parameters
        repetitions = card["repetitions"]
        interval = card["interval"]
        ease_factor = card["ease_factor"]
        history = json.loads(card["history"]) if card["history"] else []
        
        date_now = datetime.datetime.utcnow()
        
        # Calculate new variables
        if grade >= 3:
            if repetitions == 0:
                interval = 1
            elif repetitions == 1:
                interval = 6
            else:
                interval = int(round(interval * ease_factor))
            repetitions += 1
        else:
            repetitions = 0
            interval = 1
            
        ease_factor = ease_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
        if ease_factor < 1.3:
            ease_factor = 1.3
            
        due_date = date_now + datetime.timedelta(days=interval)
        
        # Log entry
        log_entry = {
            "date": date_now.isoformat(),
            "grade": grade,
            "interval": interval,
            "easeFactor": ease_factor
        }
        history.append(log_entry)
        
        cursor.execute(
            """UPDATE flashcards SET 
                repetitions = ?, interval = ?, ease_factor = ?, due_date = ?, last_reviewed = ?, history = ?
               WHERE id = ?""",
            (repetitions, interval, ease_factor, due_date.isoformat(), date_now.isoformat(), json.dumps(history), card_id)
        )
        conn.commit()
        
        return {
            "id": card_id,
            "repetitions": repetitions,
            "interval": interval,
            "easeFactor": ease_factor,
            "dueDate": due_date.isoformat(),
            "lastReviewed": date_now.isoformat()
        }
    finally:
        conn.close()

# =========================================================================
# Quizzes & Practice History
# =========================================================================

@app.get("/api/quizzes")
def get_quizzes(doc_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        query = "SELECT * FROM quizzes WHERE user_id = ?"
        params = [current_user["user_id"]]
        
        if doc_id:
            query += " AND doc_id = ?"
            params.append(doc_id)
            
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        result = []
        for r in rows:
            result.append({
                "id": r["id"],
                "docId": r["doc_id"],
                "question": r["question"],
                "options": json.loads(r["options"]),
                "correctAnswer": r["correct_answer"],
                "explanation": r["explanation"]
            })
        return result
    finally:
        conn.close()

@app.post("/api/quizzes/history")
def add_quiz_history(history_data: dict, current_user: dict = Depends(get_current_user)):
    doc_id = history_data.get("docId")
    doc_name = history_data.get("docName")
    score = history_data.get("score")
    total = history_data.get("total")
    accuracy = history_data.get("accuracy")
    
    if not doc_id or score is None or total is None:
        raise HTTPException(status_code=400, detail="Missing required history fields")
        
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO quiz_history (user_id, doc_id, doc_name, date, score, total, accuracy) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (current_user["user_id"], doc_id, doc_name, datetime.datetime.utcnow().isoformat(), score, total, accuracy)
        )
        conn.commit()
        return {"message": "Quiz history logged successfully"}
    finally:
        conn.close()

# =========================================================================
# Q&A Interactive Chat (Module 5)
# =========================================================================

async def chat_with_openai(query: str, doc_text: str, chat_history: List[dict], api_key: str) -> dict:
    messages = [
        {
            "role": "system",
            "content": """You are DeckSum, a highly knowledgeable personal study tutor. You have been given the context of a student's study document.
Your goal is to answer the student's question accurately using ONLY information from the context.
If the context does not contain the answer, politely state that it's not discussed in the document, but provide the closest helpful explanation based strictly on the theme.
At the end of your response, add a short section: "Citations: [Describe where in the document or section this information is found]"."""
        },
        {
            "role": "user",
            "content": f"Document Context:\n{doc_text[:15000]}\n\nChat History:\n" + "\n".join(f"{h['sender']}: {h['text']}" for h in chat_history) + f"\n\nStudent Question: {query}"
        }
    ]
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": messages,
                "temperature": 0.4
            },
            timeout=30.0
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"OpenAI chat error: {response.text}")
            
        reply = response.json()["choices"][0]["message"]["content"]
        
        # Parse citations
        citation = "Document Reference"
        answer = reply
        import re
        citation_match = re.search(r'(?:Citations?:|Source:)\s*(.*)$', reply, re.IGNORECASE)
        if citation_match:
            citation = citation_match.group(1).strip()
            answer = re.sub(r'(?:Citations?:|Source:)\s*(.*)$', '', reply, flags=re.IGNORECASE).strip()
            
        return {"answer": answer, "citation": citation}

async def chat_with_gemini(query: str, doc_text: str, chat_history: List[dict], api_key: str) -> dict:
    prompt = f"""You are DeckSum, a highly knowledgeable personal study tutor. You have been given the context of a student's study document.
Answer the student's question accurately using ONLY information from the context.
If the context does not contain the answer, politely state that it's not discussed in the document, but provide the closest helpful explanation based strictly on the theme.
At the end of your response, add a short section: "Citations: [Describe where in the document or section this information is found]".

Document Context:
{doc_text[:20000]}

Chat History:
""" + "\n".join(f"{h['sender']}: {h['text']}" for h in chat_history) + f"\n\nStudent Question: {query}"

    reply = await query_gemini_api(prompt, api_key, temperature=0.4, is_json=False)
    
    citation = "Document Reference"
    answer = reply
    import re
    citation_match = re.search(r'(?:Citations?:|Source:)\s*(.*)$', reply, re.IGNORECASE)
    if citation_match:
        citation = citation_match.group(1).strip()
        answer = re.sub(r'(?:Citations?:|Source:)\s*(.*)$', '', reply, flags=re.IGNORECASE).strip()
        
    return {"answer": answer, "citation": citation}

def chat_offline_heuristic(query: str, doc_text: str) -> dict:
    paragraphs = [p.strip() for p in doc_text.split("\n\n") if len(p.strip()) > 30]
    if not paragraphs:
        return {
            "answer": "No readable text content found in the document.",
            "citation": "System Alert"
        }
        
    query_words = [w.lower() for w in query.split() if w.lower() not in STOP_WORDS]
    
    best_paragraph = paragraphs[0]
    highest_score = -1
    best_idx = 1
    
    for idx, para in enumerate(paragraphs):
        para_lower = para.lower()
        score = sum(1.5 if w in para_lower else 0 for w in query_words)
        
        if score > highest_score:
            highest_score = score
            best_paragraph = para
            best_idx = idx + 1
            
    if highest_score <= 0:
        keywords = extract_keywords(doc_text, 5)
        return {
            "answer": f"The document references topics including: {', '.join(keywords)}. However, I could not find a specific match for your question. Here is an excerpt:\n\n{best_paragraph[:300]}...",
            "citation": "Overview Guide"
        }
    else:
        return {
            "answer": f"According to the document:\n\n\"{best_paragraph}\"",
            "citation": f"Section {best_idx}"
        }

async def chat_with_custom(query: str, doc_text: str, chat_history: List[dict], api_key: str, custom_url: str, custom_model: str) -> dict:
    messages = [
        {
            "role": "system",
            "content": """You are DeckSum, a highly knowledgeable personal study tutor. You have been given the context of a student's study document.
Your goal is to answer the student's question accurately using ONLY information from the context.
If the context does not contain the answer, politely state that it's not discussed in the document, but provide the closest helpful explanation based strictly on the theme.
At the end of your response, add a short section: "Citations: [Describe where in the document or section this information is found]"."""
        },
        {
            "role": "user",
            "content": f"Document Context:\n{doc_text[:15000]}\n\nChat History:\n" + "\n".join(f"{h['sender']}: {h['text']}" for h in chat_history) + f"\n\nStudent Question: {query}"
        }
    ]
    
    url = custom_url.strip() if custom_url else "http://localhost:11434/v1"
    if not url.endswith("/chat/completions"):
        if url.endswith("/"):
            url = url + "chat/completions"
        else:
            url = url + "/chat/completions"

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            headers=headers,
            json={
                "model": custom_model if custom_model else "llama3",
                "messages": messages,
                "temperature": 0.4
            },
            timeout=30.0
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Custom provider chat error: {response.text}")
            
        reply = response.json()["choices"][0]["message"]["content"]
        
        # Parse citations
        citation = "Document Reference"
        answer = reply
        import re
        citation_match = re.search(r'(?:Citations?:|Source:)\s*(.*)$', reply, re.IGNORECASE)
        if citation_match:
            citation = citation_match.group(1).strip()
            answer = re.sub(r'(?:Citations?:|Source:)\s*(.*)$', '', reply, flags=re.IGNORECASE).strip()
            
        return {"answer": answer, "citation": citation}

@app.post("/api/chat")
async def chat_interaction(chat_req: ChatSchema, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT text FROM documents WHERE id = ? AND user_id = ?", (chat_req.doc_id, current_user["user_id"]))
        doc = cursor.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
            
        cursor.execute("SELECT preferences FROM users WHERE id = ?", (current_user["user_id"],))
        user_row = cursor.fetchone()
        preferences = json.loads(user_row["preferences"]) if user_row and user_row["preferences"] else {}
        
        provider = preferences.get("provider", "mock")
        api_key = preferences.get("apiKey", "")
        custom_url = preferences.get("customUrl", "")
        custom_model = preferences.get("customModel", "")
            
        if provider == "openai" and api_key:
            try:
                return await chat_with_openai(chat_req.query, doc["text"], chat_req.chat_history, api_key)
            except Exception as e:
                print(f"[CHAT FALLBACK] OpenAI failed: {str(e)}. Falling back to offline heuristic.")
                res = chat_offline_heuristic(chat_req.query, doc["text"])
                res["answer"] = f"(Note: OpenAI API was unavailable; using offline assistant. Error: {str(e)}) {res['answer']}"
                return res
        elif provider == "gemini" and api_key:
            try:
                return await chat_with_gemini(chat_req.query, doc["text"], chat_req.chat_history, api_key)
            except Exception as e:
                print(f"[CHAT FALLBACK] Gemini failed: {str(e)}. Falling back to offline heuristic.")
                res = chat_offline_heuristic(chat_req.query, doc["text"])
                res["answer"] = f"(Note: Gemini API was unavailable; using offline assistant. Error: {str(e)}) {res['answer']}"
                return res
        elif provider == "custom":
            try:
                return await chat_with_custom(chat_req.query, doc["text"], chat_req.chat_history, api_key, custom_url, custom_model)
            except Exception as e:
                print(f"[CHAT FALLBACK] Custom provider failed: {str(e)}. Falling back to offline heuristic.")
                res = chat_offline_heuristic(chat_req.query, doc["text"])
                res["answer"] = f"(Note: Custom AI provider was unavailable; using offline assistant. Error: {str(e)}) {res['answer']}"
                return res
        else:
            return chat_offline_heuristic(chat_req.query, doc["text"])
    finally:
        conn.close()

# =========================================================================
# Analytics & Study Streaks (Module 7)
# =========================================================================

@app.get("/api/analytics")
def get_analytics(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        user_id = current_user["user_id"]
        
        # 1. Study Minutes Map
        cursor.execute("SELECT date, minutes FROM study_time WHERE user_id = ?", (user_id,))
        time_rows = cursor.fetchall()
        daily_study_minutes = {r["date"]: r["minutes"] for r in time_rows}
        
        # 2. Study Streak Calculation
        streak_count = 0
        today = datetime.date.today()
        
        # Backtrack days to count consecutive study streaks
        check_date = today
        while True:
            date_str = check_date.strftime("%Y-%m-%d")
            cursor.execute("SELECT minutes FROM study_time WHERE user_id = ? AND date = ?", (user_id, date_str))
            row = cursor.fetchone()
            if row and row["minutes"] > 0:
                streak_count += 1
                check_date -= datetime.timedelta(days=1)
            else:
                # If we studied today = 0, check if we studied yesterday to maintain streak
                if check_date == today:
                    check_date -= datetime.timedelta(days=1)
                    continue
                break
                
        # 3. Quiz statistics
        cursor.execute("SELECT date, doc_name, score, total, accuracy FROM quiz_history WHERE user_id = ?", (user_id,))
        quiz_rows = cursor.fetchall()
        quiz_history = []
        for r in quiz_rows:
            quiz_history.append({
                "date": r["date"],
                "docName": r["doc_name"],
                "score": r["score"],
                "total": r["total"],
                "accuracy": r["accuracy"]
            })
            
        # 4. Total and due counts
        cursor.execute("SELECT id FROM documents WHERE user_id = ?", (user_id,))
        doc_count = len(cursor.fetchall())
        
        cursor.execute("SELECT id, ease_factor FROM flashcards WHERE user_id = ?", (user_id,))
        all_cards = cursor.fetchall()
        
        now_iso = datetime.datetime.utcnow().isoformat()
        cursor.execute("SELECT id FROM flashcards WHERE user_id = ? AND due_date <= ?", (user_id, now_iso))
        due_cards_count = len(cursor.fetchall())
        
        return {
            "streakCount": streak_count,
            "dailyStudyMinutes": daily_study_minutes,
            "quizHistory": quiz_history,
            "totalDocuments": doc_count,
            "totalFlashcards": len(all_cards),
            "dueFlashcardsCount": due_cards_count,
            "cardBreakdown": {
                "easy": sum(1 for c in all_cards if c["ease_factor"] >= 2.8),
                "medium": sum(1 for c in all_cards if 2.0 <= c["ease_factor"] < 2.8),
                "hard": sum(1 for c in all_cards if c["ease_factor"] < 2.0)
            }
        }
    finally:
        conn.close()

@app.post("/api/analytics/study-time")
def add_study_minutes(time_data: StudyTimeUpdateSchema, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    date_str = datetime.date.today().strftime("%Y-%m-%d")
    minutes = time_data.minutes
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT minutes FROM study_time WHERE user_id = ? AND date = ?", (user_id, date_str))
        row = cursor.fetchone()
        
        if row:
            cursor.execute("UPDATE study_time SET minutes = ? WHERE user_id = ? AND date = ?", (row["minutes"] + minutes, user_id, date_str))
        else:
            cursor.execute("INSERT INTO study_time (user_id, date, minutes) VALUES (?, ?, ?)", (user_id, date_str, minutes))
            
        conn.commit()
        return {"message": "Study duration logged successfully"}
    finally:
        conn.close()

# =========================================================================
# Notifications Reminders (Module 6)
# =========================================================================

@app.get("/api/notifications")
def get_notifications(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    conn = get_db()
    cursor = conn.cursor()
    try:
        now_iso = datetime.datetime.utcnow().isoformat()
        cursor.execute("SELECT COUNT(id) as due_count FROM flashcards WHERE user_id = ? AND due_date <= ?", (user_id, now_iso))
        due_count = cursor.fetchone()["due_count"]
        
        notifications = []
        if due_count > 0:
            msg = f"Scheduled Revision: You have {due_count} flashcards due for review today. Keep your revision streak alive!"
            notifications.append({
                "id": "due_alert",
                "message": msg,
                "type": "warning"
            })
            
            # Print/Log simulated email send
            print(f"[EMAIL NOTIFICATION MOCK] To: {current_user['username']}@decksum.edu - Subj: Spaced Repetition Due - Message: {msg}")
            
        return notifications
    finally:
        conn.close()

# =========================================================================
# Reset & Wipe Zone
# =========================================================================

@app.post("/api/flashcards/reset")
def reset_flashcards(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        user_id = current_user["user_id"]
        cursor.execute(
            """UPDATE flashcards SET 
                repetitions = 0, interval = 0, ease_factor = 2.5, 
                due_date = ?, last_reviewed = NULL, history = ?
               WHERE user_id = ?""",
            (datetime.datetime.utcnow().isoformat(), json.dumps([]), user_id)
        )
        conn.commit()
        return {"message": "Spaced repetition intervals successfully reset!"}
    finally:
        conn.close()

@app.post("/api/auth/wipe")
def wipe_user_data(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        user_id = current_user["user_id"]
        # Wipe all data tables for this user
        cursor.execute("DELETE FROM documents WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM flashcards WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM quizzes WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM quiz_history WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM study_time WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM notifications WHERE user_id = ?", (user_id,))
        conn.commit()
        return {"message": "All user data has been permanently wiped."}
    finally:
        conn.close()

# =========================================================================
# Administrator Management (Admin Module)
# =========================================================================

def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT is_admin FROM users WHERE id = ?", (current_user["user_id"],))
        user_row = cursor.fetchone()
        if not user_row or not user_row["is_admin"]:
            raise HTTPException(status_code=403, detail="Access denied. Administrator privileges required.")
        return current_user
    finally:
        conn.close()

@app.get("/api/admin/stats")
def get_admin_stats(current_user: dict = Depends(get_current_admin)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        # Total users
        cursor.execute("SELECT COUNT(id) FROM users")
        total_users = cursor.fetchone()[0]
        
        # Total documents
        cursor.execute("SELECT COUNT(id) FROM documents")
        total_documents = cursor.fetchone()[0]
        
        # Total flashcards
        cursor.execute("SELECT COUNT(id) FROM flashcards")
        total_flashcards = cursor.fetchone()[0]
        
        # Total study minutes
        cursor.execute("SELECT COALESCE(SUM(minutes), 0) FROM study_time")
        total_study_minutes = cursor.fetchone()[0]
        
        # Database size
        db_size = 0
        if os.path.exists(DATABASE_FILE):
            db_size = os.path.getsize(DATABASE_FILE)
            
        return {
            "totalUsers": total_users,
            "totalDocuments": total_documents,
            "totalFlashcards": total_flashcards,
            "totalStudyMinutes": total_study_minutes,
            "databaseSizeBytes": db_size
        }
    finally:
        conn.close()

@app.get("/api/admin/users")
def get_admin_users(current_user: dict = Depends(get_current_admin)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT 
                u.id, 
                u.username, 
                u.created_at, 
                u.is_admin,
                (SELECT COUNT(*) FROM documents WHERE user_id = u.id) as document_count,
                (SELECT COUNT(*) FROM flashcards WHERE user_id = u.id) as flashcard_count,
                (SELECT COALESCE(SUM(minutes), 0) FROM study_time WHERE user_id = u.id) as total_study_minutes
            FROM users u
        """)
        rows = cursor.fetchall()
        users_list = []
        for r in rows:
            users_list.append({
                "id": r["id"],
                "username": r["username"],
                "createdAt": r["createdAt"] if "createdAt" in r.keys() else r["created_at"],
                "isAdmin": bool(r["is_admin"]),
                "documentCount": r["document_count"],
                "cardCount": r["flashcard_count"],
                "totalStudyMinutes": r["total_study_minutes"]
            })
        return users_list
    finally:
        conn.close()

@app.post("/api/admin/users/{target_user_id}/toggle-admin")
def toggle_user_admin(target_user_id: int, current_user: dict = Depends(get_current_admin)):
    if target_user_id == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="You cannot revoke your own administrator privileges.")
        
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT is_admin FROM users WHERE id = ?", (target_user_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found.")
        new_admin_status = 1 if row["is_admin"] == 0 else 0
        cursor.execute("UPDATE users SET is_admin = ? WHERE id = ?", (new_admin_status, target_user_id))
        conn.commit()
        return {"message": "User admin status updated successfully", "isAdmin": bool(new_admin_status)}
    finally:
        conn.close()

@app.delete("/api/admin/users/{target_user_id}")
def delete_user_by_admin(target_user_id: int, current_user: dict = Depends(get_current_admin)):
    if target_user_id == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own administrator account.")
        
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE id = ?", (target_user_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found.")
            
        # Delete user files and study data
        cursor.execute("DELETE FROM documents WHERE user_id = ?", (target_user_id,))
        cursor.execute("DELETE FROM flashcards WHERE user_id = ?", (target_user_id,))
        cursor.execute("DELETE FROM quizzes WHERE user_id = ?", (target_user_id,))
        cursor.execute("DELETE FROM quiz_history WHERE user_id = ?", (target_user_id,))
        cursor.execute("DELETE FROM study_time WHERE user_id = ?", (target_user_id,))
        cursor.execute("DELETE FROM notifications WHERE user_id = ?", (target_user_id,))
        cursor.execute("DELETE FROM users WHERE id = ?", (target_user_id,))
        conn.commit()
        return {"message": "User and all associated data permanently deleted."}
    finally:
        conn.close()

@app.post("/api/admin/system/factory-reset")
def factory_reset(current_user: dict = Depends(get_current_admin)):
    conn = get_db()
    cursor = conn.cursor()
    try:
        # Delete all tables
        cursor.execute("DELETE FROM documents")
        cursor.execute("DELETE FROM flashcards")
        cursor.execute("DELETE FROM quizzes")
        cursor.execute("DELETE FROM quiz_history")
        cursor.execute("DELETE FROM study_time")
        cursor.execute("DELETE FROM notifications")
        # Remove all users EXCEPT the current admin
        cursor.execute("DELETE FROM users WHERE id != ?", (current_user["user_id"],))
        conn.commit()
        return {"message": "System factory reset completed. All study data and accounts except your own have been wiped."}
    finally:
        conn.close()



# =========================================================================
# Static Assets and Client Mount
# =========================================================================


# Expose main HTML route at path '/'
@app.get("/", response_class=HTMLResponse)
def get_index():
    with open("index.html", "r", encoding="utf-8") as f:
        return f.read()

# Serve static JS/CSS modules
app.mount("/src", StaticFiles(directory="src"), name="src")
