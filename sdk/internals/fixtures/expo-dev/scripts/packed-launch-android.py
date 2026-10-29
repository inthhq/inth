#!/usr/bin/env python3
"""Cold-offline packed Expo smoke using a fresh, task-owned AVD and UIAutomator."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import time
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apk', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--archive', type=Path, help='SDK archive used to build this APK')
args = parser.parse_args()
out = args.out.resolve()
out.mkdir(parents=True, exist_ok=False)
sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'Library/Android/sdk')))
adb = str(sdk / 'platform-tools/adb')
manager = str(sdk / 'cmdline-tools/latest/bin/avdmanager')
name = f'c15t-packed-expo-{os.getpid()}'
for port in list(range(5554, 5580, 2)) + [5582, 5584]:
    with socket.socket() as probe:
        try:
            probe.bind(('127.0.0.1', port))
            break
        except OSError:
            continue
else:
    raise RuntimeError('No free task emulator port')
serial = f'emulator-{port}'
(out / 'device-id.txt').write_text(serial)
package = 'com.c15t.expodev'
emulator = None

def run(command, **options):
    return subprocess.run(command, check=True, text=True, capture_output=True, **options).stdout

def device(*command):
    return run([adb, '-s', serial, *command])

def hierarchy():
    device('shell', 'uiautomator', 'dump', '/sdcard/c15t-packed.xml')
    return device('shell', 'cat', '/sdcard/c15t-packed.xml')

def find(predicate, timeout=45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        xml = hierarchy()
        for node in ET.fromstring(xml).iter('node'):
            if predicate(node):
                return node
        time.sleep(.3)
    (out / 'failure-hierarchy.xml').write_text(xml)
    raise AssertionError('Required native control or state did not appear')

def tap(node):
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    device('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))

def capture(name):
    (out / f'{name}.xml').write_text(hierarchy())
    with (out / f'{name}.png').open('wb') as file:
        subprocess.run([adb, '-s', serial, 'exec-out', 'screencap', '-p'], stdout=file, check=True)

result = {'passed': False, 'sdkInput': 'packed-tarball', 'backend': 'https://example-inth.inth.app/', 'device': serial}
if args.archive:
    result['archive'] = str(args.archive.resolve())
    result['archiveSha256'] = hashlib.sha256(args.archive.read_bytes()).hexdigest()
try:
    run([manager, 'create', 'avd', '--name', name, '--package', 'system-images;android-36;google_apis;arm64-v8a', '--device', 'pixel_6'], input='no\n')
    with (out / 'emulator.log').open('w') as log:
        emulator = subprocess.Popen([str(sdk / 'emulator/emulator'), '-avd', name, '-port', str(port), '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot', '-gpu', 'swiftshader_indirect'], stdout=log, stderr=subprocess.STDOUT)
    device('wait-for-device')
    deadline = time.monotonic() + 180
    while device('shell', 'getprop', 'sys.boot_completed').strip() != '1':
        if time.monotonic() > deadline or emulator.poll() is not None:
            raise RuntimeError('Owned AVD did not boot')
        time.sleep(1)
    device('shell', 'svc', 'wifi', 'disable')
    device('shell', 'svc', 'data', 'disable')
    device('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
    assert device('shell', 'settings', 'get', 'global', 'airplane_mode_on').strip() == '1'
    # Wait for actual network teardown before the app has ever been installed.
    deadline = time.monotonic() + 30
    while True:
        connectivity = device('shell', 'dumpsys', 'connectivity')
        if 'Active default network: none' in connectivity:
            break
        assert time.monotonic() < deadline, 'Owned AVD still has a default network'
        time.sleep(.25)
    (out / 'network-before-install.txt').write_text(connectivity)
    (out / 'wifi-before-install.txt').write_text(device('shell', 'dumpsys', 'wifi'))
    settings = device('shell', 'settings', 'list', 'global')
    (out / 'radio-settings-before-install.txt').write_text(settings)
    mobile_data = dict(re.findall(r'^(mobile_data\d*)=(.*)$', settings, re.MULTILINE))
    result['networkBeforeFirstLaunch'] = {
        'airplaneMode': True, 'activeDefaultNetwork': None,
        'wifiSetting': device('shell', 'settings', 'get', 'global', 'wifi_on').strip(),
        'mobileDataSettings': mobile_data,
    }
    assert result['networkBeforeFirstLaunch']['wifiSetting'] == '0'
    assert mobile_data and all(value == '0' for value in mobile_data.values())
    device('shell', 'settings', 'put', 'system', 'screen_off_timeout', '2147483647')
    device('shell', 'input', 'keyevent', '224')
    device('shell', 'input', 'keyevent', '82')
    device('install', '-r', str(args.apk.resolve()))
    device('shell', 'nohup screenrecord --time-limit 180 /data/local/tmp/c15t-packed.mp4 >/data/local/tmp/c15t-packed-video.log 2>&1 </dev/null &')
    device('shell', 'am', 'start', '-W', '-n', package + '/.MainActivity')
    reject = find(lambda node: node.get('resource-id') == 'c15t.first-layer.reject-all')
    capture('01-cold-offline-native-prompt')
    tap(reject)
    state_node = find(lambda node: node.get('resource-id') == 'fixture.native-state' and '"explicitChoice":{' in node.get('text', ''))
    state = json.loads(state_node.get('text'))
    assert state['policyPending'] is False and state['prompt'] == 'none'
    assert state['permissions']['necessary'] is True
    assert all(not value for category, value in state['permissions'].items() if category != 'necessary')
    assert all(state['explicitChoice'][category] is False for category in ['functionality', 'experience', 'measurement', 'marketing'])
    outcome = find(lambda node: node.get('resource-id') == 'fixture.native-outcome' and '"kind":"committed"' in node.get('text', ''))
    result['stateAfterReject'] = state
    result['outcome'] = json.loads(outcome.get('text'))
    assert set(result['outcome']) == {'sessionId', 'kind', 'revision'}
    capture('02-compact-native-outcome')
    device('shell', 'am', 'force-stop', package)
    device('shell', 'am', 'start', '-W', '-n', package + '/.MainActivity')
    restored = json.loads(find(lambda node: node.get('resource-id') == 'fixture.native-state' and '"explicitChoice":{' in node.get('text', '')).get('text'))
    assert restored['explicitChoice'] == state['explicitChoice']
    assert restored['permissions'] == state['permissions']
    capture('03-offline-process-restart')
    tap(find(lambda node: node.get('text') == 'Privacy settings'))
    switch = find(lambda node: node.get('resource-id') == 'c15t.prefs.category.measurement.switch')
    assert switch.get('checked') == 'false'
    capture('04-restored-native-preferences')
    connectivity = device('shell', 'dumpsys', 'connectivity')
    (out / 'network-after-relaunch.txt').write_text(connectivity)
    assert 'Active default network: none' in connectivity
    result['passed'] = True
finally:
    if emulator is not None:
        for command in [('shell', 'pkill', '-2', 'screenrecord'), ('shell', 'for i in 1 2 3 4 5 6 7 8 9 10; do pidof screenrecord >/dev/null || exit 0; sleep 1; done; exit 1'), ('pull', '/data/local/tmp/c15t-packed.mp4', str(out / 'journey.mp4')), ('pull', '/data/local/tmp/c15t-packed-video.log', str(out / 'video.log')), ('emu', 'kill')]:
            try:
                device(*command)
            except subprocess.CalledProcessError:
                pass
        emulator.wait(timeout=30)
    subprocess.run([manager, 'delete', 'avd', '--name', name], capture_output=True)
    result['apkSha256'] = hashlib.sha256(args.apk.read_bytes()).hexdigest()
    (out / 'result.json').write_text(json.dumps(result, indent=2))
