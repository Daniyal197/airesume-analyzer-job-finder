from google import genai

from gemini_client import call_gemini_json, AIAnalysisError  # noqa: F401 — re-exported

MATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "match_score": {"type": "integer"},
        "match_reasoning": {"type": "string"},
        "matched_skills": {"type": "array", "items": {"type": "string"}},
        "missing_skills": {"type": "array", "items": {"type": "string"}},
        "missing_keywords": {"type": "array", "items": {"type": "string"}},
        "tailoring_suggestions": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "match_score",
        "match_reasoning",
        "matched_skills",
        "missing_skills",
        "missing_keywords",
        "tailoring_suggestions",
    ],
}

PROMPT_TEMPLATE = """You are an expert technical recruiter comparing a candidate's resume against a specific job description.

Analyze the fit between the resume and the job description below, and return:

- match_score: an integer 0-100 estimating overall fit for this specific role
- match_reasoning: 1-2 sentences explaining the match_score
- matched_skills: skills/requirements from the job description that ARE present in the resume
- missing_skills: skills/requirements from the job description that are NOT present in the resume
- missing_keywords: important keywords/phrases from the job description that are absent from the resume (useful for ATS keyword matching, not just skills)
- tailoring_suggestions: 2-5 specific, actionable edits the candidate could make to the resume to better match THIS job

Resume text:
---
{resume_text}
---

Job description:
---
{job_description}
---
"""


def match_resume_to_job(
    resume_text: str,
    job_description: str,
    client: genai.Client | None = None,
) -> dict:
    prompt = PROMPT_TEMPLATE.format(
        resume_text=resume_text,
        job_description=job_description,
    )
    return call_gemini_json(prompt, MATCH_SCHEMA, client=client, log_prefix="job_matcher")