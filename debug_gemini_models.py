import traceback


def main() -> int:
    try:
        from app.core.config import settings
        from google import genai

        api_key = settings.GEMINI_API_KEY or ""
        if not api_key:
            print("GEMINI_API_KEY is empty.")
            return 1

        print(f"Using key length: {len(api_key)}")
        client = genai.Client(api_key=api_key)

        print("Listing models...")
        models_iter = client.models.list()

        count = 0
        for model in models_iter:
            name = getattr(model, "name", "<no-name>")
            display_name = getattr(model, "display_name", "")
            print(f"- {name} | {display_name}")
            count += 1
            if count >= 20:
                print("...truncated after 20 models")
                break

        print(f"Model listing succeeded. Printed {count} model(s).")
        return 0
    except Exception:
        print("Gemini SDK validation failed with exception:")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
