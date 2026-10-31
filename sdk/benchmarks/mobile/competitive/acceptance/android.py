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
from core import apk_measure, check_r8, check_settings, manifest, read, require, sha, write
from harness import config, environment, verify, verify_installed


def native_preferences(tree):
    """Read stock Compose semantics. Last changed requires an explicit choice."""
    result = {'categories': {}, 'lastChanged': None}
    for node in tree.iter('node'):
        name = node.get('resource-id', '')
        match = re.fullmatch(r'c15t\.prefs\.category\.(\w+)\.switch', name)
        if match and node.get('checkable') == 'true' and node.get('checked') in ('true', 'false'):
            result['categories'][match.group(1)] = node.get('checked') == 'true'
        if name == 'c15t.prefs.last-changed' and node.get('text', '').startswith('Last changed '):
            result['lastChanged'] = node.get('text')
    return result


def denied(state):
    categories = state.get('categories', {})
    return bool(state.get('lastChanged')
                and set(categories) == {'functionality', 'experience', 'measurement', 'marketing'}
                and all(value is False for value in categories.values()))


def emulator_stopped(ownership):
    return bool(ownership.get('stoppedBeforeLockRelease') and ownership.get('emulatorPortsClosed')
                and ownership.get('adbDisconnected') and ownership.get('serialStateAfterStop') in ('absent', 'offline'))


def diagnostic_snapshots(log):
    """Only the explicitly supplied, excluded diagnostic APK emits this marker."""
    values = []
    for line in log.splitlines():
        if 'CMP_SIZE_C15T_STATE' in line and '{' in line:
            try:
                value, _ = json.JSONDecoder().raw_decode(line[line.index('{'):])
                values.append(value)
            except json.JSONDecodeError:
                continue
    return values


def run(cfg, port, attempt='first', diagnostic_build=None):
    require(re.fullmatch(r'[a-z0-9-]+', attempt), 'use a simple unique attempt name')
    root = Path(cfg['output']) / 'acceptance/android-optimized' / attempt
    require(not root.exists(), 'acceptance output exists; preserve it and use a new --attempt')
    root.mkdir(parents=True)
    evidence = verify(cfg)
    artifacts = {row['vendor']: Path(row['descriptor']['artifact']) for row in evidence['measurements']
                 if row['profile'] == 'android-optimized'}
    diagnostic = None
    if diagnostic_build:
        diagnostic_build = Path(diagnostic_build).resolve()
        record = read(diagnostic_build)
        directory = diagnostic_build.parent
        require(record['profile'] == 'android-optimized' and record['vendor'] == 'c15t'
                and record['inputs'] == evidence['inputs'], 'diagnostic build has different frozen inputs/profile')
        require([row for row in manifest(directory) if row['path'] != diagnostic_build.name] == record['artifacts'], 'diagnostic build outputs changed')
        verify_installed(cfg, Path(record['host']), 'c15t')
        check_r8('android-optimized', directory / 'configuration.txt', directory / 'mapping.txt')
        clean = next((row for row in evidence['measurements'] if row['vendor'] == 'c15t' and row['profile'] == 'android-optimized'), None)
        require(clean is not None, 'missing measured android-optimized c15t APK')
        check_settings('android-optimized', read(directory / 'settings.json'), clean['settings'])
        normalized = lambda rows: sorted((r['coordinate'], r['size'], r['sha256']) for r in rows)
        require(normalized(read(directory / 'dependencies.json')) == normalized(read(clean['descriptor']['dependencies'])), 'diagnostic native dependency graph differs')
        diagnostic = directory / 'app-release.apk'
        require(sha(diagnostic) != clean['artifactSha256'], 'diagnostic must be separate from the measured size APK')
        apk_measure(diagnostic, directory / 'mapping.txt', 'c15t', for_size=False)
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
    log_failures = []

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
        result = call(['logcat', '-d', '-v', 'threadtime'], check=False)
        log = result.stdout.decode(errors='replace')
        (directory / (tag + '-logcat.txt')).write_text(log)
        if result.returncode:
            failure = {'capture': str(directory.relative_to(root) / tag), 'exitCode': result.returncode,
                       'stderr': result.stderr.decode(errors='replace')}
            log_failures.append(failure)
            write(directory / (tag + '-logcat-failure.json'), failure)
        return ET.fromstring(raw), log

    def tap(tree, label):
        for node in tree.iter('node'):
            if node.get('text', '').casefold() == label.casefold():
                xy = [int(n) for n in re.findall(r'\d+', node.get('bounds', ''))]
                if len(xy) == 4:
                    call(['shell', 'input', 'tap', str((xy[0] + xy[2]) // 2), str((xy[1] + xy[3]) // 2)])
                    return True
        return False

    def preferences(directory, tag, tree):
        state = native_preferences(tree)
        for index in range(6):
            call(['shell', 'input', 'swipe', '540', '1600', '540', '500', '400'])
            time.sleep(0.5)
            tree, _ = capture(directory, f'{tag}-scroll-{index + 1}')
            current = native_preferences(tree)
            state['categories'].update(current['categories'])
            state['lastChanged'] = current['lastChanged'] or state['lastChanged']
            if current['lastChanged']:
                break
        return state, tree

    def persisted(directory, tag):
        path = '/data/user/0/com.c15t.expodev/no_backup/c15t/com.c15t.snapshot'
        result = call(['exec-out', 'cat', path], check=False)
        if result.returncode:
            return None
        destination = directory / (tag + '-encrypted-snapshot.bin')
        destination.write_bytes(result.stdout)
        return {'bytes': len(result.stdout), 'sha256': sha(destination),
                'encrypted': True, 'plaintextRead': False}

    def epoch_ms():
        value = call(['shell', 'date', '+%s%3N']).stdout.decode().strip()
        require(value.isdigit(), 'device clock did not return epoch milliseconds')
        return int(value)

    process = None
    observations = {}
    try:
        command = [str(sdk / 'emulator/emulator'), '-avd', name, '-port', str(port),
                   '-no-window', '-no-snapshot', '-no-audio', '-no-boot-anim',
                   '-gpu', 'swiftshader', '-memory', '3072', '-netdelay', 'none', '-netspeed', 'full']
        emulator_log = (root / 'emulator.log').open('w')
        process = subprocess.Popen(command, env=env, stdout=emulator_log, stderr=subprocess.STDOUT)
        ownership['emulatorPid'] = process.pid
        call(['wait-for-device'], timeout=180)
        deadline = time.monotonic() + 180
        while call(['shell', 'getprop', 'sys.boot_completed']).stdout.strip() != b'1':
            require(time.monotonic() < deadline, 'task emulator boot timed out')
            time.sleep(2)
        call(['root'], check=False)
        call(['wait-for-device'])
        root_uid = call(['shell', 'id', '-u']).stdout.decode().strip()
        require(root_uid == '0', 'task emulator requires working adb root for offline rules and encrypted-file capture')
        ownership['adbRootUid'] = root_uid
        call(['shell', 'input', 'keyevent', '82'])
        properties = {prop: call(['shell', 'getprop', prop]).stdout.decode().strip()
                      for prop in ('ro.build.fingerprint', 'ro.build.version.sdk', 'ro.product.cpu.abi')}
        require(properties['ro.build.version.sdk'] == '36' and properties['ro.product.cpu.abi'] == 'arm64-v8a', 'wrong device image')
        write(root / 'device.json', {'command': command, 'properties': properties})
        for vendor in ('c15t', 'didomi', 'usercentrics', 'sourcepoint'):
            directory = root / vendor
            directory.mkdir()
            require(vendor in artifacts, f'missing completed optimized {vendor} size measurement')
            apk = artifacts[vendor]
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
            call(['shell', 'am', 'start', '-n', 'com.c15t.expodev/.MainActivity'])
            time.sleep(12)
            tree, log = capture(directory, 'cold-launch')
            initial_text = [n.get('text') for n in tree.iter('node') if n.get('text')]
            opened = tap(tree, 'Privacy settings')
            time.sleep(4)
            tree, _ = capture(directory, 'preferences')
            observation = {'apkSha256': sha(apk), 'installedApkSha256': installed_sha, 'privacySettingsTapped': opened,
                           'preferencesText': [n.get('text') for n in tree.iter('node') if n.get('text')],
                           'timingMeasured': False}
            if vendor == 'c15t':
                activity = (directory / 'preferences-activity.txt').read_text()
                observation['coldOfflineHostText'] = initial_text
                observation['nativePreferencesActivity'] = 'com.c15t.consentui.ConsentHostActivity' in activity
                before, tree = preferences(directory, 'before-choice', tree)
                observation['beforeChoicePreferences'] = before
                observation['beforeChoiceEncryptedSnapshot'] = persisted(directory, 'before-choice')
                observation['rejectionStartedEpochMs'] = epoch_ms()
                observation['rejectAllTapped'] = tap(tree, 'Reject All')
                time.sleep(3)
                observation['rejectionEndedEpochMs'] = epoch_ms()
                tree, _ = capture(directory, 'after-rejection')
                observation['afterRejectionHostText'] = [n.get('text') for n in tree.iter('node') if n.get('text')]
                observation['afterRejectionEncryptedSnapshot'] = persisted(directory, 'after-rejection')
                reopened = tap(tree, 'Privacy settings')
                time.sleep(2)
                tree, _ = capture(directory, 'saved-preferences')
                saved, _ = preferences(directory, 'saved-preferences', tree)
                observation['afterRejectionPreferences'] = saved
                prior_pid = call(['shell', 'pidof', 'com.c15t.expodev']).stdout.decode().strip()
                call(['shell', 'am', 'force-stop', 'com.c15t.expodev'])
                call(['logcat', '-c'])
                call(['shell', 'am', 'start', '-n', 'com.c15t.expodev/.MainActivity'])
                time.sleep(8)
                restarted_pid = call(['shell', 'pidof', 'com.c15t.expodev']).stdout.decode().strip()
                observation['processBeforeRestart'] = prior_pid
                observation['processAfterRestart'] = restarted_pid
                observation['freshProcess'] = bool(prior_pid and restarted_pid and prior_pid != restarted_pid)
                tree, _ = capture(directory, 'offline-restart')
                restart_text = [n.get('text') for n in tree.iter('node') if n.get('text')]
                observation['offlineRestartHostText'] = restart_text
                observation['offlineRestartEncryptedSnapshot'] = persisted(directory, 'offline-restart')
                restarted_open = tap(tree, 'Privacy settings')
                time.sleep(2)
                tree, _ = capture(directory, 'restarted-preferences')
                restarted, _ = preferences(directory, 'restarted-preferences', tree)
                observation['offlineRestartPreferences'] = restarted
                observation['durableDenial'] = bool(reopened and restarted_open and denied(saved) and saved == restarted)
                observation['accepted'] = bool('Ready' in initial_text and 'Measurement denied' in initial_text
                    and 'Ready' in restart_text and 'Measurement denied' in restart_text
                    and not before['lastChanged'] and opened and observation['nativePreferencesActivity']
                    and observation['rejectAllTapped'] and observation['durableDenial'] and observation['freshProcess']
                    and observation['afterRejectionEncryptedSnapshot'] and observation['offlineRestartEncryptedSnapshot'])
                observation['limits'] = 'No diagnostic SDK state was added to the size APK. Native UI reads the saved explicit choice. Encrypted storage is retained without exporting keys or claiming plaintext inspection. Internal error/policyPending fields are not exposed by this stock size fixture.'
                if diagnostic:
                    call(['shell', 'am', 'force-stop', 'com.c15t.expodev'])
                    call(['install', '-r', str(diagnostic)], timeout=90)
                    installed = call(['shell', 'pm', 'path', 'com.c15t.expodev']).stdout.decode().strip().split(':', 1)[1]
                    require(call(['shell', 'sha256sum', installed]).stdout.decode().split()[0] == sha(diagnostic), 'wrong diagnostic APK installed')
                    after_uid = re.search(r'uid:(\d+)', call(['shell', 'cmd', 'package', 'list', 'packages', '-U', 'com.c15t.expodev']).stdout.decode()).group(1)
                    require(after_uid == uid, 'diagnostic update changed UID/data ownership')
                    call(['logcat', '-c'])
                    call(['shell', 'am', 'start', '-n', 'com.c15t.expodev/.MainActivity'])
                    deadline = time.monotonic() + 40
                    state = None
                    reads = 0
                    while time.monotonic() < deadline:
                        reads += 1
                        result = call(['logcat', '-d', '-v', 'threadtime', 'ReactNativeJS:V', '*:S'], check=False)
                        diagnostic_log = result.stdout.decode(errors='replace')
                        (directory / f'excluded-diagnostic-read-{reads}.txt').write_text(diagnostic_log)
                        states = diagnostic_snapshots(diagnostic_log)
                        state = next((item for item in reversed(states) if item.get('ready') is True and item.get('explicitChoice')), None)
                        if state:
                            break
                        time.sleep(1)
                    capture(directory, 'excluded-diagnostic-state')
                    choice = ((state or {}).get('explicitChoice') or {}).get('categories', {}).get('measurement', {})
                    confirmed = choice.get('confirmedAt', 0)
                    valid = bool(choice.get('value') is False and choice.get('basis', {}).get('kind') == 'choice-v1'
                                 and observation['rejectionStartedEpochMs'] <= confirmed <= observation['rejectionEndedEpochMs'])
                    observation['excludedDiagnosticCapture'] = {'excludedFromSize': True, 'apkSha256': sha(diagnostic),
                        'buildRecordSha256': sha(diagnostic_build), 'sameUid': True, 'state': state,
                        'choiceTimestampMatchesCleanApkRejection': valid}
                    observation['accepted'] = observation['accepted'] and valid
                    call(['shell', 'am', 'force-stop', 'com.c15t.expodev'])
                    call(['install', '-r', str(apk)], timeout=90)
                for table in ('iptables', 'ip6tables'):
                    call(['shell', table, '-D', 'OUTPUT', '-m', 'owner', '--uid-owner', uid, '-j', 'REJECT'])
            observations[vendor] = observation
            write(root / 'results.json', {'schemaVersion': 1, 'profile': 'android-optimized',
                                        'observations': observations,
                                        'logCaptureFailures': log_failures,
                                        'onetrust': 'compile-only; verified App ID missing'})
            call(['shell', 'am', 'force-stop', 'com.c15t.expodev'])
    finally:
        if process is not None:
            try:
                call(['emu', 'kill'], timeout=10, check=False)
            except subprocess.TimeoutExpired:
                ownership['emulatorKillCommandTimedOut'] = True
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.terminate()
                try:
                    process.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=20)
            ownership['stoppedBeforeLockRelease'] = process.poll() is not None
            ownership['emulatorExitCode'] = process.returncode
            disconnected = False
            try:
                disconnected = call(['wait-for-disconnect'], timeout=30, check=False).returncode == 0
            except subprocess.TimeoutExpired:
                ownership['adbDisconnectWaitTimedOut'] = True
            remaining = subprocess.check_output([str(sdk / 'platform-tools/adb'), 'devices'], text=True)
            state = next((line.split()[1] for line in remaining.splitlines()
                          if line.split() and line.split()[0] == serial), 'absent')
            ownership['serialStateAfterStop'] = state
            ownership['serialAbsentAfterStop'] = state == 'absent'
            ownership['adbDisconnected'] = disconnected and state in ('absent', 'offline')
            ports_closed = []
            for candidate in (port, port + 1):
                with socket.socket() as probe:
                    ports_closed.append(probe.connect_ex(('127.0.0.1', candidate)) != 0)
            ownership['emulatorPortsClosed'] = all(ports_closed)
            emulator_log.close()
        write(root / 'ownership.json', ownership)
        write(root / 'commands.json', transcript)
    require(emulator_stopped(ownership),
            'owned emulator did not fully disconnect before lock release')
    require(observations.get('c15t', {}).get('accepted'), 'optimized c15t acceptance failed; retained actual observations')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--port', type=int, default=5584)
    parser.add_argument('--attempt', default='first')
    parser.add_argument('--diagnostic-build', help='optional separate excluded diagnostic build-complete.json; never a size measurement')
    args = parser.parse_args()
    run(config(args.config), args.port, args.attempt, args.diagnostic_build)
