#!/usr/bin/env python3
"""Build a consumer outside the checkout, with fresh Gradle and Bun caches."""
import argparse
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlparse
import zipfile
import xml.etree.ElementTree as ElementTree


def exact_package_version(value):
    """Keep every compatibility result bound to an exact installed package version."""
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', value):
        raise argparse.ArgumentTypeError('must be an exact package version, such as 0.86.3')
    return value


def verify_staging(repository, version):
    """Validate binaries, source archives and API docs in a staged Maven version."""
    for artifact, extension in [('inth-core', 'jar'), ('inth-android', 'aar'), ('inth-consent-ui', 'aar')]:
        directory = repository / 'com/inth' / artifact / version
        prefix = directory / f'{artifact}-{version}'
        for suffix in [f'.{extension}', '.pom', '.module', '-sources.jar', '-javadoc.jar']:
            if not Path(f'{prefix}{suffix}').is_file():
                raise ValueError(f'Missing staged artifact: {prefix}{suffix}')
        pom = ElementTree.parse(f'{prefix}.pom')
        ns = {'m': 'http://maven.apache.org/POM/4.0.0'}
        versions = [dependency.findtext('m:version', namespaces=ns)
                    for dependency in pom.findall('m:dependencies/m:dependency', ns)
                    if dependency.findtext('m:groupId', namespaces=ns) == 'org.jetbrains.kotlin'
                    and dependency.findtext('m:artifactId', namespaces=ns) == 'kotlin-stdlib']
        module = json.loads(Path(f'{prefix}.module').read_text())
        module_versions = [dependency['version']['requires']
                           for variant in module['variants'] for dependency in variant.get('dependencies', [])
                           if dependency['group'] == 'org.jetbrains.kotlin' and dependency['module'] == 'kotlin-stdlib']
        if versions != ['2.1.20'] or not module_versions or set(module_versions) != {'2.1.20'}:
            raise ValueError(f'{artifact} does not publish the supported Kotlin 2.1.20 baseline')
        for classifier in ['sources', 'javadoc']:
            with zipfile.ZipFile(f'{prefix}-{classifier}.jar') as archive:
                entries = archive.namelist()
                for notice in ['LICENSE', 'NOTICE']:
                    if f'META-INF/licenses/com.inth/{artifact}/{notice}' not in entries:
                        raise ValueError(f'{artifact} {classifier} is missing {notice}')
                if classifier == 'sources' and not any(p.endswith('.kt') for p in entries):
                    raise ValueError(f'{artifact} has no Kotlin sources')
                if classifier == 'javadoc' and not any(p.endswith('.html') for p in entries):
                    raise ValueError(f'{artifact} has no API documentation')
        with zipfile.ZipFile(f'{prefix}.{extension}') as archive:
            if extension == 'jar':
                entries = archive.namelist()
                if 'META-INF/proguard/inth-core.pro' not in entries:
                    raise ValueError('JVM artifact is missing its shrinker rules')
            elif artifact == 'inth-android' and 'proguard.txt' not in archive.namelist():
                raise ValueError('Android artifact is missing consumer shrinker rules')
            if extension == 'aar':
                with zipfile.ZipFile(io.BytesIO(archive.read('classes.jar'))) as classes:
                    entries = classes.namelist()
            else:
                entries = archive.namelist()
            for notice in ['LICENSE', 'NOTICE']:
                if f'META-INF/licenses/com.inth/{artifact}/{notice}' not in entries:
                    raise ValueError(f'{artifact} is missing {notice}')


def main():
    """Build an isolated native or packed RN consumer and record its evidence."""
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--repository', help='Reachable HTTPS Maven repository (remote resolution proof)')
    source.add_argument('--staging-repository', type=Path, help='Local staging only; never remote resolution proof')
    parser.add_argument('--version', required=True)
    parser.add_argument('--rn-package', type=Path, help='Packed RN tarball; adds the real bridge and Codegen to the build')
    parser.add_argument('--react-native-version', type=exact_package_version, default='0.86.3',
                        help='Exact host React Native version for a packed RN consumer (default: 0.86.3)')
    parser.add_argument('--react-version', type=exact_package_version, default='19.2.7',
                        help='Exact host React version for a packed RN consumer (default: 19.2.7)')
    parser.add_argument('--compile-sdk', type=int, default=36,
                        help='Host compileSdkVersion; minSdk stays 24 (default: 36)')
    parser.add_argument('--output', type=Path, help='New directory outside the repository; retained for evidence')
    args = parser.parse_args()
    if args.compile_sdk < 36:
        parser.error('--compile-sdk must be at least 36 for the staged native artifacts')
    fixture = Path(__file__).resolve().parent
    root = fixture.parents[2]
    output = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix='inth-android-consumer-'))
    if output.is_relative_to(root):
        parser.error('The consumer and its caches must be outside the checkout')
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        parser.error('--output must be empty so caches cannot hide missing artifacts')
    consumer = output / 'consumer'
    shutil.copytree(fixture, consumer, ignore=shutil.ignore_patterns('verify.py', '__pycache__'))
    if args.staging_repository:
        verify_staging(args.staging_repository.resolve(), args.version)
        repository = output / 'staging'
        shutil.copytree(args.staging_repository.resolve(), repository)
        repository_url = repository.as_uri()
        proof = 'local-staging-only'
    else:
        parsed = urlparse(args.repository)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            parser.error('--repository must be HTTPS without embedded credentials')
        repository_url = args.repository
        proof = 'remote-resolution'
    android = consumer / 'android'
    wrapper = fixture.parent / 'gradle/wrapper'
    shutil.copytree(wrapper, android / 'gradle/wrapper')
    properties = android / 'gradle/wrapper/gradle-wrapper.properties'
    # GRADLE_USER_HOME below is fresh every run, so this distribution is always
    # downloaded; the wrapper's 10 s default has timed out on GitHub's runners.
    properties.write_text(properties.read_text().replace('gradle-9.4.1-bin', 'gradle-9.3.1-bin').replace('networkTimeout=10000', 'networkTimeout=120000'))
    shutil.copy(fixture.parent / 'gradlew', android / 'gradlew')
    env = dict(os.environ, GRADLE_USER_HOME=str(output / 'gradle-home'), BUN_INSTALL_CACHE_DIR=str(output / 'bun-cache'))
    # An inherited source-build flag can never change this consumer's dependency source.
    env.pop('GRADLE_OPTS', None)
    env.pop('GRADLE_RO_DEP_CACHE', None)
    commands = []

    def run(command, cwd=consumer):
        commands.append(command)
        subprocess.run(command, cwd=cwd, env=env, check=True)

    react_native_version = None
    react_version = None
    if args.rn_package:
        tarball = args.rn_package.resolve()
        (consumer / 'package.json').write_text(json.dumps({
            'name': 'inth-packed-android-consumer', 'private': True,
            'dependencies': {'@inth/react-native': f'file:{tarball}',
                             'react-native': args.react_native_version, 'react': args.react_version}
        }, indent=2))
        run(['bun', 'install', '--ignore-scripts'])
        packed = consumer / 'node_modules/@inth/react-native'
        if packed.is_symlink():
            raise ValueError('RN package must be an installed tarball, not a workspace link')
        installed = {}
        for name, expected in [('react-native', args.react_native_version), ('react', args.react_version)]:
            version = json.loads((consumer / 'node_modules' / name / 'package.json').read_text())['version']
            if version != expected:
                raise ValueError(f'Installed {name} {version}, expected {expected}')
            installed[name] = version
        react_native_version = installed['react-native']
        react_version = installed['react']
    host_properties = [f'-PcompileSdkVersion={args.compile_sdk}']
    if react_native_version:
        # Both app and bridge use the version that was actually installed for Codegen.
        host_properties.append(f'-Pinth.reactNativeVersion={react_native_version}')
    run(['./gradlew', '--no-daemon', '--no-build-cache', '--no-configuration-cache', '--console=plain',
         f'-Pinth.repository={repository_url}', f'-Pinth.core.version={args.version}',
         *host_properties, ':headless:test', ':app:assembleRelease'], cwd=android)
    apk = android / 'app/build/outputs/apk/release/app-release-unsigned.apk'
    mapping = android / 'app/build/outputs/mapping/release/mapping.txt'
    if not apk.is_file() or not mapping.is_file() or not mapping.stat().st_size:
        raise ValueError('Expected an R8 release APK and nonempty mapping')
    manifest = android / 'app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml'
    initializer = 'com.inth.reactnative.InthReactNativeInitializer' if args.rn_package else 'com.inth.android.InthInitializer'
    if initializer not in manifest.read_text():
        raise ValueError('The artifact lost its pre-JS startup initializer')
    result = {'proof': proof, 'version': args.version, 'packedRN': bool(args.rn_package),
              'toolchain': {'agp': '8.12.0', 'kotlin': '2.1.20', 'gradle': '9.3.1',
                            'compileSdk': args.compile_sdk, 'minSdk': 24},
              'apk': str(apk), 'mapping': str(mapping), 'commands': commands,
              'notVerified': ['app launch', 'device behavior', 'certification', 'EAS', 'signed native release']}
    if args.rn_package:
        result['reactNativeVersion'] = react_native_version
        result['reactVersion'] = react_version
        spec = packed / 'android/inth-react-native/build/generated/source/codegen/java/com/inth/reactnative/NativeInthSpec.java'
        if not spec.is_file():
            raise ValueError('Normal auto-detection did not generate NativeInthSpec')
        result['codegenSpec'] = str(spec)
    if args.staging_repository:
        result['notVerified'].append('remote versioned artifact resolution')
    (output / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
