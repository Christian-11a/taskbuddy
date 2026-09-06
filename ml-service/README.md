# TaskBuddy ML Service

FastAPI service that scores job–provider pairs for the recommendation engine
using the trained **Random Forest** pipeline (`rf-a-v1`) — the winner of the
model comparison experiment (~0.81 accuracy / ~0.88 ROC-AUC over 100
group-aware splits).

The backend calls `POST /score` with 14 raw features per pair; all
preprocessing (ordinal encoding, TF-IDF → SVD for the two Taglish text
features) happens **inside the persisted sklearn pipeline**, so this service
receives raw values and returns hire probabilities.

> **🚀 Deployed instance:** live at **https://taskbuddy-ml-service-8ppc.onrender.com**
> — status page: <https://taskbuddy-ml-service-8ppc.onrender.com/> · JSON health:
> <https://taskbuddy-ml-service-8ppc.onrender.com/health>. The deployed backend's
> `ML_SERVICE_URL` points here. (Free tier: first request after idle takes
> ~30–60 s while the instance wakes.)

## Setup & run

Use the project-local virtual environment — it pins one interpreter so bare
`pip`/`uvicorn` always hit the right Python (machines with multiple Pythons
otherwise install packages into the wrong one). `.venv/` is gitignored.

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate                # Windows (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
python train_model.py                 # produces model/rf-a-v1.joblib (~2 MB)
uvicorn app.main:app --port 8000
```

Training expects `taskbuddy_synthetic_dataset.csv` in this folder (40k rows;
**not** committed to git — get it from the team drive / TaskBuddy ML repo).
The model artifact `model/rf-a-v1.joblib` **is** committed, so serving and
deploys work without the dataset.

## Training (`train_model.py`)

1. Validates the dataset has the 14 feature columns + `is_recommended` + `job_id`.
2. Runs a **group-aware holdout sanity check** (split by `job_id` so candidates
   of one job never straddle train/test) and warns if metrics fall notably
   below the experiment baseline.
3. Refits the pipeline on **all rows** (evaluation is settled; production
   scoring benefits from every labeled example) and saves:
   - `model/rf-a-v1.joblib` — the full preprocessing+RF pipeline
   - `model/rf-a-v1.meta.json` — version, date, metrics, hyperparams, library versions

Pipeline: `ColumnTransformer` (passthrough numerics, `OrdinalEncoder`
categoricals, per-text `TfidfVectorizer(sublinear_tf=True)` →
`TruncatedSVD(20)`) → `RandomForestClassifier(n_estimators=50, max_depth=10,
max_features='sqrt', min_samples_split=5, class_weight='balanced')`.

**scikit-learn is pinned exactly** in `requirements.txt` — joblib artifacts
are only guaranteed to load under the sklearn version that trained them.
If you bump sklearn, retrain and recommit the artifact in the same change.

## API

### `GET /` — status page

Minimalist browser status page (same style as the backend's): service state,
model version, training rows, holdout metrics, uptime.

### `GET /health`

```json
{ "status": "ok", "model_loaded": true, "model_version": "rf-a-v1", "trained_at": "..." }
```

If the artifact is missing, `status` is `degraded`, `model_loaded` is `false`,
and `/score` returns **503** (fail fast — no silent fallback scoring; the
backend leaves the job in `recommending` and can re-trigger manually).

### `POST /score`

Request — one record per pair, **exactly** these 14 fields (names match the
training columns; the backend builds them via `fn_job_provider_features`):

```json
{
  "records": [
    {
      "skills_match": 1, "distance_km": 3.42, "provider_avg_rating": 4.5,
      "provider_completed_jobs": 12, "provider_availability": 1,
      "job_idle_duration_hrs": 0.17, "provider_response_time_hrs": 1.25,
      "provider_years_experience": 4.0, "hour_posted": 14,
      "provider_skill_category": "Plumbing", "day_of_week": "Monday",
      "job_urgency": "urgent",
      "job_description": "Tumutulo yung gripo sa kusina...",
      "provider_bio": "Licensed plumber po ako, 4 years na..."
    }
  ]
}
```

Response (scores in request order, ~200 ms typical):

```json
{ "model_version": "rf-a-v1", "scores": [0.81909] }
```

## Retraining & versioning

- When enough real labeled rows accumulate (schema §13 export from
  `recommendation_candidates`), retrain on them — **exclude runs with
  `model_version` = `'stub-v0'`** and keep the group-aware split by `job_id`.
- Bump the version (`rf-a-v2`, ...): change `MODEL_VERSION` in
  `train_model.py`, retrain, commit the new artifact, and set the `MODEL_PATH`
  env var if the filename changes. `recommendation_runs.model_version` records
  which model produced every run, so results remain traceable.

## Deploy (Render)

Second free web service on the same repo as the backend:

- **Root Directory:** `ml-service`
- **Build:** `pip install -r requirements.txt`
- **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

The committed artifact deploys with the repo — no training on Render. Then set
`ML_SERVICE_URL` to this service's URL in the backend's Render environment;
the backend status page's ML dot turns green once connected. (Free-tier note:
let this service spin down when idle — keep-alive only the backend, or two
always-on free services will exhaust Render's 750 monthly instance hours.)
