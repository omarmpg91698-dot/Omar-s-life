# Omar's life — System Architecture

## 1. Vision & Architectural Philosophy
Omar's life is a **local-first, bilingual (Arabic RTL / English LTR), privacy-first personal intelligence operating system** delivered as an Android-optimized Progressive Web App (PWA).

### Core Principles
1. **Local-First Persistence:** IndexedDB (via Dexie.js) is the primary source of truth. Every mutation writes locally first (`< 15ms`) and queues an outbox delta for optional cloud synchronization.
2. **Consolidated Kernel, Modular Capabilities:** All 15 personal OS modules operate on 12 unified core entities connected by a polymorphic `entity_links` graph rather than isolated silos.
3. **Zero Mandatory Costs:** Designed for 100% free operation offline and via free-tier edge/cloud services (Cloudflare Pages, optional Supabase, server-side Gemini Flash free tier, or optional home Ollama tunnel).
4. **Security & Privacy First:** Sensitive fields support client-side WebCrypto AES-256-GCM encryption; API keys remain strictly server-side; AI tools run inside a Zod-validated `ActionProposal` sandbox requiring user confirmation for mutations.

## 2. Layered System Topology
- **Presentation Layer (React 19 + Tailwind CSS v4):** Responsive mobile-first thumb-zone UI (`360px+`) scaling to multi-column desktop (`1440px`), using CSS Logical Properties (`ms-*`, `me-*`, `ps-*`, `pe-*`) for seamless RTL/LTR flipping.
- **Domain Module Layer (15 Capabilities / 5 Pillars):**
  - *Command & Execution:* Life Manager, Project Control, Smart Inbox
  - *Knowledge & Decisions:* Second Brain, Learning Hub, Decision Intelligence
  - *Wealth & Commitments:* Wealth Manager, Subscription Tracker
  - *People & Growth:* Personal CRM, Career Architect
  - *Operations & Signals:* Home Manager, Business Intelligence Hub, Market Intelligence
  - *Cross-Cutting Intelligence:* Personal Assistant, Automation Center
- **Platform Kernel (`src/core/`):**
  - `db`: Dexie IndexedDB schema, versioned migrations, and repository pattern.
  - `events`: Typed internal EventBus decoupling modules.
  - `search`: MiniSearch in-memory full-text index with bilingual Arabic/English normalization.
  - `automation`: Deterministic `Trigger -> Conditions -> Actions` engine with loop protection and approval gates.
  - `ai`: Shared `PersonalAIEngine` (Context Builder, local RAG, Tier-0 deterministic offline fallback, Tier-1 Gemini server proxy, Tier-2 Ollama HTTPS adapter, Tool Sandbox).
  - `security`: WebCrypto PBKDF2 + AES-GCM Vault, Zod validators, safe markdown/URL guards.
  - `sync`: Delta outbox, conflict snapshots, `.omarbak` encrypted backup/restore.
- **Server Proxy (`server.ts` / Edge Functions):** Express API proxy for `@google/genai` and CORS-safe public RSS/market feeds.
