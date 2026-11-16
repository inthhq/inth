"""Operations restricted to the emulator created in this run's device directory."""
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import threading
import time
import xml.etree.ElementTree as ET

from core import read, require, write
from parser import NAMES, denial_in_interval, events, snapshots, validate


def package(name):
    require(name in NAMES, 'unsupported app')
    return 'com.c15t.expodev.cached.' + name


class Device:
    def __init__(self, cfg):
        self.cfg = cfg
        self.root = Path(cfg['output'])
        self.spec = cfg['device']
        self.serial = 'emulator-' + str(self.spec['port'])
        self.sdk = Path(cfg['androidSdk'])
        self.adb_path = self.sdk / 'platform-tools/adb'

    def call(self, args, check=True, timeout=45):
        result = subprocess.run([str(self.adb_path), '-s', self.serial, *map(str, args)], capture_output=True, timeout=timeout)
        require(not check or result.returncode == 0, 'adb failed: ' + str(args) + ': ' + result.stderr.decode(errors='replace'))
        return result

    def text(self, args):
        return self.call(args).stdout.decode(errors='replace').strip()

    def epoch_ms(self):
        return int(self.text(['shell', 'date', '+%s%3N']))

    def pids(self, name):
        return self.call(['shell', 'pidof', package(name)], check=False).stdout.decode().split()

    def stop(self):
        for name in NAMES:
            self.call(['shell', 'am', 'force-stop', package(name)])
        result = {name: self.pids(name) for name in NAMES}
        require(all(not p for p in result.values()), 'participant did not stop')
        return result

    def launch(self, name):
        return self.call(['shell', 'am', 'start', '-n', package(name) + '/com.c15t.expodev.MainActivity'], check=False)

    def fingerprint(self):
        return {'serial': self.serial, 'avdName': self.spec['avdName'],
                **{p: self.text(['shell', 'getprop', p]) for p in ('ro.build.fingerprint', 'ro.product.cpu.abi', 'ro.build.version.sdk')},
                'screenSize': self.text(['shell', 'wm', 'size']), 'screenDensity': self.text(['shell', 'wm', 'density'])}

    def owned(self):
        row = read(self.root / 'device/ownership.json')
        require(row['taskOwned'] is True and row['serial'] == self.serial and row['avdName'] == self.spec['avdName'] and row['avdHome'] == str(self.root / 'device/avd'), 'device ownership mismatch')
        require(self.text(['emu', 'avd', 'name']).splitlines()[0] == self.spec['avdName'], 'live AVD name mismatch')
        require(self.fingerprint() == read(self.root / 'device/fingerprint.json'), 'live device changed')

    def create(self):
        require(not (self.root / 'device/ownership.json').exists(), 'device already created; use a fresh output')
        env = {**os.environ, 'ANDROID_AVD_HOME': str(self.root / 'device/avd')}
        avd = self.spec['avdName']
        require(not (self.root / 'device/avd' / (avd + '.ini')).exists(), 'AVD exists')
        devices = subprocess.check_output([str(self.adb_path), 'devices'], text=True)
        require(not re.search(r'^' + re.escape(self.serial) + r'\s', devices, re.M), 'emulator port already in use')
        for port in (self.spec['port'], self.spec['port'] + 1):
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', port))
        command = [str(self.sdk / 'cmdline-tools/latest/bin/avdmanager'), 'create', 'avd', '-n', avd, '-k', 'system-images;android-36;google_apis;arm64-v8a', '-d', 'pixel_8']
        result = subprocess.run(command, input=b'no\n', capture_output=True, env=env, check=True)
        (self.root / 'device/create.log').write_bytes(result.stdout + result.stderr)
        command = [str(self.sdk / 'emulator/emulator'), '-avd', avd, '-port', str(self.spec['port']), '-no-window', '-no-snapshot', '-no-audio', '-no-boot-anim', '-gpu', 'swiftshader', '-memory', '3072', '-netdelay', 'none', '-netspeed', 'full']
        with (self.root / 'device/emulator.log').open('wb') as stream:
            process = subprocess.Popen(command, env=env, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            write(self.root / 'device/ownership.json', {'taskOwned': True, 'serial': self.serial, 'avdName': avd, 'avdHome': env['ANDROID_AVD_HOME'], 'pid': process.pid, 'command': command})
            self.call(['wait-for-device'], timeout=120)
            deadline = time.monotonic() + 120
            while self.text(['shell', 'getprop', 'sys.boot_completed']) != '1':
                require(time.monotonic() < deadline, 'boot deadline exceeded')
                time.sleep(1)
            self.call(['root'])
            self.call(['wait-for-device'], timeout=60)
            require(self.text(['shell', 'id', '-u']) == '0', 'rootable task emulator required')
            for args in (['shell', 'wm', 'size', '1080x2400'], ['shell', 'wm', 'density', '420'],
                         *[['shell', 'settings', 'put', 'global', key, '1'] for key in ('window_animation_scale', 'transition_animation_scale', 'animator_duration_scale')],
                         ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'], ['shell', 'wm', 'dismiss-keyguard']):
                self.call(args)
            fingerprint = self.fingerprint()
            require(fingerprint['ro.product.cpu.abi'] == 'arm64-v8a' and fingerprint['ro.build.version.sdk'] == '36', 'wrong system image')
            write(self.root / 'device/fingerprint.json', fingerprint)
        except BaseException:
            # This session is ours even when boot fails before an ADB fingerprint exists.
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                pass
            finally:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=10)
            write(self.root / 'device/create-failure.json', {'ownedProcessId': process.pid, 'exitCode': process.returncode, 'processStopped': True})
            raise

    def installed(self, name):
        remote = self.text(['shell', 'pm', 'path', package(name)])
        require(remote.startswith('package:') and '\n' not in remote, 'split/missing app')
        digest = self.text(['shell', 'sha256sum', remote[len('package:'):]]).split()[0]
        require(digest == read(self.root / 'builds.json')[name]['apkSha256'], 'installed APK changed')
        match = re.search(r'(?:userId|appId)=(\d+)', self.text(['shell', 'dumpsys', 'package', package(name)]))
        require(match, 'missing installed UID')
        return int(match[1])

    def tree(self, out=None, label=None):
        self.call(['shell', 'uiautomator', 'dump', '/sdcard/cmp-cached-window.xml'])
        data = self.call(['exec-out', 'cat', '/sdcard/cmp-cached-window.xml']).stdout
        if out is not None:
            (out / (label + '.xml')).write_bytes(data)
            (out / (label + '.png')).write_bytes(self.call(['exec-out', 'screencap', '-p']).stdout)
        return ET.fromstring(data)

    def tap(self, labels, out, tag, timeout=30):
        deadline = time.monotonic() + timeout
        while True:
            tree = self.tree()
            matches = [n for n in tree.iter('node') if n.attrib.get('text', '').strip().casefold() in {s.casefold() for s in labels}]
            if matches:
                require(len(matches) == 1, 'ambiguous stock control')
                node = matches[0]
                self.tree(out, tag)
                bounds = list(map(int, re.findall(r'\d+', node.attrib['bounds'])))
                require(len(bounds) == 4, 'bad control bounds')
                self.call(['shell', 'input', 'tap', (bounds[0] + bounds[2]) // 2, (bounds[1] + bounds[3]) // 2])
                return {'label': node.attrib['text'], 'bounds': bounds}
            require(time.monotonic() < deadline, 'stock control unavailable: ' + str(labels))
            time.sleep(.5)

    def calibrate(self):
        self.owned()
        require(not any((self.root / 'calibration').iterdir()), 'calibration already attempted; use a fresh output')
        builds = read(self.root / 'builds.json')
        for name in NAMES:
            self.call(['install', str(self.root / builds[name]['apk'])], timeout=120)
            self.installed(name)
        for name in NAMES:
            out = self.root / 'calibration' / name
            out.mkdir()
            row = {'accepted': False, 'timingSample': False}
            try:
                self.stop()
                self.call(['shell', 'pm', 'clear', package(name)])
                self.call(['logcat', '-G', '16M'])
                self.call(['logcat', '-c'])
                require(self.launch(name).returncode == 0, 'calibration launch failed')
                ui = self.cfg.get('stockUi', {}).get(name, {})
                actions = []
                if name != 'didomi':
                    actions.append(self.tap(['Privacy settings'], out, 'open'))
                first = self.epoch_ms()
                labels = ui.get('rejectLabels', ['Disagree & Close'] if name == 'didomi' else ['Reject All', 'Deny all', 'Reject', 'Disagree to All', 'Reject All & Close'])
                actions.append(self.tap(labels, out, 'before-rejection'))
                time.sleep(5)
                last = self.epoch_ms()
                self.tree(out, 'after-rejection')
                self.tap(['Capture current state'], out, 'diagnostic-control')
                deadline = time.monotonic() + 10
                while True:
                    text = self.text(['logcat', '-d', '-v', 'threadtime'])
                    (out / 'logcat.txt').write_text(text)
                    try:
                        found = [s for s in snapshots(events(text)) if s['payload'].get('kind') == 'diagnostic']
                        require(len(found) == 1, 'missing diagnostic snapshot')
                        captured = self.epoch_ms()
                        proof = validate(name, found[0]['payload'], captured, settings=self.cfg['tenants'][name])
                        denial_in_interval(name, proof, first, last)
                        row.update(accepted=True, pid=found[0]['pid'], capturedEpochMs=captured, rejectionWallClockInterval={'beforeMs': first, 'afterMs': last}, actions=actions, snapshot=found[0]['payload'], **proof)
                        break
                    except (ValueError, KeyError, TypeError, IndexError, OverflowError):
                        if time.monotonic() >= deadline:
                            raise
                        time.sleep(.2)
            except (ValueError, KeyError, TypeError, IndexError, OverflowError, OSError, subprocess.SubprocessError, ET.ParseError) as error:
                row['reason'] = str(error)
            finally:
                self.stop()
                write(out / 'result.json', row)

    def isolate(self):
        """Positive/negative same-UID TCP control, then persistent v4/v6 rejects."""
        self.owned()
        require(not (self.root / 'offline/network-proof.json').exists(), 'offline proof exists')
        names = [n for n in NAMES if read(self.root / 'calibration' / n / 'result.json')['accepted']]
        require(names, 'no real stock-denial calibrations')
        self.stop()
        uids = {n: self.installed(n) for n in names}
        log = []
        def record(args, check=True):
            p = self.call(args, check=False)
            log.append({'args': args, 'exitCode': p.returncode, 'stdout': p.stdout.decode(errors='replace'), 'stderr': p.stderr.decode(errors='replace')})
            require(not check or p.returncode == 0, 'network control command failed')
            return p.returncode
        done = threading.Event()
        listener = socket.socket()
        listener.bind(('127.0.0.1', 0))
        listener.listen()
        listener.settimeout(.25)
        port = listener.getsockname()[1]
        def accept():
            while not done.is_set():
                try:
                    connection, _ = listener.accept()
                    connection.close()
                except socket.timeout:
                    continue
                except OSError:
                    break
        thread = threading.Thread(target=accept, daemon=True)
        thread.start()
        positive, negative = {}, {}
        reverse_removed = False
        try:
            record(['reverse', 'tcp:' + str(port), 'tcp:' + str(port)])
            for name, uid in uids.items():
                positive[name] = record(['shell', 'su', str(uid), '/system/bin/nc', '-4', '-z', '-w', '3', '127.0.0.1', str(port)])
            for args in (['shell', 'svc', 'wifi', 'disable'], ['shell', 'svc', 'data', 'disable'], ['shell', 'ip', 'link', 'set', 'eth0', 'down']):
                record(args)
            for uid in uids.values():
                for binary in ('iptables', 'ip6tables'):
                    record(['shell', binary, '-I', 'OUTPUT', '1', '-m', 'owner', '--uid-owner', str(uid), '-j', 'REJECT'])
            for name, uid in uids.items():
                negative[name] = record(['shell', 'su', str(uid), '/system/bin/nc', '-4', '-z', '-w', '3', '127.0.0.1', str(port)], check=False)
                require(negative[name] != 0, 'offline same-UID probe succeeded')
        finally:
            done.set()
            listener.close()
            thread.join(timeout=2)
            reverse_removed = record(['reverse', '--remove', 'tcp:' + str(port)], check=False) == 0
            write(self.root / 'offline/network-proof.json', {'uids': uids, 'positive': positive, 'negative': negative, 'probeClosed': True, 'reverseRemoved': reverse_removed, 'commands': log})
        require(reverse_removed, 'reverse cleanup failed')
        for args in (['shell', 'dumpsys', 'connectivity'], ['shell', 'ip', 'route', 'show', 'table', 'all'], ['shell', 'ip', '-6', 'route', 'show', 'table', 'all']):
            record(args)
        write(self.root / 'offline/network-proof.json', {'uids': uids, 'positive': positive, 'negative': negative, 'probeClosed': True, 'reverseRemoved': reverse_removed, 'commands': log})

    def offline_live(self, names):
        self.owned()
        proof = read(self.root / 'offline/network-proof.json')
        require(proof['probeClosed'] is True and proof['reverseRemoved'] is True, 'probe cleanup missing')
        for name in names:
            uid = self.installed(name)
            require(uid == proof['uids'][name] and proof['positive'][name] == 0 and proof['negative'][name] != 0, 'network isolation proof differs')
            for binary in ('iptables', 'ip6tables'):
                self.call(['shell', binary, '-C', 'OUTPUT', '-m', 'owner', '--uid-owner', str(uid), '-j', 'REJECT'])

    def cleanup(self):
        self.owned()
        for name in NAMES:
            if self.call(['shell', 'pm', 'path', package(name)], check=False).stdout.strip():
                self.installed(name)
                self.call(['shell', 'am', 'force-stop', package(name)])
        self.call(['emu', 'kill'])
        self.call(['wait-for-disconnect'], timeout=30)
        ownership = read(self.root / 'device/ownership.json')
        deadline = time.monotonic() + 30
        while True:
            devices = subprocess.check_output([str(self.adb_path), 'devices'], text=True)
            state = next((line.split()[1] for line in devices.splitlines() if line.split() and line.split()[0] == self.serial), 'absent')
            ports_closed = []
            for port in (self.spec['port'], self.spec['port'] + 1):
                with socket.socket() as probe:
                    ports_closed.append(probe.connect_ex(('127.0.0.1', port)) != 0)
            try:
                os.kill(ownership['pid'], 0)
                process_stopped = False
            except ProcessLookupError:
                process_stopped = True
            stopped = process_stopped and all(ports_closed) and state in ('absent', 'offline')
            if stopped:
                break
            require(time.monotonic() < deadline, 'owned emulator has not stopped; no cleanup success recorded')
            time.sleep(.2)
        write(self.root / 'cleanup.json', {'stoppedSerial': self.serial, 'avdRetained': True, 'otherDevicesTouched': False,
              'processStopped': True, 'emulatorPortsClosed': True, 'adbDisconnected': True, 'serialStateAfterStop': state})
