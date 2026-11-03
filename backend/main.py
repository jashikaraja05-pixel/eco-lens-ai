"""EcoLens AI — Python FastAPI classification service.

POST /classify (multipart "file") -> {item, category, confidence, reasoning, steps, bin}
Uses a real vision model through any OpenAI-compatible Chat Completions API
(Lovable AI Gateway by default). No predictions are fabricated: on failure the
endpoint returns an HTTP error.
"""
import base64
import json
import os
import re

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

AI_BASE_URL = os.getenv("AI_BASE_URL", "https://ai.gateway.lovable.dev/v1").rstrip("/")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "google/gemini-3-flash-preview")
MAX_BYTES = 6 * 1024 * 1024
ALLOWED = {"image/jpeg", "image/png", "image/webp"}
CATEGORIES = ["organic", "recyclable", "hazardous", "ewaste", "residual", "uncertain"]
UNCERTAIN_THRESHOLD = 55
BINS = {
    "organic": "Green Bin (Organic / Wet Waste)",
    "recyclable": "Blue Bin (Dry Recyclable Waste)",
    "hazardous": "Red Bin (Hazardous Waste Depot)",
    "ewaste": "Red Bin (Special E-Waste Bin)",
    "residual": "Black Bin (Residual Non-Recyclable Waste)",
    "uncertain": "No bin — rescan or check local rules",
}
PROMPT = (
    "You are a waste segregation expert. Classify the single main waste item in the image into one of: "
    "organic, recyclable, hazardous, ewaste, residual, or uncertain (blurry, no waste item, mixed items). "
    "confidence = your honest probability 0-100. Reply with ONLY JSON: "
    '{"item": str, "category": str, "confidence": number, "reasoning": str, "steps": [str, ...3-5]}'
)

app = FastAPI(title="EcoLens AI Classifier", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","), allow_methods=["POST", "GET"], allow_headers=["*"])


def sniff(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


@app.get("/health")
def health():
    return {"status": "ok", "model": AI_MODEL, "configured": bool(AI_API_KEY)}


@app.post("/classify")
async def classify(file: UploadFile = File(...)):
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image too large (max 6 MB).")
    mime = sniff(data)
    if not data or mime not in ALLOWED:
        raise HTTPException(415, "Upload a JPEG, PNG or WebP image.")
    if not AI_API_KEY:
        raise HTTPException(503, "AI_API_KEY is not configured on the classifier service.")

    url = f"data:{mime};base64,{base64.b64encode(data).decode()}"
    body = {
        "model": AI_MODEL,
        "messages": [
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": [{"type": "text", "text": "Classify this waste item."}, {"type": "image_url", "image_url": {"url": url}}]},
        ],
    }
    headers = {"Authorization": f"Bearer {AI_API_KEY}", "Lovable-API-Key": AI_API_KEY, "X-Lovable-AIG-SDK": "fetch"}
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(f"{AI_BASE_URL}/chat/completions", json=body, headers=headers)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Vision API unreachable: {type(e).__name__}")
    if r.status_code in (402, 429):
        raise HTTPException(r.status_code, "AI usage limit reached. Try again later.")
    if r.status_code >= 400:
        raise HTTPException(502, f"Vision API error ({r.status_code}).")

    text = r.json()["choices"][0]["message"]["content"] or ""
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise HTTPException(502, "Model did not return a classification.")
    try:
        p = json.loads(m.group(0))
        category = str(p["category"]).lower()
        confidence = max(0, min(100, round(float(p["confidence"]))))
        item, reasoning = str(p["item"])[:150], str(p["reasoning"])[:1500]
        steps = [str(s)[:500] for s in p.get("steps", [])][:6]
    except (KeyError, ValueError, TypeError):
        raise HTTPException(502, "Model returned malformed output.")
    if category not in CATEGORIES:
        raise HTTPException(502, "Model returned an unknown category.")
    if confidence < UNCERTAIN_THRESHOLD:
        category = "uncertain"
    return {"item": item, "category": category, "confidence": confidence, "reasoning": reasoning, "steps": steps or ["Follow local municipal guidance."], "bin": BINS[category]}
