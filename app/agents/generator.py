import os

from google import genai
from groq import AsyncGroq
from pydantic import BaseModel

from app.core.config import settings


class JDResponse(BaseModel):
    jd_text: str


def _fallback_jd(role: str, experience: str) -> str:
    return (
        f"**Role:** {experience} {role}\n\n"
        "**Overview:**\n"
        "We are looking for a skilled professional to join our dynamic team.\n\n"
        "**Key Responsibilities:**\n"
        "- Design and build scalable solutions.\n"
        "- Maintain code quality.\n\n"
        "**Qualifications:**\n"
        "- Proven experience in a similar role.\n"
        "- Strong problem-solving skills."
    )


async def generate_sample_jd(role: str, experience: str) -> str:
    prompt = (
        f"Generate a professional, realistic 300-word job description for a "
        f"{experience}-level {role}. Include a brief company overview, "
        f"key responsibilities, and required qualifications. Return ONLY the raw text."
    )

    try:
        print("🧠 [Generator] Requesting JD from Gemini...")
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        gemini_model = getattr(
            settings,
            "GEMINI_MODEL",
            "gemini-3.5-flash-lite",
        )

        response = client.models.generate_content(
            model=gemini_model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": JDResponse,
            },
        )
        parsed = getattr(response, "parsed", None)
        if parsed is None or not parsed.jd_text.strip():
            raise RuntimeError("Gemini returned no parsed job description")
        return parsed.jd_text.strip()

    except Exception as gemini_err:
        print(
            f"⚠️ [Generator] Gemini failed: {gemini_err}. "
            "Falling back to Groq..."
        )
        try:
            groq_client = AsyncGroq(
                api_key=os.environ.get("GROQ_API_KEY") or settings.GROQ_API_KEY
            )
            groq_model = os.environ.get(
                "GROQ_MODEL",
                settings.GROQ_MODEL,
            )

            chat_completion = await groq_client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a professional HR assistant. "
                            "Return ONLY the raw text of the job description."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                model=groq_model,
                temperature=0.7,
            )
            content = chat_completion.choices[0].message.content
            if not content:
                raise RuntimeError("Groq returned an empty response")
            return content.strip()

        except Exception as groq_err:
            print(f"🚨 [Generator] Groq fallback failed: {groq_err}")
            return _fallback_jd(role, experience)
