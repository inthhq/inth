#!/usr/bin/env python3
"""Prepare a standalone Expo app whose only SDK input is a packed tarball."""
import argparse
import json
from pathlib import Path
import shutil
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--package', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
fixture = Path(__file__).resolve().parents[1]
repo = fixture.parents[2]
output = args.output.resolve()
package = args.package.resolve()
if output.is_relative_to(repo) or (output.exists() and any(output.iterdir())):
    parser.error('--output must be an empty directory outside the checkout')
with tarfile.open(package) as archive:
    member = archive.extractfile('package/package.json')
    if member is None or json.load(member).get('name') != '@c15t/react-native':
        parser.error('--package must be an @c15t/react-native tarball')

shutil.copytree(fixture, output, dirs_exist_ok=True, ignore=shutil.ignore_patterns(
    'node_modules', 'android', 'ios', '.expo', '.artifacts', '.env', '.env.*',
    '*.tsbuildinfo', 'scripts', 'bun.lock', 'package-lock.json', 'yarn.lock'))
(output / 'vendor').mkdir()
shutil.copy(package, output / 'vendor/c15t-react-native.tgz')
manifest = output / 'package.json'
config = json.loads(manifest.read_text())
config['dependencies']['@c15t/react-native'] = 'file:vendor/c15t-react-native.tgz'
config['packageManager'] = 'bun@1.3.11'
manifest.write_text(json.dumps(config, indent=2) + '\n')
# A packed install uses Expo's normal Metro resolver; workspace watch paths do not apply.
(output / 'metro.config.js').write_text(
    "const { getDefaultConfig } = require('expo/metro-config');\n"
    "module.exports = getDefaultConfig(__dirname);\n")
# EAS uploads the tarball with the app. Never depend on the producer's absolute path.
(output / '.easignore').write_text(
    'node_modules\n/android\n/ios\n.expo\n.artifacts\n.env*\n!vendor/c15t-react-native.tgz\n')
print(json.dumps({'consumer': str(output), 'sdkInput': 'vendor/c15t-react-native.tgz',
                  'owner': 'inth-com', 'installed': False, 'cloudBuild': False}, indent=2))
