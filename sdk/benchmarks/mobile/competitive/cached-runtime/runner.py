#!/usr/bin/env python3
"""Fresh Android cached-policy cohort. All outputs and tenant data stay external."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import time
import zipfile

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import harness as host_harness
from core import ANDROID_SETTINGS, apk_measure, check_settings, digest, manifest, read, require, sha, write
from device import Device, package
from parser import NAMES, denial_in_interval, events, parse, snapshots, validate
from protocol import PROFILE, canonical_schedule, replay_completed, source_manifest, summary, verify_rows, verify_schedule


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def disjoint(a, b):
    return not (a == b or a.is_relative_to(b) or b.is_relative_to(a))


def config(path):
    path = Path(path).resolve()
    value = read(path)
    require(value.get('schemaVersion') == 1, 'unsupported cached config')
    require(set(value) <= {'schemaVersion', 'output', 'sizeConfig', 'producer', 'device', 'stockUi', 'nativeLockRunner', 'androidSdk', 'javaHome', 'gradleHome'}, 'unknown cached config field; frozen inputs and tenants belong in sizeConfig')
    for key in ('output', 'sizeConfig', 'producer'):
        value[key] = str(host_harness.resolve(path.parent, value[key]))
    size = host_harness.config(value['sizeConfig'])
    for key in ('androidSdk', 'javaHome', 'gradleHome'):
        if value.get(key):
            value[key] = size[key] = str(host_harness.resolve(path.parent, value[key]))
    root, producer = Path(value['output']), Path(value['producer'])
    repo = HERE.parents[3]
    for protected in (repo, producer, Path(size['output']), Path(size['archive']), Path(size['maven'])):
        require(disjoint(root, protected), 'cached output overlaps repository, producer or frozen inputs')
    device = value['device']
    require(re.fullmatch(r'cmp_[a-zA-Z0-9_]+', device['avdName']) and type(device['port']) is int and 5554 <= device['port'] <= 5682 and device['port'] % 2 == 0, 'configure a new cmp_ AVD and free even emulator port')
    require(size.get('nativeLockRunner'), 'size config must define the shared native lock runner')
    # Relative paths in command arrays are resolved against their config file.
    lock_runner = value.get('nativeLockRunner', size['nativeLockRunner'])
    require(isinstance(lock_runner, list) and lock_runner and all(isinstance(s, str) and s for s in lock_runner), 'nativeLockRunner must be a command array')
    lock_base = path.parent if 'nativeLockRunner' in value else Path(size['_config']).parent
    lock_runner = [str(host_harness.resolve(lock_base, s)) if s.startswith('.') else s for s in lock_runner]
    tenants = size.get('tenants', {})
    for name, required in {'didomi': ('apiKey', 'noticeId', 'target'), 'usercentrics': ('settingsId', 'target'), 'sourcepoint': ('accountId', 'propertyId', 'propertyName', 'privacyManagerId')}.items():
        require(all(tenants.get(name, {}).get(k) not in (None, '', 0, 'UNCONFIGURED') for k in required), 'configure real published tenant: ' + name)
    tenants.setdefault('c15t', {}).setdefault('privacyUrl', 'https://example.com/privacy')
    cfg = {**size, **value, 'nativeLockRunner': lock_runner, 'tenants': tenants,
           'deviceRoot': str(root / 'device/avd'), 'gradleHome': str(root / 'gradle-cache'),
           '_size': size, '_config': str(path)}
    require(root != Path('/') and root.name not in ('', '.', '..'), 'unsafe output root')
    return cfg


def verify_inputs(cfg):
    """Read frozen archives/Maven and Git identity; never build from the producer."""
    inputs = host_harness.validate_inputs(cfg)
    producer = Path(cfg['producer'])
    head = subprocess.check_output(['git', '-C', str(producer), 'rev-parse', 'HEAD'], text=True).strip()
    status = subprocess.check_output(['git', '-C', str(producer), 'status', '--porcelain', '--untracked-files=all'], text=True)
    require(head == host_harness.PINS['sourceRef'] and not status, 'producer must remain clean at the frozen sourceRef')
    return {**inputs, 'producerRef': head}


def checked_prepared(cfg):
    root = Path(cfg['output'])
    row = read(root / 'prepared.json')
    require(row['inputs'] == verify_inputs(cfg) and row['sources'] == source_manifest(), 'frozen inputs or integration source changed; use a fresh output')
    require(row['configurationSha256'] == sha(cfg['_config']) and row['sizeConfigurationSha256'] == sha(cfg['sizeConfig']), 'configuration changed after prepare')
    return row


def prepare(cfg):
    root = Path(cfg['output'])
    require(not root.exists(), 'output exists; every fresh cohort needs a new output root')
    inputs = verify_inputs(cfg)
    descriptors = {n: host_harness.descriptor(cfg['_size'], 'android-release', n) for n in NAMES}
    root.mkdir(parents=True, exist_ok=False)
    for path in ('logs', 'inputs', 'artifacts', 'runtime/inputs', 'runtime/artifacts', 'calibration', 'offline', 'device/avd'):
        (root / path).mkdir(parents=True, exist_ok=True)
    construction = {}
    for name in NAMES:
        source = Path(descriptors[name]['host'])
        host = host_harness.host_for(cfg, 'android', name, runtime=True)
        shutil.copytree(source, host, symlinks=True, ignore=shutil.ignore_patterns(*host_harness.EXCLUDED))
        shutil.copytree(source / 'node_modules', host / 'node_modules', symlinks=True)
        for directory, dirs, _ in os.walk(host / 'node_modules', followlinks=False):
            for child in list(dirs):
                path = Path(directory) / child
                if child in ('build', '.gradle', '.cxx', '.kotlin') and 'android' in path.relative_to(host / 'node_modules').parts[:-1]:
                    require(not path.is_symlink(), 'unexpected linked native build directory')
                    shutil.rmtree(path)
                    dirs.remove(child)
        for link in (host / 'node_modules').rglob('*'):
            if link.is_symlink():
                require(link.resolve().is_relative_to(host / 'node_modules'), 'external dependency symlink, refusing to build against producer or size host')
        if name != 'c15t':
            pin = next(r for r in host_harness.PINS['wrappers'] if r['name'] == name)
            archive = name + '-' + pin['wrapperVersion'] + '.tgz'
            host_harness.copy_input(source.parent / 'inputs' / archive, root / 'runtime/inputs' / archive)
        host_harness.verify_installed(cfg, host, name)
        for filename in ('App.tsx', 'runtime-types.ts'):
            shutil.copy2(HERE / 'fixtures' / filename, host / filename)
        shutil.copy2(HERE / 'fixtures' / (name + '.tsx'), host / 'consent-adapter.tsx')
        (host / 'benchmark-config.ts').write_text(host_harness.tenant_source(cfg))
        java = host / 'android/app/src/main/java/com/c15t/expodev'
        replacements = [
            (java / 'MainApplication.kt', 'class MainApplication : Application(), ReactApplication {', 'class MainApplication : Application(), ReactApplication {\n  override fun attachBaseContext(base: android.content.Context) {\n    BenchmarkClock.start()\n    super.attachBaseContext(base)\n  }'),
            (java / 'MainApplication.kt', 'PackageList(this).packages.apply {', 'PackageList(this).packages.apply {\n          add(BenchmarkPackage())'),
            (java / 'MainActivity.kt', '  override fun onCreate(savedInstanceState:', '  override fun onResume() {\n    BenchmarkClock.resume()\n    super.onResume()\n  }\n  override fun onCreate(savedInstanceState:'),
            (host / 'android/app/build.gradle', "applicationId 'com.c15t.expodev'", "applicationId 'com.c15t.expodev'\n        applicationIdSuffix '.cached." + name + "'"),
        ]
        require(not (java / 'runtime-benchmark.kt').exists(), 'size host already instrumented')
        for path, before, after in replacements:
            text = path.read_text()
            require(text.count(before) == 1, 'unexpected generated host source: ' + path.name)
            path.write_text(text.replace(before, after))
        shutil.copy2(HERE / 'fixtures/runtime-benchmark.kt', java / 'runtime-benchmark.kt')
        prepared = read(host / 'prepared.json')
        prepared.update(runtime=True, profile='android-release', files=manifest(host, host_harness.EXCLUDED))
        write(host / 'prepared.json', prepared)
        construction[name] = {'sizeBuildRecordSha256': sha(descriptors[name]['buildRecord']), 'sizeArtifactSha256': sha(descriptors[name]['artifact']), 'hostInputsSha256': digest(host_harness.host_inputs(host))}
    write(root / 'prepared.json', {'schemaVersion': 1, 'profileId': PROFILE, 'createdUtc': utc(), 'inputs': inputs,
          'sources': source_manifest(), 'configurationSha256': sha(cfg['_config']), 'sizeConfigurationSha256': sha(cfg['sizeConfig']), 'construction': construction})


def verify_builds(cfg):
    root = Path(cfg['output'])
    checked_prepared(cfg)
    result = {}
    signers = set()
    for name in NAMES:
        host = host_harness.host_for(cfg, 'android', name, runtime=True)
        output = root / 'runtime/artifacts' / name
        complete = read(output / 'build-complete.json')
        require(complete['runtime'] is True and complete['profile'] == 'android-release' and complete['vendor'] == name, 'wrong runtime build')
        require(complete['hostInputsSha256'] == digest(host_harness.host_inputs(host)), 'host changed after build')
        require(complete['inputs'] == host_harness.validate_inputs(cfg), 'build inputs changed')
        require([r for r in manifest(output) if r['path'] != 'build-complete.json'] == complete['artifacts'], 'build artifact changed')
        host_harness.verify_installed(cfg, host, name)
        settings = read(output / 'settings.json')
        require(settings['applicationId'] == package(name), 'wrong cached application ID')
        check_settings('android-release', {**settings, 'applicationId': ANDROID_SETTINGS['applicationId']})
        signers.add((settings['signingStoreSha256'], settings['signingAlias']))
        compiler = read(output / 'compiler.json')
        require(compiler.get('kotlinPluginSources') and all('/kotlin-gradle-plugin/2.1.20/' in row['location'] for row in compiler['kotlinPluginSources']), 'Kotlin plugin differs from 2.1.20')
        require(any('org.jetbrains.kotlin:kotlin-compiler-embeddable:2.1.20' in row['components'] for row in compiler['compilerConfigurations']), 'Kotlin compiler differs from 2.1.20')
        from core import check_r8
        check_r8('android-release', output / 'configuration.txt', output / 'mapping.txt')
        graph = read(output / 'dependencies.json')
        normalize = lambda rows: sorted((r['coordinate'], r['size'], r['sha256']) for r in rows)
        require(normalize(graph) == normalize(host_harness.PINS['androidArtifacts'][name]), 'native dependency graph differs from pins')
        apk = output / 'app-release.apk'
        apk_measure(apk, output / 'mapping.txt', name, for_size=False)
        with zipfile.ZipFile(apk) as archive:
            bundle = archive.read('assets/index.android.bundle')
            require(bundle[:4] == bytes.fromhex('c61fbc03'), 'Hermes required')
            dex = b''.join(archive.read(p) for p in archive.namelist() if re.fullmatch(r'classes\d*\.dex', p))
            require(all(s in dex for s in (b'ATTACH_BASE_CONTEXT', b'READY_LAYOUT', b'READY_DRAW', b'WARM_DRAW', b'SNAPSHOT')), 'native markers missing from APK')
        maps = list((host / 'android/app/build/intermediates/sourcemaps').rglob('*.packager.map'))
        require(len(maps) == 1, 'missing/ambiguous mounted source map')
        source_map = read(maps[0])
        for file in ('App.tsx', 'consent-adapter.tsx'):
            matches = [body for path, body in zip(source_map['sources'], source_map['sourcesContent']) if path == file or path.endswith('/' + file)]
            require(matches == [(host / file).read_text()], 'compiled source differs from runtime fixture')
        result[name] = {'apk': str(apk.relative_to(root)), 'apkSha256': sha(apk), 'buildRecordSha256': sha(output / 'build-complete.json'), 'sourceMap': str(maps[0].relative_to(root)), 'sourceMapSha256': sha(maps[0]), 'hostInputsSha256': complete['hostInputsSha256']}
    require(len(signers) == 1, 'runtime hosts must use the same signer')
    return result


def build(cfg):
    checked_prepared(cfg)
    root = Path(cfg['output'])
    require(not (root / 'builds.json').exists() and not any((root / 'runtime/artifacts').iterdir()), 'build already attempted; use fresh output')
    for name in NAMES:
        host = host_harness.host_for(cfg, 'android', name, runtime=True)
        host_harness.invoke(['node', 'node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false'], host, root / 'logs' / (name + '-types.log'), cfg)
        host_harness.build(cfg, 'android-release', name, runtime=True)
    write(root / 'builds.json', verify_builds(cfg))


def calibration(cfg):
    require(read(Path(cfg['output']) / 'builds.json') == verify_builds(cfg), 'build binding changed')
    Device(cfg).calibrate()


def capture(cfg, device, name, out, profile, calibration, prior, stopped):
    out.mkdir(parents=True, exist_ok=True)
    path = out / (profile + '-logcat.txt')
    path.touch(exist_ok=False)
    row = {'participant': name, 'profile': profile, 'accepted': False, 'reason': None, 'startedUtc': utc(), 'previousPid': prior,
           'completedWithinDeadline': False, 'launchExit': None, 'actualPids': [], 'allParticipantPidsAfterStop': stopped}
    stream = None
    try:
        device.call(['logcat', '-c'])
        with path.open('wb') as log:
            stream = subprocess.Popen([str(device.adb_path), '-s', device.serial, 'logcat', '-v', 'threadtime'], stdout=log, stderr=subprocess.STDOUT)
            time.sleep(.1)
            if profile == 'warm':
                device.call(['shell', 'input', 'keyevent', 'KEYCODE_HOME'])
                time.sleep(2)
                require(prior is not None and device.pids(name) == [str(prior)], 'warm PID changed in background')
            row['deviceStartEpochMs'] = device.epoch_ms()
            began = time.monotonic()
            launch = device.launch(name)
            (out / (profile + '-launch.txt')).write_bytes(launch.stdout + launch.stderr)
            row['launchExit'] = launch.returncode
            deadline = 30 if profile == 'cold' else 10
            while time.monotonic() - began < deadline:
                time.sleep(.2)
                row['deviceEndEpochMs'] = device.epoch_ms()
                parsed = parse(path.read_text(errors='replace'), name, calibration, profile, captured_epoch_ms=row['deviceEndEpochMs'], settings=cfg['tenants'][name])
                if parsed['accepted'] and time.monotonic() - began < deadline:
                    row['completedWithinDeadline'] = True
                    break
            time.sleep(.35)
            stream.terminate()
            stream.wait(timeout=5)
            stream = None
        row['deviceEndEpochMs'] = device.epoch_ms()
        row['actualPids'] = device.pids(name)
        row.update(parse(path.read_text(errors='replace'), name, calibration, profile, captured_epoch_ms=row['deviceEndEpochMs'], settings=cfg['tenants'][name]))
        checks = [(row['completedWithinDeadline'], 'deadline without valid snapshot'), (row['launchExit'] == 0, 'launch failed'),
                  (row['actualPids'] == [str(row.get('pid'))], 'marker/live PID mismatch'),
                  (row.get('pid') != prior if profile == 'cold' else row.get('pid') == prior and prior is not None, 'cold/warm PID mismatch')]
        for valid, reason in checks:
            if not valid:
                row.update(accepted=False, reason=reason)
    except (ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        row.update(accepted=False, reason=str(error))
    finally:
        if stream is not None:
            stream.terminate()
            stream.wait(timeout=5)
    row.update(rawLogSha256=sha(path), finishedUtc=utc())
    write(out / (profile + '-result.json'), row)
    return row


def preflight(cfg):
    root = Path(cfg['output'])
    checked_prepared(cfg)
    device = Device(cfg)
    device.isolate()
    result = {}
    for name in NAMES:
        cal = read(root / 'calibration' / name / 'result.json')
        if not cal['accepted']:
            result[name] = {'eligible': False, 'reason': cal.get('reason', 'stock calibration failed')}
            continue
        stopped = device.stop()
        out = root / 'offline' / name
        cold = capture(cfg, device, name, out, 'cold', cal, None, stopped)
        warm = capture(cfg, device, name, out, 'warm', cal, cold.get('pid'), stopped)
        result[name] = {'eligible': cold['accepted'] and warm['accepted'], 'cold': cold, 'warm': warm, 'timingSample': False}
    device.stop()
    write(root / 'eligibility.json', result)


def verify_prerequisites(cfg):
    """Derive eligibility from full calibration/offline proofs before freezing."""
    root = Path(cfg['output'])
    proof = read(root / 'offline/network-proof.json')
    require(proof['probeClosed'] is True and proof['reverseRemoved'] is True, 'network probe cleanup missing')
    eligibility = read(root / 'eligibility.json')
    for name in NAMES:
        cal = read(root / 'calibration' / name / 'result.json')
        if not cal['accepted']:
            require(eligibility[name]['eligible'] is False, 'failed calibration marked eligible')
            continue
        require(proof['positive'][name] == 0 and proof['negative'][name] != 0 and type(proof['uids'][name]) is int and proof['uids'][name] > 0, 'missing same-UID network controls')
        items = snapshots(events((root / 'calibration' / name / 'logcat.txt').read_text()))
        diagnostic = [s for s in items if s['payload'].get('kind') == 'diagnostic']
        require(len(diagnostic) == 1 and diagnostic[0]['payload'] == cal['snapshot'] and diagnostic[0]['pid'] == cal['pid'], 'calibration differs from native raw snapshot')
        require(cal['actions'] and len(cal['actions'][-1]['bounds']) == 4, 'missing actual rejection action')
        for file in ('before-rejection.png', 'before-rejection.xml', 'after-rejection.png', 'after-rejection.xml'):
            require((root / 'calibration' / name / file).stat().st_size > 0, 'missing stock rejection screenshot/XML')
        actual = validate(name, cal['snapshot'], cal['capturedEpochMs'], settings=cfg['tenants'][name])
        require(actual['denial'] == cal['denial'] and actual['targetId'] == cal['targetId'], 'calibration binding changed')
        interval = cal['rejectionWallClockInterval']
        denial_in_interval(name, actual, interval['beforeMs'], interval['afterMs'])
        pair = []
        for profile in ('cold', 'warm'):
            row = read(root / 'offline' / name / (profile + '-result.json'))
            path = root / 'offline' / name / (profile + '-logcat.txt')
            require(sha(path) == row['rawLogSha256'], 'offline preflight log changed')
            parsed = parse(path.read_text(), name, cal, profile, captured_epoch_ms=row.get('deviceEndEpochMs', 0), settings=cfg['tenants'][name])
            accepted = parsed['accepted'] and row['completedWithinDeadline'] is True and row['launchExit'] == 0 and row['actualPids'] == [str(parsed.get('pid'))]
            if profile == 'cold':
                accepted = accepted and parsed.get('pid') != cal['pid']
            else:
                accepted = accepted and pair[0].get('pid') is not None and parsed.get('pid') == pair[0]['pid']
            require(row['accepted'] == accepted, 'forged offline preflight acceptance')
            pair.append({**parsed, 'accepted': accepted})
        require(eligibility[name]['eligible'] == all(r['accepted'] for r in pair), 'eligibility differs from offline cold/warm proof')


def freeze(cfg):
    root = Path(cfg['output'])
    require(not (root / 'schedule.json').exists(), 'schedule already frozen')
    require(read(root / 'builds.json') == verify_builds(cfg), 'build binding changed')
    verify_prerequisites(cfg)
    write(root / 'schedule.json', canonical_schedule(root))


def sample(cfg):
    root = Path(cfg['output'])
    schedule = read(root / 'schedule.json')
    checked_prepared(cfg)
    verify_schedule(schedule, canonical_schedule(root))
    require(not (root / 'samples').exists() and not (root / 'sample-results.json').exists(), 'cohort already attempted; no resume/replacements')
    device = Device(cfg)
    names = [n for n in NAMES if schedule['eligibility'][n]]
    device.offline_live(names)
    (root / 'samples').mkdir()
    write(root / 'samples/started.json', {'utc': utc(), 'scheduleSha256': sha(root / 'schedule.json')})
    # The caller acquired the shared lock before reaching quiet or settling.
    quiet = subprocess.run(['ec', 'quiet'], capture_output=True)
    write(root / 'quiet.json', {'command': ['ec', 'quiet'], 'exitCode': quiet.returncode, 'stdout': quiet.stdout.decode(errors='replace'), 'stderr': quiet.stderr.decode(errors='replace')})
    print(quiet.stdout.decode(errors='replace'), flush=True)
    require(quiet.returncode == 0, 'ec quiet failed')
    (root / 'processes-before.txt').write_bytes(subprocess.check_output(['ps', '-axo', 'pid,ppid,%cpu,command']))
    time.sleep(schedule['settlingSeconds'])
    rows, last = [], dict.fromkeys(NAMES)
    try:
        for attempt in schedule['attempts']:
            name = attempt['participant']
            out = root / 'samples' / ('%03d-%s' % (attempt['attempt'], name))
            stopped = device.stop()
            time.sleep(schedule['cooldownSeconds'])
            cal = read(root / 'calibration' / name / 'result.json')
            cold = capture(cfg, device, name, out, 'cold', cal, last[name], stopped)
            last[name] = cold.get('pid') or last[name]
            warm = capture(cfg, device, name, out, 'warm', cal, cold.get('pid'), stopped)
            rows.extend([{**attempt, **cold}, {**attempt, **warm}])
            write(root / 'sample-results.json', {'scheduleSha256': sha(root / 'schedule.json'), 'rows': rows, 'summary': summary(rows, schedule['eligibility'])})
            print(attempt['attempt'], name, cold['accepted'], warm['accepted'], flush=True)
    finally:
        device.stop()
    write(root / 'samples/finished.json', {'utc': utc()})


def verify(cfg):
    root = Path(cfg['output'])
    checked_prepared(cfg)
    verify_prerequisites(cfg)
    schedule = read(root / 'schedule.json')
    verify_schedule(schedule, canonical_schedule(root))
    reported = read(root / 'sample-results.json')
    require(reported['scheduleSha256'] == sha(root / 'schedule.json'), 'schedule binding changed')
    calibration = {n: read(root / 'calibration' / n / 'result.json') for n in NAMES}
    actual = verify_rows(root, schedule, reported['rows'], calibration, cfg['tenants'])
    require(actual == reported['summary'], 'reported summary differs from raw logs')
    return {'profileId': PROFILE, 'summary': actual, 'rawLogsReplayed': len(reported['rows'])}


NATIVE = ('build', 'device', 'calibrate', 'preflight', 'sample', 'cleanup')


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('stage', choices=['prepare', 'build', 'device', 'calibrate', 'preflight', 'freeze', 'sample', 'verify', 'replay', 'cleanup'])
    cli.add_argument('--config', type=Path)
    cli.add_argument('--evidence', type=Path, help='read-only completed 2026-10-30 external evidence root for replay')
    cli.add_argument('--lock-token', help=argparse.SUPPRESS)
    args = cli.parse_args()
    if args.stage == 'replay':
        require(args.evidence and not args.config, 'replay needs --evidence only')
        print(json.dumps(replay_completed(args.evidence.resolve()), indent=2))
        return
    require(args.config, '--config required')
    cfg = config(args.config)
    if args.stage in NATIVE and not args.lock_token:
        token = secrets.token_hex(16)
        command = cfg['nativeLockRunner'] + ['cmp-cached-' + args.stage, sys.executable, str(HERE / 'runner.py'), args.stage, '--config', str(args.config.resolve()), '--lock-token', token]
        raise SystemExit(subprocess.call(command, env={**host_harness.environment(cfg), 'CMP_CACHED_LOCK_TOKEN': token}))
    if args.stage in NATIVE:
        require(args.lock_token == os.environ.get('CMP_CACHED_LOCK_TOKEN'), 'use the public command to acquire the shared native lock')
    initial = verify_inputs(cfg)
    try:
        if args.stage == 'device':
            checked_prepared(cfg)
            Device(cfg).create()
        elif args.stage == 'cleanup':
            Device(cfg).cleanup()
        else:
            result = globals()[args.stage](cfg)
            if result is not None:
                print(json.dumps(result, indent=2))
    finally:
        require(verify_inputs(cfg) == initial, 'frozen inputs or producer changed during command')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error)) from error
