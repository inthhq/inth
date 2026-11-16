#!/usr/bin/env python3
"""Record what real vendor SDKs send, so consent tests can assert on traffic.

Point each SDK at ``<base>/vendor/<vendor>``:

  posthog    host = <base>/vendor/posthog
  mixpanel   serverURL = <base>/vendor/mixpanel
  amplitude  serverUrl = <base>/vendor/amplitude/2/httpapi
  sentry     dsn = http://public@<host:port>/vendor/sentry/1

Every request is answered the way the vendor would answer it and recorded with
its kind: ``capture`` carries user data (events, replay, profiles), ``config``
fetches settings or flags, ``other`` is anything else. Consent tests assert on
``capture``; PostHog documents that opt-out does not stop ``config`` fetches.

  GET  /captured[?vendor=posthog&since=<seq>&kind=capture]   recorded requests
  POST /captured/reset                                       forget everything
  GET  /health

Standalone: ``python3 scripts/vendor_capture.py --port 39874 --out <dir>``.
``handle()`` lets another loopback server (the RN e2e backend) serve the same
routes on its own port.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from time import time
from urllib.parse import parse_qs, unquote_plus, urlsplit

VENDORS = ('posthog', 'mixpanel', 'amplitude', 'sentry')
SENTRY_CAPTURE_ITEMS = {'event', 'transaction', 'attachment', 'replay_event', 'replay_recording', 'replay_video', 'profile', 'profile_chunk', 'log', 'feedback'}


def _decode(body: bytes, encoding: str | None) -> bytes:
    encoding = (encoding or '').lower()
    try:
        if encoding == 'gzip' or body[:2] == b'\x1f\x8b':
            return gzip.decompress(body)
        if encoding == 'deflate':
            return zlib.decompress(body)
    except (OSError, zlib.error):
        return body
    return body


def _json(text: str):
    try:
        return json.loads(text)
    except ValueError:
        return None


def _mixpanel_rows(text: str, query: dict[str, list[str]]):
    """Mixpanel sends ``data=<json or base64 json>`` as a form body or query."""
    raw = parse_qs(text).get('data') or query.get('data')
    if not raw:
        parsed = _json(text)
        return parsed if isinstance(parsed, list) else [parsed] if isinstance(parsed, dict) else []
    value = raw[0]
    parsed = _json(value) or _json(unquote_plus(value))
    if parsed is None:
        try:
            parsed = _json(base64.b64decode(value + '=' * (-len(value) % 4)).decode())
        except (ValueError, UnicodeDecodeError):
            parsed = None
    return parsed if isinstance(parsed, list) else [parsed] if isinstance(parsed, dict) else []


def _sentry_items(body: bytes) -> list[str]:
    """Envelope: header line, then (item header, payload) pairs."""
    types: list[str] = []
    lines = body.split(b'\n')
    index = 1
    while index < len(lines):
        header = _json(lines[index].decode(errors='replace')) if lines[index].strip() else None
        index += 1
        if not isinstance(header, dict) or 'type' not in header:
            continue
        types.append(str(header['type']))
        length = header.get('length')
        if isinstance(length, int):
            # Payloads with an explicit length may contain newlines (replay video).
            consumed = 0
            while index < len(lines) and consumed < length:
                consumed += len(lines[index]) + 1
                index += 1
        else:
            index += 1
    return types


def classify(vendor: str, method: str, path: str, body: bytes, encoding: str | None = None) -> dict:
    """Describe one vendor request: its kind, event names and envelope items."""
    split = urlsplit(path)
    route = split.path
    query = parse_qs(split.query)
    data = _decode(body, encoding)
    text = data.decode(errors='replace')
    events: list[str] = []
    items: list[str] = []
    kind = 'other'
    if vendor == 'posthog':
        if any(segment in route for segment in ('/flags', '/decide', '/array/', '/api/surveys', '/config')):
            kind = 'config'
        elif any(route.rstrip('/').endswith(suffix) for suffix in ('/batch', '/e', '/capture', '/track', '/engage', '/s', '/i/v0/e')):
            kind = 'capture'
            parsed = _json(text)
            rows = parsed.get('batch') if isinstance(parsed, dict) and 'batch' in parsed else parsed
            rows = rows if isinstance(rows, list) else [rows] if isinstance(rows, dict) else []
            events = [str(row.get('event')) for row in rows if isinstance(row, dict) and row.get('event')]
    elif vendor == 'mixpanel':
        if any(route.rstrip('/').endswith(suffix) for suffix in ('/track', '/engage', '/groups', '/import')):
            kind = 'capture'
            events = [str(row.get('event') or ('$engage' if '/engage' in route else '$groups')) for row in _mixpanel_rows(text, query) if isinstance(row, dict)]
        elif '/decide' in route or '/flags' in route:
            kind = 'config'
    elif vendor == 'amplitude':
        if route.rstrip('/').endswith(('/2/httpapi', '/batch')):
            kind = 'capture'
            parsed = _json(text)
            rows = parsed.get('events', []) if isinstance(parsed, dict) else []
            events = [str(row.get('event_type')) for row in rows if isinstance(row, dict) and row.get('event_type')]
        elif '/config' in route or '/remote' in route:
            kind = 'config'
    elif vendor == 'sentry':
        if route.rstrip('/').endswith(('/envelope', '/store')):
            items = _sentry_items(data) if route.rstrip('/').endswith('/envelope') else ['event']
            kind = 'capture' if any(item in SENTRY_CAPTURE_ITEMS for item in items) else 'other'
    return {'vendor': vendor, 'method': method, 'path': route, 'kind': kind, 'events': events, 'items': items, 'bytes': len(data)}


def reply_for(vendor: str, path: str) -> tuple[int, str, bytes]:
    route = urlsplit(path).path
    if vendor == 'posthog':
        if '/flags' in route or '/decide' in route:
            return 200, 'application/json', json.dumps({'flags': {}, 'featureFlags': {}, 'featureFlagPayloads': {}, 'errorsWhileComputingFlags': False, 'sessionRecording': False}).encode()
        return 200, 'application/json', b'{"status":1}'
    if vendor == 'mixpanel':
        if '/decide' in route or '/flags' in route:
            return 200, 'application/json', b'{"notifications":[],"surveys":[],"flags":{}}'
        return 200, 'text/plain', b'1'
    if vendor == 'amplitude':
        return 200, 'application/json', b'{"code":200,"events_ingested":1,"payload_size_bytes":1,"server_upload_time":0}'
    if vendor == 'sentry':
        return 200, 'application/json', b'{}'
    return 404, 'application/json', b'{"error":"unknown vendor"}'


class VendorCapture:
    """Thread-safe request log. ``out`` receives ``vendor-requests.json``."""

    def __init__(self, out: Path | None = None):
        self.out = out
        self.lock = Lock()
        self.requests: list[dict] = []

    def _persist(self) -> None:
        if self.out is not None:
            self.out.mkdir(parents=True, exist_ok=True)
            (self.out / 'vendor-requests.json').write_text(json.dumps(self.requests, indent=1))

    def handle(self, method: str, path: str, headers, body: bytes) -> tuple[int, str, bytes] | None:
        """Serve a capture route, or return None so the caller can serve it."""
        split = urlsplit(path)
        if split.path.startswith('/vendor/'):
            vendor = split.path.split('/')[2]
            if vendor not in VENDORS:
                return 404, 'application/json', b'{"error":"unknown vendor"}'
            inner = '/' + '/'.join(split.path.split('/')[3:]) + (f'?{split.query}' if split.query else '')
            record = classify(vendor, method, inner, body, headers.get('Content-Encoding'))
            with self.lock:
                record['seq'] = len(self.requests) + 1
                record['at'] = round(time() * 1000)
                self.requests.append(record)
                self._persist()
            return reply_for(vendor, inner)
        if split.path == '/captured' and method == 'GET':
            query = parse_qs(split.query)
            since = int(query.get('since', ['0'])[0])
            with self.lock:
                rows = [row for row in self.requests if row['seq'] > since
                        and ('vendor' not in query or row['vendor'] == query['vendor'][0])
                        and ('kind' not in query or row['kind'] == query['kind'][0])]
                last = len(self.requests)
            return 200, 'application/json', json.dumps({'last': last, 'requests': rows}).encode()
        if split.path == '/captured/reset' and method == 'POST':
            with self.lock:
                self.requests.clear()
                self._persist()
            return 200, 'application/json', b'{"last":0}'
        return None


def read_body(handler) -> bytes:
    """Read a fixed-length or chunked request body. Vendor SDKs send both."""
    if handler.headers.get('Transfer-Encoding', '').lower() == 'chunked':
        data = b''
        while True:
            size = int(handler.rfile.readline().split(b';')[0].strip() or b'0', 16)
            if size == 0:
                handler.rfile.readline()
                return data
            data += handler.rfile.read(size)
            handler.rfile.readline()
    length = int(handler.headers.get('Content-Length') or 0)
    return handler.rfile.read(length) if length else b''


def serve(port: int, out: Path | None) -> None:
    capture = VendorCapture(out)

    class Handler(BaseHTTPRequestHandler):
        def _serve(self) -> None:
            body = read_body(self)
            result = capture.handle(self.command, self.path, self.headers, body)
            if result is None and self.path == '/health':
                result = 200, 'application/json', b'{"ok":true}'
            status, content_type, data = result or (404, 'application/json', b'{"error":"not found"}')
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        do_GET = do_POST = do_PUT = _serve

        def log_message(self, *_args) -> None:
            pass

    # Loopback only: simulators share the host's network, and Android reaches it
    # through `adb reverse` or 10.0.2.2. A wildcard address would also make
    # HTTPServer resolve the host's own name, which can stall on CI machines.
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    if out is not None:
        out.mkdir(parents=True, exist_ok=True)
        # Port 0 asks the OS for a free port; report the one it chose.
        (out / 'vendor-capture-ready').write_text(str(server.server_address[1]))
    server.serve_forever()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=39874)
    parser.add_argument('--out', type=Path)
    arguments = parser.parse_args()
    serve(arguments.port, arguments.out)
