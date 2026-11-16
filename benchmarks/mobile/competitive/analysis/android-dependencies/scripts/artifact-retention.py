#!/usr/bin/env python3
"""Join final R8/APK Analyzer retention to frozen binary class inventories.

Class and package estimates here describe uncompressed DEX. Synthetic ownership
is kept separate. These numbers do not predict compressed savings after a change.
"""
import argparse
from collections import defaultdict
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile

from analyze import check, analyzer_packages, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence', required=True, type=Path)
parser.add_argument('--out', required=True, type=Path)
args = parser.parse_args()
android = args.evidence.resolve() / 'android'
output = args.out.resolve()
rows = json.loads((android / 'c15t-resolved-artifacts.json').read_text())
inventory = defaultdict(set)
owners = defaultdict(set)
artifact_hashes = defaultdict(set)
seen = set()
for row in rows:
    identity = (row['coordinate'], row['sha256'])
    if identity in seen:
        continue
    seen.add(identity)
    frozen = android / 'inputs/native' / (row['sha256'] + '-' + Path(row['file']).name)
    check(hashlib.sha256(frozen.read_bytes()).hexdigest() == row['sha256'], 'frozen native artifact hash differs')
    artifact_hashes[row['coordinate']].add(row['sha256'])
    with zipfile.ZipFile(frozen) as archive:
        if frozen.name.endswith('.aar'):
            jars = [name for name in archive.namelist() if name == 'classes.jar' or name.startswith('libs/') and name.endswith('.jar')]
            for name in jars:
                with zipfile.ZipFile(io.BytesIO(archive.read(name))) as jar:
                    inventory[row['coordinate']].update(name[:-6].replace('/', '.') for name in jar.namelist() if name.endswith('.class'))
        else:
            inventory[row['coordinate']].update(name[:-6].replace('/', '.') for name in archive.namelist() if name.endswith('.class'))
    for name in inventory[row['coordinate']]:
        owners[name].add(row['coordinate'])

mapping = dict(re.findall(r'^([^ #\s]+) -> ([^\s]+):$', (android / 'c15t-artifacts/r8/mapping.txt').read_text(), re.M))
defined = set(json.loads((android / 'c15t-analysis/dex-class-descriptors.json').read_text()))
_, classes = analyzer_packages(output / 'raw/c15t-dex-packages.tsv')
result = {}
unattributed = []
for coordinate in inventory:
    result[coordinate] = {
        'coordinate': coordinate, 'artifactSha256': sorted(artifact_hashes[coordinate]),
        'inputClassCount': len(inventory[coordinate]),
        'retainedMappedInputClasses': 0, 'generatedOriginalClassesByOwnerHeuristic': 0,
        'estimatedDexBytesDirectClassInventory': 0,
        'estimatedDexBytesGeneratedOwnerHeuristic': 0,
    }
for name, data in classes.items():
    destination = mapping.get(name, name)
    check('L' + destination.replace('.', '/') + ';' in defined, name)
    possible = owners.get(name, set())
    heuristic = False
    if not possible and '$$' in name:
        possible = owners.get(name.split('$$', 1)[0], set())
        heuristic = bool(possible)
    if len(possible) == 1:
        coordinate = next(iter(possible))
        result[coordinate]['generatedOriginalClassesByOwnerHeuristic' if heuristic else 'retainedMappedInputClasses'] += 1
        result[coordinate]['estimatedDexBytesGeneratedOwnerHeuristic' if heuristic else 'estimatedDexBytesDirectClassInventory'] += data['estimatedDexBytes']
    else:
        unattributed.append({'class': name, 'estimatedDexBytes': data['estimatedDexBytes'],
                             'ambiguousArtifactOwners': sorted(possible)})
artifacts = sorted(result.values(), key=lambda row: row['estimatedDexBytesDirectClassInventory'] + row['estimatedDexBytesGeneratedOwnerHeuristic'], reverse=True)
for row in artifacts:
    row['combinedEstimatedDexBytes'] = row['estimatedDexBytesDirectClassInventory'] + row['estimatedDexBytesGeneratedOwnerHeuristic']
total = sum(row['combinedEstimatedDexBytes'] for row in artifacts) + sum(row['estimatedDexBytes'] for row in unattributed)
class_sum = sum(data['estimatedDexBytes'] for data in classes.values())
check(total == class_sum, 'instruction ownership total differs from class sum')
write(output / 'artifact-retention.json', {
    'unit': 'APK Analyzer uncompressed estimated DEX bytes. Direct class membership and heuristic synthetic ownership are separate. No compressed APK savings are claimed.',
    'artifacts': artifacts, 'unattributedClasses': unattributed,
    'estimatedClassByteSum': class_sum,
    'note': 'Input artifact hashes verified against frozen native files. Project classes, generated resource classes and some compiler synthetics have no external artifact owner.',
})
print(json.dumps(artifacts[:22], indent=2))
