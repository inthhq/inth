"""Cached denial runtime profile. No latency is accepted without raw native markers."""
import datetime
import json
import math
import re
import subprocess
import time
from pathlib import Path

from core import HERE, manifest, bind_files, digest, percentile, read, require, sha, verify_files, write

SUPPORTED = ('c15t', 'didomi', 'usercentrics')
ENDPOINT = 'Application.attachBaseContext to first decor OnDraw after validated cached-denial Ready layout'


def parse(text, vendor, calibration=None):
    result = {'accepted': False, 'reason': None}
    try:
        require(vendor in SUPPORTED, 'unsupported runtime participant')
        events = []
        for line in text.splitlines():
            if 'CMP_BENCH' not in line:
                continue
            match = re.search(r'\s(\d+)\s+\d+\s+[VDIWEF]\s+CMP_BENCH\s*:\s*(\{.*)', line)
            require(match, 'malformed native marker line')
            event = json.loads(match[2])
            require(type(event.get('pid')) is int and event['pid'] > 0 and event['pid'] == int(match[1]), 'logcat/marker PID mismatch')
            events.append(event)
        def one(kind):
            matches = [e for e in events if e.get('event') == kind]
            require(len(matches) == 1, f'expected one {kind} marker')
            return matches[0]
        start, layout, draw = [one(kind) for kind in ('ATTACH_BASE_CONTEXT', 'READY_LAYOUT', 'READY_DRAW')]
        require(events.index(start) < events.index(layout) < events.index(draw), 'out-of-order marker records')
        pid = start['pid']
        require(pid == layout['pid'] == draw['pid'], 'marker PID mismatch')
        def nanos(event, key):
            raw = event[key]
            require(isinstance(raw, str) and re.fullmatch(r'[1-9]\d*', raw), 'invalid native nanoseconds')
            return int(raw)
        began, laid, ended = nanos(start, 'nanos'), nanos(layout, 'nanos'), nanos(draw, 'nanos')
        elapsed = nanos(draw, 'elapsedNanos')
        require(began < laid <= ended and nanos(draw, 'startNanos') == began and elapsed == ended - began, 'invalid marker timing arithmetic/order')
        require(elapsed <= 30_000_000_000, 'timing exceeds fixed deadline')
        chunks = [e for e in events if e.get('event') == 'SNAPSHOT']
        require(chunks and all(e['pid'] == pid and events.index(e) > events.index(draw) for e in chunks), 'snapshot must follow draw in same process')
        payloads = []
        for sequence in {e['sequence'] for e in chunks}:
            require(type(sequence) is int and sequence > 0, 'invalid snapshot sequence')
            group = [e for e in chunks if e['sequence'] == sequence]
            parts = group[0]['parts']
            require(type(parts) is int and 1 <= parts <= 100 and all(type(e['parts']) is int and e['parts'] == parts for e in group), 'inconsistent chunk counts')
            require(len(group) == parts and all(type(e['part']) is int for e in group) and sorted(e['part'] for e in group) == list(range(parts)), 'incomplete/duplicate snapshot chunks')
            payloads.append(json.loads(''.join(e['body'] for e in sorted(group, key=lambda e: e['part']))))
        require(len(payloads) == 1 and payloads[0].get('valid') is True, 'expected one complete valid snapshot')
        payload = payloads[0]
        target, raw = payload['targetId'], payload['raw']
        require(isinstance(target, str) and target, 'missing configured denial target')
        if vendor == 'c15t':
            require(raw['ready'] is True and raw['policyPending'] is False and raw['error'] is None, 'c15t not eligible: ready/policy/error')
            require(target in raw['consentCategories'] and raw['effectivePermissions'][target] is False, 'missing denied effective category')
            choice = raw['explicitChoice']['categories'][target]
            require(choice['value'] is False and type(choice['confirmedAt']) is int and choice['confirmedAt'] > 0 and choice['basis'], 'missing explicit denial')
            denial = {'confirmedAt': choice['confirmedAt'], 'basis': choice['basis']}
        elif vendor == 'didomi':
            status = raw['currentUserStatus']
            purpose = status['purposes'][target]
            require(raw['shouldUserStatusBeCollected'] is False and target in raw['requiredPurposeIds'] and purpose['id'] == target and purpose['enabled'] is False, 'Didomi lacks configured denied purpose')
            require(isinstance(status['consent_string'], str) and status['consent_string'] and isinstance(status['updated'], str), 'Didomi lacks saved choice')
            datetime.datetime.fromisoformat(status['updated'].replace('Z', '+00:00'))
            denial = {'updated': status['updated'], 'consentString': status['consent_string']}
        else:
            require(raw['shouldCollectConsent'] is False, 'Usercentrics needs consent')
            matches = [s for s in raw['consents'] if s['templateId'] == target]
            require(len(matches) == 1, 'Usercentrics missing/duplicate target')
            service = matches[0]
            require(service['isEssential'] is False and service['status'] is False and type(service['type']) is int and service['type'] == 0, 'Usercentrics target not explicitly denied optional service')
            history = [h for h in service['history'] if h['status'] is False and h['type'] == 0 and type(h['timestampInMillis']) is int and -(2**31) <= h['timestampInMillis'] < 2**31]
            require(history, 'Usercentrics lacks raw signed32 denial history')
            denial = {'history': history}
        if calibration is not None:
            require(target == calibration['targetId'] and denial == calibration['denial'], 'denial differs from frozen calibration')
        result.update(accepted=True, pid=pid, targetId=target, denial=denial, snapshot=payload, elapsedNanos=elapsed, elapsedMs=elapsed / 1e6)
    except (ValueError, KeyError, TypeError, IndexError) as error:
        result['reason'] = str(error)
    return result


def attempts(eligible, rounds=30):
    require(type(rounds) is int and rounds > 0, 'invalid attempt count')
    require(eligible and len(set(eligible)) == len(eligible) and all(n in SUPPORTED for n in eligible), 'invalid eligible participant set')
    rows = []
    for round_index in range(rounds):
        offset = round_index % len(eligible)
        order = eligible[offset:] + eligible[:offset]
        for position, vendor in enumerate(order):
            rows.append({'attempt': len(rows) + 1, 'round': round_index + 1, 'position': position + 1, 'participant': vendor})
    return rows


def denial_in_interval(vendor, calibration, first, last):
    require(type(first) is int and type(last) is int and 0 < first <= last and last - first <= 300_000, 'invalid stock rejection interval')
    denial = calibration['denial']
    if vendor == 'c15t':
        require(first <= denial['confirmedAt'] <= last, 'c15t denial outside stock rejection interval')
    elif vendor == 'didomi':
        stamp = int(datetime.datetime.fromisoformat(denial['updated'].replace('Z', '+00:00')).timestamp() * 1000)
        require(first // 1000 <= stamp // 1000 <= last // 1000, 'Didomi denial outside stock rejection interval')
    else:
        def in_interval(raw):
            return any(first <= raw + k * 2**32 <= last for k in range(first // 2**32 - 1, last // 2**32 + 2))
        require(any(in_interval(h['timestampInMillis']) for h in denial['history']), 'raw signed32 denial does not match stock rejection interval modulo 2^32')


def inputs(cfg):
    from harness import resolve
    path = resolve(Path(cfg['_config']).parent, cfg['runtimeInputs'])
    value = read(path)
    require(value.get('schemaVersion') == 1, 'unsupported runtime input schema')
    for row in value['participants'].values():
        for key in ['apk', 'buildRecord', 'mapping', 'dependencies', 'settings', 'calibrationLog', 'offlineLog', 'stockUiScreenshot', 'stockUiXml', 'cacheArchive']:
            if row.get(key):
                row[key] = str(resolve(path.parent, row[key]))
    for key in ['networkProof', 'ownershipFile']:
        value[key] = str(resolve(path.parent, value[key]))
    return value


def bind_runtime_artifacts(row, build):
    artifacts = {entry['path']: entry for entry in build['artifacts']}
    require(len(artifacts) == len(build['artifacts']), 'duplicate runtime build artifact')
    for key, name in [('apk', 'app-release.apk'), ('mapping', 'mapping.txt'), ('dependencies', 'dependencies.json'), ('settings', 'settings.json')]:
        expected = artifacts.get(name)
        require(expected is not None and Path(row[key]).stat().st_size == expected['bytes'] and sha(row[key]) == expected['sha256'], f'runtime {key} differs from its build record')


def eligibility(cfg, value):
    eligible = []
    statuses = {}
    files = [value['networkProof'], value['ownershipFile']]
    proof = read(value['networkProof'])
    probe = proof['taskOwnedTcpProbe']
    require(probe['listenerClosed'] is True and probe['adbReverseRemoved'] is True, 'network probe cleanup missing')
    ownership = read(value['ownershipFile'])
    require(ownership.get('taskOwned') is True and ownership['serial'] == value['device']['serial'] and ownership['avdName'] == value['device']['avdName'], 'device ownership mismatch')
    for vendor, row in value['participants'].items():
        require(vendor in SUPPORTED, f'unsupported runtime app: {vendor}')
        try:
            require(row.get('configured') is True, 'tenant config unavailable')
            for key in ['apk', 'buildRecord', 'mapping', 'dependencies', 'settings', 'calibrationLog', 'offlineLog', 'stockUiScreenshot', 'stockUiXml', 'cacheArchive']:
                require(Path(row[key]).is_file() and Path(row[key]).stat().st_size > 0, f'missing runtime {key}')
                files.append(row[key])
            require(sha(row['apk']) == row['apkSha256'], 'runtime APK hash mismatch')
            from core import ANDROID_SETTINGS, apk_measure, check_settings
            from harness import PINS, host_inputs, validate_inputs, verify_installed
            build = read(row['buildRecord'])
            require(build['runtime'] is True and build['profile'] == 'android-release' and build['vendor'] == vendor, 'unsupported runtime build record')
            host = Path(build['host'])
            require(digest(host_inputs(host)) == build['hostInputsSha256'], 'runtime host changed after build')
            require(build['inputs'] == validate_inputs(cfg), 'runtime producer inputs changed')
            require([f for f in manifest(Path(row['buildRecord']).parent) if f['path'] != 'build-complete.json'] == build['artifacts'], 'runtime build artifacts changed')
            bind_runtime_artifacts(row, build)
            for source, installed in [('App.tsx', 'App.tsx'), ('runtime-types.ts', 'runtime-types.ts'), (vendor + '.tsx', 'consent-adapter.tsx')]:
                require(sha(host / installed) == sha(HERE / 'fixtures/runtime' / source), 'runtime fixture source binding mismatch')
            verify_installed(cfg, host, vendor)
            expected_classes = apk_measure(row['apk'], row['mapping'], vendor)
            require(expected_classes['sdkUniqueDexDestinations'] > 0, 'runtime APK lacks native SDK')
            settings = read(row['settings'])
            require(settings['applicationId'] == 'com.c15t.expodev.benchmark.' + vendor, 'runtime application ID mismatch')
            check_settings('android-release', {**settings, 'applicationId': ANDROID_SETTINGS['applicationId']})
            dependencies = [{k: v for k, v in d.items() if k in ('coordinate', 'size', 'sha256')} for d in read(row['dependencies'])]
            require(sorted(dependencies, key=lambda d: (d['coordinate'], d['sha256'])) == sorted(PINS['androidArtifacts'][vendor], key=lambda d: (d['coordinate'], d['sha256'])), 'runtime native dependency parity mismatch')
            import zipfile
            with zipfile.ZipFile(row['apk']) as archive:
                dex = b''.join(archive.read(n) for n in archive.namelist() if re.fullmatch(r'classes\d*\.dex', n))
                for marker in (b'ATTACH_BASE_CONTEXT', b'READY_LAYOUT', b'READY_DRAW', b'SNAPSHOT'):
                    require(marker in dex, 'runtime instrumentation missing from DEX')
            calibration = parse(Path(row['calibrationLog']).read_text(), vendor)
            require(calibration['accepted'], 'stock calibration failed: ' + str(calibration['reason']))
            denial_in_interval(vendor, calibration, row['rejectionStartedEpochMs'], row['rejectionEndedEpochMs'])
            offline = parse(Path(row['offlineLog']).read_text(), vendor, calibration)
            require(offline['accepted'], 'offline preflight failed: ' + str(offline['reason']))
            require(probe['positiveOnlineExitCodes'][vendor] == 0 and probe['negativeOfflineExitCodes'][vendor] != 0, 'same-UID positive/negative isolation probe failed')
            require(type(proof['uids'][vendor]) is int and proof['uids'][vendor] > 0, 'missing app UID')
            eligible.append(vendor)
            statuses[vendor] = {'eligible': True, 'targetId': calibration['targetId'], 'denial': calibration['denial'], 'previousPid': offline['pid']}
        except (ValueError, OSError, KeyError, TypeError) as error:
            statuses[vendor] = {'eligible': False, 'reason': str(error)}
    for vendor in ('c15t', 'onetrust', 'didomi', 'usercentrics', 'sourcepoint'):
        statuses.setdefault(vendor, {'eligible': False, 'reason': 'no configured, validated runtime adapter inputs'})
    return eligible, statuses, bind_files(sorted(set(files)))


def adb(cfg, value, args, check=True, timeout=45):
    from harness import environment
    sdk = environment(cfg).get('ANDROID_HOME')
    require(sdk, 'Android SDK root required')
    serial = value['device']['serial']
    require(re.fullmatch(r'emulator-\d+', serial), 'only explicitly owned emulator serials are supported')
    result = subprocess.run([str(Path(sdk) / 'platform-tools/adb'), '-s', serial, *args], capture_output=True, timeout=timeout)
    require(not check or result.returncode == 0, f'adb failed: {args}: {result.stderr.decode(errors="replace")}')
    return result


def live_device(cfg, value, statuses):
    require(adb(cfg, value, ['emu', 'avd', 'name']).stdout.decode().splitlines()[0] == value['device']['avdName'], 'live AVD name mismatch')
    for prop, expected in [('ro.build.fingerprint', value['device']['fingerprint']), ('ro.product.cpu.abi', 'arm64-v8a'), ('ro.build.version.sdk', '36')]:
        require(adb(cfg, value, ['shell', 'getprop', prop]).stdout.decode().strip() == expected, f'device mismatch: {prop}')
    proof = read(value['networkProof'])
    for vendor in [v for v, s in statuses.items() if s['eligible']]:
        package = 'com.c15t.expodev.benchmark.' + vendor
        live = adb(cfg, value, ['shell', 'dumpsys', 'package', package]).stdout.decode()
        match = re.search(r'(?:userId|appId)=(\d+)', live)
        require(match, 'runtime app is missing from the owned emulator')
        uid = int(match[1])
        require(uid == proof['uids'][vendor], 'live UID differs from offline proof')
        for binary in ['iptables', 'ip6tables']:
            adb(cfg, value, ['shell', binary, '-C', 'OUTPUT', '-m', 'owner', '--uid-owner', str(uid), '-j', 'REJECT'])
        remote = adb(cfg, value, ['shell', 'pm', 'path', package]).stdout.decode().strip()
        require(remote.startswith('package:') and '\n' not in remote, 'missing or split runtime APK unsupported')
        # Hash the actual installed APK. Do not trust an install log or a named local file.
        actual = adb(cfg, value, ['shell', 'sha256sum', remote.removeprefix('package:')]).stdout.decode().split()[0]
        require(actual == value['participants'][vendor]['apkSha256'], 'live installed APK hash mismatch')
    return True


def verify_samples(schedule, rows):
    require(len(rows) == len(schedule['attempts']), 'incomplete runtime schedule, do not replace attempts')
    last = {v: s['previousPid'] for v, s in schedule['eligibility'].items() if s['eligible']}
    summary = {}
    for expected, row in zip(schedule['attempts'], rows):
        require(all(row.get(key) == value for key, value in expected.items()), 'sample schedule mismatch')
        vendor = expected['participant']
        stopped = row.get('allParticipantPidsAfterStop')
        require(isinstance(stopped, dict) and set(stopped) == set(schedule['participants']) and all(value == [] for value in stopped.values()), 'missing all-participant force-stop evidence')
        require(schedule['eligibility'][vendor]['eligible'], 'ineligible participant was timed')
        verify_files(row['files'])
        actual = parse(Path(row['log']).read_text(), vendor, schedule['eligibility'][vendor])
        accepted = actual['accepted'] and row['launchExit'] == 0 and row['completedWithinDeadline'] is True and actual.get('pid') != last[vendor] and row.get('livePids') == [str(actual.get('pid'))]
        require(type(row['accepted']) is bool and row['accepted'] == accepted, 'forged accepted timing sample')
        if row['accepted']:
            require(actual['elapsedMs'] == row['elapsedMs'], 'forged latency')
        if actual.get('pid'):
            last[vendor] = actual['pid']
    for vendor, status in schedule['eligibility'].items():
        own = [r for r in rows if r['participant'] == vendor]
        values = [r['elapsedMs'] for r in own if r['accepted']]
        summary[vendor] = {'eligible': status['eligible'], 'reason': status.get('reason'), 'scheduled': len(own), 'valid': len(values), 'failed': len(own) - len(values), 'p50Ms': percentile(values, .5), 'p95Ms': percentile(values, .95), 'failureReasons': [r.get('reason') for r in own if not r['accepted']]}
    return summary


def run(cfg, action):
    root = Path(cfg['output']) / 'runtime'
    value = inputs(cfg)
    eligible, statuses, files = eligibility(cfg, value)
    if action == 'preflight':
        print(json.dumps(statuses, indent=2))
        return
    if action == 'schedule':
        require(eligible, 'no eligible runtime participants')
        require(not (root / 'schedule.json').exists(), 'runtime schedule already frozen')
        live_device(cfg, value, statuses)
        write(root / 'schedule.json', {'schemaVersion': 1, 'endpoint': ENDPOINT, 'attempts': attempts(eligible), 'eligibility': statuses, 'files': files, 'device': value['device'], 'participants': list(value['participants']), 'cooldownSeconds': 1, 'deadlineSeconds': 30, 'settleSeconds': 10})
        return
    schedule_path = root / 'schedule.json'
    schedule = read(schedule_path)
    verify_files(schedule['files'])
    require(schedule['eligibility'] == statuses, 'runtime eligibility changed after scheduling')
    if action == 'verify':
        samples = read(root / 'samples.json')
        require(samples['scheduleSha256'] == sha(schedule_path), 'sample/schedule hash mismatch')
        rows = samples['rows']
        summary = verify_samples(schedule, rows)
        write(root / 'results.json', {'schemaVersion': 1, 'endpoint': ENDPOINT, 'scheduleSha256': sha(schedule_path), 'summary': summary})
        print(json.dumps(summary, indent=2))
        return
    require(action == 'sample', 'unsupported runtime action')
    require(not (root / 'samples').exists(), 'never overwrite/restart a timed schedule')
    live_device(cfg, value, statuses)
    # Called under the one shared native lock, held across quiet, settling and all attempts.
    quiet = subprocess.run(['ec', 'quiet'], capture_output=True, text=True, check=True)
    write(root / 'quiet.json', {'stdout': quiet.stdout, 'stderr': quiet.stderr, 'capturedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    time.sleep(schedule['settleSeconds'])
    (root / 'samples').mkdir()
    rows = []
    participants = list(value['participants'])
    def stop_all():
        stopped = {}
        for vendor in participants:
            package = 'com.c15t.expodev.benchmark.' + vendor
            adb(cfg, value, ['shell', 'am', 'force-stop', package])
            stopped[vendor] = adb(cfg, value, ['shell', 'pidof', package], check=False).stdout.decode().split()
            require(not stopped[vendor], 'participant survived force-stop')
        return stopped
    last = {v: s['previousPid'] for v, s in statuses.items() if s['eligible']}
    try:
        for attempt in schedule['attempts']:
            vendor = attempt['participant']
            out = root / 'samples' / f'{attempt["attempt"]:03d}-{vendor}'
            out.mkdir()
            stopped = stop_all()
            time.sleep(schedule['cooldownSeconds'])
            adb(cfg, value, ['logcat', '-c'])
            began = time.monotonic()
            launch = adb(cfg, value, ['shell', 'am', 'start', '-n', 'com.c15t.expodev.benchmark.' + vendor + '/com.c15t.expodev.MainActivity'], check=False)
            completed = False
            text = ''
            while time.monotonic() - began < schedule['deadlineSeconds']:
                time.sleep(.25)
                text = adb(cfg, value, ['logcat', '-d', '-v', 'threadtime']).stdout.decode(errors='replace')
                if parse(text, vendor, statuses[vendor])['accepted']:
                    completed = True
                    break
            time.sleep(.25)
            text = adb(cfg, value, ['logcat', '-d', '-v', 'threadtime']).stdout.decode(errors='replace')
            log = out / 'logcat.txt'
            log.write_text(text)
            result = parse(text, vendor, statuses[vendor])
            live = adb(cfg, value, ['shell', 'pidof', 'com.c15t.expodev.benchmark.' + vendor], check=False).stdout.decode().split()
            accepted = result['accepted'] and launch.returncode == 0 and completed and result.get('pid') != last[vendor] and live == [str(result.get('pid'))]
            row = {**attempt, **result, 'accepted': accepted, 'allParticipantPidsAfterStop': stopped, 'launchExit': launch.returncode, 'completedWithinDeadline': completed, 'livePids': live, 'log': str(log), 'files': bind_files([log])}
            if not accepted and not row.get('reason'):
                row['reason'] = 'launch/deadline/fresh-process validation failed'
            if result.get('pid'):
                last[vendor] = result['pid']
            rows.append(row)
            write(root / 'samples.json', {'scheduleSha256': sha(schedule_path), 'rows': rows})
    finally:
        stop_all()
    live_device(cfg, value, statuses)
    summary = verify_samples(schedule, rows)
    write(root / 'results.json', {'schemaVersion': 1, 'endpoint': ENDPOINT, 'scheduleSha256': sha(schedule_path), 'summary': summary})
    print(json.dumps(summary, indent=2))
