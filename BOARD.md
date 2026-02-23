# Griot — Ops Board (Kanban)

Last updated: 2026-02-23

## TODO
- Grocery Dashboard (HTML): host with an easy URL (local gateway path + optional remote access)
- Grocery Pipeline: automate receipt ingestion (Telegram receipt photo -> OCR -> parse -> append to CSV -> export JSON)
- Grocery Dashboard (HTML): add trends (weekly/monthly), filters (store/date), and top swaps recommendations

## IN PROGRESS
- None

## DONE
- QMD (Quick Markdown Search) installed and indexed; integrated into memory pipeline (zero token cost)
- WhatsApp channel linked (+5564993197271) and allowlist configured with multiple contacts
- OpenRouter model cascade configured: Minimax m2.5 (primary) -> Kimi k2.5 -> Gemini 3.1 Pro -> Claude Sonnet 4.6
- Heartbeat model set to Minimax m2.5 (cheap, efficient)
- Mission Control dashboard created and deployed to GitHub (`griot-mission-control`) + Netlify
- Gmail OAuth connected (griotbot@gmail.com)
- Telegram bot connected + allowlist
- AI Breakfast newsletter auto-labeled and ready for morning brief
- 7am daily Griot Morning Brief configured and verified
- Griot Standup scheduled (daily)
- Heartbeat: every 30 minutes (casual checks)
