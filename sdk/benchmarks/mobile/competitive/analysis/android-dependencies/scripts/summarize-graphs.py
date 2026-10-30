#!/usr/bin/env python3
"""Check copied resolution against measured artifact hashes and show causal paths."""
import argparse
from collections import deque
import json
from pathlib import Path

from analyze import write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence', required=True, type=Path)
parser.add_argument('--out', required=True, type=Path)
args = parser.parse_args()
android = args.evidence.resolve() / 'android'
output = args.out.resolve()
graphs = {}
checks = {}
for name in ['baseline', 'c15t']:
    graph = json.loads((output / 'graphs' / f'{name}.json').read_text())
    recorded = json.loads((android / f'{name}-resolved-artifacts.json').read_text())
    old = sorted((row['coordinate'], row['sha256']) for row in recorded)
    current = sorted((row['coordinate'], row['sha256']) for row in graph['artifacts'])
    assert old == current, (name, 'Resolved artifact identity differs from measured APK inputs', set(old) ^ set(current))
    graphs[name] = graph
    checks[name] = {'resolvedArtifactRows': len(current), 'everyArtifactCoordinateAndHashMatchesFrozenMeasuredInputs': True,
                    'components': len(graph['components']), 'gradleVersion': graph['gradleVersion']}


def path(graph, start, target):
    nodes = {row['id']: row for row in graph['components']}
    queue = deque([(start, [start])])
    seen = {start}
    while queue:
        node, visited = queue.popleft()
        if node == target:
            return visited
        for edge in nodes[node]['dependencies']:
            if not edge['constraint'] and edge['selected'] not in seen:
                seen.add(edge['selected'])
                queue.append((edge['selected'], [*visited, edge['selected']]))
    raise ValueError((start, target))


c15t = graphs['c15t']
bridge = next(row['id'] for row in c15t['components'] if row['id'].endswith(':c15t_react-native'))
targets = [
    'com.c15t:c15t-core:3.0.0-alpha.1',
    'com.c15t:c15t-android:3.0.0-alpha.1',
    'com.c15t:c15t-consent-ui:3.0.0-alpha.1',
    'org.jetbrains.kotlinx:kotlinx-serialization-json-jvm:1.8.1',
    'androidx.compose.material3:material3-android:1.3.2',
    'androidx.compose.foundation:foundation-android:1.9.0',
    'androidx.compose.ui:ui-android:1.9.0',
    'androidx.compose.runtime:runtime-android:1.9.0',
    'androidx.graphics:graphics-path:1.0.1',
    'androidx.lifecycle:lifecycle-process:2.10.0',
    'androidx.lifecycle:lifecycle-viewmodel-compose-android:2.10.0',
    'androidx.activity:activity-compose:1.11.0',
    'androidx.collection:collection-jvm:1.5.0',
]
paths = {target: path(c15t, bridge, target) for target in targets}
nodes = {row['id']: row for row in c15t['components']}
write(output / 'graph-paths.json', {
    'checks': checks, 'bridgeRoot': bridge, 'shortestNonConstraintPathsFromBridge': paths,
    'selectionReasons': {target: nodes[target]['selectionReasons'] for target in targets},
    'note': 'Fresh copied-host resolution is evidence only after exact coordinate and hash equality with frozen measured artifact rows. Both captures hold the shared native lock. No APK was built.',
})
results = json.loads((output / 'results.json').read_text())
results['dependencyGraphChecks'] = checks
write(output / 'results.json', results)
print(json.dumps({'checks': checks, 'paths': paths}, indent=2))
