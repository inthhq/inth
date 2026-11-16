#!/usr/bin/env python3
"""Record Android analysis tool identity without embedding the SDK directory."""
import argparse
import hashlib
import os
from pathlib import Path

from analyze import write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--android-home', type=Path, default=os.environ.get('ANDROID_HOME'))
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
if args.android_home is None:
    raise SystemExit('Set ANDROID_HOME or pass --android-home.')
sdk = args.android_home
paths = {
    'apkanalyzer-launcher': sdk / 'cmdline-tools/latest/bin/apkanalyzer',
    'apkanalyzer-classpath.jar': sdk / 'cmdline-tools/latest/lib/apkanalyzer-classpath.jar',
    'aapt2': sdk / 'build-tools/36.0.0/aapt2',
    'command-line-tools-source.properties': sdk / 'cmdline-tools/latest/source.properties',
}
properties = dict(line.split('=', 1) for line in paths['command-line-tools-source.properties'].read_text().splitlines() if '=' in line)
write(args.out / 'analysis-tool-hashes.json', {
    'androidCommandLineToolsVersion': properties['Pkg.Revision'],
    'tools': [{'tool': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
               'bytes': path.stat().st_size} for name, path in paths.items()],
})
