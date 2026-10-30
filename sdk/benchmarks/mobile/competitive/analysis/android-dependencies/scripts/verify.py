#!/usr/bin/env python3
"""Verify frozen producer/input hashes, final APK arithmetic and report tables."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

from analyze import sha, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence', type=Path, required=True)
parser.add_argument('--acceptance', type=Path, required=True)
parser.add_argument('--producer', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
inputs = args.acceptance.resolve() / 'inputs'
output = args.out.resolve()
source_manifest = json.loads((inputs / 'source-inputs.json').read_text())
assert source_manifest['head'] == '256e903bfa542c15126e017c10fdfea70f421521'
env = dict(os.environ, GIT_OPTIONAL_LOCKS='0')
head = subprocess.check_output(['git', '-C', str(args.producer), 'rev-parse', 'HEAD'], text=True, env=env).strip()
status = subprocess.check_output(['git', '-C', str(args.producer), 'status', '--porcelain'], text=True, env=env)
assert head == source_manifest['head'] and not status
assert len(source_manifest['files']) == 1814
for row in source_manifest['files']:
    path = args.producer / row['path']
    assert path.stat().st_size == row['size'] and sha(path) == row['sha256'], row['path']
maven_manifest = json.loads((inputs / 'maven-manifest.json').read_text())
assert len(maven_manifest) == 90
assert sum(path.is_file() for path in (inputs / 'maven-staging').rglob('*')) == 90
for row in maven_manifest:
    path = inputs / 'maven-staging' / row['path']
    assert path.stat().st_size == row['size'] and sha(path) == row['sha256'], row['path']
archives = list(inputs.glob('c15t-react-native-*.tgz'))
assert len(archives) == 1
assert sha(archives[0]) == '4d92e2c3377cf2059a905335c62c037de9a0cc9a46df42d474a3c5b2dc7a65bd'
for row in json.loads((output / 'input-hashes.json').read_text()):
    path = args.evidence / row['input']
    assert sha(path) == row['sha256'] and path.stat().st_size == row['bytes'], row['input']
results = json.loads((output / 'results.json').read_text())
graph_checks = json.loads((output / 'graph-paths.json').read_text())['checks']
assert results['dependencyGraphChecks'] == graph_checks
assert all(row['everyArtifactCoordinateAndHashMatchesFrozenMeasuredInputs'] for row in graph_checks.values())
variants = results['variants']
assert {name: value['apkBytes'] for name, value in variants.items()} == {
    'baseline': 20779838, 'c15t': 22757384, 'onetrust': 21803892,
    'didomi': 25428214, 'usercentrics': 21830808, 'sourcepoint': 21778262,
}
for value in variants.values():
    assert sum(row['compressedBytes'] for row in value['groupDeltasFromBaseline'].values()) + value['zipAndSigningOverheadDelta'] == value['addedApkBytes']
retention = json.loads((output / 'r8-retention.json').read_text())
for value in retention.values():
    assert sum(row.get('instructionBytes', 0) for row in value['families'].values()) == value['totalInstructionBytes']
    assert not value['mixedOriginDestinations']
rows = json.loads((output / 'dex-estimate-deltas.json').read_text())
assert sum(row['deltaEstimatedDexBytes'] for row in rows['categories']) == rows['growthEstimatedDexBytes']

# Check the two numeric Markdown tables against the machine-readable outputs.
tables = []
current = []
for line in (output / 'report.md').read_text().splitlines():
    if line.startswith('|'):
        current.append([part.strip().replace('**', '') for part in line.strip('|').split('|')])
    elif current:
        tables.append(current)
        current = []
if current:
    tables.append(current)
assert len(tables) == 2
apk_values = [int(row[1].replace(',', '')) for row in tables[0][2:]]
assert sum(apk_values[:-1]) == apk_values[-1] == variants['c15t']['addedApkBytes']
estimate_values = [[int(value.replace(',', '')) for value in row[1:]] for row in tables[1][2:]]
assert all(old + delta == new for old, new, delta in estimate_values)
assert [sum(row[column] for row in estimate_values[:-1]) for column in range(3)] == estimate_values[-1]
assert estimate_values[-1] == [5275213, 8503513, 3228300]
write(output / 'verification.json', {
    'passed': True, 'producerHead': head, 'producerGitClean': True,
    'producerSourceFilesVerified': len(source_manifest['files']),
    'frozenMavenFilesVerified': len(maven_manifest),
    'rnArchiveSha256Verified': sha(archives[0]),
    'sourceManifestSha256': sha(inputs / 'source-inputs.json'),
    'mavenManifestSha256': sha(inputs / 'maven-manifest.json'),
    'apksVerified': len(variants), 'inputHashesRechecked': len(json.loads((output / 'input-hashes.json').read_text())),
    'sizeGroupSums': True, 'disjointInstructionSums': True, 'markdownTableSums': True,
    'resolvedGraphArtifactHashEquality': True,
    'counterfactualSizeBuilds': 0, 'runtimeSampling': False,
})
print('Verified 1,814 producer source files, 90 Maven files, RN archive, six APKs, DEX instruction sums and both report tables.')
