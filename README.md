# Innovation Hub v1

Innovation Hub is a full-stack internal contribution platform for submitting, reviewing, publishing, and tracking POCs with role-based access (`admin`, `developer`, `viewer`).

## Highlights

- JWT auth: register, login, refresh, logout, me
- Role-based UX and route protection
- Super admin + track admin model
- Contribution lifecycle: `draft -> published -> live -> finished` (+ `cancelled`)
- Interest and approval flow for contributors
- Feedback system on finished contributions
- Credits and leaderboard
- Thumbnail uploads via `/uploads`

## Recent Changes (Included)

- Viewer dashboard card updated from **Track Ratio** to **Top 5 Users by Credits**.
- `/users/leaderboard` is now available to all authenticated users (used by viewer dashboard too).
- Admin feedback now supports **mandatory rating (1 to 5 stars)** per participant.
- Admin feedback timeline now shows stored star ratings.
- Viewer contribution filter bug fixed: selecting **Published** now returns only `published` items (not live/finished).
- Power Automate webhook support is documented via env var:
  - `POWER_AUTOMATE_LIVE_WEBHOOK_URL`

## Tech Stack

- Frontend: React 19, Vite 7, React Router, Axios, Tailwind CSS v4
- Backend: FastAPI, Motor (MongoDB), Pydantic Settings, JWT
- Database: MongoDB

## Project Structure

```text
Innovation-hub-v1/
  client/
  backend-fastapi/
```

## Prerequisites

- Node.js 18+
- npm 9+
- Python 3.10+
- MongoDB (local or Atlas)

## Backend Setup

```bash
cd backend-fastapi
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend-fastapi/.env`:

```env
APP_NAME=POC FastAPI Backend
APP_ENV=development
PORT=8000

MONGODB_URI=mongodb://127.0.0.1:27017/poc_showcase
MONGODB_DB_NAME=poc_showcase

CLIENT_URL=http://localhost:5173
CLIENT_URLS=
CLIENT_URL_REGEX=https?://(localhost|127\.0\.0\.1)(:\d+)?

JWT_ACCESS_SECRET=replace_with_a_secure_access_secret
JWT_REFRESH_SECRET=replace_with_a_secure_refresh_secret
JWT_ACCESS_EXPIRY_MINUTES=15
JWT_REFRESH_EXPIRY_DAYS=7

SUPER_ADMIN_EMAIL=admin@agivant.com

# Optional: Power Automate webhook for live notifications
POWER_AUTOMATE_LIVE_WEBHOOK_URL=
```

Run backend:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

Health:

- `http://127.0.0.1:8010/api/health`

## Frontend Setup

```bash
cd client
npm install
```

Create `client/.env`:

```env
VITE_BACKEND_URL=http://127.0.0.1:8010
```

Run frontend:

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

App URL:

- `http://127.0.0.1:5173`

## Seed Admin User

```bash
cd backend-fastapi
source .venv/bin/activate
python -m scripts.seed_admin
```

Default admin credentials:

- Email: `admin@agivant.com`
- Password: `admin123`

## Role Behavior

- `admin`:
  - Super admin can manage users across tracks
  - Track admins can manage only their assigned track
  - Can review/publish/manage contributions in allowed scope
  - Can provide admin feedback + star ratings on finished contributions
- `developer`:
  - Can create and manage own contributions
  - Can mark interest in eligible contributions
- `viewer`:
  - Can browse visible contributions
  - Can mark interest, view involved contributions
  - Can see personal credits

## Feedback & Rating (Finished Contributions)

- Admin feedback is allowed only on `finished` contributions.
- Admin must select participant, write feedback, and choose **1–5 star rating**.
- The latest feedback per `(admin, participant, contribution)` is stored.
- User feedback is also supported for approved participants.

## Credits & Leaderboard

- Credits are derived from finished contributions.
- Leaderboard supports sorting and track filtering.
- Viewer dashboard shows **Top 5 Users by Credits**.

## API Overview

Base prefix: `/api`

Auth:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

Users:

- `GET /users`
- `GET /users/{user_id}`
- `POST /users`
- `PUT /users/{user_id}`
- `DELETE /users/{user_id}`
- `GET /users/interests`
- `GET /users/leaderboard`
- `GET /users/directory`
- `GET /users/my-credits`

POCs:

- `GET /pocs`
- `GET /pocs/{poc_id}`
- `POST /pocs`
- `PUT /pocs/{poc_id}`
- `DELETE /pocs/{poc_id}`
- `POST /pocs/{poc_id}/publish`
- `POST /pocs/{poc_id}/go-live`
- `POST /pocs/{poc_id}/finish`
- `POST /pocs/{poc_id}/mark-draft`
- `POST /pocs/{poc_id}/cancel`
- `POST /pocs/{poc_id}/cancel-reason`
- `POST /pocs/{poc_id}/upvote`
- `DELETE /pocs/{poc_id}/upvote`
- `GET /pocs/{poc_id}/voters`
- `POST /pocs/{poc_id}/approve-user`
- `POST /pocs/{poc_id}/unapprove-user`
- `POST /pocs/{poc_id}/admin-feedback` (requires `feedback`, `userId`, `rating`)
- `POST /pocs/{poc_id}/user-feedback`

Health:

- `GET /health`

## Frontend Scripts

From `client/`:

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`

## Notes

- Uploads are served from `/uploads` and stored locally by default.
- In serverless environments, local filesystem is ephemeral; use external object storage for production uploads.
- If you change super admin email, keep `SUPER_ADMIN_EMAIL` in sync.
- If `POWER_AUTOMATE_LIVE_WEBHOOK_URL` is empty, webhook notifications are skipped (no crash).
