# downydowndown

Paste a **YouTube**, **SoundCloud**, or **Mixcloud** link and download the
audio or video. Stripped-down, mobile-first, works on desktop too.

- **Audio** → highest-quality MP3
- **Video** (YouTube only) → best quality, capped at **1080p**, MP4
- SoundCloud & Mixcloud are audio-only, so the Video toggle disables itself
  automatically for those links.

It's a single small app: a Node/Express server that serves the web UI **and**
runs [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) + `ffmpeg` to fetch and
convert. Files are streamed to you on the fly and never stored on the server.

> **Why not GitHub Pages?** GitHub Pages is static-only — it can't run
> `yt-dlp`/`ffmpeg`. The downloading must happen on a real server, so this is
> packaged as one deployable app (one URL, no separate frontend host).

---

## Run it locally

Requires Node 18+, plus `yt-dlp` and `ffmpeg` on your PATH.

```bash
npm install
npm start
# open http://localhost:3000
```

Or with Docker (bundles everything):

```bash
docker build -t downydowndown .
docker run --rm -p 10000:10000 downydowndown
# open http://localhost:10000
```

---

## Deploy it live (Render — free, ~3 minutes)

This repo includes a `Dockerfile` and `render.yaml`, so Render builds it with
no extra config.

1. Push this repo to GitHub (already done if you're reading this there).
2. Go to **https://render.com** and sign in with GitHub.
3. Click **New +** → **Blueprint**.
4. Pick this repository. Render reads `render.yaml` and proposes a free Docker
   web service named **downydowndown**.
5. Click **Apply**. First build takes a few minutes (it installs ffmpeg +
   yt-dlp).
6. When it's live, Render gives you a URL like
   `https://downydowndown.onrender.com` — that's your app.

> Free Render services sleep after inactivity, so the first request after idle
> takes ~30s to wake. Any paid tier removes that.

### Other hosts

Anything that runs a Dockerfile works the same way:

- **Fly.io:** `fly launch` (uses the Dockerfile), then `fly deploy`.
- **Railway:** New Project → Deploy from repo → it detects the Dockerfile.

The container listens on `$PORT` (defaults to `10000`).

---

## Notes

- **Highest quality:** audio grabs the best available stream (`--audio-quality 0`);
  video uses `bestvideo[height<=1080]+bestaudio` merged to MP4, so anything
  above 1080p is capped at 1080p.
- **YouTube bot-gating:** YouTube sometimes challenges datacenter IPs. The
  server already passes alternate player clients to reduce this; if a specific
  video still refuses, that's YouTube's anti-bot, not the app.
- Only YouTube / SoundCloud / Mixcloud hosts are accepted; other URLs are
  rejected before anything runs.
- Respect copyright and each platform's Terms of Service — download only
  content you have the right to.
