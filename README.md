# 🤖 Autopilot Social — Backend

AI-driven relationship intelligence pipeline built with FastAPI.

## Stack
- **FastAPI** — REST API
- **VADER** — Sentiment analysis  
- **scikit-learn** — Drift detection
- **Claude API** — Action generation
- **n8n** — Automation (schedules, emails)
- **APScheduler** — In-process scheduling

## Demo Video
👉 [Watch the Autopilot Social Prototype Demo here](https://drive.google.com/drive/folders/1-WFl1Zencjf7AJKikAyz5n1zJK5-1Lf8?usp=sharing)

---

## Quick Start

```bash
# 1. Clone & install
cd autopilot-backend
pip install -r requirements.txt

# 2. Set env vars
cp .env.example .env
# → Add your ANTHROPIC_API_KEY
# → Add your MongoDB Connection String to MONGO_URL
# → Make sure VITE_API_BASE_URL in frontend/.env points to your backend (e.g. http://127.0.0.1:8000)

# 3. Run the backend server
uvicorn app.main:app --reload --port 8000

# 4. Open API docs
open http://localhost:8000/docs

# 5. In a new terminal, run the frontend
cd frontend
npm install
npm run dev

# 6. Open Frontend
open http://localhost:5173
```

---

## First Run (3 API calls)

```bash
# Step 1: Load synthetic demo data
curl -X POST http://localhost:8000/api/ingest/synthetic

# Step 2: Run the full pipeline
curl -X POST http://localhost:8000/api/pipeline/run/sync

# Step 3: Get results
curl http://localhost:8000/api/contacts/summary
curl http://localhost:8000/api/actions/
```

---

## API Reference

### Ingest
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ingest/synthetic` | Load demo data instantly |
| POST | `/api/ingest/whatsapp` | Upload WhatsApp .txt export |
| POST | `/api/ingest/telegram` | Upload Telegram result.json |
| POST | `/api/ingest/csv` | Upload generic CSV log |
| GET  | `/api/ingest/status` | See what's loaded |
| DELETE | `/api/ingest/clear` | Wipe all data |

### Pipeline
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/pipeline/run` | Async pipeline run (recommended) |
| POST | `/api/pipeline/run/sync` | Sync run (blocks, for testing) |
| GET  | `/api/pipeline/status` | Last run status |
| GET  | `/api/pipeline/history` | All run logs |

### Contacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/contacts/` | All contacts (filterable) |
| GET  | `/api/contacts/summary` | Dashboard stats |
| GET  | `/api/contacts/{id}` | Single contact profile |

### Actions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/actions/` | All AI actions |
| PATCH | `/api/actions/{id}/status` | Mark sent/dismissed |
| DELETE | `/api/actions/{id}` | Remove action |

---

## Machine Learning Scoring & Detection

Instead of a basic formula, Autopilot uses trained ML models to track relationship health:
- **Delay Detection:** `IsolationForest` to flag anomalous response delays.
- **Inactivity Scoring:** `RandomForest` & `IsolationForest` combined to score inactivity risks.
- **Missing Mentions:** `XGBoost` for detecting forgotten follow-ups or critical terms.
- **Buried Plans:** `LightGBM` for surfacing buried plans from older messages.

```
Health Score (ML Predicted) =
  Features extracted (Response delay max, activity windows, msg gaps)
  Predicted via Inactivity & Anomaly Models
```

## Tags
| Tag | Condition |
|-----|-----------|
| CLOSE | Score ≥ 80, high frequency |
| ACTIVE | Score ≥ 60, no drift |
| STABLE | Score 40–60 |
| FADING | Drift detected, score < 50 |
| GHOSTED | User sent last msg, >30 days silent |

---

## n8n Setup

1. Install n8n: `npx n8n`
2. Go to `http://localhost:5678`
3. Import `n8n/autopilot_workflow.json`
4. Configure your email credentials in the Email node
5. Activate the workflow

**Webhooks n8n listens on:**
- `POST /webhook/autopilot` — pipeline complete event
- `POST /webhook/reminders` — new critical actions

**Schedule:** Pipeline auto-runs every 6h via n8n trigger

---

## Project Structure

```
autopilot/
├── app/                           # FastAPI backend app
│   ├── main.py
│   ├── api/                       # API Routes (contacts, pipelines, ingest)
│   ├── core/                      # MongoDB configs & schedulers
│   ├── models/                    # Pydantic models
│   ├── parsers/                   # WhatsApp, Telegram, CSV parsers
│   └── services/                  # Action generation & pipeline orchestration
├── frontend/                      # React/Vite Frontend UI
│   └── src/api.js                 # Centralised API handlers
├── model/                         # Machine Learning pipelines & scripts
│   ├── train_buried.py            # LightGBM plan detection
│   ├── train_delay.py             # IsolationForest delay anomaly
│   ├── train_long_inactive.py     # Random forest inactivity
│   ├── train_missing.py           # XGBoost missing mentions
│   └── models/                    # Pre-trained .joblib weights
└── n8n/                           # n8n Automation Workflows
```
