# Innovation Garage v1

Innovation Hub is a full-stack platform for collecting, reviewing, publishing, and tracking internal POC ideas with role-based access control.

## What This App Supports

- JWT authentication (`register`, `login`, `refresh`, `logout`, `me`)
- Role-based flows for `admin`, and `viewer`
- POC CRUD with status (`draft` / `published`)
- Admin-only publish workflow through Idea Reviews
- Interest voting on published ideas (non-admin, non-owner)
- User management (admin only)
- Image upload for POC thumbnails (`/uploads`)
- Dark mode with persisted preference
- Publish success notification in Idea Reviews
- Delete confirmation modal for POC deletion

## Tech Stack

- Frontend: React 19, Vite 7, React Router, Axios, Tailwind CSS v4
- Backend: FastAPI, MongoDB, python, passlib/bcrypt
- Database: MongoDB

## Project Structure

```text
POC_upload/
  client/            # Frontend (React + Vite)
  backend-fastapi/   # Backend (FastAPI)
```

## Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB (local or hosted)

## Create MongoDB Instance

You can use either local MongoDB or MongoDB Atlas.

### Option A: Local MongoDB (quickest for development)

1. Install MongoDB Community Edition and MongoDB Compass.
2. Start MongoDB service (Windows):

```powershell
net start MongoDB
```

3. Use this connection string in backend `.env`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/poc_showcase
MONGODB_DB_NAME=poc_showcase
```

### Option B: MongoDB Atlas (cloud)

1. Create account at `https://www.mongodb.com/atlas`.
2. Create a new project and a free cluster (M0).
3. In Atlas:
- Create a database user (save username/password).
- Add your IP in Network Access (or allow `0.0.0.0/0` only for temporary dev).
4. Click `Connect` -> `Drivers` and copy the URI.
5. Replace placeholders and set backend `.env`:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/poc_showcase?retryWrites=true&w=majority
MONGODB_DB_NAME=poc_showcase
```

6. If your password has special characters, URL-encode it.

## End-to-End Local Setup (Windows PowerShell)

### 1. Backend Setup

```powershell
cd backend-fastapi
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `backend-fastapi/.env`:

```env
APP_NAME=POC FastAPI Backend
APP_ENV=development
PORT=8000
MONGODB_URI=mongodb://127.0.0.1:27017/poc_showcase
MONGODB_DB_NAME=poc_showcase
CLIENT_URL=http://localhost:5175
JWT_ACCESS_SECRET=replace_with_a_secure_access_secret
JWT_REFRESH_SECRET=replace_with_a_secure_refresh_secret
JWT_ACCESS_EXPIRY_MINUTES=15
JWT_REFRESH_EXPIRY_DAYS=7
```

Run backend:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

### 2. Frontend Setup

```powershell
cd client
npm install
```

Create or update `client/.env`:

```env
VITE_BACKEND_URL=http://localhost:8010
```

Run frontend:

```powershell
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

The frontend proxies `/api` and `/uploads` to `VITE_BACKEND_URL`.

## Seed Admin User

```powershell
cd backend-fastapi
.\.venv\Scripts\Activate.ps1
python -m scripts.seed_admin
```

Default admin credentials:

- Email: `admin@pocshowcase.com`
- Password: `admin123`

## Role Behavior

- `admin`: manage users, review/publish ideas, create/edit/delete any POC, view interested users
- `developer`: create POCs, edit/delete own POCs, mark interest on other published POCs ( next versions)
- `viewer`: browse published POCs, submit draft ideas, mark interest on eligible published POCs

## API Overview

Base prefix: `/api`

- Health: `GET /health`
- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- Users: `GET /users`, `GET /users/{user_id}`, `POST /users`, `PUT /users/{user_id}`, `DELETE /users/{user_id}`
- POCs: `GET /pocs`, `GET /pocs/{poc_id}`, `POST /pocs`, `PUT /pocs/{poc_id}`, `DELETE /pocs/{poc_id}`, `POST /pocs/{poc_id}/publish`, `POST /pocs/{poc_id}/upvote`, `DELETE /pocs/{poc_id}/upvote`, `GET /pocs/{poc_id}/voters`

Uploads are served at `/uploads`.

## Frontend Scripts

From `client/`:

- `npm run dev` - start dev server
- `npm run build` - build production bundle
- `npm run preview` - preview production build
- `npm run lint` - run eslint

## Backend Run Notes

- `PORT` in `.env` is app config, but local run port is controlled by uvicorn command.
- Keep `CLIENT_URL` and frontend dev URL aligned (`http://localhost:5175` in this setup).

## Deploy to Vercel (Frontend + Backend)

Deploy as **2 Vercel projects** from the same GitHub repo:

1. Backend project (root: `backend-fastapi`)
2. Frontend project (root: `client`)

### 1. Deploy Backend (FastAPI) on Vercel

Backend Vercel config files are included:

- `backend-fastapi/vercel.json`
- `backend-fastapi/api/index.py`

In Vercel:

1. Create new project -> import this repo.
2. Set **Root Directory** to `backend-fastapi`.
3. Add environment variables:
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRY_MINUTES` (for example `15`)
- `JWT_REFRESH_EXPIRY_DAYS` (for example `7`)
- `CLIENT_URL` (your frontend production URL, later from frontend project)
- Optional: `CLIENT_URLS` (comma-separated extra origins)
- Optional: `CLIENT_URL_REGEX` (default already allows localhost)
4. Deploy.

After deploy, test:

- `https://<your-backend>.vercel.app/api/health`

### 2. Deploy Frontend (Vite) on Vercel

1. Create another Vercel project from same repo.
2. Set **Root Directory** to `client`.
3. Add env var:
- `VITE_API_BASE_URL=https://<your-backend>.vercel.app/api`
4. Deploy.

### 3. Update Backend CORS

After frontend URL is live:

1. Go back to backend project env vars.
2. Set `CLIENT_URL=https://<your-frontend>.vercel.app`
3. Redeploy backend.

## Important Serverless Note

- Current thumbnail uploads are stored on local filesystem.
- On Vercel, filesystem is ephemeral (`/tmp`), so uploaded files are not permanent.
- For production, move uploads to external storage (Cloudinary, S3, or similar).
