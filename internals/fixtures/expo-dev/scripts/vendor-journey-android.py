#!/usr/bin/env python3
"""The real-vendor consent journey for the Expo E2E build, on Android.

The steps and traffic rules match the vendor steps in the bare fixture's
UIAutomator journey (react-native-bare/android/e2e/.../consent-journey.kt) and
the iOS half of this journey (vendor-journey.swift): a fresh install and a
refusal send no user data, a measurement grant delivers the probe, a withdrawal
stops every vendor once in-flight uploads settle, and a relaunch keeps the
refusal. It drives the installed app over adb with UIAutomator dumps, so it
does not depend on the Gradle setup of each Expo SDK. vendor-e2e.sh runs it and
checks Firebase from its log afterwards.

Usage: vendor-journey-android.py --serial emulator-5560 --backend http://127.0.0.1:39875 --out <dir>
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('--serial', required=True)
parser.add_argument('--backend', required=True, help='E2E backend origin as the host reaches it')
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--package', default='com.inth.expodev')
args = parser.parse_args()
out = args.out.resolve()
screens = out / 'screens'
screens.mkdir(parents=True, exist_ok=True)
adb = str(Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'Library/Android/sdk'))) / 'platform-tools/adb')
# Vendors whose traffic the capture server records. Firebase is checked from its log.
TRAFFIC_VENDORS = ['posthog', 'mixpanel', 'amplitude', 'sentry']
# Longer than Sentry's 5-second replay upload interval.
VENDOR_QUIET_SECONDS = 6


class JourneyFailure(AssertionError):
    pass


def check(condition: bool, message: str) -> None:
    if not condition:
        raise JourneyFailure(message)


def device(*command: str) -> str:
    return subprocess.run([adb, '-s', args.serial, *command], check=True, text=True, capture_output=True).stdout


def fetch_json(path: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(args.backend + path, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.load(response)


# MARK: UI

def hierarchy() -> ET.Element:
    for _ in range(5):
        dumped = device('exec-out', 'uiautomator', 'dump', '/dev/tty')
        start, end = dumped.find('<?xml'), dumped.rfind('</hierarchy>')
        if start != -1 and end != -1:
            return ET.fromstring(dumped[start:end + len('</hierarchy>')])
        time.sleep(0.5)
    raise JourneyFailure(f'UIAutomator returned no hierarchy: {dumped[-400:]}')


def find(root: ET.Element, resource_id: str) -> ET.Element | None:
    return next((node for node in root.iter('node') if node.get('resource-id') == resource_id), None)


def await_node(resource_id: str, timeout: float = 30, matches=lambda node: True) -> ET.Element:
    deadline = time.monotonic() + timeout
    while True:
        root = hierarchy()
        node = find(root, resource_id)
        if node is not None and matches(node):
            return node
        if time.monotonic() > deadline:
            (out / 'failure-hierarchy.xml').write_text(ET.tostring(root, encoding='unicode'))
            raise JourneyFailure(f'Timed out waiting for {resource_id}; last {None if node is None else node.attrib}')
        time.sleep(0.3)


def bounds(node: ET.Element) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
    return x1, y1, x2, y2


def tap(resource_id: str) -> None:
    x1, y1, x2, y2 = bounds(await_node(resource_id))
    device('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))


def reveal(resource_id: str) -> ET.Element:
    """Scroll the native preferences until the control sits above the pinned buttons."""
    for _ in range(12):
        root = hierarchy()
        node = find(root, resource_id)
        # Reject All is always in the footer. Save can sit in the top app bar, so it is no floor.
        pinned = [find(root, 'inth.prefs.reject-all')]
        floor = min((bounds(item)[1] for item in pinned if item is not None), default=10**6)
        if node is not None and bounds(node)[3] < floor - 8:
            return node
        scrollable = next((item for item in root.iter('node') if item.get('scrollable') == 'true'), None)
        check(scrollable is not None, f'No native scroll container for {resource_id}')
        x1, y1, x2, y2 = bounds(scrollable)
        middle = (x1 + x2) // 2
        device('shell', 'input', 'swipe', str(middle), str(y2 - (y2 - y1) // 5), str(middle), str(y1 + (y2 - y1) // 5), '400')
        time.sleep(0.5)
    raise JourneyFailure(f'Not reachable: {resource_id}')


def await_label(resource_id: str, value: str) -> None:
    await_node(resource_id, matches=lambda node: node.get('text') == value)


def capture(name: str) -> None:
    time.sleep(0.5)
    (screens / f'{name}.xml').write_text(ET.tostring(hierarchy(), encoding='unicode'))
    with (screens / f'{name}.png').open('wb') as file:
        subprocess.run([adb, '-s', args.serial, 'exec-out', 'screencap', '-p'], stdout=file, check=True)


def launch() -> None:
    device('shell', 'am', 'force-stop', args.package)
    device('shell', 'am', 'start', '-W', '-n', f'{args.package}/.MainActivity')


# MARK: Real vendor SDKs

def vendor_probes() -> list[dict]:
    return fetch_json('/e2e/state').get('vendorProbes', [])


def governed_capture(since: int) -> tuple[int, list[dict]]:
    """Capture requests after since. Sentry counts only replay items, the part Inth controls."""
    captured = fetch_json(f'/captured?kind=capture&since={since}')
    rows = [row for row in captured['requests']
            if row['vendor'] != 'sentry' or any(item.startswith('replay_') for item in row.get('items', []))]
    return captured['last'], rows


def counts(rows: list[dict]) -> dict[str, int]:
    return {vendor: sum(1 for row in rows if row['vendor'] == vendor) for vendor in TRAFFIC_VENDORS}


def await_vendor_probe(after: int, reason: str, measurement: bool) -> dict:
    """Wait for the probe the app reports after `after` earlier ones. Each SDK must accept the calls."""
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        probe = next((row for row in vendor_probes()[after:] if row.get('reason') == reason), None)
        if probe is not None:
            check(probe.get('started') is True, f'Vendor SDKs did not start: {probe}')
            check(not probe.get('errors'), f'Vendor SDK errors: {probe}')
            check(probe.get('measurementAllowed') is measurement, f'Probe ran with the wrong decision: {probe}')
            return probe
        time.sleep(0.25)
    raise JourneyFailure(f'No {reason} vendor probe after {after}')


def send_vendor_probe(measurement: bool) -> dict:
    count = len(vendor_probes())
    tap('fixture.vendor-probe')
    return await_vendor_probe(count, 'button', measurement)


def record_vendor_step(step: str, probe: dict, granted: bool, since: int, rows: list[dict], extra: dict | None = None) -> None:
    body = {'step': step, 'probe': probe.get('name'), 'granted': granted, 'since': since,
            'counts': counts(rows), 'requests': rows, **(extra or {})}
    fetch_json('/e2e/vendor-step', body)
    (out / f'{step}.json').write_text(json.dumps(body, indent=2, sort_keys=True))


def assert_vendors_silent(step: str, since: int, probe: dict, extra: dict | None = None) -> None:
    """No vendor may send user data after since. An absence needs a window: Mixpanel's
    native flush returns before its upload, and Sentry uploads replay every 5 seconds."""
    until = time.monotonic() + 8
    last, rows = governed_capture(since)
    while not rows and time.monotonic() < until:
        time.sleep(0.5)
        last, rows = governed_capture(since)
    record_vendor_step(step, probe, False, since, rows, extra)
    check(not rows, f'{step}: vendors sent user data without consent: {rows}')


def assert_vendors_capture(step: str, since: int, probe: dict) -> None:
    """Every SDK sends the probe event, and Sentry uploads replay, once measurement is granted."""
    name = probe['name']

    def sent(rows: list[dict], vendor: str) -> bool:
        return any(row['vendor'] == vendor and (vendor == 'sentry' or name in row.get('events', [])) for row in rows)

    deadline = time.monotonic() + 60
    _, rows = governed_capture(since)
    while not all(sent(rows, vendor) for vendor in TRAFFIC_VENDORS) and time.monotonic() < deadline:
        time.sleep(0.5)
        _, rows = governed_capture(since)
    record_vendor_step(step, probe, True, since, rows)
    for vendor in TRAFFIC_VENDORS:
        check(sent(rows, vendor), f"{step}: {vendor} sent no {'replay' if vendor == 'sentry' else name} after granting measurement: {rows}")


def vendor_traffic_settles(after: int) -> tuple[int, list[dict]]:
    """Withdrawal may finish uploads already in flight; Sentry documents a final replay
    segment after stop and uploads replay every 5 seconds. Wait until vendor traffic
    has been quiet for longer than that interval."""
    deadline = time.monotonic() + 30
    last, rows = governed_capture(after)
    quiet_since, seen = time.monotonic(), len(rows)
    while time.monotonic() - quiet_since < VENDOR_QUIET_SECONDS and time.monotonic() < deadline:
        time.sleep(0.5)
        last, rows = governed_capture(after)
        if len(rows) != seen:
            quiet_since, seen = time.monotonic(), len(rows)
    check(time.monotonic() - quiet_since >= VENDOR_QUIET_SECONDS, f'Vendor traffic did not stop after withdrawal: {rows}')
    return last, rows


# MARK: Journey

def journey() -> None:
    # The runner installs into a new AVD, so the app has no stored subject.
    launch()
    # Vendor step 1: a fresh install sends nothing, including the launch probe.
    assert_vendors_silent('vendor-1-fresh-install', 0, await_vendor_probe(0, 'startup', False))
    await_node('inth.first-layer.reject-all', timeout=60)
    capture('01-fresh-prompt')

    tap('inth.first-layer.reject-all')
    await_label('fixture.prompt', 'prompt:none')
    capture('02-rejected')
    # Vendor step 2: a refusal keeps every vendor silent.
    reject_seq = governed_capture(0)[0]
    assert_vendors_silent('vendor-2-reject-all', reject_seq, send_vendor_probe(False))

    tap('fixture.open-preferences')
    switch = reveal('inth.prefs.category.measurement.switch')
    check(switch.get('checked') == 'false', f'Measurement started on: {switch.attrib}')
    tap('inth.prefs.category.measurement.switch')
    await_node('inth.prefs.category.measurement.switch', matches=lambda node: node.get('checked') == 'true')
    capture('03-measurement-switched-on')
    tap('inth.prefs.save')
    await_label('fixture.measurement', 'measurement:granted')
    capture('04-measurement-granted')
    # Vendor step 3: measurement is the category every helper defaults to.
    grant_seq = governed_capture(0)[0]
    assert_vendors_capture('vendor-3-grant-measurement', grant_seq, send_vendor_probe(True))

    tap('fixture.open-preferences')
    await_node('inth.prefs.reject-all')
    capture('05-preferences-before-withdrawal')
    tap('inth.prefs.reject-all')
    await_label('fixture.measurement', 'measurement:denied')
    capture('06-withdrawn')
    # Vendor step 4: after in-flight uploads settle, a withdrawal stops every vendor.
    withdraw_seq, in_flight = vendor_traffic_settles(governed_capture(0)[0])
    assert_vendors_silent('vendor-4-withdraw', withdraw_seq, send_vendor_probe(False), {'inFlightAfterWithdrawal': in_flight})

    probes_before_relaunch = len(vendor_probes())
    launch()
    # Vendor step 5: the saved refusal holds across a relaunch.
    assert_vendors_silent('vendor-5-relaunch-refused', withdraw_seq, await_vendor_probe(probes_before_relaunch, 'startup', False))
    await_label('fixture.prompt', 'prompt:none')
    await_label('fixture.measurement', 'measurement:denied')
    capture('07-relaunched-refused')


try:
    journey()
finally:
    try:
        capture('final-or-failure')
    except Exception as error:  # noqa: BLE001 - evidence must not hide the journey's failure
        print(f'Could not capture the final frame: {error}')
print('Android vendor journey passed')
