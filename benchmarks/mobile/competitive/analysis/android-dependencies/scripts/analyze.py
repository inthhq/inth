#!/usr/bin/env python3
"""Analyze frozen final APKs without rebuilding or changing their consumers.

Use --run-apkanalyzer to refresh local TSV evidence. All paths in report JSON
are relative to --evidence or --out. Vendor binaries remain outside the report.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import zipfile

VENDORS = ['baseline', 'c15t', 'onetrust', 'didomi', 'usercentrics', 'sourcepoint']
PACKAGES = [
    'androidx.compose', 'androidx.compose.ui', 'androidx.compose.runtime',
    'androidx.compose.foundation', 'androidx.compose.animation',
    'androidx.compose.material3', 'androidx.compose.material',
    'com.c15t.core', 'com.c15t.core.iab', 'com.c15t.core.model',
    'com.c15t.consentui', 'com.c15t.android', 'com.c15t.reactnative',
    'kotlinx.serialization', 'kotlinx.coroutines', 'kotlin', 'kotlin.reflect',
    'androidx.activity', 'androidx.lifecycle', 'androidx.savedstate',
    'androidx.collection', 'androidx.emoji2', 'androidx.profileinstaller',
    'androidx.graphics', 'androidx.appcompat', 'androidx.fragment',
    'androidx.constraintlayout', 'com.google.android.material', 'okhttp3',
    'okio', 'com.google.gson', 'com.facebook', 'expo', 'com.onetrust',
    'io.didomi', 'com.usercentrics', 'io.sentry', 'com.sourcepoint', 'io.ktor',
]
FAMILIES = [
    ('com.c15t.core.', 'c15t-core'),
    ('com.c15t.consentui.', 'c15t-presenter'),
    ('com.c15t.android.', 'c15t-android'),
    ('com.c15t.reactnative.', 'c15t-rn-bridge'),
    ('androidx.compose.', 'compose'),
    ('kotlinx.serialization.', 'serialization'),
    ('kotlinx.coroutines.', 'coroutines'),
    ('androidx.lifecycle.', 'lifecycle'),
    ('androidx.activity.', 'activity'),
    ('androidx.savedstate.', 'savedstate'),
    ('androidx.collection.', 'collection'),
    ('kotlin.', 'kotlin'),
]


def check(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def family(name):
    return next((group for prefix, group in FAMILIES if name.startswith(prefix)), 'other')


def zip_group(name):
    if re.fullmatch(r'classes\d*\.dex', name):
        return 'dex'
    if name.startswith('lib/'):
        return 'nativeLibraries'
    if name == 'assets/index.android.bundle':
        return 'hermesBundle'
    if name == 'assets/c15t-policy.json':
        return 'c15tPolicy'
    if name.startswith('res/') or name == 'resources.arsc':
        return 'resources'
    if name == 'AndroidManifest.xml':
        return 'manifest'
    return 'other'


def read_dex(raw):
    """Return defined descriptors and exact instruction bytes, excluding metadata.

    Instruction bytes are 2 * code_item.insns_size. They exclude code headers,
    catches, debug data, strings, IDs, annotations, and alignment. No compressed
    attribution follows from these counts.
    """
    check(raw.startswith(b'dex\n'), 'invalid DEX header')
    u32 = lambda offset: struct.unpack_from('<I', raw, offset)[0]

    def uleb(offset):
        value = 0
        shift = 0
        while True:
            byte = raw[offset]
            offset += 1
            value |= (byte & 127) << shift
            if not byte & 128:
                return value, offset
            shift += 7

    strings = []
    for index in range(u32(56)):
        offset = u32(u32(60) + index * 4)
        _, offset = uleb(offset)
        strings.append(raw[offset:raw.index(0, offset)].decode('utf-8', errors='replace'))
    types = [strings[u32(u32(68) + index * 4)] for index in range(u32(64))]
    classes = {}
    owned_code_offsets = set()
    for index in range(u32(96)):
        offset = u32(100) + index * 32
        descriptor = types[u32(offset)]
        data_offset = u32(offset + 24)
        instruction_bytes = 0
        code_offsets = set()
        if data_offset:
            counts = []
            for _ in range(4):
                count, data_offset = uleb(data_offset)
                counts.append(count)
            for _ in range(counts[0] + counts[1]):
                _, data_offset = uleb(data_offset)
                _, data_offset = uleb(data_offset)
            for _ in range(counts[2] + counts[3]):
                _, data_offset = uleb(data_offset)
                _, data_offset = uleb(data_offset)
                code_offset, data_offset = uleb(data_offset)
                if code_offset:
                    code_offsets.add(code_offset)
            instruction_bytes = sum(2 * u32(code + 12) for code in code_offsets)
        check(not owned_code_offsets & code_offsets, 'Shared DEX code item needs explicit attribution')
        owned_code_offsets.update(code_offsets)
        classes[descriptor] = {'instructionBytes': instruction_bytes, 'codeItems': len(code_offsets)}
    return classes


def apk(apk_path):
    groups = defaultdict(lambda: Counter(compressedBytes=0, uncompressedBytes=0, entries=0))
    entries = {}
    descriptors = {}
    with zipfile.ZipFile(apk_path) as archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            raw = archive.read(entry)
            group = zip_group(entry.filename)
            groups[group].update(compressedBytes=entry.compress_size,
                                 uncompressedBytes=entry.file_size, entries=1)
            entries[entry.filename] = {
                'group': group, 'compressedBytes': entry.compress_size,
                'uncompressedBytes': entry.file_size,
                'sha256': hashlib.sha256(raw).hexdigest(),
            }
            if group == 'dex':
                dex = read_dex(raw)
                check(not descriptors.keys() & dex.keys(), 'Duplicate DEX class definition')
                descriptors.update(dex)
    payload = sum(value['compressedBytes'] for value in groups.values())
    return {
        'apkBytes': apk_path.stat().st_size, 'apkSha256': sha(apk_path),
        'groups': dict(groups), 'compressedPayloadBytes': payload,
        'zipAndSigningOverheadBytes': apk_path.stat().st_size - payload,
        'dexClasses': len(descriptors),
    }, entries, descriptors


def analyzer_packages(path):
    packages = {}
    classes = {}
    for line in path.read_text().splitlines():
        parts = line.split('\t')
        if len(parts) != 4 or not parts[0].startswith(('P d ', 'C d ')):
            continue
        value = {'definedMethods': int(parts[0].split()[-1]),
                 'referencedMethods': int(parts[1]), 'estimatedDexBytes': int(parts[2])}
        (packages if parts[0].startswith('P ') else classes)[parts[3]] = value
    check('<TOTAL>' in packages, 'APK Analyzer total is missing')
    return packages, classes


def retention(mapping_path, usage_path, seeds_path, descriptors):
    mapping = dict(re.findall(r'^([^ #\s]+) -> ([^\s]+):$', mapping_path.read_text(), re.M))
    reverse = defaultdict(list)
    retained = defaultdict(set)
    original_retained = Counter()
    for original, destination in mapping.items():
        descriptor = 'L' + destination.replace('.', '/') + ';'
        if descriptor in descriptors:
            reverse[descriptor].append(original)
            group = family(original)
            retained[group].add(descriptor)
            original_retained[group] += 1
    exact = defaultdict(Counter)
    ambiguous = []
    for descriptor, data in descriptors.items():
        originals = reverse.get(descriptor, [descriptor[1:-1].replace('/', '.')])
        groups = {family(name) for name in originals}
        group = next(iter(groups)) if len(groups) == 1 else 'mixed-r8-origin'
        if len(groups) > 1:
            ambiguous.append({'descriptor': descriptor, 'families': sorted(groups)})
        exact[group].update(instructionBytes=data['instructionBytes'], codeItems=data['codeItems'],
                            dexClasses=1)
    removed = Counter()
    # A class removed entirely is an unindented name without a trailing colon.
    for line in usage_path.read_text().splitlines():
        if line and not line.startswith((' ', '#')) and not line.endswith(':'):
            removed[family(line)] += 1
    seeds = defaultdict(Counter)
    for line in seeds_path.read_text().splitlines():
        if line:
            seeds[family(line.split(':', 1)[0])]['members' if ':' in line else 'classes'] += 1
    return {
        'families': {group: dict(
            exact.get(group, {}), mappedOriginalClassesWithDexDestination=original_retained[group],
            uniqueMappedDexDestinations=len(retained[group]),
            fullyRemovedOriginalClassesInUsage=removed[group],
            seededOriginalClasses=seeds[group]['classes'], seededMembers=seeds[group]['members'])
            for group in sorted(set(exact) | set(removed) | set(seeds))},
        'mixedOriginDestinations': ambiguous,
        'totalInstructionBytes': sum(row['instructionBytes'] for row in descriptors.values()),
    }


def dependency_delta(base_rows, rows):
    base = {row['coordinate']: row for row in base_rows}
    current = {row['coordinate']: row for row in rows}
    shared = sorted(base.keys() & current.keys())
    check(all(base[coordinate]['sha256'] == current[coordinate]['sha256'] for coordinate in shared), 'shared native artifact hashes differ')
    added = sorted(current.keys() - base.keys())
    removed = sorted(base.keys() - current.keys())
    replacements = []
    for old in removed:
        module = old.rsplit(':', 1)[0]
        for new in added:
            if new.rsplit(':', 1)[0] == module:
                replacements.append({'baseline': old, 'resolved': new})
    return {'sharedCoordinates': len(shared), 'sharedArtifactHashesEqual': True,
            'addedCoordinates': added, 'removedOrVersionReplacedCoordinates': removed,
            'sameModuleVersionReplacements': replacements,
            'resolvedArtifactRows': len(rows), 'uniqueCoordinates': len(current)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--apkanalyzer', type=Path)
    parser.add_argument('--run-apkanalyzer', action='store_true')
    args = parser.parse_args()
    evidence = args.evidence.resolve()
    android = evidence / 'android'
    output = args.out.resolve()
    raw_output = output / 'raw'
    raw_output.mkdir(parents=True, exist_ok=True)
    expected = json.loads((android / 'results.json').read_text())['variants']
    base_dependencies = json.loads((android / 'baseline-resolved-artifacts.json').read_text())
    index = []
    results = {}
    all_entries = {}
    retentions = {}
    all_packages = {}
    dependencies = {}
    for name in VENDORS:
        artifact_dir = android / f'{name}-artifacts'
        apk_path = artifact_dir / 'app-release.apk'
        mapping = artifact_dir / 'r8' / 'mapping.txt'
        usage = artifact_dir / 'r8' / 'usage.txt'
        seeds = artifact_dir / 'r8' / 'seeds.txt'
        configuration = artifact_dir / 'r8' / 'configuration.txt'
        deps = android / f'{name}-resolved-artifacts.json'
        for path in [apk_path, mapping, usage, seeds, configuration, deps]:
            index.append({'input': path.relative_to(evidence).as_posix(),
                          'sha256': sha(path), 'bytes': path.stat().st_size})
        summary, entries, descriptors = apk(apk_path)
        for field in ['apkBytes', 'apkSha256', 'dexClasses', 'groups', 'zipAndSigningOverheadBytes']:
            check(summary[field] == expected[name][field], (name, field))
        package_file = raw_output / f'{name}-dex-packages.tsv'
        if args.run_apkanalyzer:
            analyzer = args.apkanalyzer or Path(os.environ['ANDROID_HOME']) / 'cmdline-tools/latest/bin/apkanalyzer'
            with package_file.open('w') as stdout:
                subprocess.run([str(analyzer), 'dex', 'packages', '--defined-only',
                                '--proguard-mappings', str(mapping), str(apk_path)],
                               stdout=stdout, check=True)
        packages, classes = analyzer_packages(package_file)
        all_packages[name] = packages
        summary['addedApkBytes'] = summary['apkBytes'] - expected['baseline']['apkBytes']
        check(summary['addedApkBytes'] == expected[name]['addedApkBytes'], 'added APK bytes differ from frozen measurement')
        summary['apkanalyzerEstimate'] = packages['<TOTAL>']
        summary['packageEstimates'] = {package: packages.get(package, {
            'estimatedDexBytes': 0, 'definedMethods': 0, 'referencedMethods': 0}) for package in PACKAGES}
        summary['r8OptimizationDisabledByHost'] = bool(re.search(r'^-dontoptimize\s*$', configuration.read_text(), re.M))
        summary['r8Version'] = re.search(r'^# compiler_version: (.+)$', mapping.read_text(), re.M).group(1)
        retentions[name] = retention(mapping, usage, seeds, descriptors)
        dependencies[name] = dependency_delta(base_dependencies, json.loads(deps.read_text()))
        results[name] = summary
        all_entries[name] = entries
    baseline = results['baseline']
    for name, summary in results.items():
        summary['groupDeltasFromBaseline'] = {
            group: {field: summary['groups'].get(group, {}).get(field, 0)
                    - baseline['groups'].get(group, {}).get(field, 0)
                    for field in ['compressedBytes', 'uncompressedBytes']}
            for group in sorted(summary['groups'].keys() | baseline['groups'].keys())}
        summary['zipAndSigningOverheadDelta'] = summary['zipAndSigningOverheadBytes'] - baseline['zipAndSigningOverheadBytes']
        check(sum(row['compressedBytes'] for row in summary['groupDeltasFromBaseline'].values()) + summary['zipAndSigningOverheadDelta'] == summary['addedApkBytes'], 'compressed APK groups do not sum to added bytes')
    changed = []
    base_entries = all_entries['baseline']
    current_entries = all_entries['c15t']
    for name in sorted(base_entries.keys() | current_entries.keys()):
        old = base_entries.get(name)
        new = current_entries.get(name)
        if old == new:
            continue
        changed.append({'entry': name, 'baseline': old, 'c15t': new,
                        'compressedByteDelta': (new or {}).get('compressedBytes', 0) - (old or {}).get('compressedBytes', 0)})
    changed.sort(key=lambda row: abs(row['compressedByteDelta']), reverse=True)
    native_comparison = []
    for name in sorted(name for name in base_entries.keys() | current_entries.keys() if name.startswith('lib/')):
        old = base_entries.get(name)
        new = current_entries.get(name)
        native_comparison.append({'entry': name, 'baseline': old, 'c15t': new,
                                  'sameHash': old is not None and new is not None and old['sha256'] == new['sha256']})
    dex_estimate_growth = results['c15t']['apkanalyzerEstimate']['estimatedDexBytes'] - baseline['apkanalyzerEstimate']['estimatedDexBytes']
    compose_estimate = all_packages['c15t']['androidx.compose']['estimatedDexBytes']
    c15t = results['c15t']
    result = {
        'schemaVersion': 1,
        'producer': {'gitHead': '256e903bfa542c15126e017c10fdfea70f421521',
                     'rnVersion': '3.0.0-alpha.2', 'androidMavenVersion': '3.0.0-alpha.1',
                     'rnTarballSha256': '4d92e2c3377cf2059a905335c62c037de9a0cc9a46df42d474a3c5b2dc7a65bd',
                     'nativeCoreJarSha256': 'f9fbf86009959e3c9c4dfdf8d7c2432f494dc96b5ccda768e42ae3fbde0e5efb'},
        'profile': {'stockIntegrationUnchanged': True, 'abi': 'arm64-v8a', 'minSdk': 24,
                    'compileAndTargetSdk': 36, 'gradle': '9.3.1', 'agp': '8.12.0',
                    'r8': '8.12.14', 'resourceShrinking': True,
                    'hostR8OptimizationDisabled': all(row['r8OptimizationDisabledByHost'] for row in results.values())},
        'method': {
            'directApkBytes': 'Signed file length. Group compressed-byte deltas plus ZIP/signing overhead delta exactly equal addedApkBytes.',
            'packageEstimates': 'APK Analyzer defined-only estimates after deobfuscating actual APK DEX with its R8 map. They exclude some shared DEX structures. Nested packages overlap their parent. They are not compressed APK contributions.',
            'instructions': 'Exact code_item instruction lengths from final APK DEX, grouped by original R8 class family. Excludes metadata, headers, shared pools and compression.',
            'removedClasses': 'Fully removed original classes from usage.txt. A retained class can still have removed members.',
            'dependencyReplacement': 'Normal Gradle selection. Matching baseline coordinates have matching artifact hashes. An artifact dependency does not imply all its classes ship.',
            'diagnostics': 'No counterfactual APK size build. Static final-DEX retention settles the main cause. No claimed byte saving from deleting or replacing a library.',
        },
        'variants': results,
        'findings': {
            'c15tAddedSignedApkBytes': c15t['addedApkBytes'],
            'c15tCompressedDexGrowthBytes': c15t['groupDeltasFromBaseline']['dex']['compressedBytes'],
            'compressedDexShareOfAddedApk': c15t['groupDeltasFromBaseline']['dex']['compressedBytes'] / c15t['addedApkBytes'],
            'c15tEstimatedDexGrowthBytes': dex_estimate_growth,
            'composeEstimatedDexBytes': compose_estimate,
            'composeShareOfEstimatedDexGrowth': compose_estimate / dex_estimate_growth,
            'exactInstructionByteGrowth': retentions['c15t']['totalInstructionBytes'] - retentions['baseline']['totalInstructionBytes'],
            'composeExactInstructionBytes': retentions['c15t']['families']['compose']['instructionBytes'],
            'mainCause': 'The stock presenter retains Compose UI, text, foundation, runtime, Material 3 and animation in a host with no Compose baseline. The RN bridge always depends on the presenter and retains its methods; the presenter Activity is a manifest root.',
            'compressedClassAttribution': 'Unmeasured. R8 changes reachability and DEX layout and APK compression operates on entire DEX entries.',
            'sdkSourceChanged': False, 'nativeApkBuilds': 0, 'runtimeSamples': 0,
        },
        'retainedC15tDexDestinations': {
            group: retentions['c15t']['families'][group]['uniqueMappedDexDestinations']
            for group in ['c15t-core', 'c15t-presenter', 'c15t-android', 'c15t-rn-bridge', 'compose']
        },
        'c15tSignedApkDifferenceFromVendorBytes': {
            name: c15t['addedApkBytes'] - results[name]['addedApkBytes']
            for name in VENDORS if name not in ['baseline', 'c15t']
        },
        'hypotheses': [
            {'hypothesis': 'Added native binary payload is the main cost',
             'outcome': 'refuted', 'evidence': 'Only 35,672 added native-library bytes; 1,655,577 added compressed DEX bytes.'},
            {'hypothesis': 'c15t duplicates Kotlin reflection or its HTTP stack',
             'outcome': 'refuted', 'evidence': 'Identical baseline artifact hashes; Kotlin reflection estimate grows by only 972 bytes and OkHttp estimate falls by 1,743.'},
            {'hypothesis': 'An SDK keep-all rule prevents Compose shrinking',
             'outcome': 'refuted', 'evidence': 'No c15t keep-all rule. usage.txt lists 4,154 fully removed Compose original classes. Native UI and RN API roots retain remaining code.'},
            {'hypothesis': 'Serialization is the main cause of the competitive gap',
             'outcome': 'secondary', 'evidence': 'Serialization is 134,335 estimated DEX bytes; Compose is 2,425,795. These are uncompressed estimates.'},
            {'hypothesis': 'A lower Compose pin would reproduce Didomi retention',
             'outcome': 'unmeasured', 'evidence': 'Vendor pins were not changed. Versions and reachable UI differ together.'},
        ],
        'recommendedNextWork': [
            {'priority': 1, 'change': 'Measure a separate matched optimizing-R8 host profile for every SDK using proguard-android-optimize.txt.',
             'measuredSavingBytes': None, 'risk': 'Revalidate native UI, RN reflection, serialization and startup. Keep existing results as their own profile.'},
            {'priority': 2, 'change': 'Investigate presenter Compose UI/foundation/text retention while preserving the full stock behavior.',
             'measuredSavingBytes': None, 'risk': 'No safe production packaging fix was proved. Removing imports does not remove reachable transitive UI code.'},
            {'priority': 3, 'change': 'Consider a separate RN headless entry and optional presenter module for applications supplying custom UI.',
             'measuredSavingBytes': None, 'risk': 'Different integration and compatibility work. Must not replace the full-stock benchmark or be described as feature equivalent.'},
        ],
    }
    if (output / 'graph-paths.json').exists():
        result['dependencyGraphChecks'] = json.loads((output / 'graph-paths.json').read_text())['checks']
    write(output / 'results.json', result)
    write(output / 'dependency-resolution.json', dependencies)
    write(output / 'r8-retention.json', retentions)
    write(output / 'zip-deltas.json', {'entries': changed, 'nativeLibraries': native_comparison})
    write(output / 'input-hashes.json', index)
    disjoint = [
        'androidx.compose', 'com.c15t.core', 'com.c15t.consentui', 'com.c15t.android',
        'com.c15t.reactnative', 'kotlinx.serialization', 'kotlinx.coroutines', 'kotlin',
        'androidx.activity', 'androidx.lifecycle', 'androidx.savedstate',
        'androidx.collection', 'androidx.emoji2', 'androidx.profileinstaller', 'androidx.graphics',
    ]
    deltas = []
    for package in disjoint:
        old = all_packages['baseline'].get(package, {}).get('estimatedDexBytes', 0)
        new = all_packages['c15t'].get(package, {}).get('estimatedDexBytes', 0)
        deltas.append({'package': package, 'baselineEstimatedDexBytes': old,
                       'c15tEstimatedDexBytes': new, 'deltaEstimatedDexBytes': new - old})
    deltas.append({'package': 'all-other-original-packages',
                   'deltaEstimatedDexBytes': dex_estimate_growth - sum(row['deltaEstimatedDexBytes'] for row in deltas)})
    check(sum(row['deltaEstimatedDexBytes'] for row in deltas) == dex_estimate_growth, 'estimated DEX categories do not sum to growth')
    write(output / 'dex-estimate-deltas.json', {
        'unit': 'APK Analyzer estimated DEX bytes, not compressed APK bytes',
        'categoriesDisjoint': True, 'growthEstimatedDexBytes': dex_estimate_growth,
        'baselineEstimatedDexBytes': baseline['apkanalyzerEstimate']['estimatedDexBytes'],
        'c15tEstimatedDexBytes': c15t['apkanalyzerEstimate']['estimatedDexBytes'],
        'categories': deltas,
    })
    print(json.dumps(result['findings'], indent=2))


if __name__ == '__main__':
    main()
