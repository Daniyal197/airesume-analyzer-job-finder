from google import genai

from gemini_client import call_gemini_json, AIAnalysisError 

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "technical_skills": {"type": "array", "items": {"type": "string"}},
        "soft_skills": {"type": "array", "items": {"type": "string"}},
        "experience_summary": {"type": "string"},
        "ats_score": {"type": "integer"},
        "ats_reasoning": {"type": "string"},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "improvement_suggestions": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "technical_skills",
        "soft_skills",
        "experience_summary",
        "ats_score",
        "ats_reasoning",
        "strengths",
        "improvement_suggestions",
    ],
}

PROMPT_TEMPLATE = """You are an expert technical recruiter and ATS (Applicant Tracking System) specialist.

Analyze the following resume text and return your analysis.

- technical_skills: concrete technical skills/tools/languages found in the resume
- soft_skills: soft skills found or clearly implied
- experience_summary: a neutral 2-3 sentence summary of the candidate's background
- ats_score: an integer 0-100 estimating how well this resume would parse and rank in a typical ATS (formatting clarity, keyword density, structure)
- ats_reasoning: 1-2 sentences explaining the ats_score
- strengths: 2-4 specific strengths of this resume
- improvement_suggestions: 2-5 specific, actionable suggestions to improve the resume

Resume text:
---
{resume_text}
---
"""


def analyze_resume(resume_text: str, client: genai.Client | None = None) -> dict:
    """Send resume text to Gemini and get back a structured analysis dict."""
    prompt = PROMPT_TEMPLATE.format(resume_text=resume_text)
    return call_gemini_json(prompt, ANALYSIS_SCHEMA, client=client, log_prefix="ai_analyzer")