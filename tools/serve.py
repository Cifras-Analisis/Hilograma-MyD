#!/usr/bin/env python3
"""Servidor local para Hilograma MyD (solo en 127.0.0.1).

Sirve la carpeta del proyecto sin cache y con las mismas cabeceras de
seguridad que _headers. Uso:  python tools/serve.py [puerto]
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8642

CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; "
       "worker-src 'self'; manifest-src 'self'; connect-src 'self'; media-src 'none'; object-src 'none'; "
       "frame-src 'none'; child-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; "
       "require-trusted-types-for 'script'; trusted-types hilo")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map,
                          **{'.webmanifest': 'application/manifest+json', '.js': 'text/javascript',
                             '.hilo': 'application/octet-stream'})

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()


if __name__ == '__main__':
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler) as httpd:
        print('Hilograma MyD en http://localhost:%d  (Ctrl+C para salir)' % PORT)
        httpd.serve_forever()
