#!/usr/bin/env python3
"""Check Firebase Analytics against each vendor step, from Firebase's own debug log.

Firebase cannot be pointed at the capture server, so the journey's vendor steps
(vendor-steps.jsonl) are checked here instead. For every probe:

  granted  Firebase logs the probe event, and at probe time the latest collection
           state is enabled and analytics_storage is granted.
  refused  Firebase never logs the probe event as logged, and at probe time
           collection is disabled and analytics_storage is denied.

"At probe time" is the latest state logged before the probe starts, or, when
Firebase has logged none yet, the first one logged within 2 seconds after.

Probe times come from vendor-probes.json (device epoch ms). iOS reads the
simulator's `log stream` (host clock, local time). Firebase's iOS debug log has
no consent line, so analytics_storage comes from the consent_settings_3p value
Firebase writes to its APMAnalyticsSuiteName defaults, which the OS logs.
Android reads `logcat -v epoch`.
Usage: verify-vendor-firebase.py <evidence dir> ios|android
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

out, platform = Path(sys.argv[1]), sys.argv[2]
steps = [json.loads(line) for line in (out / 'vendor-steps.jsonl').read_text().splitlines() if line.strip()]
probes = {probe['name']: probe for probe in json.loads((out / 'vendor-probes.json').read_text())}

COLLECTION = re.compile(r'(?:analytics collection|measurement enabled)\D{0,40}?(?P<state>enabled|disabled|true|false)', re.I)
STORAGE = re.compile(r'analytics_storage\W{0,6}(?P<state>granted|denied|true|false|1|0)\b', re.I)
# Seconds after a probe starts in which a state Firebase logs still counts for it.
LOG_GRACE_S = 2.0
# iOS: 'Logging event: …' and 'Event logged. …'; Android: 'Logging event (FE): …'.
LOGGED = re.compile(r'Logging event|Event logged', re.I)


def parse(path: Path) -> list[tuple[float, str]]:
    lines: list[tuple[float, str]] = []
    block: tuple[float, list[str]] | None = None
    for raw in path.read_text(errors='replace').splitlines():
        if platform == 'android':
            match = re.match(r'\s*(\d+\.\d+)\s+\d+\s+\d+\s+\w\s+(FA|FA-SVC)\s*:\s?(.*)', raw)
            if match:
                lines.append((float(match.group(1)), match.group(3)))
            continue
        if block is not None:
            block[1].append(raw)
            if 'Domain: ' in raw:
                if 'APMAnalyticsSuiteName' in raw:
                    lines.append((block[0], ' '.join(block[1])))
                block = None
            continue
        match = re.match(r'(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+(.*)', raw)
        if not match:
            continue
        at = datetime.strptime(match.group(1)[:26], '%Y-%m-%d %H:%M:%S.%f').timestamp()
        if '[com.apple.defaults:User Defaults] setting {' in raw:
            block = (at, [raw])
        elif re.search(r'\[FirebaseAnalytics\]|I-ACS', raw):
            lines.append((at, match.group(2)))
    return lines


def latest(lines, before: float, pattern: re.Pattern) -> tuple[str, str] | None:
    found = None
    for at, text in lines:
        if at > before:
            break
        match = pattern.search(text)
        if match:
            found = (match.group('state').lower(), text)
    return found


log = out / ('firebase.log' if platform == 'android' else 'app-stream.log')
lines = parse(log) if log.exists() else []
print(f'{len(lines)} Firebase lines from {log.name}')
failures: list[str] = []
report = []
for step in steps:
    name = step.get('probe')
    probe = probes.get(name or '')
    if probe is None:
        failures.append(f"{step['step']}: no probe report for {name}")
        continue
    granted = bool(step['granted'])
    mentions = [text for _, text in lines if name in text]
    logged = [text for text in mentions if LOGGED.search(text)]
    # Read the state Firebase held when it handled the probe. Before each probe
    # the journey re-syncs every integration, and the Firebase helper turns
    # collection off before applying consent, then on again. Firebase logs
    # settings on its own thread, so they can land a moment after the probe
    # starts. A logged probe marks the moment Firebase accepted it. Otherwise
    # take the latest state up to LOG_GRACE_S after the start: a refused probe
    # that Firebase had in fact accepted already fails the event check.
    logged_at = next((when for when, text in lines if name in text and LOGGED.search(text)), None)
    at = logged_at if logged_at is not None else probe['startedAt'] / 1000 + LOG_GRACE_S
    collection = latest(lines, at, COLLECTION)
    storage = latest(lines, at, STORAGE)
    want_on = {'enabled', 'true', 'granted', '1'}
    checks = {
        'collection': collection is not None and (collection[0] in want_on) == granted,
        'analytics_storage': storage is not None and (storage[0] in want_on) == granted,
        'event': bool(logged) == granted,
    }
    report.append({'step': step['step'], 'probe': name, 'granted': granted, 'checks': checks,
                   'collection': collection, 'analytics_storage': storage, 'mentions': mentions})
    for check, ok in checks.items():
        if not ok:
            failures.append(f"{step['step']}: Firebase {check} does not match granted={granted}")
(out / 'vendor-firebase.json').write_text(json.dumps(report, indent=2))
for row in report:
    print(json.dumps({key: row[key] for key in ('step', 'granted', 'checks')}))
if failures:
    print('\n'.join(failures))
    sys.exit(1)
print('Firebase followed every c15t decision')
