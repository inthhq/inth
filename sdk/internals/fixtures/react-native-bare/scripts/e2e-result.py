#!/usr/bin/env python3
"""Keep command failures visible even when no native test report was produced."""
import json
import re
import shutil
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

out, platform, code = Path(sys.argv[1]), sys.argv[2], int(sys.argv[3])
summary = out / 'test-summary.json'
native = json.loads(summary.read_text()) if summary.exists() and summary.stat().st_size else {}
manifest = out / 'attachments/manifest.json'
if manifest.exists():
    for test in json.loads(manifest.read_text()):
        for attachment in test['attachments']:
            name = attachment.get('suggestedHumanReadableName', '')
            if name.endswith('.png') and re.match(r'^(\d\d-|final-or-failure)', name):
                screen = out / 'screens' / (name.split('_0_')[0] + '.png')
                screen.parent.mkdir(exist_ok=True)
                shutil.copyfile(out / 'attachments' / attachment['exportedFileName'], screen)

reports = [ET.parse(path).getroot() for path in out.glob('junit/**/*.xml')]
passed = native.get('passedTests', 0) if platform == 'ios' else sum(
    int(report.get('tests', '0')) - sum(int(report.get(key, '0')) for key in ['failures', 'errors', 'skipped'])
    for report in reports)
required = ['journey.mp4', 'final.png', 'native-state.json', 'events.jsonl'] + [
    f'screens/{name}.png' for name in [
        '01-fresh-prompt', '02-rejected', '03-accepted',
        '04-customize-measurement', '05-saved', '06-unsaved-draft',
        '07-relaunched-preferences', '08-withdrawn-offline', '09-withdrawal-relaunched', '10-reconnected',
        '08-native-iab-blocked-js', '09-native-partner-search', '10-native-partner-details',
        '11-native-additional-consent', '12-native-committed-before-js', '13-js-outcome-resumed',
        '14-nonmodal-native-notice', '15-notice-acknowledged', 'final-or-failure']]
if (out / 'scenario.txt').exists() and (out / 'scenario.txt').read_text().strip() == 'expiry':
    required = ['journey.mp4', 'final.png', 'native-state.json', 'events.jsonl'] + [
        f'screens/{name}.png' for name in ['20-expiry-initial-prompt', '21-expiry-earlier-all',
        '22-expiry-narrowed-preferences', '23-expiry-reject-only', '24-expiry-denied',
        '25-expiry-denial-restored', '26-expiry-replayed', '27-expiry-wide-denial']]
if (out / 'scenario.txt').exists() and (out / 'scenario.txt').read_text().strip() == 'adapter':
    required = ['journey.mp4', 'final.png', 'native-state.json', 'events.jsonl'] + [
        f'screens/{name}.png' for name in ['30-fallback-choice', '31-fallback-compact-commit',
        '32-notice-recreated-with-js-blocked', '33-notice-acknowledged-with-js-blocked', '34-notice-one-final-outcome']]
missing = [name for name in required if not (out / name).is_file() or not (out / name).stat().st_size]
if not code and (not passed or missing):
    code = 1
result = {'platform': platform, 'configuration': 'Release', 'exitCode': code,
          'nativePassedTests': passed, 'missingArtifacts': missing}
(out / 'result.json').write_text(json.dumps(result, indent=2))
suite = ET.Element('testsuite', name=f'{platform}-app-e2e-command', tests='1', failures=str(int(code != 0)))
case = ET.SubElement(suite, 'testcase', name='Release app UI journey', classname=f'{platform}.ConsentJourney')
if code:
    message = f'Runner exited {code}; native passed tests: {passed}; missing artifacts: {missing}. See build.log and test.log.'
    ET.SubElement(case, 'failure', message=message).text = '\n'.join(
        (out / name).read_text()[-6000:] for name in ['build.log', 'test.log'] if (out / name).exists())
ET.ElementTree(suite).write(out / 'command.xml', encoding='utf-8', xml_declaration=True)
sys.exit(int(code != 0))
