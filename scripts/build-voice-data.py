#!/usr/bin/env python3
"""Regenerate voice-data.js from repo snapshots (same as designs/scripts/build-design-data.py)."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
repo = ROOT
script = repo / "designs/scripts/build-design-data.py"
if not script.is_file():
    sys.exit(f"Missing {script} — run from voice-agents repo")

subprocess.run([sys.executable, str(script)], check=True)
src = repo / "designs/shared/data.js"
dest = Path(__file__).resolve().parents[1] / "voice-data.js"
dest.write_text(src.read_text())
print(f"Copied → {dest}")
