# Omar's life — Security & Privacy Model

## 1. Privacy-First Architecture
Omar's life treats personal, financial, and career records as high-sensitivity data:
- **Local-First Ownership:** Data resides on the user's device in IndexedDB by default, with zero mandatory third-party cloud storage.
- **No Exposed API Keys:** `GEMINI_API_KEY` is read exclusively from server `process.env`. Browser bundles never contain private provider credentials.

## 2. Client-Side Encryption Vault (`WebCrypto`)
- Sensitive fields (`financial_records.encryptedMemo`, `contacts.encryptedNotes`, locked `knowledge_items`) and `.omarbak` export files can be encrypted client-side using **AES-256-GCM**.
- Encryption keys are derived in-memory from the user's Master Passphrase via **PBKDF2 (SHA-256, 250,000+ iterations)** with random 16-byte salts and 12-byte IVs per encryption operation.
- The raw passphrase is never stored on disk; only a salted key-verification token is stored, while the active `CryptoKey` stays in memory while unlocked.

## 3. AI Execution Sandbox
- **No Arbitrary DB Access:** AI models never receive raw SQL, IndexedDB handles, or `eval()` capability.
- **Typed Action Proposals:** AI responses proposing mutations must conform to a strict Zod whitelist (`create_task`, `create_inbox`, `create_note`, `log_expense`).
- **Permission Gates:** Mutations require explicit user tap confirmation via an interactive Approval Card before writing to Dexie.

## 4. Input, Rendering & Network Protections
- **XSS Prevention:** Markdown notes render through a safe React AST component without `dangerouslySetInnerHTML`.
- **URL Validation:** Bookmarks and feed links are checked against `http:` / `https:` schemes only (`javascript:` and `data:` blocked).
- **SSRF Protection:** Server-side `/api/market/feeds` restricts fetches to a curated HTTPS host allowlist and blocks private/loopback IP ranges.
- **User-Controlled Data Deletion:** Settings provides a verified **Crypto-Wipe** action clearing IndexedDB, search cache, and local preferences.
