from pydantic_settings import BaseSettings
from pathlib import Path

# Resolve .env path relative to this file \u2014 works no matter where uvicorn is invoked
_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

class Settings(BaseSettings):
    ANTHROPIC_API_KEY: str = "your-key-here"
    N8N_WEBHOOK_URL: str = "http://localhost:5678/webhook/autopilot"
    N8N_REMINDER_WEBHOOK: str = "http://localhost:5678/webhook/reminders"
    N8N_SEND_MESSAGE_WEBHOOK: str = "http://localhost:5678/webhook/send-message"
    N8N_TEST_WEBHOOK: str = "http://localhost:5678/webhook/test-connection"
    APP_ENV: str = "development"
    MONGO_URL: str = "mongodb://localhost:27017"

    class Config:
        env_file = str(_ENV_PATH)
        extra = "allow"

settings = Settings()
