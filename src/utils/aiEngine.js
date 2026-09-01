/**
 * DeckSum - AI Generation Engine
 * Handles document summarization, MCQ quiz generation, flashcard creation, and chat Q&A.
 * Supports a high-fidelity client-side offline heuristic engine AND live OpenAI/Gemini integrations.
 */

// Heuristic stop words for client-side text extraction
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'about', 'against', 'between', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'in', 'out',
    'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can',
    'will', 'just', 'don', 'should', 'now', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
    'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself',
    'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs',
    'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'has',
    'have', 'had', 'do', 'does', 'did', 'doing', 'would', 'could', 'should'
]);

/**
 * Main entry point for generating a study package (summary, flashcards, quizzes).
 */
export async function generateStudyPackage(text, settings = {}) {
    const { provider = 'mock', apiKey = '', customTopic = '', customUrl = '', customModel = '' } = settings;

    if (provider === 'openai' && apiKey) {
        return generateWithOpenAI(text, apiKey, customTopic);
    } else if (provider === 'gemini' && apiKey) {
        return generateWithGemini(text, apiKey, customTopic);
    } else if (provider === 'custom') {
        return generateWithCustom(text, apiKey, customUrl, customModel, customTopic);
    } else {
        // Run Simulated AI Heuristics
        return generateOfflineHeuristic(text, customTopic);
    }
}

/**
 * Main entry point for contextual Q&A chat.
 */
export async function answerContextQuery(query, documentText, chatHistory = [], settings = {}) {
    const { provider = 'mock', apiKey = '', customUrl = '', customModel = '' } = settings;

    if (provider === 'openai' && apiKey) {
        return chatWithOpenAI(query, documentText, chatHistory, apiKey);
    } else if (provider === 'gemini' && apiKey) {
        return chatWithGemini(query, documentText, chatHistory, apiKey);
    } else if (provider === 'custom') {
        return chatWithCustom(query, documentText, chatHistory, apiKey, customUrl, customModel);
    } else {
        return chatOfflineHeuristic(query, documentText);
    }
}

/* ========================================================================= */
/* 1. MOCK/OFFLINE HEURISTIC ENGINE (Extracts structure directly from text)  */
/* ========================================================================= */

function extractKeywords(text, count = 12) {
    const words = text.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .split(/\s+/);
        
    const freqs = {};
    for (const w of words) {
        if (w.length > 3 && !STOP_WORDS.has(w) && isNaN(w)) {
            freqs[w] = (freqs[w] || 0) + 1;
        }
    }
    
    return Object.entries(freqs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(entry => entry[0]);
}

function extractKeySentences(text, keywords, count = 6) {
    // Split into sentences using typical marks
    const sentences = text.split(/[.!?]\s+/).map(s => s.trim()).filter(s => s.length > 20);
    
    const sentenceScores = sentences.map(sentence => {
        const words = sentence.toLowerCase().split(/\s+/);
        let score = 0;
        for (const w of words) {
            if (keywords.includes(w)) {
                score += 1;
            }
        }
        // Penalize excessively long/short sentences
        if (words.length > 40 || words.length < 8) {
            score *= 0.5;
        }
        return { sentence, score };
    });
    
    return sentenceScores
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map(item => item.sentence);
}

function generateOfflineHeuristic(text, customTopic = '') {
    return new Promise((resolve) => {
        setTimeout(() => {
            const cleanText = text.trim();
            const keywords = extractKeywords(cleanText, 15);
            const keySentences = extractKeySentences(cleanText, keywords, 8);
            
            // Build Summary
            const capitalizedKeywords = keywords.map(w => w.charAt(0).toUpperCase() + w.slice(1));
            
            // Heuristic definitions
            const vocabulary = capitalizedKeywords.slice(0, 6).map((word, idx) => {
                // Find a sentence containing this word to use as a dynamic definition
                const matchingSentence = keySentences.find(s => s.toLowerCase().includes(word.toLowerCase())) || '';
                let def = `A key term and subject of study related to the uploaded document context.`;
                if (matchingSentence) {
                    def = matchingSentence.length > 120 ? matchingSentence.substring(0, 120) + '...' : matchingSentence;
                }
                return { term: word, definition: def };
            });

            const summaryPoints = keySentences.slice(0, 5);
            if (summaryPoints.length === 0) {
                summaryPoints.push("Ensure your document contains readable text for the analysis engine.");
            }

            const structuredSummary = {
                title: customTopic || "Document Summary & Insights",
                overview: `This study guide summarizes the uploaded materials focusing primarily on: ${capitalizedKeywords.slice(0, 4).join(', ')}. It covers critical concepts, terminology, and foundational structures from the text.`,
                keyTakeaways: summaryPoints,
                vocabulary: vocabulary
            };

            // Build Flashcards
            const flashcards = capitalizedKeywords.slice(0, 8).map((word, index) => {
                const associatedSentence = keySentences.find(s => s.toLowerCase().includes(word.toLowerCase())) || cleanText.substring(0, 200);
                return {
                    id: `fc_${Date.now()}_${index}`,
                    question: `Explain the concept and significance of "${word}" as detailed in the document.`,
                    answer: associatedSentence,
                    category: word
                };
            });

            // Build MCQ Quizzes
            const quizzes = capitalizedKeywords.slice(0, 5).map((word, index) => {
                const matchingSentence = keySentences.find(s => s.toLowerCase().includes(word.toLowerCase())) || '';
                const mainConcept = matchingSentence || `The text presents key details regarding ${word}.`;
                
                const otherTerms = capitalizedKeywords.filter(w => w !== word);
                const distractor1 = otherTerms[0] || 'Unrelated structural concepts';
                const distractor2 = otherTerms[1] || 'Alternative theoretical frameworks';
                const distractor3 = otherTerms[2] || 'External context and applications';
                
                // Shuffle options
                const correctText = `Correct explanation detailing: ${mainConcept}`;
                const optionsList = [
                    { key: 'A', text: correctText },
                    { key: 'B', text: `Primary analysis focusing on ${distractor1}` },
                    { key: 'C', text: `Secondary methodology surrounding ${distractor2}` },
                    { key: 'D', text: `Incidental effects concerning ${distractor3}` }
                ];
                
                // Fisher-Yates Shuffle
                for (let i = optionsList.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [optionsList[i], optionsList[j]] = [optionsList[j], optionsList[i]];
                }
                
                // Re-assign letters
                const letters = ['A', 'B', 'C', 'D'];
                const options = optionsList.map((opt, i) => ({
                    letter: letters[i],
                    text: opt.text,
                    isCorrect: opt.text === correctText
                }));
                
                const correctLetter = options.find(o => o.isCorrect).letter;

                return {
                    id: `q_${Date.now()}_${index}`,
                    question: `Which of the following best describes the role or concept of "${word}" according to the uploaded study materials?`,
                    options: options.map(o => ({ letter: o.letter, text: o.text })),
                    correctAnswer: correctLetter,
                    explanation: `Based on the text: "${mainConcept}". This directly confirms that the correct option is ${correctLetter}.`
                };
            });

            resolve({
                summary: structuredSummary,
                flashcards,
                quizzes
            });
        }, 1200); // Simulate network/processing delay
    });
}

function chatOfflineHeuristic(query, documentText) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const paragraphs = documentText.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 30);
            if (paragraphs.length === 0) {
                resolve({
                    answer: "I couldn't find any readable text in the document. Please ensure the document is uploaded and contains copyable text.",
                    citation: "System Warning"
                });
                return;
            }

            const queryWords = query.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => !STOP_WORDS.has(w));
            
            let bestParagraph = paragraphs[0];
            let highestScore = -1;
            let bestIndex = 1;

            paragraphs.forEach((paragraph, idx) => {
                const paraWords = paragraph.toLowerCase();
                let score = 0;
                queryWords.forEach(w => {
                    if (paraWords.includes(w)) {
                        score += 1;
                        // Add extra weight for exact keyword phrases
                        const idxOfWord = paraWords.indexOf(w);
                        if (idxOfWord !== -1) {
                            score += 0.5;
                        }
                    }
                });
                
                if (score > highestScore) {
                    highestScore = score;
                    bestParagraph = paragraph;
                    bestIndex = idx + 1;
                }
            });

            if (highestScore <= 0) {
                resolve({
                    answer: `The document discusses topics including: ${extractKeywords(documentText, 5).join(', ')}. However, I could not find a specific match for "${query}". Here is a relevant excerpt:\n\n${bestParagraph.substring(0, 300)}...`,
                    citation: `Document Overview`
                });
            } else {
                resolve({
                    answer: `According to the document:\n\n"${bestParagraph}"`,
                    citation: `Section ${bestIndex}`
                });
            }
        }, 800);
    });
}

/* ========================================================================= */
/* 2. OPENAI INTEGRATION (Calls chat completions using provided API key)     */
/* ========================================================================= */

async function generateWithOpenAI(text, apiKey, customTopic) {
    const systemPrompt = `You are DeckSum, an expert academic AI. Generate a study package based on the document text. You must respond in valid JSON format.
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
Generate 5-8 flashcards and 5-8 quizzes. Ensure the questions test core understanding, not trivial formatting.`;

    const userPrompt = `Document topic/guideline: ${customTopic || 'General Summary'}\n\nDocument Text:\n${text.substring(0, 15000)}`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Failed to call OpenAI API.');
        }

        const data = await response.json();
        const studyPackage = JSON.parse(data.choices[0].message.content);
        
        // Add random IDs if not present
        if (studyPackage.flashcards) {
            studyPackage.flashcards = studyPackage.flashcards.map((fc, i) => ({
                id: `fc_openai_${Date.now()}_${i}`,
                ...fc
            }));
        }
        if (studyPackage.quizzes) {
            studyPackage.quizzes = studyPackage.quizzes.map((q, i) => ({
                id: `q_openai_${Date.now()}_${i}`,
                ...q
            }));
        }

        return studyPackage;
    } catch (error) {
        console.error("OpenAI generate error:", error);
        throw error;
    }
}

async function chatWithOpenAI(query, documentText, chatHistory, apiKey) {
    const messages = [
        {
            role: 'system',
            content: `You are DeckSum, a highly knowledgeable personal study tutor. You have been given the context of a student's study document. 
Your goal is to answer the student's question accurately using ONLY information from the context.
If the context does not contain the answer, politely state that it's not discussed in the document, but provide the closest helpful explanation based strictly on the theme.
At the end of your response, add a short section: "Citations: [Describe where in the document or section this information is found]".`
        },
        {
            role: 'user',
            content: `Document Context:\n${documentText.substring(0, 15000)}\n\nChat History:\n${chatHistory.map(h => `${h.sender}: ${h.text}`).join('\n')}\n\nStudent Question: ${query}`
        }
    ];

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: messages,
                temperature: 0.4
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'OpenAI chat completion failed.');
        }

        const data = await response.json();
        const reply = data.choices[0].message.content;
        
        // Parse out citations at the end if any
        let citation = 'Document Reference';
        let answer = reply;
        
        const citationMatch = reply.match(/(?:Citations?:|Source:)\s*(.*)$/i);
        if (citationMatch) {
            citation = citationMatch[1].trim();
            answer = reply.replace(/(?:Citations?:|Source:)\s*(.*)$/i, '').trim();
        }

        return { answer, citation };
    } catch (error) {
        console.error("OpenAI chat error:", error);
        throw error;
    }
}

/* ========================================================================= */
/* 3. GEMINI INTEGRATION (Calls Gemini 2.5 flash endpoints)                   */
/* ========================================================================= */

async function generateWithGemini(text, apiKey, customTopic) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const prompt = `You are DeckSum, an expert academic AI. Generate a study package based on the document text. You must respond in valid JSON format ONLY. 
Do not include markdown wraps like \`\`\`json. Return a single JSON object matching this structure:
{
  "summary": {
    "title": "A descriptive title based on the topic",
    "overview": "A detailed 2-3 sentence overview of the document content",
    "keyTakeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3", "Takeaway 4", "Takeaway 5"],
    "vocabulary": [
      { "term": "Term 1", "definition": "Clear concise definition" }
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

Document topic/guideline: ${customTopic || 'General Summary'}
Document Text:
${text.substring(0, 20000)}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.3
                }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Failed to call Gemini API.');
        }

        const data = await response.json();
        const jsonText = data.candidates[0].content.parts[0].text;
        const studyPackage = JSON.parse(jsonText);

        if (studyPackage.flashcards) {
            studyPackage.flashcards = studyPackage.flashcards.map((fc, i) => ({
                id: `fc_gemini_${Date.now()}_${i}`,
                ...fc
            }));
        }
        if (studyPackage.quizzes) {
            studyPackage.quizzes = studyPackage.quizzes.map((q, i) => ({
                id: `q_gemini_${Date.now()}_${i}`,
                ...q
            }));
        }

        return studyPackage;
    } catch (error) {
        console.error("Gemini generate error:", error);
        throw error;
    }
}

async function chatWithGemini(query, documentText, chatHistory, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const prompt = `You are DeckSum, a highly knowledgeable personal study tutor. You have been given the context of a student's study document.
Answer the student's question accurately using ONLY information from the context.
If the context does not contain the answer, politely state that it's not discussed in the document, but provide the closest helpful explanation based strictly on the theme.
At the end of your response, add a short section: "Citations: [Describe where in the document or section this information is found]".

Document Context:
${documentText.substring(0, 20000)}

Chat History:
${chatHistory.map(h => `${h.sender}: ${h.text}`).join('\n')}

Student Question: ${query}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.4 }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Gemini chat query failed.');
        }

        const data = await response.json();
        const reply = data.candidates[0].content.parts[0].text;
        
        let citation = 'Document Reference';
        let answer = reply;
        
        const citationMatch = reply.match(/(?:Citations?:|Source:)\s*(.*)$/i);
        if (citationMatch) {
            citation = citationMatch[1].trim();
            answer = reply.replace(/(?:Citations?:|Source:)\s*(.*)$/i, '').trim();
        }

        return { answer, citation };
    } catch (error) {
        console.error("Gemini chat error:", error);
        throw error;
    }
}

async function generateWithCustom(text, apiKey, customUrl, customModel, customTopic) {
    const systemPrompt = `You are DeckSum, an expert academic AI. Generate a study package based on the document text. You must respond in valid JSON format.
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
Generate 5-8 flashcards and 5-8 quizzes. Ensure the questions test core understanding, not trivial formatting.`;

    const userPrompt = `Document topic/guideline: ${customTopic || 'General Summary'}\n\nDocument Text:\n${text.substring(0, 15000)}`;

    let url = customUrl.trim() || "http://localhost:11434/v1";
    if (!url.endsWith("/chat/completions")) {
        if (url.endsWith("/")) {
            url = url + "chat/completions";
        } else {
            url = url + "/chat/completions";
        }
    }

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: customModel || 'llama3',
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Custom provider API returned: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        const studyPackage = JSON.parse(data.choices[0].message.content);
        
        if (studyPackage.flashcards) {
            studyPackage.flashcards = studyPackage.flashcards.map((fc, i) => ({
                id: `fc_custom_${Date.now()}_${i}`,
                ...fc
            }));
        }
        if (studyPackage.quizzes) {
            studyPackage.quizzes = studyPackage.quizzes.map((q, i) => ({
                id: `q_custom_${Date.now()}_${i}`,
                ...q
            }));
        }

        return studyPackage;
    } catch (error) {
        console.error("Custom generate error:", error);
        throw error;
    }
}

async function chatWithCustom(query, documentText, chatHistory, apiKey, customUrl, customModel) {
    const messages = [
        {
            role: 'system',
            content: `You are DeckSum, a highly knowledgeable personal study tutor. You have been given the context of a student's study document. 
Your goal is to answer the student's question accurately using ONLY information from the context.
If the context does not contain the answer, politely state that it's not discussed in the document, but provide the closest helpful explanation based strictly on the theme.
At the end of your response, add a short section: "Citations: [Describe where in the document or section this information is found]".`
        },
        {
            role: 'user',
            content: `Document Context:\n${documentText.substring(0, 15000)}\n\nChat History:\n${chatHistory.map(h => `${h.sender}: ${h.text}`).join('\n')}\n\nStudent Question: ${query}`
        }
    ];

    let url = customUrl.trim() || "http://localhost:11434/v1";
    if (!url.endsWith("/chat/completions")) {
        if (url.endsWith("/")) {
            url = url + "chat/completions";
        } else {
            url = url + "/chat/completions";
        }
    }

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: customModel || 'llama3',
                messages: messages,
                temperature: 0.4
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Custom provider chat API returned: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        const reply = data.choices[0].message.content;
        
        let citation = 'Document Reference';
        let answer = reply;
        
        const citationMatch = reply.match(/(?:Citations?:|Source:)\s*(.*)$/i);
        if (citationMatch) {
            citation = citationMatch[1].trim();
            answer = reply.replace(/(?:Citations?:|Source:)\s*(.*)$/i, '').trim();
        }

        return { answer, citation };
    } catch (error) {
        console.error("Custom chat error:", error);
        throw error;
    }
}
