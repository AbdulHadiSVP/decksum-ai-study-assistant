/**
 * DeckSum - Client-side Document Parser Utility
 * Extracts plain text from TXT, PDF, and DOCX files entirely in the browser.
 */

export async function parseDocument(file, onProgress = () => {}) {
    const fileType = file.name.split('.').pop().toLowerCase();
    
    if (fileType === 'txt' || fileType === 'md' || fileType === 'json') {
        return parseTextFile(file, onProgress);
    } else if (fileType === 'docx') {
        return parseDocxFile(file, onProgress);
    } else if (fileType === 'pdf') {
        return parsePdfFile(file, onProgress);
    } else {
        throw new Error(`Unsupported file format: .${fileType}. Please upload PDF, DOCX, or plain text.`);
    }
}

function parseTextFile(file, onProgress) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onloadstart = () => onProgress(10);
        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 90) + 10;
                onProgress(percent);
            }
        };
        
        reader.onload = (e) => {
            onProgress(100);
            resolve(e.target.result);
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read the text file.'));
        };
        
        reader.readAsText(file);
    });
}

async function parseDocxFile(file, onProgress) {
    onProgress(15);
    if (!window.mammoth) {
        throw new Error('Mammoth.js parser is not loaded. Check internet connection.');
    }
    
    const arrayBuffer = await file.arrayBuffer();
    onProgress(50);
    
    try {
        const result = await window.mammoth.extractRawText({ arrayBuffer });
        onProgress(100);
        return result.value; // Raw text contents
    } catch (error) {
        console.error('Docx parse error:', error);
        throw new Error('Could not parse Word document. File might be corrupted.');
    }
}

async function parsePdfFile(file, onProgress) {
    onProgress(10);
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    if (!pdfjsLib) {
        throw new Error('PDF.js parser is not loaded. Check internet connection.');
    }

    const arrayBuffer = await file.arrayBuffer();
    onProgress(30);

    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        
        // Progress updates from pdf.js loading task
        loadingTask.onProgress = (progressData) => {
            if (progressData.total > 0) {
                const percent = Math.round((progressData.loaded / progressData.total) * 40) + 30; // Scale to 30-70%
                onProgress(percent);
            }
        };

        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;
        let extractedText = '';

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            extractedText += pageText + '\n';
            
            // Scaled progress from 70% to 95%
            const pageProgress = 70 + Math.round((pageNum / totalPages) * 25);
            onProgress(pageProgress);
        }
        
        onProgress(100);
        return extractedText;
    } catch (error) {
        console.error('PDF parse error:', error);
        throw new Error('Could not parse PDF. File might be password-protected or layout is incompatible.');
    }
}
