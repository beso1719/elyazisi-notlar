# Geliştirme sunucusu — tarayıcı önbelleğini devre dışı bırakır (eski JS sorunlarını önler).
# Çalıştır:  py serve.py    →  http://localhost:8000
import http.server, socketserver

PORT = 8000

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

with socketserver.TCPServer(('', PORT), NoCache) as httpd:
    print(f'http://localhost:{PORT}  (Ctrl+C ile durdur)')
    httpd.serve_forever()
