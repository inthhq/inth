#!/usr/bin/env python3
"""Loopback protocol fixture producer. Never substitutes for either native core."""

import argparse
import json
import re
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from time import time
from urllib.parse import unquote, urlsplit
from uuid import uuid4

parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--port', type=int, default=3000)
parser.add_argument('--scenario', choices=['category', 'iab', 'expiry', 'adapter'], default='category')
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(root / 'scripts'))
from vendor_capture import VendorCapture, read_body  # noqa: E402

# Real vendor SDKs in the app send here; the journeys read /captured.
capture = VendorCapture(args.out)
vendor_probes = []
transport = json.loads((root / 'packages/native-protocol/evaluation-eu-fresh-install.json').read_text())['input']['transport']
if args.scenario == 'iab':
    transport = {'status': 200, 'body': json.loads((root / 'examples/native/consent-demo/fixtures/iab-init.json').read_text())}
online = False
# Explicitly authored fixture fallback. No /init identity, receipt or token is exported.
policy = transport['body']['policyResolution']
manifest = {'schemaVersion': 2, 'revision': 'app-e2e-offline-policy-1', 'branding': 'c15t', 'hosting': 'inth',
            'policyPacks': [{'match': {'fallback': True, 'isDefault': True}, 'rule': policy['policy'], 'fingerprints': policy['fingerprints']}]}
state = {}
native_state = {}
js_block = {}
# Fixed fixture times, unrelated to the reference app's disclosure ages.
control = {'now': 1793232000000, 'expiresAt': 1793232001000,
           'categories': ['necessary', 'functionality', 'experience', 'measurement', 'marketing']} if args.scenario == 'expiry' else {}
saves = []
# idempotencyKey -> (subjectId, property, response): a key is recorded once, as on /v1.
recorded = {}
lock = Lock()
# The cores' base URL is this prefix; they call only the three /v1 routes under it.
BASE = '/api/self-host'
INIT = BASE + '/v1/consent/init'
RECORDS = BASE + '/v1/consent/records'
LINK = re.compile(re.escape(BASE) + r'/v1/subjects/([^/]+)/link')


def records_problem(body):
    """Why a records body is not the /v1 shape, or None."""
    if not isinstance(body, dict):
        return 'body is not an object'
    for field in ('idempotencyKey', 'subjectId', 'property', 'consentAction'):
        if not isinstance(body.get(field), str) or not body[field]:
            return field + ' is required'
    categories = (body.get('answer') or {}).get('categories') if isinstance(body.get('answer'), dict) else None
    if not isinstance(categories, dict) or set(body['answer']) != {'categories'}:
        return 'answer must be { categories }'
    confirmed = body.get('confirmed')
    if not isinstance(confirmed, list) or not set(confirmed) <= set(categories):
        return 'confirmed must name keys of answer.categories'
    return None


class Handler(BaseHTTPRequestHandler):
    def vendor(self, body=b''):
        """Serve /vendor/* and /captured*, or return False for the fixture routes."""
        result = capture.handle(self.command, self.path, self.headers, body)
        if result is None:
            return False
        status, content_type, data = result
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        return True

    def do_PUT(self):
        if not self.vendor(read_body(self)):
            self.reply(404, {'error': 'unexpected route'})

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('x-request-id', self.request_id)
        self.end_headers()
        self.wfile.write(data)

    def fail(self, status, code, message):
        """The /v1 error body."""
        self.reply(status, {'error': {'code': code, 'message': message}, 'requestId': self.request_id})

    def parse_request(self):
        self.request_id = 'req_' + uuid4().hex
        return super().parse_request()

    def do_GET(self):
        if self.vendor():
            return
        with lock:
            if urlsplit(self.path).path == '/api/self-host/manifest':
                self.reply(200, manifest)
            elif urlsplit(self.path).path == INIT:
                if not online:
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                    return
                self.reply(transport['status'], transport['body'])
            elif self.path == '/e2e/control':
                self.reply(200, control)
            elif self.path == '/e2e/state':
                self.reply(200, {**state, 'saves': saves, 'native': native_state, 'jsBlock': js_block, 'backendOnline': online, 'vendorProbes': vendor_probes})
            elif self.path == '/health':
                self.reply(200, {'fixture': 'evaluation-eu-fresh-install'})
            else:
                self.fail(404, 'not_found', 'unexpected route')

    def do_POST(self):
        global transport, online
        data = read_body(self)
        if self.vendor(data):
            return
        if self.path.startswith('/e2e/artifacts/'):
            name = self.path.removeprefix('/e2e/artifacts/')
            if not re.fullmatch(r'[a-z0-9-]+\.(png|xml|json)', name):
                self.reply(400, {'error': 'invalid artifact name'})
                return
            screens = args.out / 'screens'
            screens.mkdir(exist_ok=True)
            (screens / name).write_bytes(data)
            self.reply(200, {})
            return
        try:
            body = json.loads(data)
        except ValueError:
            self.fail(400, 'invalid_request', 'body is not JSON')
            return
        path = urlsplit(self.path).path
        link = LINK.fullmatch(path)
        with lock:
            if self.path == '/e2e/control':
                if args.scenario != 'expiry' or set(body) - {'now', 'categories'}:
                    self.reply(400, {'error': 'fixture controls unavailable'})
                    return
                control.update(body)
                self.reply(200, control)
            elif self.path == '/e2e/scenario':
                fixture = 'notice-init.json' if body.get('kind') == 'notice' else 'iab-init.json'
                transport = {'status': 200, 'body': json.loads((root / 'examples/native/consent-demo/fixtures' / fixture).read_text())}
                if body.get('kind') == 'fallback':
                    transport = {'status': 200, 'body': {'policyResolution': {'version': 1, 'status': 'no-match', 'policy': None}}}
                self.reply(200, {})
            elif self.path == '/e2e/native':
                native_state.clear()
                native_state.update(body)
                native_state['observedAt'] = time()
                (args.out / 'native-observer.json').write_text(json.dumps(body, indent=2))
                self.reply(200, {})
            elif self.path == '/e2e/vendor-probe':
                body['receivedAt'] = time()
                vendor_probes.append(body)
                (args.out / 'vendor-probes.json').write_text(json.dumps(vendor_probes, indent=2))
                self.reply(200, {'count': len(vendor_probes)})
            elif self.path == '/e2e/vendor-step':
                # The journey's verdict per step, read by verify-vendor-firebase.py.
                with (args.out / 'vendor-steps.jsonl').open('a') as steps:
                    steps.write(json.dumps({**body, 'at': time()}) + '\n')
                self.reply(200, {})
            elif self.path == '/e2e/js-block':
                js_block.update(body)
                js_block['observedAt'] = time()
                self.reply(200, {})
            elif self.path == '/e2e/network':
                online = body['online'] is True
                self.reply(200, {'online': online})
            elif self.path == '/e2e/state':
                body['snapshot'] = json.loads(body['snapshot']) if body['snapshot'] else None
                body['bootstrap'] = json.loads(body['bootstrap']) if body.get('bootstrap') else None
                state.clear()
                state.update(body)
                (args.out / 'native-state.json').write_text(json.dumps({**state, 'saves': saves, 'native': native_state, 'jsBlock': js_block, 'backendOnline': online}, indent=2))
                self.reply(200, {})
            elif path == RECORDS:
                with (args.out / 'delivery-attempts.jsonl').open('a') as attempts:
                    attempts.write(json.dumps({'at': time(), 'online': online, 'rawHex': data.hex(), 'body': body}) + '\n')
                if not online:
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                    return
                problem = records_problem(body)
                if problem:
                    self.fail(400, 'invalid_request', problem)
                    return
                key = body['idempotencyKey']
                if key in recorded:
                    subject, prop, response = recorded[key]
                    if (subject, prop) != (body['subjectId'], body['property']):
                        self.fail(409, 'conflict', 'idempotencyKey was recorded for another subject or property')
                        return
                    # A resend of a recorded action: the same answer, recorded once.
                    self.reply(200, response)
                    return
                response = {'subjectId': body['subjectId'], 'recordId': str(uuid4())}
                if 'externalId' in body:
                    response['link'] = {'stored': False, 'reason': 'unverified'}
                recorded[key] = (body['subjectId'], body['property'], response)
                saves.append(body)
                self.reply(200, response)
            elif link:
                if not online:
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                    return
                if not isinstance(body.get('externalId'), str):
                    self.fail(400, 'invalid_request', 'externalId is required')
                    return
                if not body.get('identityToken'):
                    self.fail(401, 'identity_token_required', 'a device links only with an identity token')
                    return
                self.reply(200, {'subjectId': unquote(link.group(1)), 'externalId': body['externalId'], 'verifiedBy': 'identity_token'})
            else:
                self.fail(404, 'not_found', 'unexpected route')
                return
            with (args.out / 'events.jsonl').open('a') as events:
                events.write(json.dumps({'at': time(), 'path': self.path, 'body': body}) + '\n')


server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
(args.out / 'backend-ready').write_text(str(server.server_port))
server.serve_forever()
