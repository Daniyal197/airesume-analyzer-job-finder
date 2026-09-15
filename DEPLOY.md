# Deploying Resume Desk

Backend → **Render** (genuinely free tier, no credit card). Frontend → **Vercel**
(same as your portfolio). Takes about 15 minutes end to end.

## Before you start

Push this whole project to a GitHub repo (both `backend/` and `frontend/` in
one repo is fine — that's what `render.yaml` and the Vercel root-directory
setting below are for).

```bash
cd "AI Resume Analyzer and Job Tracker"
git init
git add .
git commit -m "Resume Desk"
git branch -M main
git remote add origin https://github.com/Daniyal197/YOUR-REPO-NAME.git
git push -u origin main
```

`.gitignore` is already set up to keep `.env`, `venv/`, and `__pycache__/` out
of the repo — **never commit your real `.env` file**.

## 1. MongoDB Atlas — allow Render's IPs

Render's free tier doesn't give you a fixed IP address, so an IP allowlist
won't work. In Atlas → Network Access → add `0.0.0.0/0` ("Allow access from
anywhere"). You already did this for local dev, so this step may already be
done — just double-check it's still there.

## 2. Deploy the backend on Render

1. Go to https://dashboard.render.com → **New** → **Blueprint**
2. Connect your GitHub account and pick this repo
3. Render reads `render.yaml` at the repo root and shows one service:
   `resume-desk-api`. Click through — it'll prompt you for the 5 secret
   values (marked `sync: false` in the blueprint):
   - `GEMINI_API_KEY`
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `JOOBLE_API_KEY`
   - `ALLOWED_ORIGINS` — leave this **blank for now**, you'll set it in step 4
4. Click **Deploy Blueprint**. First build takes a few minutes.
5. Once live, copy the URL Render gives you — looks like
   `https://resume-desk-api-xxxx.onrender.com`

**Free tier reality check:** the service spins down after 15 minutes with no
requests, and the *next* request after that wakes it back up — taking
30-50 seconds. That first slow request is normal, not a bug. Worth mentioning
if you demo this live.

## 3. Point the frontend at your live backend

Open `frontend/app.js` and replace the placeholder:

```js
const RENDER_BACKEND_URL = "https://resume-desk-api-xxxx.onrender.com"; // <- your real URL
```

Commit and push this change.

## 4. Deploy the frontend on Vercel

1. Go to https://vercel.com/new → import the same GitHub repo
2. When configuring the project, set **Root Directory** to `frontend`
3. Framework preset: **Other** (it's plain HTML/CSS/JS, no build step needed)
4. Deploy. Vercel gives you a URL like `https://your-app.vercel.app`

## 5. Lock down CORS

Now that you have the real Vercel URL, go back to Render → your service →
**Environment** → set `ALLOWED_ORIGINS` to your Vercel URL (e.g.
`https://your-app.vercel.app`) → save (this triggers a redeploy).

Without this step the API still works (it defaults to allowing any origin),
but locking it down to your actual frontend is the more correct, production
version of this — worth doing and worth being able to explain in an
interview.

## 6. Test it

Open your Vercel URL, register an account, and try each tool. Remember the
first request may take up to a minute if the backend had spun down.

## Things that don't change between local and deployed

- Gemini, MongoDB Atlas, and Jooble are all already cloud services — nothing
  to redeploy there, same keys work in both places.
- The frontend's `RENDER_BACKEND_URL` / local-detection logic in `app.js`
  means you never have to touch it again once set — opening the site via
  `127.0.0.1`/`localhost` still uses your local backend automatically.