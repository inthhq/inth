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
    def check_report(self, complete, provenance=()):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            evidence = {
                'complete': complete,
                'provenanceWarnings': list(provenance),
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

    def test_historical_reports_surface_missing_prebuild_provenance(self):
        warning = 'Historical dependency sources were not recorded before building.'
        report, markdown = self.check_report(True, [warning])
        self.assertEqual(report['warnings'], [warning])
        self.assertIn(warning, markdown)



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
    def test_diagnostic_acceptance_uses_optimized_measurement_in_mixed_cohort(self):
        from acceptance import android
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            record = root / 'diagnostic/build-complete.json'
            core.write(record, {'profile': 'android-optimized', 'vendor': 'c15t', 'inputs': {}, 'artifacts': [], 'host': str(root)})
            core.write(record.parent / 'settings.json', {})
            measurements = [{'vendor': 'c15t', 'profile': 'ios-local', 'settings': {'selected': 'wrong'}, 'descriptor': {'artifact': 'wrong'}},
                            {'vendor': 'c15t', 'profile': 'android-optimized', 'settings': {'selected': 'optimized'}, 'descriptor': {'artifact': 'optimized'}}]
            evidence = {'inputs': {}, 'measurements': measurements}
            with patch.object(android, 'verify', return_value=evidence), patch.object(android, 'manifest', return_value=[]), patch.object(android, 'verify_installed'), patch.object(android, 'check_r8'), patch.object(android, 'check_settings', side_effect=RuntimeError('stop before native operations')) as checked:
                with self.assertRaisesRegex(RuntimeError, 'stop before native operations'):
                    android.run({'output': str(root / 'output')}, 5588, diagnostic_build=record)
                self.assertEqual(checked.call_args.args[2], {'selected': 'optimized'})
                evidence['measurements'] = measurements[:1]
                checked.reset_mock()
                with self.assertRaisesRegex(ValueError, 'missing measured android-optimized'):
                    android.run({'output': str(root / 'output')}, 5588, attempt='missing', diagnostic_build=record)
                checked.assert_not_called()

    def test_dependency_report_rejects_balanced_edits_against_measured_json(self):
        import runpy
        import sys
        root = core.HERE / 'analysis/android-dependencies'
        script = root / 'scripts/verify.py'
        with patch.object(sys, 'path', [str(script.parent), *sys.path]):
            verify_tables = runpy.run_path(str(script))['verify_report_tables']
        report = (root / 'report.md').read_text()
        snapshot = core.read(root / 'results.json')
        verify_tables(report, snapshot['apks'], snapshot['dexEstimateDeltas'])
        mutations = [
            report.replace('| DEX | 1,655,577 |', '| DEX | 1,655,576 |').replace('| Hermes bundle | 125,492 |', '| Hermes bundle | 125,493 |'),
            report.replace('| Compose | 0 | 2,425,795 | 2,425,795 |', '| Compose | 0 | 2,425,796 | 2,425,796 |').replace('| c15t core | 0 | 270,780 | 270,780 |', '| c15t core | 0 | 270,779 | 270,779 |'),
        ]
        for changed in mutations:
            self.assertNotEqual(report, changed)
            with self.assertRaisesRegex(ValueError, 'report rows differ'):
                verify_tables(changed, snapshot['apks'], snapshot['dexEstimateDeltas'])
        changed = copy.deepcopy(snapshot['dexEstimateDeltas'])
        changed['baselineEstimatedDexBytes'] += 1
        with self.assertRaisesRegex(ValueError, 'report rows differ'):
            verify_tables(report, snapshot['apks'], changed)

    def test_dependency_verification_checks_remain_active_under_python_optimization(self):
        import subprocess
        import sys
        script = core.HERE / 'analysis/android-dependencies/scripts/verify.py'
        code = "import runpy,sys; from pathlib import Path; sys.path.insert(0,str(Path(sys.argv[1]).parent)); runpy.run_path(sys.argv[1])['check'](False,'invalid optimized evidence')"
        result = subprocess.run([sys.executable, '-O', '-c', code, str(script)], text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('invalid optimized evidence', result.stderr)

    def dependency_host(self, root):
        host = Path(root)
        for name, version in [('expo', '57.0.22'), ('react-native', '0.86.3'), ('react', '19.2.7')]:
            core.write(host / 'node_modules' / name / 'package.json', {'version': version})
        for name in ('expo/build/Expo.fx.js', 'react-native/ReactAndroid/src/main/Host.kt',
                     'react/index.js', 'transitive/build/index.js'):
            path = host / 'node_modules' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('original dependency source')
        return host

    def test_prebuild_and_later_readers_reject_framework_and_transitive_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = self.dependency_host(tmp)
            harness.bind_installed(host)
            cfg = {'output': str(host / 'output')}
            core.write(host / 'prepared.json', {'profile': 'android-release', 'inputs': {}, 'files': harness.host_inputs(host), 'construction': harness.construction_inputs()})
            original = harness.host_inputs(host)
            for name in ('expo/build/Expo.fx.js', 'react-native/ReactAndroid/src/main/Host.kt',
                         'react/index.js', 'transitive/build/index.js'):
                source = host / 'node_modules' / name
                source.write_text('modified dependency source')
                for before in (True, False):
                    with self.subTest(name=name, before=before), self.assertRaisesRegex(ValueError, 'dependency sources changed'):
                        harness.verify_installed(cfg, host, 'baseline', before_build=before)
                with patch.object(harness, 'preflight'), patch.object(harness, 'host_for', return_value=host), patch.object(harness, 'validate_inputs', return_value={}), patch.object(harness, 'invoke', side_effect=AssertionError('changed dependency reached native command')) as invoke:
                    with self.assertRaisesRegex(ValueError, 'dependency sources changed'):
                        harness.build(cfg, 'android-release', 'baseline')
                    invoke.assert_not_called()
                source.write_text('original dependency source')
            harness.verify_installed(cfg, host, 'baseline', before_build=True)
            # The dependency binding itself is part of every existing host reader,
            # including the strict runtime reader's host hash.
            (host / 'installed-inputs.json').unlink()
            self.assertNotEqual(harness.host_inputs(host), original)
            core.write(host / 'prepared.json', {'profile': 'android-release', 'inputs': {}, 'files': harness.host_inputs(host), 'construction': harness.construction_inputs()})
            with patch.object(harness, 'preflight'), patch.object(harness, 'host_for', return_value=host), patch.object(harness, 'validate_inputs', return_value={}), patch.object(harness, 'invoke') as invoke:
                with self.assertRaisesRegex(ValueError, 'missing prebuild installed-source binding'):
                    harness.build(cfg, 'android-release', 'baseline')
                invoke.assert_not_called()

    def test_construction_edits_fail_before_size_or_runtime_build_commands(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            checkout = root / 'checkout'
            checkout.mkdir()
            names = ('harness.py', 'core.py', 'pins.json', 'fixtures/gradle/android-resolved-artifacts.gradle',
                     'fixtures/runtime/App.tsx', 'fixtures/adapters/c15t.tsx')
            for name in names:
                path = checkout / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes((core.HERE / name).read_bytes())
            host = self.dependency_host(root / 'host')
            harness.bind_installed(host)
            cfg = {'output': str(root / 'output')}
            with patch.object(harness, 'HERE', checkout), patch.object(harness, 'validate_inputs', return_value={}):
                construction = harness.construction_inputs()
                core.write(host / 'prepared.json', {'profile': 'android-release', 'inputs': {},
                    'files': harness.host_inputs(host), 'construction': construction})
                harness.verify_prepared(cfg, host, 'android-release', 'baseline')
                for name in names:
                    path = checkout / name
                    original = path.read_bytes()
                    path.write_bytes(original + b'\nchanged construction input\n')
                    for profile, runtime_build in [('android-release', False), ('android-optimized', False),
                                                   ('ios-local', False), ('ios-postprocessed', False), ('android-release', True)]:
                        with self.subTest(name=name, profile=profile, runtime=runtime_build), patch.object(harness, 'host_for', return_value=host), patch.object(harness, 'invoke') as invoke, patch.object(harness, 'preflight') as preflight:
                            with self.assertRaisesRegex(ValueError, 'construction sources changed'):
                                harness.build(cfg, profile, 'baseline', runtime=runtime_build)
                            invoke.assert_not_called()
                            preflight.assert_not_called()
                    path.write_bytes(original)

    def test_dependency_binding_covers_isolated_bun_links_and_file_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = self.dependency_host(tmp)
            modules = host / 'node_modules'
            source = modules / '.bun/transitive@1/node_modules/transitive/index.js'
            source.parent.mkdir(parents=True)
            source.write_text('transitive installed bytes')
            link = modules / 'linked'
            link.symlink_to('.bun/transitive@1/node_modules/transitive', target_is_directory=True)
            binary = modules / '.bin/transitive'
            binary.parent.mkdir()
            binary.symlink_to('../linked/index.js')
            harness.bind_installed(host)
            harness.verify_installed({}, host, 'baseline', before_build=True)
            for mutation in ('change', 'delete', 'add', 'mode', 'retarget'):
                original = source.read_bytes()
                if mutation == 'change':
                    source.write_text('different bytes')
                elif mutation == 'delete':
                    source.unlink()
                elif mutation == 'add':
                    (modules / 'new.js').touch()
                elif mutation == 'mode':
                    source.chmod(0o755)
                else:
                    binary.unlink()
                    binary.symlink_to('../react/index.js')
                with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                    harness.verify_installed({}, host, 'baseline')
                source.write_bytes(original)
                source.chmod(0o644)
                (modules / 'new.js').unlink(missing_ok=True)
                binary.unlink()
                binary.symlink_to('../linked/index.js')
            for target in ('../../outside', 'missing', 'linked'):
                link.unlink()
                if target == '../../outside':
                    (host.parent / 'outside').touch()
                link.symlink_to(target)
                with self.subTest(target=target), self.assertRaisesRegex(ValueError, 'dependency symlink'):
                    core.installed_manifest(modules)
            link.unlink()

    def test_fresh_and_retained_size_readers_check_bound_installed_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            host = self.dependency_host(root / 'host')
            harness.bind_installed(host)
            cfg = {'output': str(root)}
            output = harness.out_for(cfg, 'android-release', 'baseline')
            record = output / 'build-complete.json'
            core.write(record, {'runtime': False, 'profile': 'android-release', 'vendor': 'baseline',
                'host': str(host), 'hostInputsSha256': core.digest(harness.host_inputs(host)),
                'installedInputsSha256': core.sha(host / 'installed-inputs.json'),
                'inputs': {}, 'artifacts': [], 'commonInputs': {}})
            row = {'host': str(host), 'profile': 'android-release', 'vendor': 'baseline', 'buildRecord': str(record)}
            with patch.object(harness, 'validate_inputs', return_value={}):
                harness.descriptor(cfg, 'android-release', 'baseline')
                harness.verify_archive_for_retained(cfg, row)
                (host / 'node_modules/transitive/build/index.js').write_text('different transitive source')
                with self.assertRaisesRegex(ValueError, 'dependency sources changed'):
                    harness.descriptor(cfg, 'android-release', 'baseline')
                with self.assertRaisesRegex(ValueError, 'dependency sources changed'):
                    harness.verify_archive_for_retained(cfg, row)

    def test_strict_runtime_reader_rejects_bound_dependency_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            host = self.dependency_host(root / 'host')
            for source, installed in [('App.tsx', 'App.tsx'), ('runtime-types.ts', 'runtime-types.ts'), ('c15t.tsx', 'consent-adapter.tsx')]:
                (host / installed).write_bytes((core.HERE / 'fixtures/runtime' / source).read_bytes())
            harness.bind_installed(host)
            output = root / 'artifacts'
            output.mkdir()
            row = {'configured': True}
            for key, name in [('apk', 'app-release.apk'), ('mapping', 'mapping.txt'), ('dependencies', 'dependencies.json'), ('settings', 'settings.json'),
                              ('calibrationLog', 'calibration.log'), ('offlineLog', 'offline.log'), ('stockUiScreenshot', 'screen.png'), ('stockUiXml', 'screen.xml'), ('cacheArchive', 'cache.tar')]:
                path = output / name
                path.write_text('fixture evidence')
                row[key] = str(path)
            row['apkSha256'] = core.sha(row['apk'])
            record = output / 'build-complete.json'
            core.write(record, {'runtime': True, 'profile': 'android-release', 'vendor': 'c15t', 'host': str(host),
                'hostInputsSha256': core.digest(harness.host_inputs(host)), 'inputs': {}, 'artifacts': core.manifest(output)})
            row['buildRecord'] = str(record)
            proof, ownership = root / 'network.json', root / 'ownership.json'
            core.write(proof, {'taskOwnedTcpProbe': {'listenerClosed': True, 'adbReverseRemoved': True}})
            core.write(ownership, {'taskOwned': True, 'serial': 'emulator-5590', 'avdName': 'fixture'})
            value = {'networkProof': str(proof), 'ownershipFile': str(ownership), 'device': {'serial': 'emulator-5590', 'avdName': 'fixture'}, 'participants': {'c15t': row}}
            (host / 'node_modules/transitive/build/index.js').write_text('changed transitive installed source')
            with patch.object(harness, 'validate_inputs', return_value={}):
                eligible, statuses, _ = runtime.eligibility({}, value)
            self.assertEqual(eligible, [])
            self.assertIn('dependency sources changed', statuses['c15t']['reason'])

    def test_only_named_native_outputs_allow_additions_after_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = self.dependency_host(tmp)
            modules = host / 'node_modules'
            packaged = modules / 'react-native/ReactAndroid/build/packaged.dat'
            packaged.parent.mkdir(parents=True)
            packaged.write_text('published bytes even inside an output directory')
            harness.bind_installed(host)
            output = modules / 'react-native/ReactAndroid/build/generated/Native.kt'
            output.parent.mkdir(parents=True)
            output.write_text('native output')
            harness.verify_installed({}, host, 'baseline')
            with self.assertRaisesRegex(ValueError, 'dependency sources changed'):
                harness.verify_installed({}, host, 'baseline', before_build=True)
            output.unlink()
            # A named output exception must preserve files present at prepare.
            packaged.write_text('changed published source')
            with self.assertRaisesRegex(ValueError, 'dependency sources changed'):
                harness.verify_installed({}, host, 'baseline')
            packaged.write_text('published bytes even inside an output directory')
            output = modules / 'expo/build/new.js'
            output.write_text('extra executable dependency')
            with self.assertRaisesRegex(ValueError, 'dependency sources changed'):
                harness.verify_installed({}, host, 'baseline')

    def test_generated_tenant_config_is_common_even_for_legacy_rechecks(self):
        with tempfile.TemporaryDirectory() as tmp:
            rows = []
            for vendor in ('baseline', 'c15t'):
                host = Path(tmp) / vendor
                host.mkdir()
                for name in ('App.tsx', 'index.ts', 'metro.config.js', 'tsconfig.json', 'benchmark-config.ts'):
                    (host / name).write_text('identical tenant and host')
                rows.append({'host': str(host)})
            host = Path(rows[1]['host'])
            normal = harness.cohort_inputs(rows, 'ios')
            self.assertIn('benchmark-config.ts', normal)
            legacy = harness.cohort_inputs(rows, 'ios', legacy=True)
            self.assertNotIn('benchmark-config.ts', legacy)
            (host / 'benchmark-config.ts').write_text('changed tenant')
            self.assertNotEqual(harness.common_inputs(host, 'ios'), normal)
            for historic in (False, True):
                with self.subTest(legacy=historic), self.assertRaisesRegex(ValueError, 'parity mismatch'):
                    harness.cohort_inputs(rows, 'ios', legacy=historic)
            for row in rows:
                (Path(row['host']) / 'benchmark-config.ts').unlink()
            self.assertEqual(harness.cohort_inputs(rows, 'ios', legacy=True), legacy)
            with self.assertRaisesRegex(ValueError, 'missing benchmark configuration'):
                harness.cohort_inputs(rows, 'ios')

    def test_build_rejects_unpinned_generated_sources_before_gradle_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = Path(tmp)
            for name, version in [('expo', '57.0.22'), ('react-native', '0.86.3'), ('react', '19.2.7')]:
                core.write(host / 'node_modules' / name / 'package.json', {'version': version})
            installed = host / 'node_modules/@c15t/react-native'
            installed.mkdir(parents=True)
            (installed / 'index.js').write_text('pinned source')
            archive = host / 'wrapper.tgz'
            with tarfile.open(archive, 'w:gz') as handle:
                handle.add(installed, arcname='package')
            cfg = {'archive': str(archive), 'output': str(host / 'output')}
            self.assertEqual(harness.verify_installed(cfg, host, 'c15t', before_build=True), 1)
            generated = installed / 'android/c15t-react-native/build/generated/Injected.kt'
            generated.parent.mkdir(parents=True)
            generated.write_text('extra generated source must not enter a fresh build')
            with self.assertRaisesRegex(ValueError, 'extra installed package file'):
                harness.verify_installed(cfg, host, 'c15t', before_build=True)
            self.assertEqual(harness.verify_installed(cfg, host, 'c15t'), 1)
            harness.bind_installed(host)
            core.write(host / 'prepared.json', {'profile': 'android-release', 'inputs': {}, 'files': harness.host_inputs(host), 'construction': harness.construction_inputs()})
            with patch.object(harness, 'preflight'), patch.object(harness, 'host_for', return_value=host), patch.object(harness, 'validate_inputs', return_value={}), patch.object(harness, 'invoke', side_effect=AssertionError('unpinned source reached a build command')) as invoke:
                with self.assertRaisesRegex(ValueError, 'extra installed package file'):
                    harness.build(cfg, 'android-release', 'c15t')
                invoke.assert_not_called()

    def test_installed_wrapper_rejects_extra_sources_and_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            installed = root / 'package'
            installed.mkdir()
            (installed / 'index.js').write_text('export const pinned = true;')
            archive = root / 'wrapper.tgz'
            with tarfile.open(archive, 'w:gz') as handle:
                handle.add(installed, arcname='package')
            self.assertEqual(core.verify_archive(archive, installed), 1)
            for relative in ('unlisted.js', 'dist/unlisted.js', 'android/src/main/Injected.kt', 'build/unlisted.js'):
                path = installed / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('unpinned source')
                with self.subTest(relative=relative), self.assertRaisesRegex(ValueError, 'extra installed package file'):
                    core.verify_archive(archive, installed, generated_roots=('android/build',))
                path.unlink()
            generated = installed / 'android/build/generated/Generated.kt'
            generated.parent.mkdir(parents=True)
            generated.write_text('native build output')
            with self.assertRaisesRegex(ValueError, 'extra installed package file'):
                core.verify_archive(archive, installed)
            self.assertEqual(core.verify_archive(archive, installed, generated_roots=('android/build',)), 1)
            for relative, target in (('alias.js', 'index.js'), ('linked-source', 'android'), ('android/build/alias', '../../index.js')):
                link = installed / relative
                link.symlink_to(target)
                with self.subTest(link=relative), self.assertRaisesRegex(ValueError, 'installed package symlink'):
                    core.verify_archive(archive, installed, generated_roots=('android/build',))
                link.unlink()

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
            optimized = '# The proguard configuration file for the following section is /temporary/proguard-android-optimize.txt-8.12.0\n'
            for mutation in ['-dontoptimize\n', '-dontobfuscate\n', '# The proguard configuration file for the following section is /temporary/proguard-android.txt-8.12.0\n']:
                config.write_text(optimized + mutation)
                with self.subTest(mutation=mutation), self.assertRaises(ValueError):
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

    def test_untimed_acceptance_requires_saved_choice_not_default_off(self):
        import xml.etree.ElementTree as ET
        from acceptance.android import native_preferences, denied
        tree = ET.fromstring('<hierarchy><node resource-id="c15t.prefs.category.measurement.switch" checkable="true" checked="false"/></hierarchy>')
        state = native_preferences(tree)
        self.assertFalse(denied(state))
        ET.SubElement(tree, 'node', {'resource-id': 'c15t.prefs.last-changed', 'text': 'Last changed Oct 30, 2026'})
        state = native_preferences(tree)
        self.assertTrue(denied(state))
        self.assertFalse(denied({**state, 'categories': {'measurement': True}}))
        self.assertFalse(denied({'lastChanged': state['lastChanged'], 'categories': {}}))
        tree.find('node').set('checkable', 'false')
        self.assertFalse(denied(native_preferences(tree)))

    def test_emulator_cleanup_accepts_stale_offline_rows_only_after_real_shutdown(self):
        from acceptance.android import emulator_stopped
        stopped = {'stoppedBeforeLockRelease': True, 'emulatorPortsClosed': True,
                   'adbDisconnected': True, 'serialStateAfterStop': 'offline'}
        self.assertTrue(emulator_stopped(stopped))
        self.assertTrue(emulator_stopped({**stopped, 'serialStateAfterStop': 'absent'}))
        for mutation in [{'stoppedBeforeLockRelease': False}, {'emulatorPortsClosed': False},
                         {'adbDisconnected': False}, {'serialStateAfterStop': 'device'}]:
            with self.subTest(mutation=mutation):
                self.assertFalse(emulator_stopped({**stopped, **mutation}))

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
                for name in ['App.tsx', 'index.ts', 'metro.config.js', 'tsconfig.json', 'benchmark-config.ts']:
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
                (root / 'c15t-host/benchmark-config.ts').write_text('different mounted tenant')
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

    def test_optimized_snapshot_binds_clean_acceptance_to_its_six_app_cohort(self):
        snapshot = core.read(core.HERE / 'snapshots/2026-10-30-android-optimized.json')
        self.assertTrue(snapshot['complete'])
        self.assertEqual(snapshot['profile'], 'android-optimized')
        rows = [{**row, 'cohort': row['profile']} for row in snapshot['measurements']]
        self.assertEqual(core.size_rows(rows, profiles=('android-optimized',)), rows)
        self.assertEqual({row['vendor'] for row in rows}, set(core.VENDORS))
        baseline = next(row for row in rows if row['vendor'] == 'baseline')
        for row in rows:
            self.assertTrue(row['r8']['optimizationEnabled'])
            self.assertEqual(row['r8']['defaultFile'], 'proguard-android-optimize.txt')
            self.assertEqual(row['addedBytes'], row['bytes'] - baseline['bytes'])
            self.assertEqual(sum(group['compressedBytes'] for group in row['groups'].values())
                             + row['zipAndSigningOverheadBytes'], row['bytes'])
            self.assertNotIn(row['artifactSha256'], snapshot['excludedArtifacts'])
        acceptance = snapshot['acceptance']
        c15t = next(row for row in rows if row['vendor'] == 'c15t')
        self.assertEqual(acceptance['c15t']['installedApkSha256'], c15t['artifactSha256'])
        self.assertTrue(acceptance['c15t']['durableDenial'])
        self.assertTrue(acceptance['c15t']['freshProcess'])
        self.assertTrue(acceptance['c15t']['choiceTimestampMatchesCleanApkRejection'])
        self.assertTrue(acceptance['emulator']['stoppedBeforeLockRelease'])
        self.assertTrue(acceptance['emulator']['emulatorPortsClosed'])
        self.assertTrue(acceptance['emulator']['adbDisconnected'])
        self.assertIn(acceptance['emulator']['serialStateAfterStop'], ('absent', 'offline'))
        self.assertIn(acceptance['c15t']['diagnosticApkSha256'], snapshot['excludedArtifacts'])


if __name__ == '__main__':
    unittest.main()
