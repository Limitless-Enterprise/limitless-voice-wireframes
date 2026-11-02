# Limitless Voice Agents — V2 HTML wireframe

Clickable static wireframe for the **Voice Agents V2** slice (Purple Basil Medspa / Mia), aligned with the Limitless Platform wireframes PDF. Sample conversations and transcripts are embedded from ElevenLabs ConvAI snapshots—**no runtime API calls**.

**Agents:** read [`agent.md`](agent.md) for navigation, editing rules, and data refresh.

## Quick start

```bash
python3 scripts/serve.py
```

Open `http://127.0.0.1:8765/index.html` (or the next free port). Options: `--no-open`, `--port`, `--host`.

## Refresh data (maintainers)

```bash
python3 scripts/build-wireframe-data.py
```

Requires Limitless `bb llm-vault` ElevenLabs key locally; commits `data.js` + `wireframe-data.json` only.

## Figma reference

[Limitless Platform — Wireframes](https://www.figma.com/design/kUK18KmzAYqDoHjpFHNIsy/Limitless-Platform---Wireframes?node-id=548-1898) · fileKey `kUK18KmzAYqDoHjpFHNIsy`
