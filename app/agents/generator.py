import os
from dotenv import load_dotenv
from google import genai
from openai import AsyncOpenAI 
from app.core.config import settings


# Load environment variables from your .env file
load_dotenv()

# Initialize the modern Gemini client explicitly with the API key from your environment
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

async def generate_sample_jd(role: str, experience: str) -> str:
    """
    Generates a realistic mock job description using the modern google-genai SDK.
    Falls back to Grok (xAI) automatically if Gemini hits a rate limit.
    """
    prompt = f"""
    Write a realistic, standard Job Description for a {experience} {role}. 
    
    Requirements:
    1. Keep it under 250 words.
    2. Do NOT use markdown formatting (no bolding, no asterisks). Just use standard paragraphs and newlines.
    3. Include a brief summary of the role, 3-4 key responsibilities, and 3-4 core requirements/skills.
    4. Ensure the requirements match the {experience} level.
    """

    # --- PRIMARY ENGINE: GEMINI (Modern SDK) ---
    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL, 
            contents=prompt
        )
        return response.text.strip()
        
    except Exception as e:
        err_str = str(e).lower()
        # Trigger fallback on rate limits or service overloads
        if "429" in err_str or "quota" in err_str or "exhausted" in err_str or "503" in err_str or "overloaded" in err_str:
            print(f"⚠️ Gemini is rate-limited or busy. Falling back to Grok for JD Generation...")
            return await _fallback_to_grok(prompt)
            
        raise e

async def _fallback_to_grok(prompt: str) -> str:
    """
    Fallback engine that calls xAI's Grok model using the OpenAI SDK.
    """
    grok_key = os.getenv("GROK_API_KEY")
    if not grok_key or grok_key.startswith("xai-your-grok"):
        raise Exception("Gemini rate-limited, and Grok API key is not configured in .env")

    openai_client = AsyncOpenAI(
        api_key=grok_key,
        base_url="https://api.x.ai/v1",
    )

    try:
        response = await openai_client.chat.completions.create(
            model="grok-2-latest",
            messages=[
                {"role": "system", "content": "You are an expert HR recruiter."},
                {"role": "user", "content": prompt},
            ],
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"🚨 Grok Fallback also failed: {str(e)}")
        raise Exception(f"Both AI models failed to generate a response. {str(e)}")