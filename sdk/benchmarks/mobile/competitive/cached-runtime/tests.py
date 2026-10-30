#!/usr/bin/env python3
"""Offline regression checks. Synthetic states never enter a device or snapshot."""
import argparse
import copy
import datetime
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
import runner
from core import sha, write
from parser import NAMES, denial_in_interval, parse, validate
from protocol import attempts, canonical_schedule, replay_completed, verify_rows, verify_schedule

CAPTURE = 946684800000  # 2000-01-01, long before the reviewer's current date.


def date(value):
    return datetime.datetime.fromtimestamp(value / 1000, datetime.timezone.utc).isoformat()


def payload(name):
    if name == 'c15t':
        raw = {'ready': True, 'policyPending': False, 'error': {'code': 'transport', 'message': 'Unable to resolve host synthetic.example'},
               'resolution': {'status': 'matched', 'policyId': 'synthetic', 'fingerprint': 'synthetic'},
               'promptRequirement': {'kind': 'none'}, 'nextDeadline': CAPTURE + 1000,
               'consentCategories': ['measurement'], 'effectivePermissions': {'measurement': False},
               'explicitChoice': {'categories': {'measurement': {'value': False, 'confirmedAt': CAPTURE - 100, 'basis': {'kind': 'synthetic'}}}},
               'restrictions': {'measurement': ['explicit-denial']}}
        target = 'measurement'
    elif name == 'didomi':
        target = 'cookies'
        raw = {'shouldUserStatusBeCollected': False, 'requiredPurposeIds': [target], 'currentUserStatus': {'purposes': {target: {'id': target, 'enabled': False}}, 'updated': date(CAPTURE - 100), 'consent_string': 'synthetic'}}
    elif name == 'usercentrics':
        target = '9V8bg4D63'
        raw = {'shouldCollectConsent': False, 'consents': [{'templateId': target, 'isEssential': False, 'status': False, 'type': 0, 'history': [{'type': 0, 'status': False, 'timestampInMillis': (CAPTURE - 100 + 2**31) % 2**32 - 2**31}]}]}
    else:
        target = 'synthetic-vendor:synthetic-purpose'
        grants = {'synthetic-vendor': {'vendorGrant': False, 'purposeGrants': {'synthetic-purpose': False}}}
        gdpr = {'applies': True, 'uuid': 'synthetic', 'euconsent': 'synthetic', 'createdDate': date(CAPTURE - 100), 'expirationDate': None,
                'statuses': {'rejectedAny': True, 'consentedAll': False}, 'vendorGrants': {'synthetic-vendor': {'granted': False, 'purposes': {'synthetic-purpose': False}}}}
        stored = {'applies': True, 'uuid': 'synthetic', 'euconsent': 'synthetic', 'dateCreated': gdpr['createdDate'], 'grants': grants,
                  'consentStatus': {'hasConsentData': True, 'granularStatus': {'defaultConsent': False}},
                  'webConsentPayload': json.dumps({'euconsent': 'synthetic', 'expirationDate': date(CAPTURE + 1000), 'grants': grants})}
        raw = {'userData': {'gdpr': gdpr}, 'refreshErrors': [{'name': 'NoInternetConnection', 'description': 'No Internet connection.'}],
               'cacheEvidence': {'accountId': 22, 'propertyId': 16893, 'gdpr': {'consents': stored, 'metaData': {'vendorListId': 'synthetic', 'legalBasisChangeDate': date(CAPTURE - 1000), 'additionsChangeDate': date(CAPTURE - 1000)}}}}
    return {'kind': 'cold', 'valid': True, 'targetId': target, 'raw': raw}


def marker_rows(data, profile='cold'):
    data = copy.deepcopy(data)
    data['kind'] = profile
    rows = [{'event': 'ATTACH_BASE_CONTEXT' if profile == 'cold' else 'ACTIVITY_RESUME', 'pid': 42, 'nanos': '1000000000'}]
    if profile == 'cold':
        rows.append({'event': 'READY_LAYOUT', 'pid': 42, 'nanos': '1000000100'})
    rows.extend([{'event': 'READY_DRAW' if profile == 'cold' else 'WARM_DRAW', 'pid': 42, 'startNanos': '1000000000', 'nanos': '1000000200', 'elapsedNanos': '200'},
                 {'event': 'SNAPSHOT', 'pid': 42, 'sequence': 1, 'part': 0, 'parts': 1, 'body': json.dumps(data)}])
    return rows


def log(rows):
    return '\n'.join('01-01 00:00:00.000 42 42 I CMP_BENCH: ' + json.dumps(r) for r in rows)


class ParserTests(unittest.TestCase):
    def test_complete_positive_controls_all_adapters_and_profiles(self):
        for name in NAMES:
            data = payload(name)
            proof = validate(name, data, CAPTURE)
            denial_in_interval(name, proof, CAPTURE - 200, CAPTURE)
            for profile in ('cold', 'warm'):
                with self.subTest(name=name, profile=profile):
                    result = parse(log(marker_rows(data, profile)), name, proof, profile, captured_epoch_ms=CAPTURE)
                    self.assertTrue(result['accepted'], result['reason'])
                    self.assertEqual(result['elapsedNanos'], 200)

    def test_historical_expiry_uses_capture_not_today(self):
        for name in ('c15t', 'sourcepoint'):
            data = payload(name)
            self.assertGreater(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000, CAPTURE + 1000)
            self.assertTrue(parse(log(marker_rows(data)), name, captured_epoch_ms=CAPTURE)['accepted'])
            self.assertFalse(parse(log(marker_rows(data)), name, captured_epoch_ms=CAPTURE + 1001)['accepted'])

    def test_capture_epoch_is_required(self):
        with self.assertRaises(TypeError):
            parse(log(marker_rows(payload('c15t'))), 'c15t')

    def test_policy_and_consent_errors_cannot_use_transport_words(self):
        for code in ('policy', 'consent', 'unconfigured'):
            data = payload('c15t')
            data['raw']['error']['code'] = code
            self.assertFalse(parse(log(marker_rows(data)), 'c15t', captured_epoch_ms=CAPTURE)['accepted'])
        for name in ('didomi', 'usercentrics'):
            data = payload(name)
            data['raw']['error'] = {'code': 'policy', 'message': 'Unable to resolve host'}
            self.assertFalse(parse(log(marker_rows(data)), name, captured_epoch_ms=CAPTURE)['accepted'])
        data = payload('sourcepoint')
        data['raw']['refreshErrors'] = [{'name': 'InvalidPolicy', 'description': 'Unable to resolve host'}]
        self.assertFalse(parse(log(marker_rows(data)), 'sourcepoint', captured_epoch_ms=CAPTURE)['accepted'])

    def test_authority_failures(self):
        cases = [lambda p: p['raw'].__setitem__('policyPending', True),
                 lambda p: p['raw']['resolution'].__setitem__('status', 'unmatched'),
                 lambda p: p['raw']['promptRequirement'].__setitem__('kind', 'collect'),
                 lambda p: p['raw']['effectivePermissions'].__setitem__('measurement', True),
                 lambda p: p['raw'].__setitem__('explicitChoice', {}),
                 lambda p: p.__setitem__('targetId', 'missing'), lambda p: p.__setitem__('valid', False)]
        for mutation in cases:
            data = payload('c15t')
            mutation(data)
            self.assertFalse(parse(log(marker_rows(data)), 'c15t', captured_epoch_ms=CAPTURE)['accepted'])
        for key in ('legalBasisChangeDate', 'additionsChangeDate'):
            data = payload('sourcepoint')
            data['raw']['cacheEvidence']['gdpr']['metaData'][key] = date(CAPTURE)
            self.assertFalse(parse(log(marker_rows(data)), 'sourcepoint', captured_epoch_ms=CAPTURE)['accepted'])

    def test_wrong_saved_decision(self):
        for name in NAMES:
            data = payload(name)
            proof = validate(name, data, CAPTURE)
            proof['denial']['forged'] = True
            self.assertFalse(parse(log(marker_rows(data)), name, proof, captured_epoch_ms=CAPTURE)['accepted'])

    def test_stale_forged_and_incomplete_markers(self):
        mutations = [lambda r: r.append(copy.deepcopy(r[-1])),
                     lambda r: r[0].__setitem__('pid', 41),
                     lambda r: r[-2].__setitem__('elapsedNanos', '201'),
                     lambda r: r[-2].__setitem__('startNanos', '999'),
                     lambda r: r[-1].__setitem__('parts', 2),
                     lambda r: r[-1].__setitem__('part', 1),
                     lambda r: r.append(copy.deepcopy(r[0])),
                     lambda r: r.reverse(),
                     lambda r: r[-2].__setitem__('nanos', '999'),
                     lambda r: r[-1].__setitem__('sequence', True)]
        for mutation in mutations:
            rows = marker_rows(payload('c15t'))
            mutation(rows)
            self.assertFalse(parse(log(rows), 'c15t', captured_epoch_ms=CAPTURE)['accepted'])
        text = log(marker_rows(payload('c15t'))).replace('42 42 I CMP_BENCH', '41 41 I CMP_BENCH')
        self.assertFalse(parse(text, 'c15t', captured_epoch_ms=CAPTURE)['accepted'])


class SetupTests(unittest.TestCase):
    def test_fresh_prepare_creates_all_prerequisites_and_refuses_reuse(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            descriptors = {}
            for name in NAMES:
                host = base / 'size/android' / (name + '-host')
                java = host / 'android/app/src/main/java/com/c15t/expodev'
                java.mkdir(parents=True)
                (java / 'MainApplication.kt').write_text('class MainApplication : Application(), ReactApplication {\nPackageList(this).packages.apply {\n}\n}')
                (java / 'MainActivity.kt').write_text('  override fun onCreate(savedInstanceState: Bundle?) {}')
                (host / 'android/app/build.gradle').write_text("applicationId 'com.c15t.expodev'\n")
                (host / 'node_modules/expo/build').mkdir(parents=True)
                (host / 'node_modules/expo/build/required.js').write_text('retained')
                (host / 'node_modules/sdk/android/build').mkdir(parents=True)
                (host / 'node_modules/sdk/android/build/stale').write_text('excluded')
                (host / 'node_modules/expo/android/build').mkdir(parents=True)
                (host / 'node_modules/expo/android/build/stale').write_text('native generated output')
                pin = next((r for r in runner.host_harness.PINS['wrappers'] if r['name'] == name), None)
                if pin:
                    archive = host.parent / 'inputs' / (name + '-' + pin['wrapperVersion'] + '.tgz')
                    archive.parent.mkdir(exist_ok=True)
                    archive.write_bytes(b'synthetic-archive')
                for file in ('prepared.json', 'record.json', 'size.apk'):
                    (host / file).write_text('{}')
                descriptors[name] = {'host': str(host), 'buildRecord': str(host / 'record.json'), 'artifact': str(host / 'size.apk')}
            config_path = base / 'config.json'
            config_path.write_text('{}')
            cfg = {'output': str(base / 'new'), '_config': str(config_path), 'sizeConfig': str(config_path), '_size': {}, 'tenants': {}}
            with patch.object(runner, 'verify_inputs', return_value={'verified': True}), patch.object(runner.host_harness, 'descriptor', side_effect=lambda c, p, n: descriptors[n]), patch.object(runner.host_harness, 'verify_installed'):
                runner.prepare(cfg)
                for directory in ('logs', 'inputs', 'artifacts', 'runtime/inputs', 'runtime/artifacts', 'device/avd', 'calibration', 'offline'):
                    self.assertTrue((base / 'new' / directory).is_dir())
                self.assertTrue((base / 'new/runtime/c15t-host/node_modules/expo/build/required.js').is_file())
                self.assertTrue((base / 'new/runtime/c15t-host/node_modules/sdk/android/build/stale').is_file())
                self.assertFalse((base / 'new/runtime/c15t-host/node_modules/expo/android/build').exists())
                for name in NAMES:
                    host = base / 'new/runtime' / (name + '-host')
                    self.assertTrue((host / 'installed-inputs.json').is_file())
                    self.assertIn('installed-inputs.json', {row['path'] for row in runner.read(host / 'prepared.json')['files']})
                self.assertFalse((base / 'new/artifacts/v3-build-complete.json').exists())
                with self.assertRaisesRegex(ValueError, 'output exists'):
                    runner.prepare(cfg)

    def test_cached_build_reader_rejects_transitive_source_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            host = root / 'runtime/c15t-host'
            source = host / 'node_modules/.bun/transitive@1/node_modules/transitive/build/index.js'
            source.parent.mkdir(parents=True)
            source.write_text('installed dependency')
            runner.host_harness.bind_installed(host)
            output = root / 'runtime/artifacts/c15t'
            write(output / 'build-complete.json', {'runtime': True, 'profile': 'android-release', 'vendor': 'c15t',
                'installedInputsSha256': sha(host / 'installed-inputs.json'),
                'hostInputsSha256': runner.digest(runner.host_harness.host_inputs(host)), 'inputs': {}, 'artifacts': []})
            source.write_text('modified installed dependency')
            with patch.object(runner, 'checked_prepared'), patch.object(runner.host_harness, 'validate_inputs', return_value={}):
                with self.assertRaisesRegex(ValueError, 'dependency sources changed'):
                    runner.verify_builds({'output': str(root)})

    def test_canonical_schedule_rejects_rehashes_and_source_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ('prepared.json', 'builds.json', 'device/ownership.json', 'device/fingerprint.json'):
                write(root / name, {})
            write(root / 'eligibility.json', {n: {'eligible': True} for n in NAMES})
            schedule = canonical_schedule(root)
            verify_schedule(schedule, canonical_schedule(root))
            self.assertEqual(len(schedule['attempts']), 120)
            for mutate in (lambda s: s['attempts'].pop(), lambda s: s['attempts'].reverse(), lambda s: s.__setitem__('settlingSeconds', 0), lambda s: s.__setitem__('cooldownSeconds', True),
                           lambda s: s['eligibility'].__setitem__('c15t', False), lambda s: s['inputs'].pop('prepared.json'),
                           lambda s: s['sources'].clear(), lambda s: s.__setitem__('device', {'forged': True})):
                changed = copy.deepcopy(schedule)
                mutate(changed)
                from core import digest
                self.assertNotEqual(digest(changed), digest(schedule))
                with self.assertRaises(ValueError):
                    verify_schedule(changed, canonical_schedule(root))
            write(root / 'prepared.json', {'changed': True})
            with self.assertRaises(ValueError):
                verify_schedule(schedule, canonical_schedule(root))

    def test_full_fixed_cohort_positive_and_forged_pid_or_accepted_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            schedule = {'attempts': attempts(['c15t']), 'eligibility': {n: n == 'c15t' for n in NAMES}}
            cal = {'c15t': validate('c15t', payload('c15t'), CAPTURE)}
            rows = []
            for attempt in schedule['attempts']:
                for profile in ('cold', 'warm'):
                    data = marker_rows(payload('c15t'), profile)
                    pid = attempt['attempt'] + 100
                    for marker in data:
                        marker['pid'] = pid
                    text = log(data).replace('42 42 I CMP_BENCH', str(pid) + ' ' + str(pid) + ' I CMP_BENCH')
                    path = root / 'samples' / ('%03d-c15t' % attempt['attempt']) / (profile + '-logcat.txt')
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(text)
                    parsed = parse(text, 'c15t', cal['c15t'], profile, captured_epoch_ms=CAPTURE)
                    rows.append({**attempt, **parsed, 'profile': profile, 'startedUtc': date(CAPTURE), 'finishedUtc': date(CAPTURE + 1), 'deviceStartEpochMs': CAPTURE, 'deviceEndEpochMs': CAPTURE + 1, 'launchExit': 0, 'actualPids': [str(pid)], 'completedWithinDeadline': True, 'allParticipantPidsAfterStop': dict.fromkeys(NAMES, []), 'rawLogSha256': sha(path)})
            result = verify_rows(root, schedule, rows, cal)
            self.assertEqual(result['cold']['c15t']['valid'], 30)
            self.assertEqual(result['warm']['c15t']['valid'], 30)
            for mutate in (lambda r: r[0].__setitem__('elapsedNanos', 1), lambda r: r[1].__setitem__('actualPids', ['999']), lambda r: r[0].__setitem__('accepted', False), lambda r: r.pop()):
                changed = copy.deepcopy(rows)
                mutate(changed)
                with self.assertRaises(ValueError):
                    verify_rows(root, schedule, changed, cal)

    def test_cli_help_does_not_need_config_or_devices(self):
        text = subprocess.check_output([sys.executable, str(runner.HERE / 'runner.py'), '--help'], text=True)
        self.assertIn('replay', text)
        self.assertIn('calibrate', text)

    def test_sample_rejects_modified_schedule_before_device_work(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            expected = {'attempts': attempts(['c15t']), 'cooldownSeconds': 1}
            write(root / 'schedule.json', {**expected, 'attempts': expected['attempts'][:-1]})
            with patch.object(runner, 'checked_prepared'), patch.object(runner, 'canonical_schedule', return_value=expected), patch.object(runner.Device, 'offline_live', side_effect=AssertionError('device touched before schedule rejection')):
                with self.assertRaisesRegex(ValueError, 'canonical'):
                    runner.sample({'output': str(root)})

    def test_native_dispatch_uses_configured_lock_before_work(self):
        cfg = {'output': '/synthetic-output', 'nativeLockRunner': ['python3', '/synthetic-lock.py']}
        for stage in ('prepare', 'sample'):
            with self.subTest(stage=stage), patch.object(sys, 'argv', ['runner.py', stage, '--config', 'synthetic.json']), patch.object(runner, 'config', return_value=cfg), patch.object(runner.subprocess, 'call', return_value=0) as call, patch.object(runner, stage, side_effect=AssertionError('native work outside lock')):
                with self.assertRaises(SystemExit) as ended:
                    runner.main()
                self.assertEqual(ended.exception.code, 0)
                command = call.call_args.args[0]
                self.assertEqual(command[:3], ['python3', '/synthetic-lock.py', 'cmp-cached-' + stage])
                self.assertEqual(command[-2], '--lock-token')
                self.assertEqual(command[-1], call.call_args.kwargs['env']['CMP_CACHED_LOCK_TOKEN'])

    def test_failed_device_boot_stops_its_created_process_without_fingerprint(self):
        import device as device_module
        popen = subprocess.Popen
        children = []
        def start(*args, **kwargs):
            child = popen([sys.executable, '-c', 'import time; time.sleep(60)'], start_new_session=True)
            children.append(child)
            return child
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'device/avd').mkdir(parents=True)
            device = runner.Device({'output': str(root), 'androidSdk': str(root / 'sdk'), 'device': {'avdName': 'cmp_synthetic', 'port': 5602}})
            try:
                with patch.object(device_module.subprocess, 'check_output', return_value='List of devices attached\n'), patch.object(device_module.socket, 'socket'), patch.object(device_module.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'', b'')), patch.object(device_module.subprocess, 'Popen', side_effect=start), patch.object(device, 'call', side_effect=ValueError('simulated boot failure')):
                    with self.assertRaisesRegex(ValueError, 'simulated boot failure'):
                        device.create()
                self.assertIsNotNone(children[0].poll())
                self.assertFalse((root / 'device/fingerprint.json').exists())
                result = json.loads((root / 'device/create-failure.json').read_text())
                self.assertEqual(result['ownedProcessId'], children[0].pid)
                self.assertTrue(result['processStopped'])
            finally:
                for child in children:
                    if child.poll() is None:
                        child.kill()
                    child.wait(timeout=5)

    def test_cleanup_requires_process_exit_ports_closed_and_disconnected_transport(self):
        import device as device_module
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            device = runner.Device({'output': str(root), 'androidSdk': str(root / 'sdk'), 'device': {'avdName': 'cmp_synthetic', 'port': 5602}})
            write(root / 'device/ownership.json', {'pid': 123})
            for state in ('absent', 'offline', 'device'):
                for open_port in (False, True):
                    with self.subTest(state=state, open_port=open_port), patch.object(device, 'owned'), patch.object(device, 'call', return_value=subprocess.CompletedProcess([], 0, b'', b'')), patch.object(device_module.subprocess, 'check_output', return_value='List of devices attached\n' + ('' if state == 'absent' else device.serial + '\t' + state + '\n')), patch.object(device_module.socket, 'socket') as socket, patch.object(device_module.os, 'kill', side_effect=ProcessLookupError), patch.object(device_module.time, 'monotonic', side_effect=[0, 31]):
                        socket.return_value.__enter__.return_value.connect_ex.return_value = 0 if open_port else 1
                        if not open_port and state in ('absent', 'offline'):
                            device.cleanup()
                            self.assertTrue(json.loads((root / 'cleanup.json').read_text())['processStopped'])
                            (root / 'cleanup.json').unlink()
                        else:
                            with self.assertRaisesRegex(ValueError, 'has not stopped'):
                                device.cleanup()
                            self.assertFalse((root / 'cleanup.json').exists())

    def test_output_must_be_disjoint_from_all_inputs(self):
        self.assertFalse(runner.disjoint(Path('/study'), Path('/study/producer')))
        self.assertFalse(runner.disjoint(Path('/study/producer/out'), Path('/study/producer')))
        self.assertFalse(runner.disjoint(Path('/study'), Path('/study')))
        self.assertTrue(runner.disjoint(Path('/study/run'), Path('/study/producer')))

    def test_config_resolves_toolchains_and_lock_paths_without_native_work(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            path = root / 'cached.json'
            value = {'schemaVersion': 1, 'output': './run', 'sizeConfig': './size.json', 'producer': './producer', 'device': {'avdName': 'cmp_synthetic', 'port': 5602}, 'androidSdk': './sdk', 'javaHome': './jdk'}
            write(path, value)
            size = {'_config': str(root / 'size.json'), 'output': str(root / 'size'), 'archive': str(root / 'inputs/pin.tgz'), 'maven': str(root / 'inputs/maven'), 'nativeLockRunner': ['python3', './lock.py'],
                    'tenants': {'didomi': {'apiKey': 'synthetic', 'noticeId': 'synthetic', 'target': 'cookies'}, 'usercentrics': {'settingsId': 'synthetic', 'target': '9V8bg4D63'}, 'sourcepoint': {'accountId': 22, 'propertyId': 16893, 'propertyName': 'synthetic.example', 'privacyManagerId': 'synthetic'}}}
            with patch.object(runner.host_harness, 'config', return_value=size):
                cfg = runner.config(path)
                self.assertEqual(cfg['androidSdk'], str(root / 'sdk'))
                self.assertEqual(cfg['javaHome'], str(root / 'jdk'))
                self.assertEqual(cfg['nativeLockRunner'], ['python3', str(root / 'lock.py')])
                self.assertEqual(cfg['output'], str(root / 'run'))
                self.assertFalse((root / 'run').exists())
                value['archive'] = './unresolved-input'
                write(path, value)
                with self.assertRaisesRegex(ValueError, 'unknown cached config'):
                    runner.config(path)

    def test_build_generates_binding_instead_of_requiring_old_sentinel(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'runtime/artifacts').mkdir(parents=True)
            bindings = {n: {'apkSha256': 'synthetic'} for n in NAMES}
            with patch.object(runner, 'checked_prepared'), patch.object(runner, 'verify_builds', return_value=bindings), patch.object(runner.host_harness, 'verify_prepared'), patch.object(runner.host_harness, 'invoke', autospec=True) as invoke, patch.object(runner.host_harness, 'build', autospec=True) as build:
                runner.build({'output': str(root)})
                self.assertEqual(json.loads((root / 'builds.json').read_text()), bindings)
                self.assertEqual(invoke.call_count, 4)
                self.assertEqual(build.call_count, 4)
                for call, name in zip(build.call_args_list, NAMES):
                    self.assertEqual(call.args[1:], ('android-release', name))
                    self.assertEqual(call.kwargs, {'runtime': True})
                with self.assertRaisesRegex(ValueError, 'already attempted'):
                    runner.build({'output': str(root)})

    def test_cached_build_checks_prepared_sources_before_typecheck(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'runtime/artifacts').mkdir(parents=True)
            with patch.object(runner, 'checked_prepared'), patch.object(runner.host_harness, 'verify_prepared', side_effect=ValueError('construction sources changed')), patch.object(runner.host_harness, 'invoke') as invoke, patch.object(runner.host_harness, 'build') as build:
                with self.assertRaisesRegex(ValueError, 'construction sources changed'):
                    runner.build({'output': str(root)})
                invoke.assert_not_called()
                build.assert_not_called()

    def test_fresh_prerequisites_revalidate_full_native_proof(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = payload('c15t')
            proof = validate('c15t', data, CAPTURE)
            diagnostic = marker_rows(data)
            body = copy.deepcopy(data)
            body['kind'] = 'diagnostic'
            diagnostic[-1]['body'] = json.dumps(body)
            cal = {'accepted': True, 'pid': 42, 'capturedEpochMs': CAPTURE, 'snapshot': body, 'actions': [{'bounds': [1, 2, 3, 4]}], 'rejectionWallClockInterval': {'beforeMs': CAPTURE - 200, 'afterMs': CAPTURE}, **proof}
            for name in NAMES:
                write(root / 'calibration' / name / 'result.json', cal if name == 'c15t' else {'accepted': False})
            (root / 'calibration/c15t/logcat.txt').write_text(log(diagnostic))
            for name in ('before-rejection.png', 'before-rejection.xml', 'after-rejection.png', 'after-rejection.xml'):
                (root / 'calibration/c15t' / name).write_text('synthetic unit fixture')
            write(root / 'offline/network-proof.json', {'probeClosed': True, 'reverseRemoved': True, 'positive': {'c15t': 0}, 'negative': {'c15t': 1}, 'uids': {'c15t': 10000}})
            for profile in ('cold', 'warm'):
                markers = marker_rows(data, profile)
                for marker in markers:
                    marker['pid'] = 100
                text = log(markers).replace('42 42 I CMP_BENCH', '100 100 I CMP_BENCH')
                path = root / 'offline/c15t' / (profile + '-logcat.txt')
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text)
                row = {**parse(text, 'c15t', cal, profile, captured_epoch_ms=CAPTURE), 'completedWithinDeadline': True, 'launchExit': 0, 'actualPids': ['100'], 'deviceEndEpochMs': CAPTURE, 'rawLogSha256': sha(path)}
                write(path.with_name(profile + '-result.json'), row)
            write(root / 'eligibility.json', {n: {'eligible': n == 'c15t'} for n in NAMES})
            runner.verify_prerequisites({'output': str(root), 'tenants': {'c15t': {}}})
            altered = copy.deepcopy(cal)
            altered['snapshot']['raw']['resolution']['status'] = 'missing'
            write(root / 'calibration/c15t/result.json', altered)
            with self.assertRaisesRegex(ValueError, 'native raw snapshot'):
                runner.verify_prerequisites({'output': str(root), 'tenants': {'c15t': {}}})


def typecheck(hosts):
    fixtures = runner.HERE / 'fixtures'
    tenants = {'didomi': {'apiKey': 'synthetic', 'noticeId': 'synthetic', 'target': 'cookies'},
               'usercentrics': {'settingsId': 'synthetic', 'target': '9V8bg4D63'},
               'sourcepoint': {'accountId': 22, 'propertyId': 16893, 'propertyName': 'synthetic.example', 'privacyManagerId': 'synthetic'}}
    for name in NAMES:
        host = hosts / (name + '-host')
        with tempfile.TemporaryDirectory(prefix='cmp-cached-types-') as tmp:
            root = Path(tmp)
            for filename in ('App.tsx', 'runtime-types.ts'):
                (root / filename).write_bytes((fixtures / filename).read_bytes())
            (root / 'consent-adapter.tsx').write_bytes((fixtures / (name + '.tsx')).read_bytes())
            (root / 'tsconfig.json').write_bytes((host / 'tsconfig.json').read_bytes())
            (root / 'benchmark-config.ts').write_text(runner.host_harness.tenant_source({'tenants': tenants}))
            (root / 'node_modules').symlink_to((host / 'node_modules').resolve(), target_is_directory=True)
            subprocess.run(['node', 'node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false'], cwd=root, check=True)
            print('Pinned source API typecheck passed:', name)


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--typecheck-hosts', type=Path, help='directory containing the four pinned <sdk>-host/node_modules trees; reads only')
    cli.add_argument('--replay', type=Path, help='read-only completed external evidence root')
    args, remaining = cli.parse_known_args()
    if args.typecheck_hosts:
        typecheck(args.typecheck_hosts.resolve())
    if args.replay:
        print(json.dumps(replay_completed(args.replay.resolve()), indent=2))
    unittest.main(argv=[sys.argv[0], *remaining])
