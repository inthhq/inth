"""Behavior tests for portable collection and strict runtime acceptance."""
import copy
import datetime
import json
import os
from pathlib import Path
import plistlib
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import core
import harness
import runtime


def log_event(event):
    return f'10-30 15:47:00.000 {event["pid"]:5d} 9913 I CMP_BENCH: ' + json.dumps(event)


def valid_log(vendor='didomi', pid=42):
    raw = {'currentUserStatus': {'purposes': {'cookies': {'id': 'cookies', 'enabled': False}},
                                'consent_string': 'synthetic-test-choice', 'updated': '2026-10-30T15:00:00Z'},
           'requiredPurposeIds': ['cookies'], 'shouldUserStatusBeCollected': False}
    target = 'cookies'
    if vendor == 'c15t':
        target = 'measurement'
        raw = {'ready': True, 'policyPending': False, 'error': None, 'consentCategories': [target],
               'effectivePermissions': {target: False}, 'explicitChoice': {'categories': {target: {'value': False, 'confirmedAt': 100, 'basis': {'kind': 'choice-v1'}}}}}
    if vendor == 'usercentrics':
        target = 'optional-service'
        raw = {'shouldCollectConsent': False, 'consents': [{'templateId': target, 'isEssential': False, 'status': False, 'type': 0,
               'history': [{'status': False, 'type': 0, 'timestampInMillis': -100}]}]}
    payload = {'valid': True, 'targetId': target, 'raw': raw}
    events = [{'event': 'ATTACH_BASE_CONTEXT', 'pid': pid, 'nanos': '1000'},
              {'event': 'READY_LAYOUT', 'pid': pid, 'nanos': '2000'},
              {'event': 'READY_DRAW', 'pid': pid, 'startNanos': '1000', 'nanos': '3000', 'elapsedNanos': '2000'},
              {'event': 'SNAPSHOT', 'pid': pid, 'sequence': 1, 'part': 0, 'parts': 1, 'body': json.dumps(payload)}]
    return '\n'.join(log_event(e) for e in events)


def tiny_dex():
    descriptor = b'Ltest/Host;'
    data = bytearray(164)
    data[:8] = b'dex\n035\0'
    for offset, value in [(56, 1), (60, 112), (64, 1), (68, 116), (96, 1), (100, 120), (112, 152), (116, 0), (120, 0)]:
        struct.pack_into('<I', data, offset, value)
    data[152:] = bytes([len(descriptor)]) + descriptor + b'\0'
    return bytes(data)


class CompetitiveTests(unittest.TestCase):
    def test_size_arithmetic_includes_negative_deltas(self):
        rows = [{'profile': 'ios-local', 'vendor': v, 'status': 'measured', 'bytes': b, 'cohort': 'same'} for v, b in [('baseline', 100), ('c15t', 90)]]
        self.assertEqual(core.size_rows(rows, complete=False)[1]['addedBytes'], -10)

    def test_missing_or_error_measurements_never_become_zero(self):
        for status, count in [('blocked', None), ('measured', 0), ('measured', True), ('measured', -1)]:
            with self.subTest(status=status, count=count), self.assertRaises(ValueError):
                core.size_rows([{'profile': 'ios-local', 'vendor': 'baseline', 'status': status, 'bytes': count, 'cohort': 'same'}], False)
        with self.assertRaisesRegex(ValueError, '18'):
            core.size_rows([])

    def test_cross_profile_baseline_rejected(self):
        with self.assertRaisesRegex(ValueError, 'baseline'):
            core.size_rows([{'profile': 'ios-local', 'vendor': 'baseline', 'status': 'measured', 'bytes': 100, 'cohort': 'same'},
                            {'profile': 'ios-postprocessed', 'vendor': 'c15t', 'status': 'measured', 'bytes': 200, 'cohort': 'same'}], False)

    def test_parity_mismatch_and_duplicate_rejected(self):
        rows = [{'profile': 'android-release', 'vendor': v, 'status': 'measured', 'bytes': 100, 'cohort': c} for v, c in [('baseline', 'a'), ('c15t', 'b')]]
        with self.assertRaisesRegex(ValueError, 'parity'):
            core.size_rows(rows, False)
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            core.size_rows(rows + rows, False)

    def test_profiles_require_actual_matched_settings(self):
        local = {**core.IOS_SETTINGS, 'DEPLOYMENT_POSTPROCESSING': 'NO'}
        core.check_settings('ios-local', local)
        with self.assertRaisesRegex(ValueError, 'DEPLOYMENT_POSTPROCESSING'):
            core.check_settings('ios-postprocessed', local)
        settings = {**core.ANDROID_SETTINGS, 'signingStoreSha256': 'a', 'signingAlias': 'debug'}
        with self.assertRaisesRegex(ValueError, 'signing'):
            core.check_settings('android-release', settings, {**settings, 'signingStoreSha256': 'b'})
        with self.assertRaisesRegex(ValueError, 'minifyEnabled'):
            core.check_settings('android-release', {**settings, 'minifyEnabled': False})

    def test_relative_config_resolves_from_file_not_cwd(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'config.json'
            core.write(path, {'schemaVersion': 1, 'output': 'out with spaces', 'archive': 'inputs/archive.tgz', 'maven': 'inputs/maven'})
            cfg = harness.config(path)
            self.assertEqual(cfg['archive'], str((Path(tmp) / 'inputs/archive.tgz').resolve()))
            self.assertEqual(cfg['output'], str((Path(tmp) / 'out with spaces').resolve()))
            core.write(path, {'schemaVersion': 1, 'output': str(core.HERE)})
            with self.assertRaisesRegex(ValueError, 'outside'):
                harness.config(path)

    def test_no_private_paths_in_durable_inputs(self):
        for path in core.HERE.rglob('*'):
            if path.suffix not in ('.json', '.lock') and not path.name.endswith('Podfile.lock'):
                continue
            self.assertNotIn('/Users/', path.read_text(), str(path))

    def test_manifest_excludes_symlink_lengths_and_directory_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'file').write_bytes(b'abc')
            (root / 'directory').mkdir()
            (root / 'alias').symlink_to('file')
            self.assertEqual(sum(row['bytes'] for row in core.manifest(root)), 3)

    def test_apk_bytes_keep_zip_overhead_separate_from_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            apk = Path(tmp) / 'app.apk'
            with zipfile.ZipFile(apk, 'w', zipfile.ZIP_DEFLATED) as handle:
                handle.writestr('AndroidManifest.xml', b'manifest')
                handle.writestr('classes.dex', tiny_dex())
                handle.writestr('assets/index.android.bundle', bytes.fromhex('c61fbc03') + b'host')
            row = core.apk_measure(apk, None, 'baseline')
            self.assertEqual(row['bytes'], apk.stat().st_size)
            self.assertEqual(row['bytes'], row['compressedPayloadBytes'] + row['zipAndSigningOverheadBytes'])
            self.assertNotEqual(row['bytes'], row['uncompressedPayloadBytes'])
            with self.assertRaisesRegex(ValueError, 'unsupported'):
                core.apk_measure(apk, None, 'missing')

    def test_missing_sdk_retention_is_not_a_measured_app(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises((ValueError, FileNotFoundError)):
                core.app_measure(Path(tmp) / 'missing.app', [], [], 'c15t')

    def test_changed_raw_evidence_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'raw.log'
            p.write_text('actual value')
            files = core.bind_files([p])
            core.verify_files(files)
            p.write_text('forged value')
            with self.assertRaisesRegex(ValueError, 'changed evidence'):
                core.verify_files(files)

    def test_all_three_real_payload_shapes_can_pass(self):
        for vendor in runtime.SUPPORTED:
            with self.subTest(vendor=vendor):
                self.assertTrue(runtime.parse(valid_log(vendor), vendor)['accepted'])

    def test_false_speed_samples_are_rejected(self):
        valid = valid_log()
        bad = [valid.replace('"elapsedNanos": "2000"', '"elapsedNanos": "1"'),
               valid.replace('"parts": 1', '"parts": 2'),
               valid.replace('"pid": 42', '"pid": 43', 1),
               valid.replace('"event": "READY_DRAW"', '"event": "MISSING"'),
               valid + '\n' + valid.splitlines()[2],
               '\n'.join([valid.splitlines()[3], *valid.splitlines()[:3]]),
               'placeholder elapsedMs=1', valid.replace('"nanos": "3000"', '"nanos": "NaN"')]
        for text in bad:
            with self.subTest(text=text[:80]):
                self.assertFalse(runtime.parse(text, 'didomi')['accepted'])
        self.assertFalse(runtime.parse(valid, 'onetrust')['accepted'])

    def test_error_and_missing_explicit_denial_block_c15t(self):
        valid = valid_log('c15t')
        self.assertFalse(runtime.parse(valid.replace('\\"error\\": null', '\\"error\\": \\"transport failure\\"'), 'c15t')['accepted'])
        self.assertFalse(runtime.parse(valid.replace('\\"confirmedAt\\": 100', '\\"confirmedAt\\": 0'), 'c15t')['accepted'])

    def test_saved_denial_must_match_calibration(self):
        calibration = runtime.parse(valid_log(), 'didomi')
        wrong = {**calibration, 'denial': {'updated': 'wrong'}}
        self.assertFalse(runtime.parse(valid_log(), 'didomi', wrong)['accepted'])

    def test_schedule_rotates_without_replacement(self):
        schedule = runtime.attempts(['didomi', 'usercentrics'])
        self.assertEqual(len(schedule), 60)
        self.assertEqual([r['participant'] for r in schedule[:4]], ['didomi', 'usercentrics', 'usercentrics', 'didomi'])
        self.assertEqual(sum(r['participant'] == 'didomi' for r in schedule), 30)
        with self.assertRaisesRegex(ValueError, 'participant'):
            runtime.attempts(['onetrust'])
        with self.assertRaises(ValueError):
            runtime.attempts([])

    def test_runtime_verifier_reparses_and_rejects_forged_acceptance(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'logcat.txt'
            path.write_text(valid_log())
            parsed = runtime.parse(path.read_text(), 'didomi')
            schedule = {'participants': ['didomi'], 'attempts': runtime.attempts(['didomi'], 1), 'eligibility': {'didomi': {**parsed, 'eligible': True, 'previousPid': 41}}}
            row = {**schedule['attempts'][0], **parsed, 'allParticipantPidsAfterStop': {'didomi': []}, 'launchExit': 0, 'completedWithinDeadline': True, 'livePids': ['42'], 'log': str(path), 'files': core.bind_files([path])}
            self.assertEqual(runtime.verify_samples(schedule, [row])['didomi']['valid'], 1)
            with self.assertRaisesRegex(ValueError, 'latency'):
                runtime.verify_samples(schedule, [{**row, 'elapsedMs': 0.000001}])
            with self.assertRaisesRegex(ValueError, 'accepted'):
                runtime.verify_samples(schedule, [{**row, 'completedWithinDeadline': False}])
            with self.assertRaisesRegex(ValueError, 'accepted'):
                runtime.verify_samples({**schedule, 'eligibility': {'didomi': {**schedule['eligibility']['didomi'], 'previousPid': 42}}}, [row])
            with self.assertRaisesRegex(ValueError, 'incomplete'):
                runtime.verify_samples(schedule, [])

    def test_signed32_history_matches_rejection_interval(self):
        result = runtime.parse(valid_log('usercentrics'), 'usercentrics')
        epoch = 416 * 2**32 - 100
        runtime.denial_in_interval('usercentrics', result, epoch - 5, epoch + 5)
        with self.assertRaisesRegex(ValueError, 'modulo'):
            runtime.denial_in_interval('usercentrics', result, epoch + 50, epoch + 100)

    def test_nearest_rank_and_no_fake_zero_latency(self):
        self.assertEqual(core.percentile(list(range(1, 31)), .5), 15)
        self.assertEqual(core.percentile(list(range(1, 31)), .95), 29)
        self.assertIsNone(core.percentile([], .5))
        for value in [0, -1, True, float('nan'), float('inf')]:
            with self.assertRaises(ValueError):
                core.percentile([value], .5)

    def test_both_official_android_tool_output_formats(self):
        badge = "package: name='com.c15t.expodev' compileSdkVersion='36'\nminSdkVersion:'24'\ntargetSdkVersion:'36'\nnative-code: 'arm64-v8a'"
        for label in ['V2 Signer:', 'Signer #1']:
            signing = 'Verifies\nNumber of signers: 1\n' + label + ' certificate SHA-256 digest: ' + 'a' * 64
            self.assertEqual(core.android_metadata(signing, badge), 'a' * 64)
            self.assertEqual(core.android_metadata(signing, badge.replace('minSdkVersion', 'sdkVersion')), 'a' * 64)
            with self.assertRaisesRegex(ValueError, 'badging'):
                core.android_metadata(signing, badge.replace("native-code: 'arm64-v8a'", "native-code: 'x86_64'"))
        with self.assertRaisesRegex(ValueError, 'signature'):
            core.android_metadata('failed', badge)

    def test_verifier_recomputes_app_bytes_and_host_parity(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = {'output': str(root)}
            common = {}
            rows = []
            for vendor in ['baseline', 'c15t']:
                host = root / (vendor + '-host')
                host.mkdir()
                for name in ['App.tsx', 'index.ts', 'metro.config.js', 'tsconfig.json']:
                    (host / name).write_text('common host input')
                common = harness.common_inputs(host, 'ios')
                app = root / (vendor + '.app')
                app.mkdir()
                (app / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'com.c15t.expodev', 'CFBundleExecutable': 'Host'}))
                (app / 'Host').write_bytes(b'\xcf\xfa\xed\xfe' + struct.pack('<I', 0x100000c) + b'unit-test-binary')
                (app / 'main.jsbundle').write_bytes(bytes.fromhex('c61fbc03') + (b'presentPreferences' if vendor == 'c15t' else b'control'))
                symbols = root / (vendor + '-symbols.txt')
                symbols.write_text('C15tReactNativeModule snapshot presentPreferences' if vendor == 'c15t' else 'host')
                linkmap = root / (vendor + '.map')
                linkmap.write_text('unit-test-link-map')
                settings = root / (vendor + '-settings.json')
                core.write(settings, {**core.IOS_SETTINGS, 'DEPLOYMENT_POSTPROCESSING': 'NO'})
                desc = {'profile': 'ios-local', 'vendor': vendor, 'host': str(host), 'artifact': str(app), 'symbols': [str(symbols)], 'maps': [str(linkmap)], 'settings': str(settings)}
                app_manifest = root / (vendor + '-files.json')
                core.write(app_manifest, [{'kind': 'file', **f} for f in core.manifest(app)])
                desc.update(appFileManifest=str(app_manifest), expectedAppManifestSha256=core.sha(app_manifest))
                measured = harness.measure_descriptor(desc, cfg)
                cohort = core.digest({'profile': 'ios-local', 'commonInputs': common, 'settings': core.check_settings('ios-local', measured['settings']), 'inputs': {}})
                rows.append({**measured, 'profile': 'ios-local', 'vendor': vendor, 'status': 'measured', 'cohort': cohort, 'descriptor': desc, 'commonFiles': core.bind_files(host / name for name in common)})
            rows = core.size_rows(rows, complete=False)
            evidence = {'schemaVersion': 1, 'origin': 'retained-artifacts', 'inputs': {}, 'pinsSha256': core.sha(core.HERE / 'pins.json'), 'complete': False, 'measurements': rows}
            core.write(root / 'evidence.json', evidence)
            with patch.object(harness, 'validate_inputs', return_value={}), patch.object(harness, 'verify_archive_for_retained'):
                harness.verify(cfg)
                forged = copy.deepcopy(evidence)
                forged['measurements'][1]['bytes'] = 1
                core.write(root / 'evidence.json', forged)
                with self.assertRaisesRegex(ValueError, 'forged/stale measurement'):
                    harness.verify(cfg)
                core.write(root / 'evidence.json', evidence)
                (root / 'c15t-host/App.tsx').write_text('different mounted app')
                evidence['measurements'][1]['commonFiles'] = core.bind_files(root / 'c15t-host' / name for name in common)
                core.write(root / 'evidence.json', evidence)
                with self.assertRaisesRegex(ValueError, 'parity'):
                    harness.verify(cfg)

    def test_recorded_snapshot_has_all_18_measurements(self):
        snapshot = core.read(core.HERE / 'snapshots/2026-10-30.json')
        rows = [{**r, 'cohort': r['profile']} for r in snapshot['measurements']]
        self.assertEqual(core.size_rows(rows), rows)
        self.assertEqual(len(rows), 18)
        self.assertEqual(snapshot['runtime']['summary']['c15t']['scheduled'], 0)
        self.assertIsNone(snapshot['runtime']['summary']['c15t']['p50Ms'])


if __name__ == '__main__':
    unittest.main()
