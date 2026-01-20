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
        - Summarize sentence by sentence and append summaries in an array.
        """
        if not text or not isinstance(text, str):
            return "Error: Invalid input text"
            
        # Split into sentences
        sentences = self._split_sentences(text)
        
        # List to store summarized sentences
        summarized_sentences = []
        
        for idx, sentence in enumerate(sentences):
            sentence_tokens = len(self.tokenizer.encode(sentence, add_special_tokens=False))
            
            if sentence_tokens > max_tokens:
                print(f"Skipping sentence {idx+1}: Too long ({sentence_tokens} tokens).")
                continue  # Skip sentences that are too long
            
            try:
                # Summarize each sentence
                summary = self.summarizer(
                    sentence,
                    max_length=80,  # Adjust for sentence-level
                    min_length=20,
                    do_sample=False
                )[0]['summary_text']
                
                # Append the summarized sentence
                summarized_sentences.append(summary)
            except Exception as e:
                print(f"Error summarizing sentence {idx+1}: {str(e)}")
                continue
        
        # Join the summarized sentences into a final summary
        final_summary = " ".join(summarized_sentences)
        
        if final_summary:
            return final_summary
        else:
            return "Error: No summaries generated."
