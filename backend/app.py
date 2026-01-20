from flask import Flask, request, jsonify, make_response, send_file
from flask_cors import CORS
from PyPDF2 import PdfReader
import tempfile
import os
import re
import io
import torch
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit
import numpy as np
import pandas as pd
import nltk
from deep_translator import GoogleTranslator
nltk.download('punkt_tab', quiet=True)
nltk.download('punkt', quiet=True)
from nltk.corpus import stopwords
from nltk.tokenize import sent_tokenize, word_tokenize
from langdetect import detect
from collections import Counter
import hashlib
from gtts import gTTS
from pydub import AudioSegment
from english_chunker import EnglishTextProcessor
from hindi_processor import HindiProcessor
from kannada_processor import KannadaProcessor

# Initialize processors
english_processor = EnglishTextProcessor()
hindi_processor = HindiProcessor()
kannada_processor = KannadaProcessor()

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB limit

# In-memory cache for TTS audio
tts_cache = {}

# Register fonts for reportlab
font_dir = os.path.dirname(os.path.abspath(__file__))
try:
    font_path = os.path.join(font_dir, 'NotoSans-Regular.ttf')
    if os.path.exists(font_path):
        pdfmetrics.registerFont(TTFont('NotoSans', font_path))
    
    font_path = os.path.join(font_dir, 'NotoSans-Devanagari-Regular.ttf')
    if os.path.exists(font_path):
        pdfmetrics.registerFont(TTFont('NotoSansDevanagari', font_path))
    
    font_path = os.path.join(font_dir, 'NotoSans-Kannada-Regular.ttf')
    if os.path.exists(font_path):
        pdfmetrics.registerFont(TTFont('NotoSansKannada', font_path))
except Exception as e:
    print(f"Font registration error: {str(e)}")
    pdfmetrics.registerFont(TTFont('NotoSans', 'Helvetica'))
    pdfmetrics.registerFont(TTFont('NotoSansDevanagari', 'Helvetica'))
    pdfmetrics.registerFont(TTFont('NotoSansKannada', 'Helvetica'))

# Language settings
SUPPORTED_LANGUAGES = {'en': 'English', 'hi': 'Hindi', 'kn': 'Kannada'}
FONT_MAPPING = {
    'en': 'NotoSans',
    'hi': 'NotoSansDevanagari',
    'kn': 'NotoSansKannada'
}

def clean_pdf_text(text):
    text = re.sub(r'<!\[if.*?\]>', '', text, flags=re.DOTALL)
    text = re.sub(r'<[a-zA-Z]:.*?>', '', text)
    text = re.sub(r'</[a-zA-Z]:.*?>', '', text)
    text = re.sub(r'<xml>.*?</xml>', '', text, flags=re.DOTALL)
    text = re.sub(r'^\s*[\r\n]+', '', text, flags=re.MULTILINE)
    return ' '.join(text.split())

def clean_summary_text(text, lang='en'):
    text = re.sub(r'ii+', '', text)
    text = re.sub(r'“CP\d+” — \d{4}/\d{1,2}/\d{1,2} — \d{1,2}:\d{2} — page \d+ — #\d+', '', text)
    text = ' '.join(text.split())
    if lang == 'en':
        text = re.sub(r'([.!?])\s+', r'\1\n\n', text)
    elif lang == 'kn':
        text = re.sub(r'[^\u0C80-\u0CFF\s.!?]', '', text)
    elif lang == 'hi':
        text = re.sub(r'[^\u0900-\u097F\s.!?]', '', text)
    return text.strip()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'pdf'}

@app.route('/process-pdf', methods=['POST'])
def process_pdf():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400

    try:
        # Save to temp file and close it before reading
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            file.save(tmp.name)
            temp_path = tmp.name

        text = ""
        reader = PdfReader(temp_path)

        metadata = {
            'pages': len(reader.pages),
            'author': reader.metadata.author if reader.metadata and reader.metadata.author else 'Unknown',
            'title': reader.metadata.title if reader.metadata and reader.metadata.title else file.filename
        }

        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                text += extracted + "\n"

        os.unlink(temp_path)  # Cleanup temp file

        text = clean_pdf_text(text)
        lang = detect(text) if text.strip() else 'en'

        return jsonify({
            'text': text,
            'metadata': metadata,
            'language': lang
        })

    except Exception as e:
        return jsonify({'error': f'PDF processing failed: {str(e)}'}), 500
    
@app.route('/summarize', methods=['POST'])
def summarize():
    data = request.get_json()
    text = data.get('text', '')
    print("Raw data:", text)
    method = data.get('method', 'bart')
    
    if not text:
        return jsonify({'error': 'No text provided'}), 400
        
    try:
        lang = detect(text) if text.strip() else 'en'
        lang = lang if lang in SUPPORTED_LANGUAGES else 'en'
        
        if lang == 'hi':
            result = hindi_processor.process(text)
        elif lang == 'kn':
            result = kannada_processor.process(text)
        else:  # English
            result = english_processor.process_text(text)
        
        return jsonify({
            'summary': result,
            'language': lang,
            'method': 'mbart' if lang in ['hi', 'kn'] else 'bart'
        })
        
    except Exception as e:
        return jsonify({'error': f'Summarization failed: {str(e)}'}), 500

@app.route('/translate', methods=['POST'])
def translate():
    data = request.get_json()
    text = data.get('text', '')
    source_lang = data.get('source_lang', 'en')
    target_lang = data.get('target_lang', '')

    if not text or not isinstance(text, str) or not text.strip():
        return jsonify({'error': 'No text provided'}), 400

    if source_lang not in SUPPORTED_LANGUAGES:
        return jsonify({'error': f'Unsupported source language: {source_lang}'}), 400

    if target_lang not in SUPPORTED_LANGUAGES:
        return jsonify({'error': f'Unsupported target language: {target_lang}'}), 400

    if source_lang == target_lang:
        return jsonify({'translated_text': text}), 200

    try:
        translator = GoogleTranslator(source=source_lang, target=target_lang)
        translated_text = translator.translate(text)
        
        if not translated_text or not translated_text.strip():
            return jsonify({'error': 'Translation resulted in empty text'}), 500

        return jsonify({'translated_text': translated_text.strip()})
        
    except Exception as e:
        return jsonify({'error': f'Translation failed: {str(e)}'}), 500

@app.route('/tts', methods=['POST'])
def tts():
    data = request.get_json()
    text = data.get('text', '')
    lang = data.get('language', 'en')

    if not text:
        return jsonify({'error': 'No text provided'}), 400

    if lang not in SUPPORTED_LANGUAGES:
        return jsonify({'error': 'Unsupported language'}), 400

    cache_key = hashlib.md5(f"{text}_{lang}".encode()).hexdigest()
    if cache_key in tts_cache:
        return send_file(
            io.BytesIO(tts_cache[cache_key]),
            mimetype='audio/wav',
            as_attachment=False,
            download_name='tts_output.wav'
        )

    try:
        if lang in ['kn', 'hi']:
            tts = gTTS(text=text, lang=lang, slow=False)
            mp3_fp = io.BytesIO()
            tts.write_to_fp(mp3_fp)
            mp3_fp.seek(0)

            audio = AudioSegment.from_file(mp3_fp, format="mp3")
            wav_fp = io.BytesIO()
            audio.export(wav_fp, format="wav")
            wav_fp.seek(0)
            audio_data = wav_fp.read()

            tts_cache[cache_key] = audio_data
            return send_file(
                io.BytesIO(audio_data),
                mimetype='audio/wav',
                as_attachment=False,
                download_name='tts_output.wav'
            )
        else:
            return jsonify({'error': 'Use browser TTS for English'}), 400
    except Exception as e:
        return jsonify({'error': f'TTS failed: {str(e)}'}), 500

@app.route('/download-summary', methods=['POST'])
def download_summary():
    data = request.get_json()
    summary = data.get('summary', '')
    method = data.get('method', '')
    lang = data.get('language', 'en')

    if not summary:
        return jsonify({'error': 'No summary provided'}), 400

    try:
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter
        margin = 72
        y_position = height - margin
        line_height = 14
        max_width = width - 2 * margin

        font = FONT_MAPPING.get(lang, 'NotoSans')
        if font not in pdfmetrics.getRegisteredFontNames():
            font = 'Helvetica'

        c.setFont('Helvetica', 16)
        c.drawCentredString(width / 2, y_position, "Document Summary")
        y_position -= 30

        c.setFont('Helvetica', 12)
        c.drawCentredString(width / 2, y_position, f"Method: {method.upper()} | Language: {SUPPORTED_LANGUAGES.get(lang, 'Unknown')}")
        y_position -= 30

        c.setFont(font, 12)
        if isinstance(summary, str):
            summary = summary.encode('utf-8').decode('utf-8')

        lines = []
        for paragraph in summary.split('\n'):
            paragraph_lines = simpleSplit(paragraph, font, 12, max_width)
            lines.extend(paragraph_lines)
            lines.append('')

        for line in lines:
            if not line:
                y_position -= line_height
                continue
            if y_position < margin:
                c.showPage()
                c.setFont(font, 12)
                y_position = height - margin
            c.drawString(margin, y_position, line)
            y_position -= line_height

        c.showPage()
        c.save()
        buffer.seek(0)

        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'summary_{method}_{lang}.pdf'
        )
    except Exception as e:
        return jsonify({'error': f'PDF generation failed: {str(e)}'}), 500

if __name__ == '__main__':
    nltk.download('punkt', quiet=True)
    nltk.download('stopwords', quiet=True)
    app.run(host='0.0.0.0', port=5000, debug=True)
