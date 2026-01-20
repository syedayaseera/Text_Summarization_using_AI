import torch
from transformers import AutoTokenizer, pipeline
import nltk
nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)

class EnglishTextProcessor:
    def __init__(self):
        self.tokenizer = AutoTokenizer.from_pretrained("facebook/bart-large-cnn")
        self.summarizer = pipeline(
            "summarization", 
            model="facebook/bart-large-cnn",
            device=0 if torch.cuda.is_available() else -1
        )
        
    def _split_sentences(self, text):
        """Split English text into sentences"""
        return nltk.sent_tokenize(text)
    
    def process_text(self, text, max_tokens=1000):
        """
        Process English text:
        - Returns summary if < max_tokens
        - Otherwise chunks and summarizes separately
        """
        if not text or not isinstance(text, str):
            return "Error: Invalid input text"
            
        # Check token count
        tokens = len(self.tokenizer.encode(text, add_special_tokens=False))
        if tokens <= max_tokens:
            # Process small text directly
            try:
                summary = self.summarizer(
                    text,
                    max_length=300,
                    min_length=100,
                    do_sample=False
                )[0]['summary_text']
                return summary
            except Exception as e:
                return f"Summarization error: {str(e)}"
            
        # Split into sentences for chunking
        sentences = self._split_sentences(text)
        chunks = []
        current_chunk = []
        current_tokens = 0
        
        for sent in sentences:
            sent_tokens = len(self.tokenizer.encode(sent, add_special_tokens=False))
            if current_tokens + sent_tokens > max_tokens:
                if current_chunk:
                    chunks.append(" ".join(current_chunk))
                    current_chunk = []
                    current_tokens = 0
                # Add sentence even if it exceeds max_tokens
                chunks.append(sent)
            else:
                current_chunk.append(sent)
                current_tokens += sent_tokens
        
        if current_chunk:
            chunks.append(" ".join(current_chunk))
            
        # Summarize each chunk
        summaries = []
        for chunk in chunks:
            try:
                summary = self.summarizer(
                    chunk,
                    max_length=150,
                    min_length=50,
                    do_sample=False
                )[0]['summary_text']
                summaries.append(summary)
            except Exception as e:
                print(f"Chunk summarization error: {str(e)}")
                continue
                
        return " ".join(summaries) if summaries else "Error: No summaries generated"