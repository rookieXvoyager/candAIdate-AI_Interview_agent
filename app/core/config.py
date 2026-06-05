from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    """
    Application configuration loaded automatically from the .env file.
    """
    # Required keys (App will throw an error on startup if this is missing from .env)
    GEMINI_API_KEY: str 
    
    # Optional keys (Set to None by default so the app doesn't crash if we haven't configured them yet)
    GROQ_API_KEY: Optional[str] = None
    AZURE_SPEECH_KEY: Optional[str] = None
    AZURE_SPEECH_REGION: Optional[str] = None
    AZURE_SEARCH_ENDPOINT: Optional[str] = None
    AZURE_SEARCH_KEY: Optional[str] = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# This automatically loads everything when imported!
settings = Settings()