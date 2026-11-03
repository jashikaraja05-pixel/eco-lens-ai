# EcoLens AI — Smart Waste Segregation System

**Neural Storm 2026 · Green Planet · GP-05: Smart Waste Segregation System**

## Problem
Mixed household waste ruins recycling streams and sends hazardous items (batteries, aerosols, e-waste) to landfill. People often don't know which bin an item belongs in.

## Solution
EcoLens AI lets anyone photograph a waste item (upload or live camera). A vision AI model identifies the item, assigns it to one of five categories, recommends the correct bin, and gives disposal steps. When the model is not confident, the app says **Uncertain** and asks for a rescan instead of guessing. Every scan is stored in the user's private history and feeds a personal dashboard.

| Category | Bin |
|---|---|
| Organic | Green Bin (wet waste) |
| Recyclable | Blue Bin (dry recyclable) |
| Hazardous / E-waste | Red Bin (hazardous / e-waste depot) |
| Residual | Black Bin (non-recyclable) |
| Uncertain | No bin — rescan (confidence < 55 % or unclear image) |

## Features
- Email/password accounts (Lovable Cloud auth, hashed passwords, email confirmation)
- Image upload + live camera capture, client-side resize, server-side type/size/magic-byte validation
- Real vision-model classification with confidence, explanation, bin and disposal steps
- Uncertain-result handling; explicit error state — no result is shown or saved if the AI fails
- History stored per user in a database with row-level security; delete single scan, clear all, delete account, search and filter by category
- Dashboard from stored scans: category counts, category split, average confidence, recent scans
- Learn hub with bin rules

## Architecture
```text
Browser (React, TanStack Start)
   │  upload / camera image (data URL)
   ▼
classifyWaste server function  (auth required, validates image)
   ├─ if PYTHON_CLASSIFIER_URL set ─► Python FastAPI /classify ─► vision model API
   └─ else ─────────────────────────► Lovable AI Gateway (openai/gpt-6-astra vision)
   │  normalizePrediction(): server-owned bin mapping + uncertainty threshold
   ▼
Lovable Cloud Postgres `scans` table (RLS: user can only see own rows)
```

### Frontend (`src/`)
- `src/routes/index.tsx` — UI (auth, scanner, dashboard, history, learn)
- `src/lib/classify.functions.ts` — authenticated server functions (classify + save, delete account)
- `src/lib/scan-schema.ts` — image validation, prediction normalization, bin mapping
- `src/lib/eco-store.ts` — row mapping and dashboard statistics

### Python backend (`backend/`)
- `backend/main.py` — FastAPI service, `POST /classify`, `GET /health`
- `backend/requirements.txt`

It sends the uploaded image to a real vision model over an OpenAI-compatible Chat Completions API (Lovable AI Gateway by default, model `google/gemini-3-flash-preview`), validates the JSON reply, applies the same 55 % uncertainty rule, and returns an HTTP error (never a fake prediction) on any failure.

## Run locally

### Web app
```bash
bun install
bun run dev
```

### Python service
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export AI_API_KEY=...            # Lovable AI Gateway key or any OpenAI-compatible key
uvicorn main:app --port 8000
```
Deploy it to any Python host (Render, Railway, Fly.io…) with start command `uvicorn main:app --host 0.0.0.0 --port $PORT` and `AI_API_KEY` set. The URL must be publicly reachable over HTTPS. Then set the app secret `PYTHON_CLASSIFIER_URL=https://your-service` to route classifications through it. Without that secret the app uses the built-in AI path.

## Environment variables
| Name | Where | Purpose |
|---|---|---|
| `LOVABLE_API_KEY` | app server (managed) | Built-in AI classification |
| `PYTHON_CLASSIFIER_URL` | app server (optional) | Use the FastAPI service instead |
| `AI_API_KEY` | Python service | Vision API key |
| `AI_BASE_URL` | Python service (optional) | Default `https://ai.gateway.lovable.dev/v1` |
| `AI_MODEL` | Python service (optional) | Default `google/gemini-3-flash-preview` |
| `CORS_ORIGINS` | Python service (optional) | Comma-separated origins, default `*` |

## API
`GET /health` → `{"status":"ok","model":"...","configured":true}`

`POST /classify` (multipart, field `file`, JPEG/PNG/WebP ≤ 6 MB) →
```json
{"item":"plastic water bottle","category":"recyclable","confidence":100,
 "reasoning":"...","steps":["..."],"bin":"Blue Bin (Dry Recyclable Waste)"}
```
Both engines return the same fields (`item, category, confidence, reasoning, steps`; the Python service also returns `bin`). The app re-derives `bin` and the uncertain rule itself in `normalizePrediction`, so both paths are stored identically.

Errors: `413` too large, `415` not an image, `503` no key, `502` model error/malformed output, `402/429` usage limits.

## Testing methodology
- **Unit tests** (`bunx vitest run`): bin mapping for all five categories, uncertainty threshold (54 → uncertain, 55 → kept), rejection of malformed model output and non-image uploads, dashboard statistics.
- **Python service** started with uvicorn, called with curl and through the app's `classifyImage` routing code.
- **End-to-end** in a headless browser: sign in → upload → analyze → result shown → reload → dashboard shows the stored scan.

## Measured results (manual spot check, 3 Nov 2026)
One run per image through both engines using the app's real routing code — **not a benchmark**. Test photos were AI-generated. Confidence values are the models' own self-reported numbers.

| Image | Python service | Built-in AI |
|---|---|---|
| Banana peel | organic 100 | organic 100 |
| Plastic water bottle | recyclable 100 | recyclable 99 |
| Single AA battery | hazardous 100 | hazardous 100 |
| Broken smartphone | ewaste 100 | ewaste 100 |
| Chip packet | residual 98 | residual 99 |
| Battery + spray can (two items) | uncertain | hazardous 99 |
| Plain grey image | uncertain | — |
| Text file | rejected (415) | — |

With `PYTHON_CLASSIFIER_URL` pointing to a stopped service, the scan fails with "Python classifier service is unreachable." — there is no silent fallback to the built-in AI.

Browser end-to-end (built-in AI): upload (battery → hazardous), camera capture via a simulated webcam (smartphone → e-waste), history survives reload, single delete, clear all, delete account, wrong-password rejection.
Not verified end-to-end: clicking a real confirmation email; a real physical camera; the app talking to a *deployed* Python service.

## Limitations
- Accuracy depends on the third-party vision model; confidence is the model's self-reported estimate, not calibrated.
- One main item per photo; mixed items are reported as uncertain.
- Bin colours follow common Indian municipal rules; local rules vary.
- Images are stored as compressed data in the database (≤ 768 px).

## Demo
1. Sign up and confirm your email, then log in.
2. Scan Waste → upload or use the camera → Analyze Waste.
3. Open Dashboard and History to see stored results; try a blurry photo to see the Uncertain state.

## AI tools disclosure
- Built with the Lovable AI coding assistant.
- Classification uses third-party vision models through the Lovable AI Gateway. No custom model was trained.
- Test images in the evaluation table were AI-generated.
