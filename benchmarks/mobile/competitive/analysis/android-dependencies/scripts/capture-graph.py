#!/usr/bin/env python3
"""Resolve a copied host. Invoke through the study's shared native lock."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--attempt', default='first')
parser.add_argument('--resume-owned-copy', action='store_true')
parser.add_argument('vendors', nargs='+')
args = parser.parse_args()
args.out = args.out.resolve()
if not os.environ.get('ANDROID_HOME'):
    raise SystemExit('Set ANDROID_HOME to the matched Android SDK before resolving the copied host.')
script = Path(__file__).resolve().parent / 'dependency-graph.gradle'
for name in args.vendors:
    source = args.evidence.resolve() / 'android' / f'{name}-host'
    host = args.out / 'consumers' / f'{name}-host'
    if host.exists() and not args.resume_owned_copy:
        raise SystemExit(f'Use a fresh output directory: {host}')
    host.parent.mkdir(parents=True, exist_ok=True)
    if not host.exists():
        shutil.copytree(source, host, symlinks=True,
                        ignore=shutil.ignore_patterns('node_modules', 'build', '.gradle', '.cxx'))
    # Each copy owns its node_modules, including Gradle plugin output directories.
    # No symlink points into the measured evidence or the producer checkout.
    if not (host / 'node_modules').exists():
        if os.uname().sysname == 'Darwin':
            subprocess.run(['cp', '-cR', str(source / 'node_modules'), str(host / 'node_modules')], check=True)
        else:
            shutil.copytree(source / 'node_modules', host / 'node_modules', symlinks=True)
    env = dict(os.environ, CMP_GRAPH_OUT=str(args.out / 'graphs' / f'{name}.json'),
               C15T_LOCAL_PODS='false', EXPO_PUBLIC_C15T_FAKE_NATIVE='false')
    if 'JAVA_HOME' not in env:
        env['JAVA_HOME'] = subprocess.check_output(['/usr/libexec/java_home', '-v17'], text=True).strip()
    command = ['sh', 'android/gradlew', '-p', 'android', '--no-daemon', '--max-workers=3',
               '-PreactNativeArchitectures=arm64-v8a',
               '-Pandroid.enableMinifyInReleaseBuilds=true',
               '-Pandroid.enableShrinkResourcesInReleaseBuilds=true',
               ':app:cmpDependencyGraph', '-I', str(script), '--console=plain']
    logs = args.out / 'raw'
    logs.mkdir(exist_ok=True)
    log_file = logs / f'{name}-dependency-graph-{args.attempt}.log'
    if log_file.exists():
        raise SystemExit(f'Preserve the earlier attempt: {log_file}')
    with log_file.open('w') as output:
        completed = subprocess.run(command, cwd=host, env=env, stdout=output, stderr=subprocess.STDOUT)
    (logs / f'{name}-dependency-graph-{args.attempt}-command.json').write_text(json.dumps({
        'command': ['sh', 'android/gradlew', *command[2:]],
        'exitCode': completed.returncode,
        'note': 'Paths in local command logs are execution provenance, not portable report inputs.',
    }, indent=2) + '\n')
    completed.check_returncode()
    print(f'Captured {name} releaseRuntimeClasspath graph', flush=True)
