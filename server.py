#!/usr/bin/env python3
"""Simple Python HTTP server for Tetris game."""

import http.server
import socketserver
import os
import json
from pathlib import Path

PORT = 3000
SCORES_FILE = Path(__file__).parent / "scores.json"


class TetrisHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler for serving static files and score API."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).parent / "static"), **kwargs)

    def do_GET(self):
        if self.path == "/api/scores":
            self.send_json_response(self._load_scores())
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/scores":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body)
                score = int(data.get("score", 0))
                lines = int(data.get("lines", 0))
                level = int(data.get("level", 1))
                play_time = int(data.get("playTime", 0))
                name = str(data.get("name", "Player"))[:20]

                scores = self._load_scores()
                scores.append({
                    "name": name,
                    "score": score,
                    "lines": lines,
                    "level": level,
                    "playTime": play_time,
                })
                scores.sort(key=lambda x: x["score"], reverse=True)
                scores = scores[:10]  # Keep top 10
                self._save_scores(scores)
                self.send_json_response({"success": True})
            except (json.JSONDecodeError, ValueError):
                self.send_json_response({"error": "Invalid data"}, 400)
        else:
            self.send_error(404)

    def send_json_response(self, data, code=200):
        response = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def _load_scores(self):
        if SCORES_FILE.exists():
            try:
                return json.loads(SCORES_FILE.read_text())
            except (json.JSONDecodeError, IOError):
                return []
        return []

    def _save_scores(self, scores):
        SCORES_FILE.write_text(json.dumps(scores, indent=2))

    def log_message(self, format, *args):
        pass  # Suppress logs for cleaner output


import socket

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True
    def server_bind(self):
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        except (AttributeError, OSError):
            pass
        super().server_bind()


def main():
    with ReusableTCPServer(("0.0.0.0", PORT), TetrisHandler) as httpd:
        print(f"🎮 Tetris server running at http://0.0.0.0:{PORT}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
