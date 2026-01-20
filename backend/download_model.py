from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
import os

model_name = "google/pegasus-x-large"
model_path = os.path.join(os.path.dirname(__file__), "models", "pegasus-x-large")

# Download model and tokenizer
model = AutoModelForSeq2SeqLM.from_pretrained(model_name, cache_dir=model_path)
tokenizer = AutoTokenizer.from_pretrained(model_name, cache_dir=model_path)

# Save to ensure local availability
model.save_pretrained(model_path)
tokenizer.save_pretrained(model_path)
print(f"Model and tokenizer saved to {model_path}")