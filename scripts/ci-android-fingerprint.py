#!/usr/bin/env python3
"""Fingerprint what each Android emulator suite depends on, so CI can skip a
suite whose inputs have not changed since it last passed.

  ci-android-fingerprint.py                 # print native=<hash> and apps=<hash>
  ci-android-fingerprint.py --check WORKFLOW

A fingerprint hashes git's object ids for the suite's input paths at HEAD, so it
changes exactly when one of those files does. Listing too much only costs a rerun;
listing too little lets a stale pass hide a regression, so when in doubt, add the
path. --check fails if the workflow's pull_request path filter misses any input,
because a PR that changes only that path would then never run the suite.
"""
from __future__ import annotations

import hashlib
import re
import subprocess
import sys
from pathlib import Path

# CI itself: changing how a suite runs must run it again.
COMMON = [
    '.github/workflows/android-emulator.yml',
    'scripts/ci-android-emulator.sh',
    'scripts/ci-android-fingerprint.py',
    'scripts/ci-android-instrument.py',
    'scripts/ci-android-toolchain.sh',
]

SUITES = {
    # The kernel suite and the native consent demo, built by packages/android.
    'native': [
        'packages/android',
        'packages/native-protocol',
        'examples/native',
        'scripts/vendor_capture.py',
    ],
    # The release RN journey and the Expo cells. @inth/sdk is assembled from the
    # other packages/sdk packages, and the policy export reaches into the CLI's
    # vendored mobile exporter, so both are listed whole.
    'apps': [
        'packages/sdk',
        'packages/react-native',
        'packages/android',
        'packages/native-protocol',
        'packages/cli/vendor/c15t-mobile',
        'packages/cli/src/native/mobile',
        'internals/fixtures/react-native-bare',
        'internals/fixtures/expo-dev',
        'internals/typescript-config',
        'internals/vitest-config',
        'scripts/export-mobile-e2e-policy.ts',
        'scripts/export-mobile-policy.ts',
        'scripts/mobile-compatibility.json',
        'scripts/vendor_capture.py',
        '.github/actions/setup-sdk',
        'package.json',
        'patches',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'turbo.json',
    ],
}


def object_id(path: str) -> str:
    result = subprocess.run(['git', 'rev-parse', f'HEAD:{path}'], capture_output=True, text=True, check=False)
    return result.stdout.strip() if result.returncode == 0 else 'absent'


def fingerprint(paths: list[str]) -> str:
    digest = hashlib.sha256()
    for path in sorted(set(paths + COMMON)):
        digest.update(f'{path} {object_id(path)}\n'.encode())
    return digest.hexdigest()


def pull_request_paths(workflow: Path) -> list[str]:
    """The pull_request paths filter, read without a YAML parser."""
    block = re.search(r'^  pull_request:\n(?:    #.*\n)*    paths:\n((?:      - .*\n|      #.*\n|[ \t]*\n)+)',
                      workflow.read_text(), re.MULTILINE)
    if not block:
        raise SystemExit(f'No pull_request paths filter in {workflow}')
    return [line.split('- ', 1)[1].strip().strip('"\'') for line in block[1].splitlines() if line.strip().startswith('- ')]


def covered(path: str, filters: list[str]) -> bool:
    for pattern in filters:
        if pattern in (path, f'{path}/**'):
            return True
        if pattern.endswith('/**') and f'{path}/'.startswith(pattern[:-2]):
            return True
    return False


def main() -> None:
    if len(sys.argv) == 3 and sys.argv[1] == '--check':
        filters = pull_request_paths(Path(sys.argv[2]))
        missing = sorted({path for paths in SUITES.values() for path in paths + COMMON if not covered(path, filters)})
        if missing:
            raise SystemExit('The pull_request paths filter misses suite inputs: ' + ', '.join(missing))
        print('The pull_request paths filter covers every suite input.')
        return
    for suite, paths in SUITES.items():
        print(f'{suite}={fingerprint(paths)}')


if __name__ == '__main__':
    main()
