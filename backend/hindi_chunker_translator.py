import requests
from langdetect import detect
from transformers import AutoTokenizer
import nltk
nltk.download('punkt_tab', quiet=True)
nltk.download('punkt', quiet=True)

# Initialize tokenizer for token counting
try:
    tokenizer = AutoTokenizer.from_pretrained("facebook/mbart-large-50")
except Exception as e:
    print(f"Error loading tokenizer: {str(e)}")
    tokenizer = None

# API endpoint for summarization service
SUMMARIZATION_API = "http://localhost:5000/summarize"

def estimate_tokens(text):
    """Estimate tokens using mbart tokenizer or fallback to word-based estimation."""
    if not tokenizer:
        words = len(text.split())
        return int(words * 2.0)  # Conservative estimate for Hindi
    try:
        tokens = len(tokenizer.encode(text, add_special_tokens=False))
        return tokens
    except Exception as e:
        print(f"Token estimation error: {str(e)}")
        words = len(text.split())
        return int(words * 2.0)

def chunk_text(text, max_tokens=500):
    """Split text into chunks with a maximum token limit."""
    sentences = nltk.sent_tokenize(text)
    chunks = []
    current_chunk = []
    current_tokens = 0

    for sentence in sentences:
        tokens = estimate_tokens(sentence)
        if current_tokens + tokens > max_tokens:
            if current_chunk:
                chunks.append(" ".join(current_chunk))
                current_chunk = [sentence]
                current_tokens = tokens
            else:
                chunks.append(sentence)
                current_chunk = []
                current_tokens = 0
        else:
            current_chunk.append(sentence)
            current_tokens += tokens

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks

def summarize_chunk(chunk, method='bart', num_sentences=3, use_chunking=False):
    """Send chunk to summarization API and return the summary."""
    print(f"Sending to API: {chunk[:100]}...")
    payload = {
        'text': chunk,
        'method': method,
        'num_sentences': num_sentences,
        'use_chunking': use_chunking
    }
    try:
        response = requests.post(SUMMARIZATION_API, json=payload)
        response.raise_for_status()
        result = response.json()
        if 'error' in result:
            print(f"Error from summarization API: {result['error']}")
            return None
        summary = result.get('summary', '')
        print(f"Received summary: {summary[:100]}...")
        return summary
    except requests.RequestException as e:
        print(f"API request failed: {str(e)}")
        return None

def process_text(text, method='bart', num_sentences=3):
    """Process Hindi text: no translation, chunk only if > 1000 tokens."""
    if not text or not isinstance(text, str) or not text.strip():
        return "Error: Invalid input text"

    try:
        # Verify language
        lang = detect(text) if text.strip() else 'hi'
        if lang != 'hi':
            print(f"Warning: Detected language {lang}, expected Hindi")
            return "Error: Input must be in Hindi"

        # Estimate tokens
        input_tokens = estimate_tokens(text)
        print(f"Input tokens: {input_tokens}, words: {len(text.split())}")

        # Check token count and decide whether to chunk
        if input_tokens > 1000:
            print("Input exceeds 1000 tokens, chunking enabled")
            chunks = chunk_text(text, max_tokens=500)
            print(f"Created {len(chunks)} chunks")
        else:
            print("Input is 1000 tokens or less, no chunking required")
            chunks = [text]

        # Summarize each chunk
        summaries = []
        for i, chunk in enumerate(chunks):
            print(f"Processing chunk {i+1}/{len(chunks)}")
            summary = summarize_chunk(
                chunk,
                method=method,
                num_sentences=num_sentences,
                use_chunking=False  # Chunking is handled here
            )
            if summary:
                summaries.append(summary)
            else:
                print(f"Failed to summarize chunk {i+1}")

        # Combine summaries
        final_summary = " ".join(summaries)
        if not final_summary.strip():
            return "Error: No valid summaries generated"

        return {
            'summary': final_summary,
            'language': 'hi',
            'num_chunks': len(chunks),
            'method': method
        }

    except Exception as e:
        print(f"Processing error: {str(e)}")
        return f"Error: {str(e)}"

if __name__ == "__main__":
    # Example usage
    sample_text = """शाम के समय, आकाश में बादलों का खेल चल रहा था। सूरज की रोशनी धीरे-धीरे घने बादलों के बीच गायब हो रही थी। चंदना अपने घर के पिछवाड़े में अकेली बैठी थी, बारिश को देख रही थी और पुरानी यादों को ताजा कर रही थी। उसका जीवन चुनौतियों, दर्द और अपेक्षाओं से भरा था।"""
    result = process_text(sample_text, method='bart', num_sentences=3)
    print(result)