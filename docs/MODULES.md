# Omar's life — Module Registry & Responsibilities

All 15 modules share the Core Kernel (`db`, `events`, `search`, `ai`, `automation`, `security`) and interact via typed repositories and `entity_links`.

1. **Personal Assistant (`assistant`)**: Unified conversational interface, local RAG over user data, Tier-0/Tier-1/Tier-2 routing, and interactive `ActionProposal` approval cards.
2. **Life Manager (`life-manager`)**: Daily tasks, priorities (`P1–P4`), calendar events, overdue detection, and daily command briefing.
3. **Second Brain (`second-brain`)**: Bilingual Markdown knowledge notes, tags, backlinks (`entity_links`), and optional Vault-encrypted private entries.
4. **Wealth Manager (`wealth-manager`)**: Integer-minor income/expense ledger, multi-currency totals, category analytics, and encrypted memos.
5. **Business Intelligence Hub (`business-intel`)**: Aggregated personal KPIs computed live from Tasks, Goals, Projects, and Wealth records.
6. **Decision Intelligence (`decision-intel`)**: Structured decision records with options, pros/cons, confidence scores, and scheduled post-decision review reminders.
7. **Market Intelligence (`market-intel`)**: Watchlist notes and free public RSS/Atom tech & financial feeds fetched through `/api/market/feeds`.
8. **Automation Center (`automation-center`)**: `Trigger -> Conditions -> Actions` workflow editor, enable/disable toggles, execution logs, and approval queue.
9. **Home Manager (`home-manager`)**: Household appliances/assets, warranty expiry tracking, and recurring maintenance schedules.
10. **Career Architect (`career-architect`)**: Career horizon goals, skill-building links to Learning Hub, and milestone tracking.
11. **Smart Inbox (`smart-inbox`)**: Zero-friction capture queue (including Android Share Target) that triages raw text/URLs into structured Tasks, Notes, Expenses, or Decisions.
12. **Learning Hub (`learning-hub`)**: Study items and spaced-repetition (SRS) flashcard queue linked to Second Brain & Career Architect.
13. **Personal CRM (`personal-crm`)**: Contacts, relationship categories, touchpoint cadence tracking, and encrypted private interaction notes.
14. **Project Control (`project-control`)**: Multi-step projects linked to Goals and Tasks with computed completion progress.
15. **Subscription Tracker (`subscription-tracker`)**: Recurring services, amortized monthly burn, and automated pre-renewal notifications.
