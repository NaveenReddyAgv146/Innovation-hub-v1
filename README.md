# POC Upload Platform

Full-stack Proof of Concept (POC) management app with role-based access, image uploads, and admin workflows.

## Stack

- Frontend: React 19, Vite 7, React Router, Zustand, Axios, Tailwind CSS
- Backend: FastAPI, Motor (MongoDB), JWT auth, role-based authorization

## Repository Structure

```text
POC-git/
  client/            # React frontend
  backend-fastapi/   # FastAPI backend
```
## backend
cd "c:\Users\Admin_Agivant\Documents\My Work\POC-Rest\POC_upload\backend-fastapi"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8010

## frontend
cd "c:\Users\Admin_Agivant\Documents\My Work\POC-Rest\POC_upload\client"
npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort

## Features

- JWT auth: register, login, refresh, logout, current-user profile
- Roles: `admin`, `developer`, `viewer`
- POC workflows: create, edit, delete, list, detail, publish, upvote
- User management for admins
- Image upload support via `/uploads`

## Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB (local or hosted)

## Local Development Setup

### 1. Clone and move into the project

```bash
git clone https://github.com/Yash-Anchule/POC_upload.git
cd POC_upload
```

### 2. Backend setup (FastAPI)

```bash
cd backend-fastapi
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Update `backend-fastapi/.env` as needed:

```env
APP_NAME=POC FastAPI Backend
APP_ENV=development
PORT=8000
MONGODB_URI=mongodb://127.0.0.1:27017/poc_showcase
MONGODB_DB_NAME=poc_showcase
CLIENT_URL=http://localhost:5173
JWT_ACCESS_SECRET=replace_with_a_secure_access_secret
JWT_REFRESH_SECRET=replace_with_a_secure_refresh_secret
JWT_ACCESS_EXPIRY_MINUTES=15
JWT_REFRESH_EXPIRY_DAYS=7
```

Run backend:

```bash
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend setup (React)

In a new terminal:

```bash
cd client
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api` + `/uploads` to `http://localhost:8000`.

## API Base

- Base URL: `/api`
- Health check: `GET /api/health`

## Default Admin Seed

```bash
cd backend-fastapi
source .venv/bin/activate
python -m scripts.seed_admin
```

Default credentials:

- Email: `admin@pocshowcase.com`
- Password: `admin123`

## Production Notes

- Set strong JWT secrets
- Restrict `CLIENT_URL` to your frontend domain
- Configure persistent storage for `backend-fastapi/uploads`
- Run FastAPI with a production ASGI setup (for example, `gunicorn` + `uvicorn` workers)

## License

ISC


