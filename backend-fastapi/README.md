# FastAPI Backend (Parallel to Node backend)

This service mirrors the existing Node API contract under `/api` so your current frontend can be pointed to it incrementally.

## Tech
- FastAPI
- Motor (MongoDB async driver)
- JWT auth (access + refresh)
- Role-based access (`admin`, `developer`, `viewer`)

## Setup

```bash
cd backend-fastapi
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

- API root: `http://localhost:8000/api/health`
- Swagger: `http://localhost:8000/docs`

## Endpoints (implemented)

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout` (auth required)
- `GET /api/auth/me` (auth required)

### Users (admin only)
- `GET /api/users`
- `GET /api/users/{id}`
- `POST /api/users`
- `PUT /api/users/{id}`
- `DELETE /api/users/{id}`

### POCs
- `GET /api/pocs` (auth required)
- `GET /api/pocs/{id}` (auth required)
- `POST /api/pocs` (admin/developer)
- `PUT /api/pocs/{id}` (admin/developer)
- `DELETE /api/pocs/{id}` (admin/developer)

### Health
- `GET /api/health`

## Notes
- Uploads are served from `/uploads` and stored in `backend-fastapi/uploads`.
- JWT refresh token is stored per user in MongoDB, like the existing Node implementation.

## Seed Admin

Create/update default admin in the DB configured by `.env`:

```bash
python -m scripts.seed_admin
```

Default admin credentials:
- Email: `admin@pocshowcase.com`
- Password: `admin123`
