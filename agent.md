# Agent guide — Limitless Voice Agents V2 wireframe

Instructions for **Cursor agents, coding agents, and humans** working with this repository.

## What this is

- **Static HTML wireframe** of the Limitless **Voice Agents V2** product slice (Figma/PDF: *Limitless Platform — Wireframes*, Purple Basil Medspa / Mia).
- **No backend, no runtime API calls.** All sample data is embedded in `data.js` (generated from ElevenLabs ConvAI snapshots).
- **Not production UI** — use for UX review, eng alignment, and agent-assisted implementation planning.

## Repository layout

| Path | Purpose |
|------|---------|
| `index.html` | Entry point; loads shell + scripts |
| `app.js` | Hash routing, all screens, binds UI to data |
| `pdf-shell.js` | PDF-aligned page chrome (tabs, reporting window, eyebrows) |
| `styles.css` | Wireframe styling |
| `data.js` | **`window.WIREFRAME_DATA`** — ship this; do not fetch ElevenLabs in the browser |
| `wireframe-data.json` | Same payload as JSON (diff-friendly) |
| `scripts/serve.py` | Local HTTP server (cross-platform) |
| `scripts/build-wireframe-data.py` | Regenerates `data.js` from ElevenLabs API (maintainers only) |
| `README.md` | Human quick start |

## Run locally (required for hash routes)

From repo root:

```bash
python3 scripts/serve.py
```

Open the URL printed (default `http://127.0.0.1:8765/index.html`). Use **`--no-open`** in CI/headless environments.

Windows: `py -3 scripts/serve.py` if `python3` is not on PATH.

Do **not** rely on `file://` for full navigation testing.

## Navigation model

- **In-app tabs:** Overview · Calls · Analytics · Agent setup (`#/overview`, `#/calls`, `#/analytics`, `#/agent`).
- **Call detail:** `#/call/<conversation_id>` (IDs from `data.js`, e.g. `conv_8801m66f2w6zfsntc1kqs6nha4yv`).
- **Proto nav (right rail):** Jump to all PDF-mapped screens (analytics sub-pages, future concept, managed setup, internal control plane, briefing).
- **Demo empty tenant:** Checkbox in proto nav → `#/empty` (PDF empty state; no call rows).

Legacy hashes `#/voice-crm` and `#/internal-2` redirect to agent setup / routing editor flows.

## Refresh embedded data (maintainers)

Requires ElevenLabs API key via Limitless vault (not committed):

```bash
python3 scripts/build-wireframe-data.py
```

This calls ConvAI for agent `agent_9201kvqe56a2ebwafvj92w81xy68` (Purple Basil), writes `wireframe-data.json` and `data.js`. **Commit both** after refresh so the wireframe stays reproducible without secrets.

Never commit API keys, `.env`, or vault output.

## Rules for agents editing this repo

1. **Keep runtime offline** — Do not add `fetch()` to ElevenLabs or Limitless APIs from `index.html` / `app.js`.
2. **Preserve PDF copy** — Screen eyebrows, titles, and disclaimer footnotes should stay aligned with the V2 PDF unless product explicitly changes.
3. **Transcripts** — Come from `conversation.transcript[]` in `data.js`; render via `renderTranscript()` in `app.js`.
4. **Internal CRM routing** — Customer Agent setup shows a summary; full routing editor is `#/internal-2` (Limitless operator view).
5. **Minimal diffs** — Prefer extending `app.js` / `pdf-shell.js` over new frameworks; no build step required to view the wireframe.
6. **Serve script** — If you change static paths, keep `scripts/serve.py` serving repo root (`directory=ROOT` one level up from `scripts/`).

## Common tasks

| Task | Action |
|------|--------|
| Add a new screen | Add route in `app.js` `SCREENS` + `map` in `render()`; use `PdfShell.renderVoicePage()` |
| Change metrics | Edit render functions; source numbers from `conversations` in `WIREFRAME_DATA` |
| New sample tenant | Extend `build-wireframe-data.py` and registry block `voice_crm_control_plane` |
| Preview for stakeholder | `scripts/serve.py`, share localhost URL or deploy static host (any static file host works) |

## Related product context

- ElevenAgents agent id in sample: `agent_9201kvqe56a2ebwafvj92w81xy68`
- Persona: **Mia · Voice receptionist**, Purple Basil Medspa
- Internal handoff tool (design): `request_human_review` → Twenty CRM spoke workspace (see `#/internal-2`)

## Publishing

This repo is intended to be **public or org-visible** under **Limitless-Enterprise** for design/engineering reference only. It contains **no secrets** when `data.js` is generated via the standard build script (redacted/tool-free).
