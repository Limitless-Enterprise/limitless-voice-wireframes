#!/usr/bin/env python3
"""Serve the V2 voice wireframe over HTTP (macOS, Linux, Windows)."""

from __future__ import annotations

import argparse
import http.server
import os
import socket
import socketserver
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write(f"[serve] {self.address_string()} - {fmt % args}\n")


def pick_port(host: str, start: int, attempts: int = 10) -> int:
    for port in range(start, start + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, port))
            except OSError:
                continue
            return port
    raise SystemExit(f"No free port in range {start}–{start + attempts - 1}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Local HTTP server for the V2 voice wireframe")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Port (default: 8765)")
    parser.add_argument("--no-open", action="store_true", help="Do not open a browser tab")
    args = parser.parse_args()

    os.chdir(ROOT)
    port = pick_port(args.host, args.port)
    url = f"http://{args.host}:{port}/index.html"

    with socketserver.TCPServer((args.host, port), Handler) as httpd:
        print(f"Serving {ROOT}")
        print(f"Open: {url}")
        print("Press Ctrl+C to stop")
        if not args.no_open:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
