#!/usr/bin/env python3
"""Summarise an Expo vendor E2E run and keep runner failures visible.

Reads the journey's vendor steps, the Firebase verdicts from
verify-vendor-firebase.py and the installed versions, then writes result.json,
summary.md and command.xml (a JUnit report for the command itself). A run passes
only when the native journey passed, every step is recorded with the expected
decision, and Firebase followed every step.

Usage: vendor-e2e-result.py <evidence dir> ios|android <runner exit code>
"""
import json
import re
import shutil
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

out, platform, code = Path(sys.argv[1]), sys.argv[2], int(sys.argv[3])
STEPS = {
    'vendor-1-fresh-install': False,
    'vendor-2-reject-all': False,
    'vendor-3-grant-measurement': True,
    'vendor-4-withdraw': False,
    'vendor-5-relaunch-refused': False,
}
VENDORS = ['posthog', 'mixpanel', 'amplitude', 'sentry']


def read_json(name, default):
    path = out / name
    return json.loads(path.read_text()) if path.is_file() and path.stat().st_size else default


# iOS screenshots arrive as XCTest attachments; keep them under readable names.
manifest = out / 'attachments/manifest.json'
if manifest.exists():
    for test in json.loads(manifest.read_text()):
        for attachment in test['attachments']:
            name = attachment.get('suggestedHumanReadableName', '')
            if name.endswith('.png') and re.match(r'^(\d\d-|final-or-failure)', name):
                screen = out / 'screens' / (name.split('_0_')[0] + '.png')
                screen.parent.mkdir(exist_ok=True)
                shutil.copyfile(out / 'attachments' / attachment['exportedFileName'], screen)

steps_path = out / 'vendor-steps.jsonl'
steps = [json.loads(line) for line in steps_path.read_text().splitlines() if line.strip()] if steps_path.exists() else []
firebase = {row['step']: row for row in read_json('vendor-firebase.json', [])}
problems = []
table = []
for name, granted in STEPS.items():
    step = next((row for row in steps if row['step'] == name), None)
    if step is None:
        problems.append(f'{name}: not recorded')
        continue
    if step['granted'] is not granted:
        problems.append(f'{name}: recorded granted={step["granted"]}, expected {granted}')
    checks = firebase.get(name, {}).get('checks')
    if not checks or not all(checks.values()):
        problems.append(f'{name}: Firebase checks {checks}')
    table.append({'step': name, 'granted': granted, 'counts': step['counts'],
                  'firebase': 'logged' if granted and checks and all(checks.values()) else
                              'not logged' if checks and all(checks.values()) else f'failed {checks}'})

if platform == 'ios':
    summary = read_json('test-summary.json', {})
    native_passed = summary.get('result') == 'Passed' and summary.get('passedTests', 0) > 0
else:
    log = out / 'test.log'
    native_passed = log.exists() and 'Android vendor journey passed' in log.read_text()
required = ['journey.mp4', 'final.png', 'versions.json', 'vendor-probes.json', 'vendor-requests.json',
            'screens/01-fresh-prompt.png', 'screens/04-measurement-granted.png', 'screens/07-relaunched-refused.png']
missing = [name for name in required if not (out / name).is_file() or not (out / name).stat().st_size]
if not code and (not native_passed or problems or missing):
    code = 1
cell = (out / 'cell.txt').read_text().strip() if (out / 'cell.txt').exists() else 'fixture'
result = {'cell': cell, 'platform': platform, 'configuration': 'Release', 'exitCode': code,
          'nativeJourneyPassed': native_passed, 'steps': table, 'problems': problems,
          'missingArtifacts': missing, 'versions': read_json('versions.json', {})}
(out / 'result.json').write_text(json.dumps(result, indent=2))

lines = [f'# Expo vendor E2E: {cell}, {platform}', '', f'Exit code {code}.', '',
         '| Step | Measurement | ' + ' | '.join(VENDORS) + ' | firebase |',
         '| --- | --- | ' + ' | '.join('---' for _ in VENDORS) + ' | --- |']
for row in table:
    lines.append(f"| {row['step']} | {'granted' if row['granted'] else 'denied'} | "
                 + ' | '.join(str(row['counts'].get(vendor, 0)) for vendor in VENDORS)
                 + f" | {row['firebase']} |")
lines += ['', 'Counts are capture requests carrying user data; Sentry counts replay uploads only.', '']
lines += [f'- {name}: {version}' for name, version in result['versions'].items()]
if problems or missing:
    lines += ['', 'Problems:', *[f'- {problem}' for problem in problems + [f'missing {name}' for name in missing]]]
(out / 'summary.md').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines))

suite = ET.Element('testsuite', name=f'expo-{cell}-{platform}-vendor-e2e', tests='1', failures=str(int(code != 0)))
case = ET.SubElement(suite, 'testcase', name='Real vendor SDKs follow consent', classname=f'{platform}.ExpoVendorJourney')
if code:
    message = f'Runner exited {code}; native journey passed: {native_passed}; problems: {problems}; missing: {missing}.'
    ET.SubElement(case, 'failure', message=message).text = '\n'.join(
        (out / name).read_text(errors='replace')[-6000:] for name in ['build.log', 'test.log'] if (out / name).exists())
ET.ElementTree(suite).write(out / 'command.xml', encoding='utf-8', xml_declaration=True)
sys.exit(int(code != 0))
