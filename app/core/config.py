from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    """
    Application configuration loaded automatically from the .env file.
    """
    # Required keys (App will throw an error on startup if this is missing from .env)
    GEMINI_API_KEY: str

    # Primary model used by all agents.
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"

    # Comma-separated fallback models tried (in order) when the primary is
    # rate-limited (HTTP 429).
    GEMINI_FALLBACK_MODELS: str = "gemini-3.1-flash-lite"

    # Groq fallback configuration.
    GROQ_API_KEY: Optional[str] = None
    GROQ_API_BASE: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "openai/gpt-oss-120b"

    # Optional keys (Set to None by default so the app doesn't crash if we haven't configured them yet)
    AZURE_SPEECH_KEY: Optional[str] = None
    AZURE_SPEECH_REGION: Optional[str] = None
    AZURE_SEARCH_ENDPOINT: Optional[str] = None
    AZURE_SEARCH_KEY: Optional[str] = None

    @property
    def resolved_models(self) -> list[str]:
        """Ordered, de-duplicated list of models to try: primary first."""
        chain = [self.GEMINI_MODEL] + [
            m.strip() for m in self.GEMINI_FALLBACK_MODELS.split(",") if m.strip()
        ]
        seen, out = set(), []
        for m in chain:
            if m not in seen:
                seen.add(m)
                out.append(m)
        return out

    # --- UPDATED PYDANTIC CONFIGURATION ---
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore" # Prevents crashes when frontend variables (VITE_*) are in the .env file
    )

# This automatically loads everything when imported!
settings = Settings()