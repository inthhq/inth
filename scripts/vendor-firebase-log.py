#!/usr/bin/env python3
"""Check Firebase Analytics against the c15t decision from its own debug log.

Firebase cannot be pointed at the capture server, so the iOS vendor journey
(``examples/native/consent-demo/ios/run-vendor-e2e.sh``) streams the simulator's
unified log as ndjson while ``VendorSDKTests`` runs. The test writes one marker
per step (``inth-vendor-step <step> seq=<n>``) from its runner process, and the
app runs with ``-FIRDebugEnabled -FIRAnalyticsDebugEnabled
-FIRAnalyticsVerboseLoggingEnabled``. Firebase then logs:

  I-ACS023012 / I-ACS023013   collection enabled / disabled
  I-ACS025055                 "... analytics_storage is granted|denied ..."
  I-ACS023051                 "Logging event: ... inth_probe ..."  (accepted)
  I-ACS023049                 "Analytics is disabled. Event not logged"

Each step runs from its marker to the next marker of the same app. Its state is
Firebase's when it logs the probe's outcome (or, before that, when the app logs
``probe <n> sent``). On a fresh install Firebase's own logging starts after the
first probe is sent. Expected per step:

  1-fresh, 2-reject     collection off, storage not granted, probe refused
  3-grant               collection on, storage granted, probe logged
  4-withdraw            collection off, storage denied, probe refused
  5-relaunch            collection off, storage denied, probe refused

Firebase's refusal line never names the event, so a refusal only counts for the
probe when it is the first event outcome after that app's ``probe <n> sent`` line,
within ``PROBE_WINDOW_SECONDS``. Refusals of Firebase's own automatic events are
recorded separately and never satisfy a step. ``--expect`` lists the apps that
must each have produced step markers.

Storage may be unknown before the first decision: on a fresh install Firebase
starts its debug logging after the binding has already denied consent, and the
Info.plist defaults deny it too.

  python3 scripts/vendor-firebase-log.py <device-log.ndjson> <evidence.json> [--expect App1,App2]
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

MARKER = re.compile(r'inth-vendor-step (\S+) seq=(\d+)')
STORAGE = re.compile(r'analytics_storage is (granted|denied)')
PROBE = 'inth_probe'
PROBE_SENT = re.compile(r'^probe \d+ sent$')
# Firebase logs a probe's outcome about 1 ms after the app logs the send.
PROBE_WINDOW_SECONDS = 3.0
EXPECTED = {
    '1-fresh': {'collection': 'disabled', 'storage': {'denied', None}, 'probe': 'refused'},
    '2-reject': {'collection': 'disabled', 'storage': {'denied', None}, 'probe': 'refused'},
    '3-grant': {'collection': 'enabled', 'storage': {'granted'}, 'probe': 'logged'},
    '4-withdraw': {'collection': 'disabled', 'storage': {'denied'}, 'probe': 'refused'},
    '5-relaunch': {'collection': 'disabled', 'storage': {'denied'}, 'probe': 'refused'},
}


def _records(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(errors='replace').splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and row.get('eventMessage') is not None:
            rows.append(row)
    # `log stream` can emit two processes' lines slightly out of order.
    return sorted(rows, key=lambda row: str(row.get('timestamp', '')))


def _time(row: dict) -> float | None:
    try:
        return datetime.strptime(str(row.get('timestamp', '')), '%Y-%m-%d %H:%M:%S.%f%z').timestamp()
    except ValueError:
        return None


def _process(row: dict) -> str:
    return str(row.get('processImagePath', '')).rsplit('/', 1)[-1]


def analyse(rows: list[dict]) -> dict[str, list[dict]]:
    """Return each app's steps with the Firebase state at their end."""
    apps: dict[str, dict] = {}
    for row in rows:
        process = _process(row)
        message = str(row['eventMessage'])
        marker = MARKER.search(message)
        if marker and process.endswith('UITests-Runner'):
            app = apps.setdefault(process.removesuffix('UITests-Runner'), {'state': {}, 'steps': []})
            app['steps'].append({'step': marker.group(1), 'seq': int(marker.group(2)), 'sent': 0, 'logged': 0,
                                 'refused': 0, 'unrelated_refusals': 0, 'lines': []})
            continue
        app = apps.setdefault(process, {'state': {}, 'steps': []})
        state = app['state']
        relevant = True
        if 'I-ACS023012' in message:
            state['collection'] = 'enabled'
        elif 'I-ACS023013' in message:
            state['collection'] = 'disabled'
        elif 'I-ACS025055' in message and (storage := STORAGE.search(message)):
            state['storage'] = storage.group(1)
        elif ('I-ACS023051' in message and PROBE in message) or 'I-ACS023049' in message or PROBE_SENT.search(message):
            if app['steps']:
                step = app['steps'][-1]
                now = _time(row)
                pending = app.get('pending')
                awaiting = pending is not None and now is not None and 0 <= now - pending <= PROBE_WINDOW_SECONDS
                if PROBE_SENT.search(message):
                    step['sent'] += 1
                    app['pending'] = now
                elif 'I-ACS023051' in message:
                    step['logged'] += 1
                    app['pending'] = None
                elif awaiting:
                    step['refused'] += 1
                    app['pending'] = None
                else:
                    step['unrelated_refusals'] += 1
                # Firebase's state when it handled the probe; the send stands in until then.
                step['collection'] = state.get('collection')
                step['storage'] = state.get('storage')
        else:
            relevant = False
        if relevant and app['steps']:
            app['steps'][-1]['lines'].append(f"{row.get('timestamp', '')} {message[:200]}")
    return {name: app['steps'] for name, app in apps.items() if app['steps']}


def failures(apps: dict[str, list[dict]], expected_apps: list[str] | None = None) -> list[str]:
    problems = [f'{app}: no step markers in the device log' for app in expected_apps or [] if app not in apps]
    if not apps:
        return problems or ['No step markers in the device log.']
    for app, steps in apps.items():
        seen = {step['step'] for step in steps}
        for name in EXPECTED:
            if name not in seen:
                problems.append(f'{app}: no {name} step in the log')
        for step in steps:
            expected = EXPECTED.get(step['step'])
            if expected is None:
                continue
            label = f"{app} {step['step']}"
            if step.get('collection') != expected['collection']:
                problems.append(f"{label}: collection {step.get('collection')}, expected {expected['collection']}")
            if step.get('storage') not in expected['storage']:
                problems.append(f"{label}: analytics_storage {step.get('storage')}, expected {sorted(map(str, expected['storage']))}")
            if expected['probe'] == 'logged' and step['logged'] == 0:
                problems.append(f'{label}: Firebase did not log the probe event')
            if step['sent'] == 0:
                problems.append(f'{label}: the app never logged sending the probe')
            if expected['probe'] == 'refused' and (step['logged'] != 0 or step['refused'] == 0):
                problems.append(f"{label}: probe logged {step['logged']} time(s), refused {step['refused']} time(s) "
                                f"(plus {step['unrelated_refusals']} refusal(s) not tied to the probe)")
    return problems


def main(argv: list[str]) -> int:
    expected_apps: list[str] = []
    if len(argv) == 5 and argv[3] == '--expect':
        expected_apps = [app for app in argv[4].split(',') if app]
    elif len(argv) != 3:
        print('Usage: vendor-firebase-log.py <device-log.ndjson> <evidence.json> [--expect App1,App2]', file=sys.stderr)
        return 2
    apps = analyse(_records(Path(argv[1])))
    problems = failures(apps, expected_apps)
    Path(argv[2]).write_text(json.dumps({'apps': apps, 'failures': problems}, indent=1))
    for app, steps in apps.items():
        for step in steps:
            print(f"firebase {app} {step['step']}: collection={step.get('collection')} "
                  f"analytics_storage={step.get('storage')} probe_logged={step['logged']} probe_refused={step['refused']} "
                  f"unrelated_refusals={step['unrelated_refusals']}")
    for problem in problems:
        print(f'FAIL {problem}', file=sys.stderr)
    return 1 if problems else 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
