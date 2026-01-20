import nltk
from transformers import AutoTokenizer
from deep_translator import GoogleTranslator, MyMemoryTranslator  # Import MyMemoryTranslator
from english_chunker import EnglishTextProcessor
from indicnlp.tokenize.sentence_tokenize import sentence_split
from langdetect import detect
nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)

class HindiProcessor:
    def __init__(self):
        self.tokenizer = AutoTokenizer.from_pretrained("xlm-roberta-base")
        self.english_processor = EnglishTextProcessor()

    def translate_hindi_to_english(self, text, chunk_size=550):
        """
        Translates Hindi text to English, handling text that exceeds the maximum
        token length by dividing it into chunks.

        Args:
            text (str): The Hindi text to translate.
            chunk_size (int, optional): The maximum number of tokens per chunk.
                Defaults to 1024.

        Returns:
            str: The translated English text, or an error message if translation fails.
        """
        if not text or not isinstance(text, str) or not text.strip():
            return "Error: Invalid input text. Please provide a string."

        translator = GoogleTranslator(source='hi', target='en')
        # translator = MyMemoryTranslator(source='hi', target='en') # Try this

        try:
            # Check the length of the input text in terms of tokens
            input_tokens = len(self.tokenizer.encode(text, add_special_tokens=False))
            print(f"Hindi input tokens: {input_tokens}")

            if input_tokens <= chunk_size:
                # If the text is short enough, translate it directly
                print("Translating Hindi to English (single pass)")
                translated_text = translator.translate(text)
                print(f"Translated text: {translated_text}") # Debug: Print output
                if not translated_text or not translated_text.strip() or len(translated_text.strip()) < 10:
                    print("Warning: Translated text is too short or empty")
                    return "Error: Translation produced insufficient text."
                return translated_text
            else:
                # If the text is too long, split it into sentences and translate each sentence
                print("Input exceeds 500 tokens, chunking enabled")
                sentences = sentence_split(text,lang='hi')
                translated_sentences = []
                for i, sentence in enumerate(sentences):
                    print(f"Translating sentence {i+1}/{len(sentences)}")
                    translated_sentence = translator.translate(sentence)
                    if translated_sentence and len(translated_sentence.strip()) >= 5:
                        translated_sentences.append(translated_sentence)
                    else:
                        print(f"Warning: Translation failed or too short for sentence: {sentence}")
                translated_text = " ".join(translated_sentences)
                if not translated_text or len(translated_text.strip()) < 20:
                    print("Warning: Combined translated text is too short or empty")
                    return "Error: Translation produced insufficient text."
                return translated_text

        except Exception as e:
            print(f"Hindi translation error: {str(e)}")
            return f"Error: Translation failed with exception: {str(e)}"

    def process(self, text):
        """Process Hindi text: translate to English, print translation, and summarize."""
        if not text or not isinstance(text, str) or not text.strip():
            return "Error: Invalid input text"

        try:
            # Verify language
            lang = detect(text) if text.strip() else 'hi'
            if lang != 'hi':
                return "Error: Input must be in Hindi"

            # Translate to English
            translated_text = self.translate_hindi_to_english(text)
            if translated_text.startswith("Error"):
                return translated_text

            # Print translated text to terminal
            print("Translated English text:")
            print(translated_text)
            print("-" * 50)  # Separator for clarity

            # Preprocess translated text to ensure compatibility with EnglishTextProcessor
            # translated_text = translated_text.strip()
            if len(translated_text) < 20:
                print("Warning: Translated text is too short, appending fallback content")
                translated_text += " This is a summary of the provided Hindi text."

            # Pass to EnglishTextProcessor
            print("Passing translated text to EnglishTextProcessor")
            summary = self.english_processor.process_text(translated_text, max_tokens=1000)
            print("Result from English processor:", summary)

            # Check if summary is valid
            if not summary or len(summary.strip()) < 10:
                print("Warning: Summary is too short, returning translated text as fallback")
                return translated_text  # Fallback to translated text to avoid error
            print("Returned summary:", summary)
            return summary

        except Exception as e:
            print(f"Hindi processing error: {str(e)}")
            return f"Error: {str(e)}"
