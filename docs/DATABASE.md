# Omar's life — Database & Entity Relationship Design

## 1. Storage Engine
- **Primary Local Store:** IndexedDB via `Dexie.js` (`omars_life_db`).
- **Full-Text Index:** `MiniSearch` synchronized incrementally on repository writes, with custom Arabic normalization (tashkeel stripping, alef unification `أ/إ/آ -> ا`, `ة -> ه`, `ى -> ي`).

## 2. Universal Entity Envelope
All syncable records share:
- `id`: UUIDv7 (time-ordered, collision-free offline generation)
- `userId`: `'local-default'` offline or authenticated user ID when synced
- `version`: Monotonic integer incremented on every local write
- `createdAt`, `updatedAt`: Epoch milliseconds
- `deletedAt`: `number | null` (soft-delete tombstone for offline sync)
- `deviceId`: Originating browser/device ID
- `syncState`: `'local' | 'pending' | 'synced' | 'conflict'`
- `tags`: `string[]`

## 3. Core Tables
| Table | Purpose | Key Indexes |
| :--- | :--- | :--- |
| `tasks` | Actionable tasks & schedule slots | `id`, `[status+dueAt]`, `projectId`, `goalId` |
| `projects` | Multi-step initiatives | `id`, `status`, `area`, `goalId` |
| `goals` | Quarterly/annual measurable targets | `id`, `horizon`, `domain`, `status` |
| `events` | Calendar & scheduled blocks | `id`, `startAt`, `category` |
| `knowledge_items` | Notes, bookmarks, SRS flashcards | `id`, `kind`, `srsNextReviewAt` |
| `decisions` | Structured decision logs & outcome reviews | `id`, `status`, `reviewAt` |
| `financial_records` | Integer-minor (`amountMinor`) ledger | `id`, `[occurredAt+category]`, `kind` |
| `subscriptions` | Recurring commitments & renewal dates | `id`, `status`, `nextRenewalAt` |
| `contacts` | Personal CRM & touchpoint cadences | `id`, `relationship`, `lastContactedAt` |
| `home_assets` | Appliances, warranties, service schedules | `id`, `nextServiceAt`, `warrantyUntil` |
| `inbox_items` | Smart Inbox raw captures & triage status | `id`, `[triageStatus+capturedAt]` |
| `entity_links` | Polymorphic graph edges across all modules | `id`, `[sourceType+sourceId]`, `[targetType+targetId]` |
| `automations` | Workflow rules (`Trigger -> Conditions -> Actions`) | `id`, `enabled`, `triggerType` |
| `automation_runs` | Workflow execution history & error logs | `id`, `ruleId`, `executedAt` |
| `notifications` | Alerts & pending approval cards | `id`, `read`, `status`, `createdAt` |
| `activity_logs` | Immutable audit trail | `id`, `timestamp`, `actor`, `entityType` |
| `sync_outbox` | Pending delta operations for cloud sync | `id`, `createdAt`, `entityType` |

## 4. Backup & Migration Policy
- Schema changes use sequential Dexie `.version(n).stores(...).upgrade(...)` migrations.
- Integer minor units (`amountMinor`, e.g., piastres/cents) prevent floating-point rounding drift in financial calculations.
