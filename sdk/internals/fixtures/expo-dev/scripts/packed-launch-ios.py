#!/usr/bin/env python3
"""Exercise an existing packed Release app without rebuilding or replacing SDK sources."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--app', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--archive', type=Path, required=True)
parser.add_argument('--native-proof', action='store_true', help='Require the fixture-only installed-core observer')
args = parser.parse_args()
out = args.out.resolve()
out.mkdir(parents=True, exist_ok=False)
source = Path(__file__).resolve().parent

def run(command, **options):
    return subprocess.run(command, check=True, text=True, capture_output=True, **options).stdout

def logged(name, command):
    with (out / name).open('w') as log:
        subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def files(root):
    return {str(p.relative_to(root)): digest(p) for p in sorted(root.rglob('*')) if p.is_file()}

result = {'passed': False, 'backend': 'https://example-inth.inth.app/', 'sdkInput': str(args.archive.resolve()), 'archiveSha256': digest(args.archive), 'networkFault': 'process-injected NSURLProtocol; every app HTTP(S) request fails with NSURLErrorNotConnectedToInternet before network dispatch; host and other Simulators unchanged'}
app = out / 'input/c15tExpoDev.app'
app.parent.mkdir()
shutil.copytree(args.app.resolve(), app, symlinks=True)
result['appFiles'] = files(app)
info = plistlib.loads((app / 'Info.plist').read_bytes())
assert info['CFBundleIdentifier'] == 'com.c15t.expodev'
assert info['com.c15t.backend.mode'] == 'hosted'
assert info['com.c15t.backend.url'].rstrip('/') == result['backend'].rstrip('/')
result['hostedPlist'] = {key: value for key, value in info.items() if 'c15t' in key.lower()}
(out / 'source-head.txt').write_text(run(['git', 'rev-parse', 'HEAD']))
(out / 'source.patch').write_text(run(['git', 'diff', '--binary']))
project = out / 'harness'
project.mkdir()
(project / 'host.swift').write_text('import UIKit\n@main class Host: UIResponder, UIApplicationDelegate { var window: UIWindow? }\n')
shutil.copyfile(source / 'packed-consent-journey.swift', project / 'journey.swift')
(project / 'project.json').write_text(json.dumps({'name': 'PackedAcceptance', 'options': {'deploymentTarget': {'iOS': '16.4'}}, 'settings': {'base': {'SWIFT_VERSION': '5.0', 'CODE_SIGN_IDENTITY': '-', 'CODE_SIGNING_FOR_SIMULATOR': 'YES', 'GENERATE_INFOPLIST_FILE': 'YES'}}, 'targets': {
    'Host': {'type': 'application', 'platform': 'iOS', 'sources': ['host.swift'], 'settings': {'base': {'PRODUCT_BUNDLE_IDENTIFIER': 'com.c15t.packed-acceptance-host'}}},
    'Journey': {'type': 'bundle.ui-testing', 'platform': 'iOS', 'sources': ['journey.swift'], 'dependencies': [{'target': 'Host'}], 'settings': {'base': {'PRODUCT_BUNDLE_IDENTIFIER': 'com.c15t.packed-acceptance-tests', 'TEST_TARGET_NAME': 'Host'}}}}, 'schemes': {'PackedAcceptance': {'build': {'targets': {'Host': 'all', 'Journey': ['test']}}, 'test': {'targets': ['Journey']}}}}))
device = None
video = None
try:
    logged('project.log', ['xcodegen', 'generate', '--spec', str(project / 'project.json')])
    runtime = next(r['identifier'] for r in json.loads(run(['xcrun', 'simctl', 'list', 'runtimes', '-j']))['runtimes'] if r['isAvailable'] and r['name'].startswith('iOS 26.4'))
    device = run(['xcrun', 'simctl', 'create', f'c15t-packed-ios-{os.getpid()}', 'iPhone 17 Pro', runtime]).strip()
    result['device'] = device
    result['runtime'] = runtime
    (out / 'device-id.txt').write_text(device)
    run(['xcrun', 'simctl', 'boot', device])
    logged('boot.log', ['xcrun', 'simctl', 'bootstatus', device, '-b'])
    run(['xcrun', 'simctl', 'ui', device, 'appearance', 'light'])
    fault = out / 'packed-network-fault.dylib'
    logged('fault-build.log', ['xcrun', '--sdk', 'iphonesimulator', 'clang', '-arch', 'arm64', '-dynamiclib', '-fobjc-arc', '-mios-simulator-version-min=16.4', '-framework', 'Foundation', str(source / 'packed-network-fault.m'), '-o', str(fault)])
    run(['codesign', '--force', '--sign', '-', str(fault)])
    # Only the copied unsigned app is signed for Simulator installation. SDK bytes stay identical.
    logged('signing.log', ['codesign', '--force', '--deep', '--sign', '-', '--preserve-metadata=identifier,entitlements', str(app)])
    result['installedAppFiles'] = files(app)
    logged('install.log', ['xcrun', 'simctl', 'install', device, str(app)])
    logged('build.log', ['xcodebuild', 'build-for-testing', '-project', str(project / 'PackedAcceptance.xcodeproj'), '-scheme', 'PackedAcceptance', '-configuration', 'Release', '-destination', f'platform=iOS Simulator,id={device}', '-derivedDataPath', str(out / 'derived'), 'ONLY_ACTIVE_ARCH=YES'])
    xctestrun = next((out / 'derived/Build/Products').glob('*.xctestrun'))
    data = plistlib.loads(xctestrun.read_bytes())
    def configure(value):
        if isinstance(value, dict):
            if 'TestBundlePath' in value:
                value['UITargetAppPath'] = str(app)
                value['UITargetAppBundleIdentifier'] = 'com.c15t.expodev'
                value.setdefault('EnvironmentVariables', {})['C15T_PACKED_FAULT'] = str(fault)
                value['EnvironmentVariables']['C15T_PACKED_NATIVE_PROOF'] = '1' if args.native_proof else '0'
            for child in list(value.values()): configure(child)
        elif isinstance(value, list):
            for child in value: configure(child)
    configure(data)
    xctestrun.write_bytes(plistlib.dumps(data))
    with (out / 'video.log').open('w') as log:
        video = subprocess.Popen(['xcrun', 'simctl', 'io', device, 'recordVideo', '--codec=h264', str(out / 'journey.mp4')], stdout=log, stderr=subprocess.STDOUT)
    logged('test.log', ['xcodebuild', 'test-without-building', '-xctestrun', str(xctestrun), '-destination', f'platform=iOS Simulator,id={device}', '-resultBundlePath', str(out / 'journey.xcresult'), '-parallel-testing-enabled', 'NO', '-collect-test-diagnostics', 'never'])
    container = Path(run(['xcrun', 'simctl', 'get_app_container', device, 'com.c15t.expodev', 'data']).strip())
    shutil.copyfile(container / 'Library/Caches/packed-network-fault-loaded.txt', out / 'network-fault-loaded.txt')
    shutil.copyfile(container / 'Library/Caches/packed-network-fault.jsonl', out / 'network-fault.jsonl')
    events = [json.loads(line) for line in (out / 'network-fault.jsonl').read_text().splitlines()]
    assert events and all(e['error'] == -1009 for e in events)
    assert any('example-inth.inth.app' in e['url'] and '/init' in e['url'] for e in events)
    assert len({e['process'] for e in events}) >= 2
    result['networkRefusals'] = events
    if args.native_proof:
        shutil.copyfile(container / 'Library/Caches/packed-native-proof.jsonl', out / 'native-proof.jsonl')
        native = [json.loads(line) for line in (out / 'native-proof.jsonl').read_text().splitlines()]
        optional = ['functionality', 'experience', 'measurement', 'marketing']
        fresh = [e for e in native if e['snapshot']['ready'] and not e['snapshot']['policyPending'] and e['snapshot']['explicitChoice'] is None]
        denied = [e for e in native if e['snapshot']['explicitChoice'] and all(e['snapshot']['explicitChoice']['categories'].get(c, {}).get('value') is False and e['gates'][c] is False for c in optional)]
        assert fresh and all(e['gates'][c] is False for e in fresh for c in optional)
        assert len({e['process'] for e in denied}) == 2
        assert {e['process'] for e in denied} == {e['process'] for e in events}
        assert all(e['gates']['necessary'] is True for e in denied)
        result['nativeCoreProof'] = {'freshBundledReadings': len(fresh), 'deniedReadings': len(denied), 'processes': sorted({e['process'] for e in denied})}

    result['passed'] = True
finally:
    if video is not None:
        video.send_signal(__import__('signal').SIGINT)
        video.wait(timeout=30)
    if device:
        logged('device.log', ['xcrun', 'simctl', 'spawn', device, 'log', 'show', '--last', '10m', '--style', 'compact', '--predicate', 'process == "c15tExpoDev"'])
        run(['xcrun', 'simctl', 'io', device, 'screenshot', str(out / 'final.png')])
        run(['xcrun', 'simctl', 'shutdown', device]); run(['xcrun', 'simctl', 'delete', device])
    if (out / 'journey.xcresult').exists():
        logged('attachments.log', ['xcrun', 'xcresulttool', 'export', 'attachments', '--path', str(out / 'journey.xcresult'), '--output-path', str(out / 'attachments')])
        (out / 'test-summary.json').write_text(run(['xcrun', 'xcresulttool', 'get', 'test-results', 'summary', '--path', str(out / 'journey.xcresult'), '--format', 'json']))
    result['harnessHashes'] = {name: digest(source / name) for name in ['packed-launch-ios.py', 'packed-consent-journey.swift', 'packed-network-fault.m', 'packed-native-proof.swift', 'install-packed-ios-proof.py']}
    (out / 'result.json').write_text(json.dumps(result, indent=2))
