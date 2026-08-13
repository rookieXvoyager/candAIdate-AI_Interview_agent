import sys
import traceback


def main() -> int:
    try:
        from app.core.config import settings

        key = settings.GEMINI_API_KEY or ""
        print(f"GEMINI_API_KEY length: {len(key)}")
        print(f"GEMINI_MODEL: {settings.GEMINI_MODEL}")
        return 0
    except Exception:
        print("Failed to import settings or read GEMINI_API_KEY.")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
