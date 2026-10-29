#!/usr/bin/env python3
"""Loopback protocol fixture producer. Never substitutes for either native core."""

import argparse
import json
import re
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from time import time
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--port', type=int, default=3000)
parser.add_argument('--scenario', choices=['category', 'iab'], default='category')
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parents[4]
transport = json.loads((root / 'native/protocol/evaluation-eu-fresh-install.json').read_text())['input']['transport']
if args.scenario == 'iab':
    transport = {'status': 200, 'body': json.loads((root / 'native/examples/consent-demo/fixtures/iab-init.json').read_text())}
online = False
# Explicitly authored fixture fallback. No /init identity, receipt or token is exported.
policy = transport['body']['policyResolution']
manifest = {'schemaVersion': 2, 'revision': 'app-e2e-offline-policy-1', 'branding': 'c15t', 'hosting': 'inth',
            'policyPacks': [{'match': {'fallback': True, 'isDefault': True}, 'rule': policy['policy'], 'fingerprints': policy['fingerprints']}]}
state = {}
native_state = {}
js_block = {}
saves = []
lock = Lock()


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('x-c15t-policy-contract', '1')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        with lock:
            if urlsplit(self.path).path == '/api/self-host/manifest':
                self.reply(200, manifest)
            elif urlsplit(self.path).path == '/api/self-host/init':
                if not online:
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                    return
                self.reply(transport['status'], transport['body'])
            elif self.path == '/e2e/state':
                self.reply(200, {**state, 'saves': saves, 'native': native_state, 'jsBlock': js_block, 'backendOnline': online})
            elif self.path == '/health':
                self.reply(200, {'fixture': 'evaluation-eu-fresh-install'})
            else:
                self.reply(404, {'error': 'unexpected route'})

    def do_POST(self):
        global transport, online
        data = self.rfile.read(int(self.headers['Content-Length']))
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
        body = json.loads(data)
        with lock:
            if self.path == '/e2e/scenario':
                transport = {'status': 200, 'body': json.loads((root / 'native/examples/consent-demo/fixtures/iab-init.json').read_text())}
                self.reply(200, {})
            elif self.path == '/e2e/native':
                native_state.clear()
                native_state.update(body)
                native_state['observedAt'] = time()
                (args.out / 'native-observer.json').write_text(json.dumps(body, indent=2))
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
            elif self.path == '/api/self-host/subjects':
                if not online:
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                    return
                if self.headers.get('x-c15t-policy-contract') != '1' or not body.get('choice'):
                    self.reply(400, {'error': 'missing native protocol receipt'})
                    return
                saves.append(body)
                self.reply(200, {})
            else:
                self.reply(404, {'error': 'unexpected route'})
                return
            with (args.out / 'events.jsonl').open('a') as events:
                events.write(json.dumps({'at': time(), 'path': self.path, 'body': body}) + '\n')


server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
(args.out / 'backend-ready').write_text(str(server.server_port))
server.serve_forever()
