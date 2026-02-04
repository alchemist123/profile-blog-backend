# Profile Backend

Express API for the profile/blog app. Uses MongoDB for storage.

## API

- `GET /api/blogs` – list all blogs (newest first)
- `GET /api/blogs/:id` – get one blog by id
- `POST /api/blogs` – create blog (body: `{ title, summary?, content, coverImage?, tags? }`)
- `PUT /api/blogs/:id` – update blog
- `DELETE /api/blogs/:id` – delete blog
- `GET /health` – health check

## Run locally (no Docker)

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set `MONGO_URI` if needed (default: `mongodb://localhost:27017/profile`)
3. Ensure MongoDB is running on port 27017
4. Start: `npm run dev` or `npm start`

## Run with Docker (from repo root)

```bash
docker compose up -d
```

- Backend: http://localhost:4000
- MongoDB: localhost:27017 (internal to compose; use `mongodb://mongodb:27017/profile` from backend)

To rebuild after code changes:

```bash
docker compose up -d --build
```
