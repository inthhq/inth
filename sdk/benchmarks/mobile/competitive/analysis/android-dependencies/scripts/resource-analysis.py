#!/usr/bin/env python3
"""Compare final resource names/configurations and their frozen AAR definitions."""
import argparse
from collections import Counter, defaultdict
import json
import os
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile

from analyze import sha, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence', required=True, type=Path)
parser.add_argument('--out', required=True, type=Path)
parser.add_argument('--refresh', action='store_true')
parser.add_argument('--aapt2', type=Path)
args = parser.parse_args()
android = args.evidence.resolve() / 'android'
output = args.out.resolve()
names = {}
for vendor in ['baseline', 'c15t']:
    target = output / 'raw' / f'{vendor}-resources.txt'
    if args.refresh:
        aapt2 = args.aapt2 or Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0/aapt2'
        with target.open('w') as stdout:
            subprocess.run([str(aapt2), 'dump', 'resources', str(android / f'{vendor}-artifacts/app-release.apk')], stdout=stdout, check=True)
    resources = {}
    current = None
    for line in target.read_text().splitlines():
        match = re.match(r'\s+resource 0x[0-9a-f]+ ([^ ]+)', line)
        if match:
            current = match[1]
            assert current not in resources, ('Duplicate resource name', current)
            resources[current] = []
        elif current and re.match(r'\s+\([^)]*\)', line):
            resources[current].append(line.strip())
    names[vendor] = resources

owners = defaultdict(set)
seen = set()
for row in json.loads((android / 'c15t-resolved-artifacts.json').read_text()):
    if not row['file'].endswith('.aar') or row['sha256'] in seen:
        continue
    seen.add(row['sha256'])
    frozen = android / 'inputs/native' / (row['sha256'] + '-' + Path(row['file']).name)
    assert sha(frozen) == row['sha256']
    with zipfile.ZipFile(frozen) as archive:
        for name in archive.namelist():
            if not re.match(r'res/values[^/]*/[^/]+\.xml$', name):
                continue
            for element in ET.fromstring(archive.read(name)):
                if 'name' in element.attrib:
                    kind = element.attrib.get('type', element.tag)
                    owners[kind + '/' + element.attrib['name']].add(row['coordinate'])

base, current = names['baseline'], names['c15t']
added = sorted(current.keys() - base.keys())
removed = sorted(base.keys() - current.keys())
assert not removed
write(output / 'resource-analysis.json', {
    'method': 'Names and configuration rows in final aapt2 resource-table dumps. Origin is a matching definition in frozen AAR values XML, not a compressed byte attribution.',
    'baselineResourceNames': len(base), 'c15tResourceNames': len(current),
    'addedNamesByType': dict(Counter(name.split('/')[0] for name in added)),
    'baselineConfigurationRows': sum(map(len, base.values())),
    'c15tConfigurationRows': sum(map(len, current.values())),
    'added': [{'resource': name, 'configurationRows': len(current[name]),
               'definingFrozenCoordinates': sorted(owners[name])} for name in added],
    'removed': removed,
    'unchangedSharedConfigurationCounts': all(len(base[name]) == len(current[name]) for name in base),
})
print(json.dumps({'addedNames': len(added), 'types': dict(Counter(name.split('/')[0] for name in added))}))
