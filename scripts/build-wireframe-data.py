#!/usr/bin/env python3
"""Fetch ElevenLabs ConvAI data and emit static wireframe payloads (no runtime API in HTML)."""

from __future__ import annotations

import json
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

AGENT_ID = "agent_9201kvqe56a2ebwafvj92w81xy68"
L1_AGENT_ID = "agent_5101m5y4fxphecjsmt2e93v0q844"
BASE = "https://api.elevenlabs.io/v1/convai"
ROOT = Path(__file__).resolve().parents[1]

# Internal Limitless control-plane registry (not customer self-service config).
VOICE_CRM_REGISTRY = {
    "signed_in_as": "debraj@limitlessenterprise.ai",
    "customers": [
        {
            "customer_id": "purple-basil-medspa",
            "display_name": "Purple Basil Medspa",
            "slug_label": "PURPLE-BASIL-MEDSPA",
            "routing_status": "ready",
            "twenty_model_status": "unknown",
            "elevenlabs_agent_ids": [AGENT_ID],
            "voice_agent_display_names": {AGENT_ID: "Mia"},
            "twenty_workspace_id": "1a567d8d-6ca8-4f34-a3b3-7e48241bad8d",
            "twenty_api_key_secret_ref": "openbao://test",
            "twenty_app_base_url": "https://purple-basil.twenty.limitlessenterprise.ai",
            "voice_lead_email_timezone": "America/Chicago",
            "notify_emails": ["info@purplebasilmedspa.com"],
            "notify_on": ["request_human_review", "urgency_high"],
            "validation": {
                "elevenlabs_agent_id": True,
                "twenty_workspace": True,
                "twenty_api_key_ref": True,
                "notification_emails": True,
                "voice_lead_email_timezone": True,
            },
        },
        {
            "customer_id": "limitless-levels-l1-assist",
            "display_name": "Limitless Levels L1 Assist",
            "slug_label": "LIMITLESS-LEVELS-L1-ASSIST",
            "routing_status": "pending",
            "twenty_model_status": "pending",
            "elevenlabs_agent_ids": [L1_AGENT_ID],
            "voice_agent_display_names": {L1_AGENT_ID: "L1 Assist"},
            "twenty_workspace_id": "1a567d8d-6ca8-4f34-a3b3-7e48241bad8d",
            "twenty_api_key_secret_ref": "openbao://test",
            "twenty_app_base_url": "https://limitless-levels.twenty.limitlessenterprise.ai",
            "voice_lead_email_timezone": "America/Chicago",
            "notify_emails": ["debraj@limitlessenterprise.ai"],
            "notify_on": ["request_human_review", "urgency_high"],
            "validation": {
                "elevenlabs_agent_id": True,
                "twenty_workspace": True,
                "twenty_api_key_ref": True,
                "notification_emails": True,
                "voice_lead_email_timezone": True,
            },
        },
    ],
}


def vault_key() -> str:
    r = subprocess.run(
        [
            "bash",
            "-lc",
            "eval \"$(bb llm-vault use ELEVEN_LABS '11Labs API Key' 2>/dev/null)\" && echo \"$ELEVEN_LABS\"",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return r.stdout.strip()


def get(path: str, key: str) -> dict:
    req = urllib.request.Request(BASE + path, headers={"xi-api-key": key})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.load(resp)


def dc_val(dc: dict, name: str):
    v = dc.get(name)
    if isinstance(v, dict):
        return v.get("value")
    return None


def main() -> None:
    key = vault_key()
    if not key:
        raise SystemExit("ELEVEN_LABS API key not available (bb llm-vault)")

    agent = get(f"/agents/{AGENT_ID}", key)
    convs_resp = get(f"/conversations?agent_id={AGENT_ID}&page_size=15", key)
    conversations = []

    for c in convs_resp.get("conversations", []):
        cid = c["conversation_id"]
        detail = get(f"/conversations/{cid}", key)
        analysis = detail.get("analysis") or {}
        meta = detail.get("metadata") or {}
        dc = analysis.get("data_collection_results") or {}
        tools = c.get("tool_names") or []
        lead_captured = bool(
            dc_val(dc, "contact_name") or dc_val(dc, "phone") or dc_val(dc, "email")
        )
        if "request_human_review" in tools:
            lead_captured = True

        transcript = [
            {
                "role": turn.get("role"),
                "message": turn.get("message") or "",
                "time_in_call_secs": turn.get("time_in_call_secs"),
            }
            for turn in detail.get("transcript") or []
        ]

        conversations.append(
            {
                "id": cid,
                "title": analysis.get("call_summary_title")
                or c.get("call_summary_title")
                or "Conversation",
                "start_time_unix_secs": c.get("start_time_unix_secs"),
                "duration_secs": c.get("call_duration_secs")
                or meta.get("call_duration_secs"),
                "status": c.get("status"),
                "call_successful": analysis.get("call_successful")
                or c.get("call_successful"),
                "call_success_score": c.get("call_success_score"),
                "termination_reason": c.get("termination_reason"),
                "source": c.get("conversation_initiation_source")
                or meta.get("conversation_initiation_source"),
                "lead_captured": lead_captured,
                "data_collection": {
                    "contact_name": dc_val(dc, "contact_name"),
                    "phone": dc_val(dc, "phone"),
                    "email": dc_val(dc, "email"),
                    "service_interest": dc_val(dc, "service_interest"),
                    "urgency": dc_val(dc, "urgency"),
                },
                "tool_names": tools,
                "message_count": c.get("message_count"),
                "transcript": transcript,
            }
        )

    conversations.sort(key=lambda x: x["start_time_unix_secs"] or 0, reverse=True)

    cfg = agent.get("conversation_config") or {}
    agent_block = cfg.get("agent") or {}
    tts = cfg.get("tts") or {}
    highlights = agent.get("platform_settings_highlights") or {}

    payload = {
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "ElevenLabs ConvAI API (Purple Basil Medspa)",
        "customer": {
            "display_name": "Purple Basil Medspa",
            "workspace_label": "Testing Site",
        },
        "agent": {
            "agent_id": AGENT_ID,
            "name": agent.get("name"),
            "persona_label": "Mia · Voice receptionist",
            "first_message": agent_block.get("first_message"),
            "voice_id": tts.get("voice_id"),
            "tts_model": tts.get("model_id"),
            "llm": (agent_block.get("prompt") or {}).get("llm"),
            "data_collection_fields": highlights.get("data_collection_field_ids")
            or list((agent.get("platform_settings") or {}).get("data_collection") or {}),
            "evaluation_criteria": highlights.get("evaluation_criteria_ids"),
            "knowledge_base": [
                kb.get("name")
                for kb in (agent_block.get("prompt") or {}).get("knowledge_base") or []
            ],
        },
        "reporting_window_days": 30,
        "conversations": conversations,
        "metrics_computed": {
            "answered_calls": len(conversations),
            "captured_leads": sum(1 for c in conversations if c["lead_captured"]),
            "scored_evaluations": sum(
                1 for c in conversations if c.get("call_success_score") is not None
            ),
            "successful_calls": sum(
                1 for c in conversations if c.get("call_successful") == "success"
            ),
        },
        "voice_crm_control_plane": VOICE_CRM_REGISTRY,
    }

    json_path = ROOT / "wireframe-data.json"
    js_path = ROOT / "data.js"
    json_path.write_text(json.dumps(payload, indent=2) + "\n")
    js_path.write_text("window.WIREFRAME_DATA = " + json.dumps(payload, indent=2) + ";\n")
    print(f"Wrote {json_path} ({len(conversations)} conversations)")
    print(f"Wrote {js_path}")


if __name__ == "__main__":
    main()
