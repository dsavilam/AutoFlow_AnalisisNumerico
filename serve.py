#!/usr/bin/env python3
"""
AutoFlow • Servidor Local de Demostración
Ejecuta este script para abrir el dashboard automáticamente en tu navegador:
    python serve.py
"""

import http.server
import socketserver
import webbrowser
import os
from pathlib import Path

PORT = 8000
DIRECTORY = Path(__file__).parent.resolve()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

    def log_message(self, format, *args):
        # Clean logging
        print(f"[AutoFlow Server] {self.address_string()} - {format % args}")

def run():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print("=" * 65)
        print("  AutoFlow • MovePredict Engine (AutoMove City Bogotá)")
        print(f"  Servidor activo en: {url}")
        print("  Presiona Ctrl+C para detener el servidor.")
        print("=" * 65)
        
        # Abrir automáticamente en el navegador web
        try:
            webbrowser.open(url)
        except Exception:
            pass

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido correctamente.")

if __name__ == "__main__":
    run()
