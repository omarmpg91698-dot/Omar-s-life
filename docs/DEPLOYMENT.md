# Omar's life — Deployment & Free-Tier Operations Guide

## 1. Environment Variables
Configure in `.env` (or hosting Secrets panel) — **never** expose secrets with `VITE_` prefixes:
- `GEMINI_API_KEY`: Optional server-side Google Gemini API key for Tier-1 AI assistance. When absent, Omar's life operates fully using Tier-0 offline deterministic intelligence or optional user-configured Ollama.
- `PORT`: Defaults to `3000`.

## 2. Running Locally
```bash
npm install
npm run dev
```

## 3. Production Build & Server Start
```bash
npm run build
npm run start
```

## 4. Free-Tier Hosting Options
- **Static + Edge Proxy (Cloudflare Pages + Functions):** Free unlimited static bandwidth and 100k Worker requests/day for `/api/ai/generate` and `/api/market/feeds`.
- **Full-Stack Node (Express + Static `dist/`):** Run `node server.ts` on any free Node host or local home server.
- **Optional Local AI (Ollama on Home PC):**
  1. Expose Ollama securely via Tailscale Funnel or Cloudflare Tunnel (`https://...`) so Android Chrome PWA does not block `http://` mixed content.
  2. Set `OLLAMA_ORIGINS=*` (or your PWA origin) on your home machine.
  3. Enter the HTTPS tunnel URL inside Omar's life Settings -> AI Engine.
- **Android PWA Installation:** Open in Chrome on Android and tap **Install App** in the header/settings or browser menu for standalone fullscreen mode, offline caching, and Android Share Sheet integration (`Smart Inbox`).
