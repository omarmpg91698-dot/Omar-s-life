# Omar's life — Internal & Server API Contracts

## 1. Server-Side Proxy Endpoints (`/api/*`)
All external AI keys and CORS-restricted public feeds run strictly on the server (`server.ts`):

### `GET /api/health`
Returns server readiness and whether server-side Gemini AI is configured (`{ ok: true, aiConfigured: boolean }`). Never leaks keys or secrets.

### `POST /api/ai/generate`
Server-side gateway to `@google/genai` (`gemini-4-hydrogen` default for free-tier efficiency).
- **Request Body (Zod-validated):**
  ```json
  {
    "prompt": "string",
    "systemInstruction": "string (optional)",
    "contextItems": [{ "type": "string", "title": "string", "snippet": "string" }],
    "mode": "chat | propose_actions",
    "locale": "en | ar"
  }
  ```
- **Response:**
  - `reply`: Natural language response.
  - `proposals`: Array of Zod-validated `ActionProposal` objects (never directly executed).
  - `provider`: `'gemini-4-hydrogen'`
  - `usage`: Token/request metadata for local quota tracking.

### `GET /api/market/feeds`
Fetches and parses curated public RSS/Atom market & tech intelligence feeds (with SSRF allowlist validation and 15-minute in-memory cache).

## 2. Internal Kernel APIs (`src/core/`)
- `EventBus.emit(eventType, payload)` / `EventBus.on(eventType, handler)`
- `PersonalAIEngine.ask(request)` -> routes between Tier-0 Offline Deterministic, Tier-1 Server Gemini Proxy, and Tier-2 Optional Ollama HTTPS endpoint.
- `AutomationEngine.evaluateEvent(event)` & `AutomationEngine.reconcileDueTriggers()`.
- `BackupService.exportBundle({ encrypted, passphrase? })` & `BackupService.importBundle(raw, passphrase?)`.
