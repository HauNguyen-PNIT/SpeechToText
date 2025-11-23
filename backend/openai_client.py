from openai import OpenAI
import os

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY not set")

def get_client():
    return OpenAI(api_key=OPENAI_API_KEY)  # Uses OPENAI_API_KEY env