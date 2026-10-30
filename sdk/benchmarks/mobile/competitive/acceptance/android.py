#!/usr/bin/env python3
"""Untimed stock-UI acceptance on a fresh, task-owned API36 emulator.

Run the entire command through the same native lock as builds and timing.
No pre-existing device is selected, cleared or stopped.
"""
import argparse
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import read, require, sha, write
from harness import config, environment, out_for


def snapshots(log):
    result = []
    for line in log.splitlines():
        if 'CMP_SIZE_C15T_STATE' in line and '{' in line:
            try:
                value, _ = json.JSONDecoder().raw_decode(line[line.index('{'):])
                result.append(value)
            except json.JSONDecodeError:
                continue
    return result


def denied(state):
    choice = (state.get('explicitChoice') or {}).get('categories', {}).get('measurement', {})
    return (state.get('ready') is True and state.get('policyPending') is False
            and state.get('effectivePermissions', {}).get('measurement') is False
            and choice.get('value') is False and choice.get('confirmedAt', 0) > 0)


def run(cfg, port):
    root = Path(cfg['output']) / 'acceptance/android-optimized'
    require(not root.exists(), 'acceptance output exists; preserve it and use a fresh output root')
    root.mkdir(parents=True)
    sdk = Path(environment(cfg)['ANDROID_HOME'])
    env = environment(cfg)
    env['ANDROID_AVD_HOME'] = str(root / 'avds')
    Path(env['ANDROID_AVD_HOME']).mkdir()
    name = 'cmp_size_optimized_' + str(os.getpid())
    serial = 'emulator-' + str(port)
    adb = [str(sdk / 'platform-tools/adb'), '-s', serial]
    require(port % 2 == 0 and 5554 <= port <= 5682, 'invalid emulator port')
    for candidate in (port, port + 1):
        with socket.socket() as probe:
            require(probe.connect_ex(('127.0.0.1', candidate)) != 0, 'emulator port is in use')
    devices = subprocess.check_output([str(sdk / 'platform-tools/adb'), 'devices'], text=True)
    require(serial not in devices, 'refusing to use an existing device')
    ownership = {'schemaVersion': 1, 'taskOwned': True, 'avdName': name, 'serial': serial,
                 'timingMeasured': False, 'createdEpochMs': int(time.time() * 1000)}
    write(root / 'ownership.json', ownership)
    create = [str(sdk / 'cmdline-tools/latest/bin/avdmanager'), 'create', 'avd', '-n', name,
              '-k', 'system-images;android-36;google_apis;arm64-v8a', '--device', 'pixel_6']
    result = subprocess.run(create, input='no\n', text=True, capture_output=True, env=env)
    (root / 'create.log').write_text(result.stdout + result.stderr)
    result.check_returncode()
    transcript = []

    def call(args, timeout=40, check=True):
        value = subprocess.run(adb + args, capture_output=True, timeout=timeout)
        transcript.append({'argv': args, 'exitCode': value.returncode,
                           'stdout': value.stdout.decode(errors='replace') if args[:1] != ['exec-out'] else '<binary/file capture>',
                           'stderr': value.stderr.decode(errors='replace')})
        if check:
            value.check_returncode()
        return value

    def capture(directory, tag):
        call(['shell', 'uiautomator', 'dump', '/sdcard/cmp-size.xml'])
        raw = call(['exec-out', 'cat', '/sdcard/cmp-size.xml']).stdout
        (directory / (tag + '.xml')).write_bytes(raw)
        (directory / (tag + '.png')).write_bytes(call(['exec-out', 'screencap', '-p']).stdout)
        (directory / (tag + '-activity.txt')).write_bytes(call(['shell', 'dumpsys', 'activity', 'activities']).stdout)
        log = call(['logcat', '-d', '-v', 'threadtime']).stdout.decode(errors='replace')
        (directory / (tag + '-logcat.txt')).write_text(log)
        return ET.fromstring(raw), log

    def tap(tree, label):
        for node in tree.iter('node'):
            if node.get('text', '').casefold() == label.casefold():
                xy = [int(n) for n in re.findall(r'\d+', node.get('bounds', ''))]
                if len(xy) == 4:
                    call(['shell', 'input', 'tap', str((xy[0] + xy[2]) // 2), str((xy[1] + xy[3]) // 2)])
                    return True
        return False

    process = None
    observations = {}
    try:
        command = [str(sdk / 'emulator/emulator'), '-avd', name, '-port', str(port),
                   '-no-window', '-no-snapshot', '-no-audio', '-no-boot-anim',
                   '-gpu', 'swiftshader', '-memory', '3072', '-netdelay', 'none', '-netspeed', 'full']
        emulator_log = (root / 'emulator.log').open('w')
        process = subprocess.Popen(command, env=env, stdout=emulator_log, stderr=subprocess.STDOUT)
        call(['wait-for-device'], timeout=180)
        deadline = time.monotonic() + 180
        while call(['shell', 'getprop', 'sys.boot_completed']).stdout.strip() != b'1':
            require(time.monotonic() < deadline, 'task emulator boot timed out')
            time.sleep(2)
        call(['root'])
        call(['wait-for-device'])
        call(['shell', 'input', 'keyevent', '82'])
        properties = {prop: call(['shell', 'getprop', prop]).stdout.decode().strip()
                      for prop in ('ro.build.fingerprint', 'ro.build.version.sdk', 'ro.product.cpu.abi')}
        require(properties['ro.build.version.sdk'] == '36' and properties['ro.product.cpu.abi'] == 'arm64-v8a', 'wrong device image')
        write(root / 'device.json', {'command': command, 'properties': properties})
        for vendor in ('c15t', 'didomi', 'usercentrics', 'sourcepoint'):
            directory = root / vendor
            directory.mkdir()
            apk = out_for(cfg, 'android-optimized', vendor) / 'app-release.apk'
            require(apk.is_file(), f'missing optimized {vendor} APK')
            call(['uninstall', 'com.c15t.expodev'], check=False)
            call(['install', str(apk)], timeout=90)
            installed_path = call(['shell', 'pm', 'path', 'com.c15t.expodev']).stdout.decode().strip()
            require(installed_path.startswith('package:') and '\n' not in installed_path, 'unexpected installed APK paths')
            installed_sha = call(['shell', 'sha256sum', installed_path.split(':', 1)[1]]).stdout.decode().split()[0]
            require(installed_sha == sha(apk), 'installed APK differs from measured signed APK')
            call(['logcat', '-c'])
            uid = None
            if vendor == 'c15t':
                uid_text = call(['shell', 'cmd', 'package', 'list', 'packages', '-U', 'com.c15t.expodev']).stdout.decode()
                uid = re.search(r'uid:(\d+)', uid_text).group(1)
                for table in ('iptables', 'ip6tables'):
                    call(['shell', table, '-I', 'OUTPUT', '-m', 'owner', '--uid-owner', uid, '-j', 'REJECT'])
                    (directory / (table + '.txt')).write_bytes(call(['shell', table, '-S', 'OUTPUT']).stdout)
                call(['shell', 'svc', 'wifi', 'disable'])
                call(['shell', 'svc', 'data', 'disable'])
                call(['shell', 'ip', 'link', 'set', 'eth0', 'down'])
            call(['shell', 'am', 'start', '-n', 'com.c15t.expodev/.MainActivity'])
            time.sleep(12)
            tree, log = capture(directory, 'cold-launch')
            initial = snapshots(log)
            opened = tap(tree, 'Privacy settings')
            time.sleep(4)
            tree, _ = capture(directory, 'preferences')
            observation = {'apkSha256': sha(apk), 'installedApkSha256': installed_sha, 'privacySettingsTapped': opened,
                           'preferencesText': [n.get('text') for n in tree.iter('node') if n.get('text')],
                           'timingMeasured': False}
            if vendor == 'c15t':
                activity = (directory / 'preferences-activity.txt').read_text()
                observation['coldOfflineState'] = initial[-1] if initial else None
                observation['nativePreferencesActivity'] = 'com.c15t.consentui.ConsentHostActivity' in activity
                observation['rejectAllTapped'] = tap(tree, 'Reject All')
                time.sleep(3)
                _, log = capture(directory, 'after-rejection')
                state = snapshots(log)
                observation['afterRejectionState'] = state[-1] if state else None
                call(['shell', 'am', 'force-stop', 'com.c15t.expodev'])
                call(['logcat', '-c'])
                call(['shell', 'am', 'start', '-n', 'com.c15t.expodev/.MainActivity'])
                time.sleep(8)
                _, log = capture(directory, 'offline-restart')
                restarted = snapshots(log)
                observation['offlineRestartState'] = restarted[-1] if restarted else None
                observation['durableDenial'] = bool(state and restarted and denied(state[-1]) and denied(restarted[-1])
                    and state[-1]['explicitChoice'] == restarted[-1]['explicitChoice'])
                observation['accepted'] = bool(initial and initial[-1].get('ready') is True
                    and initial[-1].get('policyPending') is False and observation['nativePreferencesActivity']
                    and observation['rejectAllTapped'] and observation['durableDenial'])
                for table in ('iptables', 'ip6tables'):
                    call(['shell', table, '-D', 'OUTPUT', '-m', 'owner', '--uid-owner', uid, '-j', 'REJECT'])
                call(['shell', 'ip', 'link', 'set', 'eth0', 'up'])
                call(['shell', 'svc', 'wifi', 'enable'])
                call(['shell', 'svc', 'data', 'enable'])
                time.sleep(5)
            observations[vendor] = observation
            write(root / 'results.json', {'schemaVersion': 1, 'profile': 'android-optimized',
                                        'observations': observations,
                                        'onetrust': 'compile-only; verified App ID missing'})
            call(['shell', 'am', 'force-stop', 'com.c15t.expodev'])
    finally:
        if process is not None:
            call(['emu', 'kill'], check=False)
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=20)
            ownership['stoppedBeforeLockRelease'] = process.poll() is not None
            emulator_log.close()
        write(root / 'ownership.json', ownership)
        write(root / 'commands.json', transcript)
    require(observations.get('c15t', {}).get('accepted'), 'optimized c15t acceptance failed; retained actual observations')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--port', type=int, default=5592)
    args = parser.parse_args()
    run(config(args.config), args.port)
