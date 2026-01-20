import nltk
from transformers import AutoTokenizer
from deep_translator import GoogleTranslator
from english_chunker import EnglishTextProcessor
from indicnlp.tokenize.sentence_tokenize import sentence_split
from langdetect import detect
nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)

class KannadaProcessor:
    def __init__(self):
        self.tokenizer = AutoTokenizer.from_pretrained("xlm-roberta-base")
        self.english_processor = EnglishTextProcessor()

    def translate_kannada_to_english(self, text, chunk_size=550):
        """
        Translates Kannada text to English, handling text that exceeds the maximum
        token length by dividing it into chunks.

        Args:
            text (str): The Kannada text to translate.
            chunk_size (int, optional): The maximum number of tokens per chunk.
                Defaults to 1024.

        Returns:
            str: The translated English text, or an error message if translation fails.
        """
        if not text or not isinstance(text, str) or not text.strip():
            return "Error: Invalid input text. Please provide a string."

        translator = GoogleTranslator(source='kn', target='en')

        try:
            # Check the length of the input text in terms of tokens
            input_tokens = len(self.tokenizer.encode(text, add_special_tokens=False))
            print(f"Kannada input tokens: {input_tokens}")

            if input_tokens <= chunk_size:
                # If the text is short enough, translate it directly
                print("Translating Kannada to English (single pass)")
                translated_text = translator.translate(text)
                if not translated_text or len(translated_text.strip()) < 10:
                    print("Warning: Translated text is too short or empty")
                    return "Error: Translation produced insufficient text."
                return translated_text
            else:
                # If the text is too long, split it into sentences and translate each sentence
                print("Input exceeds 550 tokens, chunking enabled")
                sentences = sentence_split(text,lang='kn')
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
            print(f"Kannada translation error: {str(e)}")
            return f"Error: Translation failed with exception: {str(e)}"

    def process(self, text):
        """Process Kannada text: translate to English, print translation, and summarize."""
        if not text or not isinstance(text, str) or not text.strip():
            return "Error: Invalid input text"

        try:
            # Verify language
            lang = detect(text) if text.strip() else 'kn'
            if lang != 'kn':
                return "Error: Input must be in Kannada"

            # Translate to English
            translated_text = self.translate_kannada_to_english(text)
            if translated_text.startswith("Error"):
                return translated_text

            # Print translated text to terminal
            print("Translated English text:")
            print(translated_text)
            print("-" * 50)  # Separator for clarity

            # Preprocess translated text to ensure compatibility with EnglishTextProcessor
            translated_text = translated_text.strip()
            if len(translated_text) < 20:
                print("Warning: Translated text is too short, appending fallback content")
                translated_text += " This is a summary of the provided Kannada text."

            # Pass to EnglishTextProcessor
            print("Passing translated text to EnglishTextProcessor")
            summary = self.english_processor.process_text(translated_text, max_tokens=1000)
            print("result from english processor:", summary)
            
            # Check if summary is valid
            if not summary or len(summary.strip()) < 10:
                print("Warning: Summary is too short, returning translated text as fallback")
                return translated_text  # Fallback to translated text to avoid error
            print("returned summary:", summary)
            return summary

        except Exception as e:
            print(f"Kannada processing error: {str(e)}")
            return f"Error: {str(e)}"