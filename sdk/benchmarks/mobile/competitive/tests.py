"""Behavior tests for portable collection and strict runtime acceptance."""
import copy
import datetime
import json
import os
from pathlib import Path
import plistlib
import struct
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import core
import harness
import runtime


class RuntimeScheduleTests(unittest.TestCase):
    def test_sampling_and_verification_reject_edited_frozen_schedule(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'runtime'
            root.mkdir()
            cfg = {'output': tmp}
            value = {'participants': {'didomi': {}}, 'device': {'serial': 'emulator-5590', 'avdName': 'test', 'fingerprint': 'fixture'}}
            calibration = root / 'calibration.log'
            calibration.write_text(valid_log(pid=41))
            statuses = {'didomi': {**runtime.parse(calibration.read_text(), 'didomi'), 'eligible': True, 'previousPid': 41}}
            files = core.bind_files([calibration])
            with patch.object(runtime, 'inputs', return_value=value), patch.object(runtime, 'eligibility', return_value=(['didomi'], statuses, files)):
                with patch.object(runtime, 'live_device'):
                    runtime.run(cfg, 'schedule')
                path = root / 'schedule.json'
                original = core.read(path)
                self.assertEqual(original['attempts'], runtime.attempts(['didomi']))
                rows = []
                for attempt in original['attempts']:
                    log = root / (str(attempt['attempt']) + '.log')
                    log.write_text(valid_log(pid=41 + attempt['attempt']))
                    parsed = runtime.parse(log.read_text(), 'didomi')
                    rows.append({**attempt, **parsed, 'allParticipantPidsAfterStop': {'didomi': []}, 'launchExit': 0, 'completedWithinDeadline': True, 'livePids': [str(parsed['pid'])], 'log': str(log), 'files': core.bind_files([log])})
                core.write(root / 'samples.json', {'scheduleSha256': core.sha(path), 'rows': rows})
                runtime.run(cfg, 'verify')
                self.assertEqual(core.read(root / 'results.json')['summary']['didomi']['valid'], 30)
                mutations = [{'attempts': original['attempts'][:1]}, {'attempts': list(reversed(original['attempts']))},
                             {'cooldownSeconds': 0}, {'deadlineSeconds': 300}, {'settleSeconds': 0},
                             {'endpoint': 'another endpoint'}, {'schemaVersion': 2}, {'participants': ['c15t']},
                             {'device': {**value['device'], 'serial': 'emulator-5592'}}]
                for mutation in mutations:
                    core.write(path, {**original, **mutation})
                    samples = rows[:1] if mutation.get('attempts') == original['attempts'][:1] else rows
                    core.write(root / 'samples.json', {'scheduleSha256': core.sha(path), 'rows': samples})
                    for action in ['sample', 'verify']:
                        with self.subTest(mutation=mutation, action=action), patch.object(runtime, 'live_device', side_effect=AssertionError('edited schedule reached a device operation')):
                            with self.assertRaisesRegex(ValueError, 'fixed profile'):
                                runtime.run(cfg, action)
                self.assertFalse((root / 'samples').exists())


class PreflightTests(unittest.TestCase):
    def test_android_uses_java_home_without_java_on_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tools = root / 'tools'
            tools.mkdir()
            for name, source in [('bun', '#!/bin/sh\necho 1.3.11\n'), ('node', '#!/bin/sh\nexit 0\n')]:
                tool = tools / name
                tool.write_text(source)
                tool.chmod(0o755)
            sdk = root / 'android-sdk'
            signer = sdk / 'build-tools/36.0.0/apksigner'
            signer.parent.mkdir(parents=True)
            signer.touch()
            badging = signer.with_name('aapt2')
            badging.touch()
            jdk = root / 'java home'
            java = jdk / 'bin/java'
            java.parent.mkdir(parents=True)
            java.write_text('#!/bin/sh\necho \'openjdk version "17.0.20"\' >&2\n')
            java.chmod(0o755)
            cfg = {'androidSdk': str(sdk), 'nativeLockRunner': ['lock-runner']}
            inputs = {'validated': True}
            with patch.dict(os.environ, {'PATH': str(tools), 'JAVA_HOME': str(jdk)}), patch.object(harness, 'validate_inputs', return_value=inputs):
                for java_config in [{}, {'javaHome': str(jdk)}]:
                    with self.subTest(java_config=java_config):
                        self.assertEqual(harness.preflight({**cfg, **java_config}, 'android', tools=True), inputs)
                for tool in [signer, badging]:
                    with self.subTest(missing_tool=tool.name):
                        tool.unlink()
                        try:
                            with self.assertRaisesRegex(ValueError, 'missing'):
                                harness.preflight(cfg, 'android', tools=True)
                        finally:
                            tool.touch()
                with self.assertRaisesRegex(ValueError, 'set javaHome or JAVA_HOME'):
                    harness.preflight({**cfg, 'javaHome': str(root / 'missing')}, 'android', tools=True)
                java.write_text('#!/bin/sh\necho \'openjdk version "17.0.19"\' >&2\n')
                with self.assertRaisesRegex(ValueError, 'Java 17.0.20 required'):
                    harness.preflight(cfg, 'android', tools=True)


class RetainedPodTests(unittest.TestCase):
    def test_retained_ios_checks_native_lock_and_distribution(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            host = root / 'host'
            wrapper = next(pin for pin in harness.PINS['wrappers'] if pin['name'] == 'didomi')
            package = host / 'node_modules' / wrapper['package']
            package.mkdir(parents=True)
            (package / 'package.json').write_text('{"version":"test-wrapper"}')
            archive = root / 'wrapper.tgz'
            with tarfile.open(archive, 'w:gz') as handle:
                handle.add(package / 'package.json', arcname='package/package.json')
            spec = host / 'ios/Pods/Local Podspecs/ExpoModulesCore.podspec.json'
            core.write(spec, harness.expo_core_spec(host))
            lock = host / 'ios/Podfile.lock'
            pinned_lock = harness.expected_pod_lock(host, 'didomi')
            lock.write_text(pinned_lock)
            binary = host / 'ios/Pods/Didomi-XCFramework/Didomi.framework/Didomi'
            binary.parent.mkdir(parents=True)
            binary.write_bytes(b'pinned native distribution')
            cached = root / 'Didomi-XCFramework-2.53.1.zip'
            with zipfile.ZipFile(cached, 'w') as handle:
                handle.writestr('Didomi.framework/Didomi', binary.read_bytes())
            distribution = next(pin for pin in harness.PINS['iosDistributions'] if pin['name'] == 'Didomi-XCFramework')
            cfg = {'output': str(root / 'output'), 'downloadCache': str(root)}
            row = {'profile': 'ios-local', 'vendor': 'didomi', 'host': str(host), 'wrapperArchive': str(archive)}
            pins = {'wrappers': [{**wrapper, 'tarballSha256': core.sha(archive)}],
                    'iosDistributions': [{**distribution, 'archiveSha256': core.sha(cached)}]}
            with patch.dict(harness.PINS, pins):
                harness.verify_archive_for_retained(cfg, row)
                lock.write_text(pinned_lock.replace('Didomi-XCFramework (2.53.1)', 'Didomi-XCFramework (2.53.0)'))
                with self.assertRaisesRegex(ValueError, 'Pod dependency lock changed'):
                    harness.verify_archive_for_retained(cfg, row)
                lock.write_text(pinned_lock)
                binary.write_bytes(b'a different native SDK build')
                with self.assertRaisesRegex(ValueError, 'installed Pod differs from exact distribution'):
                    harness.verify_archive_for_retained(cfg, row)


class ReportTests(unittest.TestCase):
    def check_report(self, complete):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            evidence = {
                'complete': complete,
                'measurements': [{
                    'profile': 'ios-local', 'vendor': 'baseline', 'status': 'measured',
                    'bytes': 100, 'addedBytes': 0, 'artifactSha256': 'a' * 64,
                }],
            }
            core.write(root / 'evidence.json', evidence)
            with patch.object(harness, 'verify', return_value=evidence):
                harness.report({'output': str(root)})
            report = core.read(root / 'report.json')
            markdown = (root / 'report.md').read_text()
            self.assertIs(report['complete'], complete)
            self.assertEqual(report['evidenceSha256'], core.sha(root / 'evidence.json'))
            self.assertEqual(report['measurements'], evidence['measurements'])
            self.assertIn('| ios-local | baseline | 100 | 0 |', markdown)
            return report, markdown

    def test_partial_reports_warn_without_opening_source_evidence(self):
        report, markdown = self.check_report(False)
        self.assertIn('incomplete cohort', markdown.splitlines()[0].lower())
        self.assertTrue(report['warnings'])
        for warning in report['warnings']:
            self.assertIn(warning, markdown)
        self.assertIn('Do not treat these measurements as a complete benchmark.', markdown)

    def test_complete_reports_keep_the_flag_without_an_incomplete_warning(self):
        report, markdown = self.check_report(True)
        self.assertEqual(report['warnings'], [])
        self.assertEqual(markdown.splitlines()[0], '# Mobile CMP app bytes')
        self.assertNotIn('incomplete', markdown.lower())



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


def device_binary(platform=2):
    return struct.pack('<8I', 0xfeedfacf, 0x100000c, 0, 2, 1, 24, 0, 0) + struct.pack('<6I', 0x32, 24, platform, 0x100400, 0x1b0100, 0)


class CompetitiveTests(unittest.TestCase):
    def test_size_readers_reject_acceptance_or_runtime_instrumentation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            app = root / 'Host.app'
            app.mkdir()
            (app / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'com.c15t.expodev', 'CFBundleExecutable': 'Host', 'DTPlatformName': 'iphoneos', 'CFBundleSupportedPlatforms': ['iPhoneOS']}))
            (app / 'Host').write_bytes(device_binary())
            apk = root / 'host.apk'
            for marker in [b'', b'CMP_SIZE_C15T_STATE', b'CMP_BENCH']:
                bundle = bytes.fromhex('c61fbc03') + marker
                (app / 'main.jsbundle').write_bytes(bundle)
                with zipfile.ZipFile(apk, 'w') as archive:
                    archive.writestr('AndroidManifest.xml', b'manifest')
                    archive.writestr('classes.dex', tiny_dex())
                    archive.writestr('assets/index.android.bundle', bundle)
                readers = [lambda: core.app_measure(app, [], [], 'baseline'),
                           lambda: core.apk_measure(apk, None, 'baseline')]
                for reader in readers:
                    with self.subTest(marker=marker, reader=reader):
                        if marker:
                            with self.assertRaisesRegex(ValueError, 'instrumentation in size artifact'):
                                reader()
                        else:
                            self.assertGreater(reader()['bytes'], 0)
                self.assertGreater(core.apk_measure(apk, None, 'baseline', for_size=False)['bytes'], 0)

    def test_ios_device_reader_rejects_arm64_simulator_load_command(self):
        core.device_macho(device_binary())
        with self.assertRaisesRegex(ValueError, 'device binary'):
            core.device_macho(device_binary(7))
        with self.assertRaisesRegex(ValueError, 'truncated'):
            core.device_macho(device_binary()[:40])

    def test_app_reader_checks_metadata_executable_and_framework_platforms(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = Path(tmp) / 'Host.app'
            app.mkdir()
            info = {'CFBundleIdentifier': 'com.c15t.expodev', 'CFBundleExecutable': 'Host', 'DTPlatformName': 'iphoneos', 'CFBundleSupportedPlatforms': ['iPhoneOS']}
            (app / 'Info.plist').write_bytes(plistlib.dumps(info))
            (app / 'Host').write_bytes(device_binary())
            (app / 'main.jsbundle').write_bytes(bytes.fromhex('c61fbc03'))
            core.app_measure(app, [], [], 'baseline')
            (app / 'Info.plist').write_bytes(plistlib.dumps({**info, 'DTPlatformName': 'iphonesimulator'}))
            with self.assertRaisesRegex(ValueError, 'device app'):
                core.app_measure(app, [], [], 'baseline')
            (app / 'Info.plist').write_bytes(plistlib.dumps(info))
            (app / 'Host').write_bytes(device_binary(7))
            with self.assertRaisesRegex(ValueError, 'device binary'):
                core.app_measure(app, [], [], 'baseline')
            (app / 'Host').write_bytes(device_binary())
            framework = app / 'Frameworks/Dependency.framework/Dependency'
            framework.parent.mkdir(parents=True)
            framework.write_bytes(device_binary(7))
            with self.assertRaisesRegex(ValueError, 'device binary'):
                core.app_measure(app, [], [], 'baseline')

    def test_runtime_artifacts_must_belong_to_bound_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            row = {}
            names = {'apk': 'app-release.apk', 'mapping': 'mapping.txt', 'dependencies': 'dependencies.json', 'settings': 'settings.json'}
            for key, name in names.items():
                p = root / name
                p.write_bytes(name.encode())
                row[key] = str(p)
            build = {'artifacts': core.manifest(root)}
            runtime.bind_runtime_artifacts(row, build)
            for key in names:
                swapped = root / ('unrelated-' + names[key])
                swapped.write_bytes(b'another build')
                with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'differs from its build record'):
                    runtime.bind_runtime_artifacts({**row, key: str(swapped)}, build)

    def test_only_path_dependent_expo_checksum_is_relocated(self):
        host = Path('/temporary/host with spaces and "quotes"')
        spec = harness.expo_core_spec(host)
        self.assertIn('host%20with%20spaces', spec['source']['http'])
        self.assertIn(str(host), spec['prepare_command'])
        original = (core.HERE / 'fixtures/locks/ios/baseline.Podfile.lock').read_text()
        with patch.object(harness, 'podspec_checksum', return_value='a' * 40):
            relocated = harness.expected_pod_lock(host, 'baseline')
        before, after = original.splitlines(), relocated.splitlines()
        self.assertEqual(len(before), len(after))
        self.assertEqual([(a, b) for a, b in zip(before, after) if a != b], [(next(line for line in before if line.startswith('  ExpoModulesCore: ')), '  ExpoModulesCore: ' + 'a' * 40)])

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

    def test_optimizer_profiles_read_merged_r8_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mapping = root / 'mapping.txt'
            mapping.write_text('# compiler: R8\n# compiler_version: 8.12.14\n# min_api: 24\n')
            config = root / 'configuration.txt'
            for profile, default, directive in [
                ('android-release', 'proguard-android.txt', '-dontoptimize\n'),
                ('android-optimized', 'proguard-android-optimize.txt', '# -dontoptimize is only a comment\n'),
            ]:
                config.write_text(f'# The proguard configuration file for the following section is /temporary/{default}-8.12.0\n' + directive)
                self.assertEqual(core.check_r8(profile, config, mapping)['optimizationEnabled'], profile == 'android-optimized')
                other = next(p for p in core.ANDROID_PROFILES if p != profile)
                with self.assertRaisesRegex(ValueError, 'optimizer mismatch'):
                    core.check_r8(other, config, mapping)
            with config.open('a') as stream:
                stream.write('-dontshrink\n')
            with self.assertRaisesRegex(ValueError, 'shrinking/obfuscation'):
                core.check_r8('android-optimized', config, mapping)

    def test_optimized_profile_is_explicit_and_complete_with_six_apps(self):
        self.assertEqual(harness.selected_profiles({}), core.DEFAULT_PROFILES)
        self.assertEqual(len(harness.selected_profiles({})) * len(core.VENDORS), 18)
        rows = [{'profile': 'android-optimized', 'vendor': vendor, 'status': 'measured', 'bytes': 100, 'cohort': 'new'} for vendor in core.VENDORS]
        self.assertEqual(len(core.size_rows(rows, profiles=('android-optimized',))), 6)
        with self.assertRaisesRegex(ValueError, '18'):
            core.size_rows(rows)
        with self.assertRaisesRegex(ValueError, '6'):
            core.size_rows(rows[:-1], profiles=('android-optimized',))
        mixed = [{**row, 'profile': 'android-release'} if row['vendor'] == 'baseline' else row for row in rows]
        with self.assertRaisesRegex(ValueError, 'baseline'):
            core.size_rows(mixed, complete=False)

    def test_optimized_host_does_not_reuse_original_host(self):
        cfg = {'output': '/temporary/run'}
        old = harness.host_for(cfg, 'android', 'c15t')
        new = harness.host_for(cfg, 'android', 'c15t', profile='android-optimized')
        self.assertNotEqual(old, new)
        self.assertEqual(old, Path('/temporary/run/android/c15t-host'))

    def test_frozen_shared_archive_can_prepare_more_than_one_host(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'frozen.tgz'
            target = Path(tmp) / 'shared.tgz'
            source.write_bytes(b'archive bytes')
            source.chmod(0o444)
            try:
                harness.copy_input(source, target)
                harness.copy_input(source, target)
                self.assertEqual(target.read_bytes(), source.read_bytes())
                self.assertEqual(target.stat().st_mode & 0o222, 0)
                target.chmod(0o644)
                target.write_bytes(b'changed input')
                with self.assertRaisesRegex(ValueError, 'frozen input changed'):
                    harness.copy_input(source, target)
            finally:
                source.chmod(0o644)
                if target.exists():
                    target.chmod(0o644)

    def test_analysis_snapshot_keeps_byte_units_and_sums_separate(self):
        snapshot = core.read(core.HERE / 'analysis/android-dependencies/results.json')
        self.assertEqual(snapshot['profile']['name'], 'android-release')
        findings = snapshot['findings']
        self.assertEqual(findings['c15tAddedSignedApkBytes'], 1977546)
        self.assertEqual(findings['c15tCompressedDexGrowthBytes'], 1655577)
        self.assertEqual(findings['composeEstimatedDexBytes'], 2425795)
        self.assertNotEqual(findings['composeEstimatedDexBytes'], findings['c15tCompressedDexGrowthBytes'])
        for app in snapshot['apks'].values():
            self.assertEqual(sum(group['compressedBytes'] for group in app['groupDeltasFromBaseline'].values())
                             + app['zipAndSigningOverheadDelta'], app['addedApkBytes'])
        source = core.read(core.HERE / 'analysis/android-dependencies/source-manifest.json')
        for record in source['files']:
            path = core.HERE / 'analysis/android-dependencies' / record['path']
            self.assertEqual(core.sha(path), record['sha256'])

    def test_untimed_acceptance_requires_real_choice_after_restart(self):
        from acceptance.android import snapshots, denied
        state = {'ready': True, 'policyPending': False, 'effectivePermissions': {'measurement': False}}
        self.assertFalse(denied(state))
        state['explicitChoice'] = {'categories': {'measurement': {'value': False, 'confirmedAt': 123}}}
        self.assertTrue(denied(state))
        self.assertFalse(denied({**state, 'policyPending': True}))
        log = 'ReactNativeJS: CMP_SIZE_C15T_STATE ' + json.dumps(state)
        self.assertEqual(snapshots(log), [state])
        self.assertEqual(snapshots('CMP_SIZE_C15T_STATE {truncated'), [])

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
                (app / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'com.c15t.expodev', 'CFBundleExecutable': 'Host', 'DTPlatformName': 'iphoneos', 'CFBundleSupportedPlatforms': ['iPhoneOS']}))
                (app / 'Host').write_bytes(device_binary())
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
