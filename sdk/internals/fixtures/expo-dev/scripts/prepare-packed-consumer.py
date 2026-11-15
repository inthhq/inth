#!/usr/bin/env python3
"""Prepare a standalone Expo app whose only SDK input is a packed tarball.

With --cell, the app takes Expo, React Native, React and the fixture's other
Expo packages from that cell (one with `expoPackages` pins) of scripts/mobile-compatibility.json instead of
the fixture's own versions. Other packages keep the fixture's pins unless the
cell's `vendorPackages` or `devPackages` overrides one, with its reason.
"""
import argparse
import json
from pathlib import Path
import shutil
import tarfile

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('--package', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--cell', help='An Expo cell from scripts/mobile-compatibility.json that has expoPackages pins, such as expo-55')
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
cell = None
if args.cell is not None:
    cells = json.loads((repo / 'scripts/mobile-compatibility.json').read_text())
    # `expo install` would pick the newest patch at run time, which the release-age
    # gate can refuse, so only cells that pin the fixture's Expo packages qualify.
    pinned = [entry for entry in cells if entry['expo'] and entry.get('expoPackages')]
    cell = next((entry for entry in pinned if entry['id'] == args.cell), None)
    if cell is None:
        parser.error(f"--cell must be an Expo cell with expoPackages pins: {', '.join(entry['id'] for entry in pinned)}")
    expo_packages = sorted(name for name in json.loads((fixture / 'package.json').read_text())['dependencies']
                           if name.startswith('expo-'))
    unpinned = [name for name in expo_packages if name not in cell.get('expoPackages', {})]
    if unpinned:
        parser.error(f"{cell['id']} has no expoPackages pin for {', '.join(unpinned)}")

shutil.copytree(fixture, output, dirs_exist_ok=True, ignore=shutil.ignore_patterns(
    'node_modules', 'android', 'ios', '.expo', '.artifacts', '.env', '.env.*',
    '*.tsbuildinfo', 'scripts', 'bun.lock', 'package-lock.json', 'yarn.lock'))
(output / 'vendor').mkdir()
shutil.copy(package, output / 'vendor/c15t-react-native.tgz')

# The E2E host imports the bare fixture's vendor code (see metro-vendor-sources.js).
# Copy it into the app, minus tests, and point the one import at the copy.
bare = repo / 'internals/fixtures/react-native-bare/src'
for folder in ['vendors', 'documentation']:
    shutil.copytree(bare / folder, output / 'react-native-bare/src' / folder,
                    ignore=shutil.ignore_patterns('*.test.ts'))
host = output / 'src/e2e/vendor-journey-app.tsx'
source = host.read_text()
if source.count("'../../../react-native-bare/src/") != 1:
    parser.error(f'{host.name} must import the bare vendor code exactly once')
host.write_text(source.replace("'../../../react-native-bare/src/", "'../../react-native-bare/src/"))

manifest = output / 'package.json'
config = json.loads(manifest.read_text())
config['dependencies']['@c15t/react-native'] = 'file:vendor/c15t-react-native.tgz'
config['packageManager'] = 'bun@1.3.11'
if cell is not None:
    config['dependencies'].update({'expo': cell['expo'], 'react': cell['react'], 'react-native': cell['reactNative'],
                                   **cell['expoPackages']})
    # A package that does not build on this cell gets its own pin, with the reason.
    for field, section in [('vendorPackages', 'dependencies'), ('devPackages', 'devDependencies')]:
        overrides = {name: version for name, version in cell.get(field, {}).items() if name != 'reason'}
        if overrides and not cell[field].get('reason'):
            parser.error(f"{cell['id']} {field} pins packages without a reason")
        unknown = [name for name in overrides if name not in config[section]]
        if unknown:
            parser.error(f"{cell['id']} {field} pins packages the fixture does not use: {', '.join(unknown)}")
        config[section].update(overrides)
    # The fixture's React types follow its own React; a cell on another minor needs its own.
    config['devDependencies']['@types/react'] = '~19.3.0' if cell['react'].startswith('19.3.') else '~19.2.2'
    config['c15tCompatibilityCell'] = cell
manifest.write_text(json.dumps(config, indent=2) + '\n')
# Same release-age gate as the checkout, so a cell resolves the same way here.
shutil.copy(repo / 'bunfig.toml', output / 'bunfig.toml')
# A packed install uses Expo's normal Metro resolver; workspace watch paths do not apply.
(output / 'metro.config.js').write_text(
    "const { getDefaultConfig } = require('expo/metro-config');\n\n"
    "const { withVendorSources } = require('./metro-vendor-sources');\n\n"
    "module.exports = withVendorSources(getDefaultConfig(__dirname));\n")
# EAS uploads the tarball with the app. Never depend on the producer's absolute path.
(output / '.easignore').write_text(
    'node_modules\n/android\n/ios\n.expo\n.artifacts\n.env*\n!vendor/c15t-react-native.tgz\n')
print(json.dumps({'consumer': str(output), 'sdkInput': 'vendor/c15t-react-native.tgz',
                  'cell': args.cell, 'owner': 'inth-com', 'installed': False, 'cloudBuild': False}, indent=2))
