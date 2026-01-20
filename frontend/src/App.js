import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { FiUpload, FiX, FiDownload, FiVolume2, FiMoon, FiSun } from 'react-icons/fi';

const SUPPORTED_LANGUAGES = {
    en: 'English',
    hi: 'Hindi',
    kn: 'Kannada',
};

const App = () => {
    const [inputText, setInputText] = useState('');
    const [translatedInput, setTranslatedInput] = useState('');
    const [summary, setSummary] = useState('Enter text to summarize');
    const [originalSummary, setOriginalSummary] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [methodUsed, setMethodUsed] = useState(null);
    const [numSentences, setNumSentences] = useState(null);
    const [pdfInfo, setPdfInfo] = useState(null);
    const [isPdfProcessing, setIsPdfProcessing] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [inputLanguage, setInputLanguage] = useState('en');
    const [originalLanguage, setOriginalLanguage] = useState('en');
    const [displayLanguage, setDisplayLanguage] = useState('en');
    const [lastReadSummary, setLastReadSummary] = useState('');
    const [useChunking, setUseChunking] = useState(false);
    const [themeMode, setThemeMode] = useState('day');
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Noto+Sans+Kannada:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);

        return () => {
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            if (window.currentAudio) {
                window.currentAudio.pause();
                window.currentAudio = null;
            }
            document.head.removeChild(link);
        };
    }, []);

    const toggleTheme = () => {
        setThemeMode(themeMode === 'day' ? 'night' : 'day');
    };

    const getSummaryBackgroundStyle = () => {
        return {
            position: 'relative',
            zIndex: 1,
            fontFamily: displayLanguage === 'kn' ? 'Noto Sans Kannada, sans-serif' : 
                        displayLanguage === 'hi' ? 'Noto Sans Devanagari, sans-serif' : 'Roboto, sans-serif',
            fontWeight: themeMode === 'night' ? 500 : 400,
            background: themeMode === 'night'
                ? 'linear-gradient(to bottom, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))'
                : 'linear-gradient(to bottom, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.95))',
            color: themeMode === 'night' ? '#F8FAFC' : '#1E293B',
        };
    };

    const handlePdfUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            setSummary('File too large (max 10MB)');
            return;
        }

        setIsPdfProcessing(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post('http://localhost:5000/process-pdf', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const normalizedText = response.data.text
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            setInputText(normalizedText);
            setPdfInfo(response.data.metadata);
            setInputLanguage(response.data.language || 'en');
            setOriginalLanguage(response.data.language || 'en');
            setDisplayLanguage(response.data.language || 'en');
            setSummary('Enter text to summarize');
            setTranslatedInput('');
        } catch (error) {
            console.error('PDF processing error:', error);
            setSummary('Failed to process PDF. Please try again or check server status.');
        } finally {
            setIsPdfProcessing(false);
        }
    };

    const handleSummarize = async (method, chunking = false) => {
        if (!inputText.trim() || inputText.split(' ').length < 50) {
            setSummary('Please enter at least 50 words of text');
            return;
        }

        setIsLoading(true);
        setMethodUsed(method);
        setNumSentences(null);
        setUseChunking(chunking);
        setSummary('Generating summary...');
        setProgress(0);

        try {
            const response = await axios.post('http://localhost:5000/summarize', {
                text: inputText,
                method: method,
                num_sentences: 3,
                use_chunking: chunking,
            });

            let formattedSummary;
            if (method === 'textrank' && response.data.original_language === 'en') {
                const sentences = response.data.summary
                    .split(/(?<=[.!?])\s+/)
                    .filter((s) => s.trim())
                    .map((s) => s.trim());
                formattedSummary = sentences.map((s) => '- ' + s).join('\n');
            } else {
                formattedSummary = response.data.summary
                    .replace(/\n+/g, '\n\n')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            if (method === 'bart' && formattedSummary.length < 100) {
                alert('Summary is too short. Try enabling chunking or check input text.');
                setSummary('Error: Incomplete summary generated. Try enabling chunking.');
                setIsLoading(false);
                return;
            }

            setOriginalSummary(formattedSummary);
            setSummary(formattedSummary);
            setInputLanguage('en');
            setDisplayLanguage('en');
            setNumSentences(response.data.num_sentences);
            setOriginalLanguage(response.data.original_language || 'en');
            setTranslatedInput(response.data.translated_text || '');
            setProgress(100);
        } catch (error) {
            console.error('Error summarizing text:', error);
            const errorMessage = error.response?.data?.error || error.message || 'Failed to generate summary';
            setSummary(`Error: ${errorMessage}. Try enabling chunking or check input length.`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLanguageChange = async (targetLang) => {
        if (
            !originalSummary ||
            originalSummary === 'Enter text to summarize' ||
            originalSummary.startsWith('Generating') ||
            originalSummary.startsWith('Error')
        ) {
            setSummary(originalSummary || 'Enter text to summarize');
            setDisplayLanguage(targetLang);
            return;
        }

        if (targetLang === 'en') {
            setSummary(originalSummary);
            setDisplayLanguage(targetLang);
            return;
        }

        try {
            const textToTranslate = originalSummary.replace(/- /g, '').replace(/\n/g, ' ').trim();
            const response = await axios.post('http://localhost:5000/translate', {
                text: textToTranslate,
                source_lang: 'en',
                target_lang: targetLang,
            });

            const translatedText = response.data.translated_text;
            if (!translatedText || translatedText.trim() === '') {
                alert('Translation resulted in empty text. Please try a different language or check the input.');
                setSummary(originalSummary);
                setDisplayLanguage('en');
                return;
            }

            const formattedTranslatedText = translatedText.replace(/([.!?])\s+/g, '$1\n\n').trim();
            setSummary(formattedTranslatedText);
            setDisplayLanguage(targetLang);
        } catch (error) {
            console.error('Translation error:', error);
            const errorMessage = error.response?.data?.error || error.message || 'Failed to translate summary';
            alert(`Failed to translate to ${SUPPORTED_LANGUAGES[targetLang]}: ${errorMessage}`);
            setSummary(originalSummary);
            setDisplayLanguage('en');
        }
    };

    const downloadSummary = async () => {
        if (
            !summary ||
            summary === 'Enter text to summarize' ||
            summary.startsWith('Generating') ||
            summary.startsWith('Error')
        ) return;

        if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
        }
        if (window.currentAudio) {
            window.currentAudio.pause();
            window.currentAudio = null;
            setIsSpeaking(false);
        }

        try {
            const pdfSummary = methodUsed === 'textrank' && originalLanguage === 'en'
                ? summary.replace(/- /g, '').replace(/\n/g, ' ')
                : summary;

            const response = await axios.post(
                'http://localhost:5000/download-summary',
                {
                    summary: pdfSummary,
                    method: methodUsed || 'unknown',
                    num_sentences: numSentences || 3,
                    language: displayLanguage,
                },
                {
                    responseType: 'blob',
                    timeout: 10000,
                }
            );

            if (response.status !== 200) {
                throw new Error(`Server returned status: ${response.status}`);
            }

            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `summary_${methodUsed || 'unknown'}_${displayLanguage}.pdf`);
            document.body.appendChild(link);
            link.click();

            setTimeout(() => {
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            }, 100);
        } catch (error) {
            console.error('Download failed:', error.message, error.response?.data);
            alert(`Failed to download PDF: ${error.response?.data?.error || error.message}`);
        }
    };

    const readSummary = async () => {
        if (
            !summary ||
            summary === 'Enter text to summarize' ||
            summary.startsWith('Generating') ||
            summary.startsWith('Error')
        ) return;

        if (isSpeaking) {
            if (displayLanguage === 'en') {
                window.speechSynthesis.cancel();
                setIsSpeaking(false);
                setLastReadSummary('');
            } else {
                if (window.currentAudio) {
                    window.currentAudio.pause();
                    window.currentAudio.currentTime = 0;
                }
                setIsSpeaking(false);
                setLastReadSummary('');
            }
            return;
        }

        let textToRead = methodUsed === 'textrank' && originalLanguage === 'en'
            ? summary.replace(/- /g, '')
            : summary;

        if (lastReadSummary === `${textToRead}_${displayLanguage}`) {
            console.log('Skipping redundant TTS call');
            return;
        }

        const playAudio = (blob, type = 'audio/wav') => {
            const audioBlob = new Blob([blob], { type });
            const audioUrl = window.URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.onplay = () => setIsSpeaking(true);
            audio.onended = () => {
                setIsSpeaking(false);
                setLastReadSummary(`${textToRead}_${displayLanguage}`);
                window.URL.revokeObjectURL(audioUrl);
                window.currentAudio = null;
            };
            audio.onerror = () => {
                setIsSpeaking(false);
                window.URL.revokeObjectURL(audioUrl);
                window.currentAudio = null;
                alert('Failed to play audio.');
            };
            window.currentAudio = audio;
            audio.play();
        };

        if (displayLanguage === 'kn' || displayLanguage === 'hi') {
            try {
                console.log(`Requesting TTS for ${displayLanguage}, characters: ${textToRead.length}`);
                const response = await axios.post(
                    'http://localhost:5000/tts',
                    {
                        text: textToRead,
                        language: displayLanguage,
                    },
                    { responseType: 'blob' }
                );
                playAudio(response.data, 'audio/wav');
            } catch (error) {
                console.error('TTS error:', error);
                alert(`${displayLanguage === 'kn' ? 'Kannada' : 'Hindi'} TTS failed. Try English.`);
                setIsSpeaking(false);
            }
        } else {
            const utterance = new SpeechSynthesisUtterance(textToRead);
            utterance.lang = 'en-US';
            utterance.volume = 1;
            utterance.rate = 1;
            utterance.pitch = 1;

            const voices = window.speechSynthesis.getVoices();
            const matchingVoice = voices.find((voice) => voice.lang.includes('en'));
            if (matchingVoice) {
                utterance.voice = matchingVoice;
            }

            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => {
                setIsSpeaking(false);
                setLastReadSummary(`${textToRead}_${displayLanguage}`);
            };
            utterance.onerror = (event) => {
                if (event.error !== 'interrupted') {
                    console.error('Speech error:', event.error);
                    setIsSpeaking(false);
                    alert(`Text-to-speech failed: ${event.error}. Try a different language or browser.`);
                } else {
                    setIsSpeaking(false);
                }
            };

            window.speechSynthesis.speak(utterance);
        }
    };

    return (
        <div className={`min-h-screen font-sans transition-all duration-300 ${
            themeMode === 'night'
                ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100'
                : 'bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50 text-gray-900'
        }`}>
            {/* Navbar */}
            <motion.nav
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className={`fixed top-0 w-full py-4 z-50 backdrop-blur-lg ${
                    themeMode === 'night'
                        ? 'bg-gray-900/80 border-b border-gray-800'
                        : 'bg-white/80 border-b border-gray-200'
                }`}
            >
                <div className="container mx-auto px-6 flex items-center justify-between">
                    <motion.a
                        href="/"
                        whileHover={{ scale: 1.05 }}
                        className={`text-2xl font-bold tracking-tight ${
                            themeMode === 'night'
                                ? 'text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400'
                                : 'text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600'
                        }`}
                    >
                        NexSummary
                    </motion.a>
                    <div className="flex items-center space-x-6">
                        <motion.a
                            href="#summarization"
                            whileHover={{ y: -2 }}
                            className={`text-sm font-medium ${
                                themeMode === 'night'
                                    ? 'text-gray-300 hover:text-blue-300'
                                    : 'text-gray-700 hover:text-blue-600'
                            } transition-colors duration-300`}
                        >
                            Summarization
                        </motion.a>
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={toggleTheme}
                            className={`p-2 rounded-full ${
                                themeMode === 'night'
                                    ? 'bg-gray-700 text-blue-300 hover:bg-gray-600'
                                    : 'bg-gray-100 text-blue-600 hover:bg-gray-200'
                            } transition-colors duration-300`}
                            aria-label={themeMode === 'night' ? 'Switch to day mode' : 'Switch to night mode'}
                        >
                            {themeMode === 'night' ? <FiSun size={18} /> : <FiMoon size={18} />}
                        </motion.button>
                    </div>
                </div>
            </motion.nav>

            {/* Hero Section */}
            <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="pt-32 pb-16 text-center"
            >
                <div className="container mx-auto px-6">
                    <motion.h1
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className={`text-5xl md:text-6xl font-bold mb-6 ${
                            themeMode === 'night'
                                ? 'text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300'
                                : 'text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600'
                        }`}
                    >
                        NexSummary
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.6 }}
                        className={`text-xl max-w-2xl mx-auto ${
                            themeMode === 'night' ? 'text-gray-300' : 'text-gray-600'
                        }`}
                    >
                        Transform your PDFs and text into concise summaries with ease
                    </motion.p>
                </div>
            </motion.section>

            {/* Main Content */}
            <section id="summarization" className="container mx-auto px-6 pb-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className={`rounded-3xl p-8 md:p-12 max-w-6xl mx-auto backdrop-blur-lg ${
                        themeMode === 'night'
                            ? 'bg-gray-800/70 border border-gray-700'
                            : 'bg-white/80 border border-gray-200'
                    }`}
                >
                    <motion.h2
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className={`text-3xl md:text-4xl font-bold mb-8 text-center ${
                            themeMode === 'night'
                                ? 'text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300'
                                : 'text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600'
                        }`}
                    >
                        Summarize with Ease
                    </motion.h2>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Input Column */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.6, delay: 0.4 }}
                            className="space-y-6"
                        >
                            <h3 className={`text-2xl font-semibold ${
                                themeMode === 'night' ? 'text-gray-100' : 'text-gray-800'
                            }`}>
                                Input Your Content
                            </h3>

                            {/* PDF Upload */}
                            <motion.div
                                whileHover={{ y: -3 }}
                                whileTap={{ scale: 0.98 }}
                                className="relative group"
                            >
                                <label className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 ${
                                    themeMode === 'night'
                                        ? 'border-gray-600 hover:border-blue-400 bg-gray-700/30'
                                        : 'border-gray-200 hover:border-blue-500 bg-white/50'
                                }`}>
                                    <motion.div
                                        animate={isPdfProcessing ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                                        transition={{ duration: 1.5, repeat: isPdfProcessing ? Infinity : 0 }}
                                    >
                                        <FiUpload className={`w-8 h-8 mb-3 ${
                                            isPdfProcessing
                                                ? 'text-blue-400'
                                                : themeMode === 'night'
                                                    ? 'text-gray-400 group-hover:text-blue-400'
                                                    : 'text-gray-400 group-hover:text-blue-500'
                                        }`} />
                                    </motion.div>
                                    <span className={`font-medium ${
                                        themeMode === 'night' ? 'text-gray-200' : 'text-gray-700'
                                    }`}>
                                        {isPdfProcessing ? 'Processing PDF...' : 'Upload PDF'}
                                    </span>
                                    <span className={`text-sm mt-1 ${
                                        themeMode === 'night' ? 'text-gray-400' : 'text-gray-500'
                                    }`}>
                                        {pdfInfo ? 'PDF loaded!' : 'Max 10MB'}
                                    </span>
                                    <input
                                        type="file"
                                        accept=".pdf"
                                        onChange={handlePdfUpload}
                                        className="hidden"
                                        disabled={isPdfProcessing}
                                    />
                                </label>
                                {pdfInfo && (
                                    <motion.button
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => {
                                            setPdfInfo(null);
                                            setInputText('');
                                            setTranslatedInput('');
                                            setSummary('Enter text to summarize');
                                            setInputLanguage('en');
                                            setOriginalLanguage('en');
                                            setDisplayLanguage('en');
                                            setMethodUsed(null);
                                            setNumSentences(null);
                                        }}
                                        className={`absolute -top-2 -right-2 rounded-full p-1.5 ${
                                            themeMode === 'night'
                                                ? 'bg-red-400 text-gray-900 hover:bg-red-500'
                                                : 'bg-red-500 text-white hover:bg-red-600'
                                        }`}
                                        aria-label="Remove PDF"
                                    >
                                        <FiX size={14} />
                                    </motion.button>
                                )}
                            </motion.div>

                            {/* PDF Info */}
                            {pdfInfo && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4 }}
                                    className={`p-4 rounded-xl ${
                                        themeMode === 'night'
                                            ? 'bg-gray-700/50 border border-gray-600'
                                            : 'bg-blue-50/70 border border-blue-100'
                                    }`}
                                >
                                    <h4 className={`font-semibold mb-2 ${
                                        themeMode === 'night' ? 'text-blue-300' : 'text-blue-600'
                                    }`}>
                                        PDF Information
                                    </h4>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div className={`${themeMode === 'night' ? 'text-gray-300' : 'text-gray-700'}`}>
                                            <span className="font-medium">Title:</span> {pdfInfo.title}
                                        </div>
                                        <div className={`${themeMode === 'night' ? 'text-gray-300' : 'text-gray-700'}`}>
                                            <span className="font-medium">Pages:</span> {pdfInfo.pages}
                                        </div>
                                        <div className={`${themeMode === 'night' ? 'text-gray-300' : 'text-gray-700'}`}>
                                            <span className="font-medium">Author:</span> {pdfInfo.author || 'Unknown'}
                                        </div>
                                        <div className={`${themeMode === 'night' ? 'text-gray-300' : 'text-gray-700'}`}>
                                            <span className="font-medium">Language:</span> {SUPPORTED_LANGUAGES[originalLanguage]}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Text Input */}
                            <div>
                                <label className={`block font-medium mb-2 ${
                                    themeMode === 'night' ? 'text-gray-200' : 'text-gray-700'
                                }`}>
                                    Enter Text
                                </label>
                                <motion.textarea
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.4 }}
                                    className={`w-full p-4 border rounded-xl focus:outline-none focus:ring-2 transition-all duration-300 placeholder-gray-400 min-h-[200px] ${
                                        themeMode === 'night'
                                            ? 'bg-gray-700/50 border-gray-600 text-gray-100 focus:ring-blue-400'
                                            : 'bg-white/80 border-gray-200 text-gray-900 focus:ring-blue-500'
                                    }`}
                                    placeholder={`Paste your ${SUPPORTED_LANGUAGES[inputLanguage]} text here...`}
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    rows="6"
                                />
                            </div>

                            {/* Translated Input */}
                            {translatedInput && (
                                <div>
                                    <label className={`block font-medium mb-2 ${
                                        themeMode === 'night' ? 'text-gray-200' : 'text-gray-700'
                                    }`}>
                                        Translated English Input
                                    </label>
                                    <motion.textarea
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ duration: 0.4 }}
                                        className={`w-full p-4 border rounded-xl focus:outline-none focus:ring-2 transition-all duration-300 ${
                                            themeMode === 'night'
                                                ? 'bg-gray-700/50 border-gray-600 text-gray-100 focus:ring-blue-400'
                                                : 'bg-white/80 border-gray-200 text-gray-900 focus:ring-blue-500'
                                        }`}
                                        value={translatedInput}
                                        readOnly
                                        rows="4"
                                    />
                                </div>
                            )}

                            {/* Summarize Button */}
                            <motion.div
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.99 }}
                                className="pt-2"
                            >
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleSummarize('bart', true)}
                                    disabled={isLoading}
                                    className={`w-full py-4 rounded-xl font-medium transition-all duration-300 ${
                                        themeMode === 'night'
                                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600'
                                            : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700'
                                    } ${isLoading ? 'opacity-80 cursor-not-allowed' : ''}`}
                                >
                                    {isLoading ? (
                                        <span className="flex items-center justify-center">
                                            <span className="mr-2">Processing</span>
                                            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                        </span>
                                    ) : (
                                        'Summarize'
                                    )}
                                </motion.button>
                            </motion.div>

                            {(originalLanguage !== 'en' || inputLanguage !== 'en') && (
                                <p className={`text-xs ${
                                    themeMode === 'night' ? 'text-gray-400' : 'text-gray-500'
                                }`}>
                                    Non-English inputs are translated to English for BART summarization. TextRank
                                    requires English input or translation.
                                </p>
                            )}
                        </motion.div>

                        {/* Output Column */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.6, delay: 0.4 }}
                            className="space-y-6"
                        >
                            <div className="flex justify-between items-center flex-wrap gap-4">
                                <h3 className={`text-2xl font-semibold ${
                                    themeMode === 'night' ? 'text-gray-100' : 'text-gray-800'
                                }`}>
                                    Your Summary
                                </h3>
                                <div className="flex items-center space-x-3">
                                    <label htmlFor="language-select" className={`text-sm ${
                                        themeMode === 'night' ? 'text-gray-300' : 'text-gray-600'
                                    }`}>
                                        Language:
                                    </label>
                                    <motion.select
                                        id="language-select"
                                        value={displayLanguage}
                                        onChange={(e) => handleLanguageChange(e.target.value)}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        className={`px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-1 ${
                                            themeMode === 'night'
                                                ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-400'
                                                : 'bg-white border-gray-200 text-gray-900 focus:ring-blue-500'
                                        }`}
                                    >
                                        <option value="en">English</option>
                                        <option value="hi">Hindi</option>
                                        <option value="kn">Kannada</option>
                                    </motion.select>
                                </div>
                                {summary &&
                                    !isLoading &&
                                    summary !== 'Enter text to summarize' &&
                                    !summary.startsWith('Generating') &&
                                    !summary.startsWith('Error') && (
                                        <div className="flex space-x-2">
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={downloadSummary}
                                                className={`p-2 rounded-lg ${
                                                    themeMode === 'night'
                                                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                                }`}
                                                title="Download as PDF"
                                            >
                                                <FiDownload size={16} />
                                            </motion.button>
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={readSummary}
                                                className={`p-2 rounded-lg ${
                                                    isSpeaking
                                                        ? themeMode === 'night'
                                                            ? 'bg-red-500 text-white hover:bg-red-600'
                                                            : 'bg-red-600 text-white hover:bg-red-700'
                                                        : themeMode === 'night'
                                                            ? 'bg-purple-500 text-white hover:bg-purple-600'
                                                            : 'bg-purple-600 text-white hover:bg-purple-700'
                                                }`}
                                                title={isSpeaking ? 'Stop reading' : 'Read aloud'}
                                            >
                                                <FiVolume2 size={16} />
                                            </motion.button>
                                        </div>
                                    )}
                            </div>

                            {/* Summary Output */}
                            <motion.div
                                key={summary}
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.4 }}
                                style={getSummaryBackgroundStyle()}
                                className={`p-6 rounded-xl min-h-[300px] max-h-[500px] overflow-y-auto ${
                                    themeMode === 'night'
                                        ? 'border border-gray-700'
                                        : 'border border-gray-200'
                                }`}
                            >
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center h-full space-y-4">
                                        <div className="relative w-16 h-16">
                                            <div className={`absolute inset-0 rounded-full border-2 ${
                                                themeMode === 'night' ? 'border-blue-400/30' : 'border-blue-500/30'
                                            }`}></div>
                                            <div className={`absolute inset-0 rounded-full border-t-2 ${
                                                themeMode === 'night' ? 'border-blue-400' : 'border-blue-500'
                                            } animate-spin`}></div>
                                        </div>
                                        <p className={`text-center ${
                                            themeMode === 'night' ? 'text-gray-300' : 'text-gray-600'
                                        }`}>
                                            Analyzing your content...
                                        </p>
                                    </div>
                                ) : (
                                    <div className="prose max-w-none">
                                        {methodUsed === 'textrank' && originalLanguage === 'en' ? (
                                            <ul className="space-y-2">
                                                {summary.split('\n').map(
                                                    (item, index) =>
                                                        item.trim() && (
                                                            <motion.li
                                                                key={index}
                                                                className="flex items-start"
                                                                initial={{ x: -10, opacity: 0 }}
                                                                animate={{ x: 0, opacity: 1 }}
                                                                transition={{ duration: 0.2, delay: index * 0.1 }}
                                                            >
                                                                <span className={`inline-block mt-1.5 mr-2 w-2 h-2 rounded-full ${
                                                                    themeMode === 'night' ? 'bg-blue-400' : 'bg-blue-600'
                                                                }`}></span>
                                                                <span>{item.replace('-', '').trim()}</span>
                                                            </motion.li>
                                                        )
                                                )}
                                            </ul>
                                        ) : (
                                            <div className="whitespace-pre-line">
                                                {summary.split('\n\n').map((paragraph, index) => (
                                                    <motion.p
                                                        key={index}
                                                        className="mb-4 last:mb-0"
                                                        initial={{ y: 10, opacity: 0 }}
                                                        animate={{ y: 0, opacity: 1 }}
                                                        transition={{ duration: 0.2, delay: index * 0.1 }}
                                                    >
                                                        {paragraph}
                                                    </motion.p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        </motion.div>
                    </div>
                </motion.div>
            </section>

            {/* Footer */}
            <motion.footer
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className={`py-6 text-center ${
                    themeMode === 'night'
                        ? 'bg-gray-900/80 text-gray-300 border-t border-gray-800'
                        : 'bg-white/80 text-gray-700 border-t border-gray-200'
                }`}
            >
                <div className="container mx-auto px-6">
                    <p className="text-sm">
                        © {new Date().getFullYear()} NexSummary. All rights reserved.
                    </p>
                </div>
            </motion.footer>
        </div>
    );
};

export default App;
