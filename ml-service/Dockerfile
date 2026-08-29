# TaskBuddy ML service — Hugging Face Spaces (Docker SDK)
#
# Spaces builds this from the root of the Space repo, which holds a copy of
# this folder — so `app/` and `model/` sit next to this file. See
# SPACE_README.md for the front matter the Space needs and the deploy steps.
#
# Python 3.14 on purpose. model/rf-a-v1.meta.json records the artifact as
# trained under Python 3.14.5 / scikit-learn 1.8.0 / pandas 3.0.3, and
# requirements.txt pins sklearn exactly for the reason stated there: a joblib
# pipeline is only guaranteed to load under the version that wrote it. Bumping
# this line without retraining is how /health starts reporting degraded.
FROM python:3.14-slim

# Spaces runs containers as UID 1000. Creating that user explicitly — rather
# than leaving the image as root — keeps $HOME writable, which is where pip and
# joblib expect to put their caches.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR $HOME/app

# Requirements first, so the ~300 MB scientific stack is cached and only
# reinstalled when requirements.txt itself changes.
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# app/ and model/ only. .dockerignore keeps the 40k-row training CSV and the
# local .venv out; neither is needed to serve, and the CSV is not in git anyway.
COPY --chown=user app/ app/
COPY --chown=user model/ model/

# main.py derives MODEL_PATH from its own location — app/main.py's parent's
# parent — so the artifact resolves to $HOME/app/model/rf-a-v1.joblib with no
# env var needed. Set MODEL_PATH only if the filename changes (rf-a-v2, ...).

# The free CPU tier is 2 vCPU. Letting BLAS spin up a thread per core it thinks
# it sees oversubscribes a small container and makes scoring slower, not faster.
ENV OMP_NUM_THREADS=2 \
    OPENBLAS_NUM_THREADS=2

# 7860 is the Spaces default and must match `app_port` in the Space's README
# front matter. main.py already reads PORT, so this stays a single source.
ENV PORT=7860
EXPOSE 7860

# Shell form so $PORT expands. One worker: the RandomForest pipeline is held in
# process memory by the lifespan hook, and a second worker would load a second
# copy for no throughput gain at this request volume.
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
