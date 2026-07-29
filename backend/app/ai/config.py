import os


def get_config() -> dict[str, str]:
    return {
        "api_key": str(os.environ.get("GROQ_API_KEY") or "").strip(),
        "model": str(os.environ.get("GROQ_MODEL") or "llama-3.3-70b-versatile"),
    }
