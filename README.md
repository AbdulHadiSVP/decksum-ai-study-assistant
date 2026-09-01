# DeckSum 📚

### AI-Powered Personal Study Assistant

DeckSum is an AI-powered personal study assistant designed to help students learn more effectively from their study materials. Users can upload documents and automatically generate summaries, flashcards, quizzes, and interactive AI-powered learning content.

DeckSum combines document processing, artificial intelligence, spaced repetition, and learning analytics to create a personalized and efficient study experience.

---

## 🚀 Features

### 🔐 User Authentication

- User registration and login
- JWT-based authentication
- Secure password handling
- User profile management
- Password recovery using security questions
- Account security settings

### 📄 Document Processing

- Upload study materials
- Supports multiple document formats
- Extract text from uploaded documents
- Process study content for AI analysis

Supported formats:

- PDF
- DOCX
- TXT
- Markdown

### 🤖 AI-Powered Learning

- Automatic document summarization
- Key takeaway generation
- Vocabulary extraction
- AI-generated flashcards
- AI-generated quizzes
- AI-powered study assistance

### 🗂️ Flashcards

- Automatically generated flashcards
- Interactive flashcard learning
- Flashcard review system
- Track learning progress
- Custom study decks

### 🧠 Spaced Repetition

DeckSum uses the SM-2 spaced repetition concept to help users review flashcards at optimal intervals.

The system tracks:

- Review count
- Ease factor
- Repetition interval
- Next review date
- Card performance

This helps improve long-term knowledge retention.

### 📝 Quiz System

- Automatically generated quizzes
- Multiple-choice questions
- Difficulty customization
- Score calculation
- Quiz history
- Performance tracking

### 💬 AI Chat Assistant

- Interactive AI chat interface
- Ask questions related to study materials
- Context-based responses
- Multi-turn conversations
- Personalized learning assistance

### 📊 Learning Analytics

- Study time tracking
- Quiz performance analysis
- Learning progress monitoring
- Study streak tracking
- Performance insights

### ⚙️ User Settings

- Study preferences
- Quiz difficulty customization
- AI provider configuration
- API key configuration
- Theme preferences

### 👨‍💼 Admin Panel

- View system statistics
- Manage users
- Manage administrator privileges
- Delete user accounts
- Monitor application activity

---

## 🛠️ Technology Stack

### Frontend

- HTML5
- CSS3
- JavaScript (ES6 Modules)

### Backend

- Python
- FastAPI
- Uvicorn

### Database

- SQLite

### Artificial Intelligence

- OpenAI API
- Google Gemini API
- Custom AI APIs
- Local LLM support

### Python Libraries

- FastAPI
- Uvicorn
- PyMuPDF
- python-docx
- HTTPX
- Passlib
- Pydantic
- python-multipart

---

## 📁 Project Structure

```text
DeckSum/
│
├── server.py                  # FastAPI backend server
├── index.html                 # Main application page
├── database.db                # SQLite database
│
├── src/
│   ├── app.js                 # Main application controller
│   ├── index.css              # Application styling
│   │
│   ├── components/
│   │   ├── admin.js           # Admin dashboard
│   │   ├── analytics.js       # Learning analytics
│   │   ├── chat.js            # AI chat assistant
│   │   ├── dashboard.js       # User dashboard
│   │   ├── flashcards.js      # Flashcard system
│   │   ├── quiz.js            # Quiz system
│   │   ├── settings.js        # User settings
│   │   ├── summary.js         # Document summaries
│   │   └── upload.js          # Document upload
│   │
│   └── utils/
│       ├── aiEngine.js        # AI integration
│       ├── api.js             # API communication
│       ├── documentParser.js  # Document parsing
│       └── spacedRepetition.js # SM-2 algorithm
│
├── scratch/                   # Temporary testing scripts
│   ├── debug_app.py
│   └── inspect_test_db.py
│
├── requirements.txt           # Python dependencies
├── .gitignore
└── README.md
