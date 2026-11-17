#!/usr/bin/env python3
"""Verify frozen producer/input hashes, final APK arithmetic and report tables."""
import argparse
import json
import os
from pathlib import Path
import subprocess

from analyze import check, sha, write


def verify_report_tables(report, variants, estimates):
    tables = []
    current = []
    for line in report.splitlines():
        if line.startswith('|'):
            current.append([part.strip().replace('**', '') for part in line.strip('|').split('|')])
        elif current:
            tables.append(current)
            current = []
    if current:
        tables.append(current)
    check(len(tables) == 2, 'expected two numeric report tables')
    c15t = variants['c15t']
    labels = {'DEX': 'dex', 'Hermes bundle': 'hermesBundle', 'Android resources': 'resources',
              'Native libraries': 'nativeLibraries', 'Other payload': 'other',
              'Bundled policy': 'c15tPolicy', 'Manifest': 'manifest'}
    expected_apk = {label: c15t['groupDeltasFromBaseline'][group]['compressedBytes'] for label, group in labels.items()}
    expected_apk['ZIP structure, alignment and signing overhead'] = c15t['zipAndSigningOverheadDelta']
    expected_apk['Signed APK total'] = c15t['addedApkBytes']
    actual_apk = {row[0]: int(row[1].replace(',', '')) for row in tables[0][2:]}
    check(len(tables[0][2:]) == len(actual_apk) and actual_apk == expected_apk, 'APK report rows differ from measured groups')
    check(sum(value for label, value in actual_apk.items() if label != 'Signed APK total') == actual_apk['Signed APK total'], 'APK report rows do not sum to the total')

    categories = {row['package']: row for row in estimates['categories']}
    labels = {'Compose': 'androidx.compose', 'c15t core': 'com.c15t.core', 'c15t presenter': 'com.c15t.consentui',
              'Kotlin serialization': 'kotlinx.serialization', 'Coroutines': 'kotlinx.coroutines',
              'AndroidX Collection': 'androidx.collection', 'Kotlin': 'kotlin',
              'c15t Android wiring': 'com.c15t.android', 'c15t RN bridge': 'com.c15t.reactnative'}
    columns = ('baselineEstimatedDexBytes', 'c15tEstimatedDexBytes', 'deltaEstimatedDexBytes')
    expected_dex = {label: [categories[package][column] for column in columns] for label, package in labels.items()}
    totals = [estimates['baselineEstimatedDexBytes'], estimates['c15tEstimatedDexBytes'], estimates['growthEstimatedDexBytes']]
    expected_dex['Other original packages'] = [total - sum(row[index] for row in expected_dex.values()) for index, total in enumerate(totals)]
    expected_dex['Total estimate'] = totals
    actual_dex = {row[0]: [int(value.replace(',', '')) for value in row[1:]] for row in tables[1][2:]}
    check(len(tables[1][2:]) == len(actual_dex) and actual_dex == expected_dex, 'DEX report rows differ from measured estimates')
    check(all(old + delta == new for old, new, delta in actual_dex.values()), 'DEX report row arithmetic differs')
    check([sum(row[column] for label, row in actual_dex.items() if label != 'Total estimate') for column in range(3)] == totals, 'DEX report rows do not sum to the totals')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--acceptance', type=Path, required=True)
    parser.add_argument('--producer', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    inputs = args.acceptance.resolve() / 'inputs'
    output = args.out.resolve()
    source_manifest = json.loads((inputs / 'source-inputs.json').read_text())
    check(source_manifest['head'] == '256e903bfa542c15126e017c10fdfea70f421521', 'source manifest is not the frozen producer')
    env = dict(os.environ, GIT_OPTIONAL_LOCKS='0')
    head = subprocess.check_output(['git', '-C', str(args.producer), 'rev-parse', 'HEAD'], text=True, env=env).strip()
    status = subprocess.check_output(['git', '-C', str(args.producer), 'status', '--porcelain'], text=True, env=env)
    check(head == source_manifest['head'], 'producer HEAD differs from the source manifest')
    check(not status, 'producer checkout is not clean')
    check(len(source_manifest['files']) == 1814, 'expected 1,814 producer source files')
    for row in source_manifest['files']:
        path = args.producer / row['path']
        check(path.stat().st_size == row['size'] and sha(path) == row['sha256'], 'producer source changed: ' + row['path'])
    maven_manifest = json.loads((inputs / 'maven-manifest.json').read_text())
    check(len(maven_manifest) == 90, 'expected 90 frozen Maven records')
    check(sum(path.is_file() for path in (inputs / 'maven-staging').rglob('*')) == 90, 'expected 90 Maven files')
    for row in maven_manifest:
        path = inputs / 'maven-staging' / row['path']
        check(path.stat().st_size == row['size'] and sha(path) == row['sha256'], 'Maven input changed: ' + row['path'])
    archives = list(inputs.glob('c15t-react-native-*.tgz'))
    check(len(archives) == 1, 'expected one RN archive')
    check(sha(archives[0]) == '4d92e2c3377cf2059a905335c62c037de9a0cc9a46df42d474a3c5b2dc7a65bd', 'RN archive differs from the frozen input')
    for row in json.loads((output / 'input-hashes.json').read_text()):
        path = args.evidence / row['input']
        check(sha(path) == row['sha256'] and path.stat().st_size == row['bytes'], 'evidence input changed: ' + row['input'])
    results = json.loads((output / 'results.json').read_text())
    graph_checks = json.loads((output / 'graph-paths.json').read_text())['checks']
    check(results['dependencyGraphChecks'] == graph_checks, 'dependency graph checks differ')
    check(all(row['everyArtifactCoordinateAndHashMatchesFrozenMeasuredInputs'] for row in graph_checks.values()), 'dependency graph does not match frozen inputs')
    variants = results['variants']
    check({name: value['apkBytes'] for name, value in variants.items()} == {
        'baseline': 20779838, 'c15t': 22757384, 'onetrust': 21803892,
        'didomi': 25428214, 'usercentrics': 21830808, 'sourcepoint': 21778262,
    }, 'APK totals differ from frozen measurements')
    for name, value in variants.items():
        check(sum(row['compressedBytes'] for row in value['groupDeltasFromBaseline'].values()) + value['zipAndSigningOverheadDelta'] == value['addedApkBytes'], 'APK group arithmetic differs: ' + name)
    retention = json.loads((output / 'r8-retention.json').read_text())
    for name, value in retention.items():
        check(sum(row.get('instructionBytes', 0) for row in value['families'].values()) == value['totalInstructionBytes'], 'DEX instruction sums differ: ' + name)
        check(not value['mixedOriginDestinations'], 'DEX origins overlap: ' + name)
    rows = json.loads((output / 'dex-estimate-deltas.json').read_text())
    check(sum(row['deltaEstimatedDexBytes'] for row in rows['categories']) == rows['growthEstimatedDexBytes'], 'DEX category deltas do not sum to growth')
    verify_report_tables((output / 'report.md').read_text(), variants, rows)
    write(output / 'verification.json', {
        'passed': True, 'producerHead': head, 'producerGitClean': True,
        'producerSourceFilesVerified': len(source_manifest['files']),
        'frozenMavenFilesVerified': len(maven_manifest),
        'rnArchiveSha256Verified': sha(archives[0]),
        'sourceManifestSha256': sha(inputs / 'source-inputs.json'),
        'mavenManifestSha256': sha(inputs / 'maven-manifest.json'),
        'apksVerified': len(variants), 'inputHashesRechecked': len(json.loads((output / 'input-hashes.json').read_text())),
        'sizeGroupSums': True, 'disjointInstructionSums': True, 'markdownTableSums': True,
        'markdownRowsMatchMeasuredOutputs': True, 'resolvedGraphArtifactHashEquality': True,
        'counterfactualSizeBuilds': 0, 'runtimeSampling': False,
    })
    print('Verified 1,814 producer source files, 90 Maven files, RN archive, six APKs, DEX instruction sums and both report tables.')


if __name__ == '__main__':
    main()
