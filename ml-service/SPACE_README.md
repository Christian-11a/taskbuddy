---
title: TaskBuddy ML Service
emoji: 🔧
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
short_description: Scores job-provider pairs for the TaskBuddy recommendation engine
---

<!--
  Copy this file into the Space repo as README.md — Hugging Face reads the YAML
  front matter above to configure the Space, and a Space without it will not
  build. `app_port` must match the port the Dockerfile's CMD binds.

  Keep ml-service/README.md as the real project documentation; this one exists
  only because the Space root needs a file with that metadata block.
-->

# TaskBuddy ML Service

FastAPI service wrapping the `rf-a-v1` Random Forest pipeline (~0.82 accuracy /
~0.88 ROC-AUC on a group-aware holdout). Called by the TaskBuddy backend, which
posts 14 raw features per job–provider pair; all preprocessing happens inside
the persisted sklearn pipeline.

- `GET /` — status page (model version, training rows, holdout metrics, uptime)
- `GET /health` — JSON health; `model_loaded: false` means the artifact is missing
- `POST /score` — `{"records": [...]}` → `{"model_version": "...", "scores": [...]}`

Returns **503** from `/score` when the artifact has not loaded, rather than
scoring with a fallback — the backend leaves the job in `recommending` and can
re-trigger manually.

This Space sleeps after a period of inactivity; the first request after that
pays a cold start while the container and model reload.
