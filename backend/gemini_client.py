import json
import os
import time

from google import genai
from google.genai import types

MODEL_NAME = "gemini-3.6-flash"
MAX_RETRIES = 3
BASE_BACKOFF_SECONDS = 2


class AIAnalysisError(Exception):
    """Raised when a Gemini call fails after all retry attempts."""


def get_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise AIAnalysisError(
            "GEMINI_API_KEY is not set. Add it to backend/.env — "
            "get a free key at https://aistudio.google.com/apikey"
        )
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=55_000),  # milliseconds
    )


def call_gemini_json(
    prompt: str,
    schema: dict,
    client: genai.Client | None = None,
    log_prefix: str = "gemini",
) -> dict:
    client = client or get_client()
    last_error: Exception | None = None

    for attempt in range(1, MAX_RETRIES + 1):
        print(f"[{log_prefix}] Calling Gemini ({MODEL_NAME}) — attempt {attempt}/{MAX_RETRIES}...")
        start = time.time()
        try:
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema,
                ),
            )
            elapsed = time.time() - start
            print(f"[{log_prefix}] Got a response in {elapsed:.1f}s, parsing JSON...")
            return json.loads(response.text)

        except Exception as e: 
            elapsed = time.time() - start
            print(f"[{log_prefix}] Attempt {attempt} failed after {elapsed:.1f}s: {e}")
            last_error = e
            if attempt < MAX_RETRIES:
                wait = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
                print(f"[{log_prefix}] Retrying in {wait}s...")
                time.sleep(wait)

    raise AIAnalysisError(f"AI call failed after {MAX_RETRIES} attempts: {last_error}")