# Mantis

Your AI Resume Agent

## Description
Mantis is a production-grade resume workspace scaffold with a React frontend and FastAPI backend. This initialization includes a dashboard, a playground layout, persistent sidebar navigation, local resume storage, and a dark UI foundation with neon green accents.

AI logic and ATS logic are intentionally not implemented yet.

## Tech Stack
- Frontend: React, React Router, Vite
- Backend: FastAPI, Uvicorn
- Persistence: browser localStorage for local resume drafts
- Styling: custom CSS with class-based theme switching

## Project Structure
```text
backend/
  main.py
  requirements.txt
  routes/
  services/
  models/
  utils/
frontend/
  index.html
  package.json
  src/
```

## Run Instructions

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend health check:
```bash
curl http://127.0.0.1:8000/api/health
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open the Vite local URL shown in the terminal to access the dashboard and playground.

Set `VITE_API_URL` in `frontend/.env` when the API is hosted on a different origin.

## Current Features
- Dashboard route at `/`
- Playground route at `/playground/:id`
- Persistent sidebar navigation
- Resume cards backed by localStorage
- Theme toggle persisted in localStorage
- Placeholder workspace panels for canvas, chat, and ATS review
# Mantis
