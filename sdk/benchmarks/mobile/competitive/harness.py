#!/usr/bin/env python3
"""Portable matched mobile CMP builds. Run --help for stages."""
import argparse
import datetime
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import zipfile
import tarfile

from core import (HERE, VENDORS, PROFILES, DEFAULT_PROFILES, ANDROID_PROFILES, ANDROID_SETTINGS, IOS_SETTINGS, SYMBOLS,
                  apk_measure, app_measure, android_metadata, bind_files, check_settings, check_r8, digest,
                  manifest, read, require, sha, size_rows, verify_archive, verify_app_manifest, verify_files, write)

PINS = read(HERE / 'pins.json')
EXCLUDED = ('node_modules', 'Pods', 'build', '.gradle', '.cxx', '.expo', '.kotlin', '.git')
WRAPPER_BUILD_OUTPUTS = {name: ('android/c15t-react-native/build',) if name == 'c15t' else ('android/build',) for name in VENDORS if name != 'baseline'}


def resolve(base, value):
    path = Path(value).expanduser()
    return (base / path).resolve() if not path.is_absolute() else path.resolve()


def config(path):
    path = Path(path).resolve()
    value = read(path)
    require(value.get('schemaVersion') == 1, 'unsupported config schema')
    for key in ['output', 'archive', 'maven', 'policy', 'downloadCache', 'androidSdk', 'javaHome', 'gradleHome', 'deviceRoot']:
        if value.get(key):
            value[key] = str(resolve(path.parent, value[key]))
    value.setdefault('output', str(path.parent / '.competitive-output'))
    root = Path(value['output'])
    repo = HERE.parents[2]
    require(root != repo and root not in HERE.parents and not root.is_relative_to(repo), 'output must be outside the repository')
    value['extensions'] = {name: str(resolve(path.parent, target)) for name, target in value.get('extensions', {}).items()}
    selected_profiles(value)
    value['_config'] = str(path)
    return value


def selected_profiles(cfg):
    profiles = cfg.get('sizeProfiles', list(DEFAULT_PROFILES))
    require(isinstance(profiles, list) and profiles and len(set(profiles)) == len(profiles)
            and set(profiles) <= set(PROFILES), 'invalid sizeProfiles selection')
    return tuple(profiles)


def environment(cfg):
    result = os.environ.copy()
    result.update(CI='1', EXPO_PUBLIC_C15T_FAKE_NATIVE='false', C15T_LOCAL_PODS='false')
    for key, var in [('androidSdk', 'ANDROID_HOME'), ('javaHome', 'JAVA_HOME'), ('gradleHome', 'GRADLE_USER_HOME'), ('deviceRoot', 'ANDROID_AVD_HOME')]:
        if cfg.get(key):
            result[var] = cfg[key]
    if cfg.get('maven'):
        result['C15T_MAVEN_URL'] = Path(cfg['maven']).as_uri()
    return result


def invoke(args, cwd, log, cfg, extra=None):
    log = Path(log)
    log.parent.mkdir(parents=True, exist_ok=True)
    env = environment(cfg)
    env.update(extra or {})
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with log.open('w') as stream:
        result = subprocess.run([str(x) for x in args], cwd=cwd, env=env, stdout=stream, stderr=subprocess.STDOUT)
    record = {'argv': [str(x) for x in args], 'cwd': str(cwd), 'startedUtc': started,
              'endedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'exitCode': result.returncode, 'logSha256': sha(log)}
    write(log.with_suffix('.command.json'), record)
    require(result.returncode == 0, f'command failed ({result.returncode}), see {log}')
    return log.read_text(errors='replace')


def root_for(cfg):
    return Path(cfg['output'])


def host_for(cfg, platform, vendor, runtime=False, profile=None):
    lane = 'android-optimized' if profile == 'android-optimized' else platform
    return root_for(cfg) / ('runtime' if runtime else lane) / (vendor + '-host')


def out_for(cfg, profile, vendor):
    return root_for(cfg) / 'artifacts' / profile / vendor


def validate_inputs(cfg):
    require(cfg.get('archive') and cfg.get('maven'), 'archive and maven inputs are required')
    require(sha(cfg['archive']) == PINS['c15t']['archiveSha256'], 'unexpected c15t archive SHA256')
    rows = manifest(cfg['maven'])
    require(rows == PINS['c15t']['mavenFiles'], 'c15t Maven input manifest differs, expected exact 90-file frozen staging')
    if cfg.get('policy'):
        require(Path(cfg['policy']).is_file(), 'missing local c15t policy file')
    return {'archiveSha256': sha(cfg['archive']), 'mavenManifestSha256': digest(rows), 'mavenFiles': len(rows)}


def preflight(cfg, platform=None, tools=False):
    result = validate_inputs(cfg)
    require(sys.version_info >= (3, 9), 'Python 3.9+ required')
    if tools:
        env = environment(cfg)
        for command in ['bun', 'node'] + (['xcodebuild', 'xcrun', 'pod'] if platform == 'ios' else []):
            require(shutil.which(command, path=env.get('PATH')), f'missing tool: {command}')
        require(subprocess.check_output(['bun', '--version'], text=True).strip() == '1.3.11', 'Bun 1.3.11 required')
        if platform == 'android':
            sdk = Path(env.get('ANDROID_HOME', ''))
            for name in ('apksigner', 'aapt2'):
                require((sdk / 'build-tools/36.0.0' / name).is_file(), f'Android build-tools 36.0.0 missing: {name}')
            java = Path(env.get('JAVA_HOME', '')) / 'bin/java'
            require(java.is_file(), 'set javaHome or JAVA_HOME for Java 17.0.20')
            version = subprocess.run([str(java), '-version'], capture_output=True, text=True, check=True).stderr
            require('17.0.20' in version, 'Java 17.0.20 required')
        if platform == 'ios':
            xcode = subprocess.check_output(['xcodebuild', '-version'], text=True)
            require('Xcode 27.1' in xcode and '27A9275' in xcode, 'Xcode 27.1 build 27A9275 required')
            require(subprocess.check_output(['pod', '--version'], text=True).strip() == '1.17.0', 'CocoaPods 1.17.0 required')
        require(isinstance(cfg.get('nativeLockRunner'), list) and cfg['nativeLockRunner'], 'nativeLockRunner command array required for native work')
    return result


def lock_command(cfg, stage, args):
    require(cfg.get('nativeLockRunner'), 'configure the shared exclusive nativeLockRunner')
    # Keep a single lock around the whole stage, including runtime quiet/settling/schedule.
    command = cfg['nativeLockRunner'] + ['cmp-' + stage, sys.executable, str(HERE / 'harness.py'), *args, '--locked']
    return subprocess.call(command, env=environment(cfg))


def plan(cfg):
    inputs = preflight(cfg)
    rows = []
    for profile in selected_profiles(cfg):
        for vendor in VENDORS:
            rows.append({'profile': profile, 'vendor': vendor, 'artifactDirectory': str(out_for(cfg, profile, vendor))})
    return {'schemaVersion': 1, 'inputs': inputs, 'measurements': rows, 'runtime': {
        vendor: 'requires configured tenant, stock rejection calibration and offline proof' if vendor in ('c15t', 'didomi', 'usercentrics') else 'blocked, runtime adapter not implemented' for vendor in VENDORS if vendor != 'baseline'}}


def download(cfg, url, name, expected):
    directory = Path(cfg.get('downloadCache', str(root_for(cfg) / 'downloads')))
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    if not path.exists():
        temporary = path.with_suffix(path.suffix + '.partial')
        urllib.request.urlretrieve(url, temporary)
        require(sha(temporary) == expected, f'download hash mismatch: {url}')
        temporary.rename(path)
    require(sha(path) == expected, f'cached download hash mismatch: {path}')
    return path


def tenant_source(cfg):
    # Local config never enters committed fixture files or snapshot provenance.
    defaults = {'c15t': {'privacyUrl': 'https://example.com/privacy'},
                'onetrust': {'cdn': 'cdn.cookielaw.org', 'appId': 'UNCONFIGURED', 'category': 'C0002'},
                'didomi': {'apiKey': 'UNCONFIGURED', 'noticeId': 'UNCONFIGURED', 'target': 'cookies'},
                'usercentrics': {'settingsId': 'UNCONFIGURED', 'target': '9V8bg4D63'},
                'sourcepoint': {'accountId': 0, 'propertyId': 0, 'propertyName': 'UNCONFIGURED', 'privacyManagerId': 'UNCONFIGURED'}}
    for vendor, values in cfg.get('tenants', {}).items():
        require(vendor in defaults and isinstance(values, dict), f'unknown tenant: {vendor}')
        defaults[vendor].update(values)
    import json
    return 'export const benchmarkConfig = ' + json.dumps(defaults, indent=2) + ';\n'


def copy_input(source, destination):
    """Reuse a verified shared frozen input without rewriting read-only files."""
    if destination.exists():
        require(destination.is_file() and not destination.is_symlink()
                and sha(source) == sha(destination), 'shared frozen input changed')
    else:
        shutil.copy2(source, destination)


def prepare(cfg, platform, vendor, runtime=False, profile=None):
    preflight(cfg, platform, tools=True)
    require(profile is None or (platform == 'android' and profile in ANDROID_PROFILES), 'prepare --profile is only for Android size profiles')
    require(not runtime or profile in (None, 'android-release'), 'runtime uses the original android-release profile')
    require(not runtime or (platform == 'android' and vendor in ('c15t', 'didomi', 'usercentrics')), 'unsupported runtime app')
    if vendor == 'c15t':
        require(cfg.get('policy') and cfg.get('backendUrl'), 'c15t needs policy and backendUrl, never substitute a fabricated policy')
    host = host_for(cfg, platform, vendor, runtime, profile)
    require(not host.exists(), f'host exists, use a fresh output root: {host}')
    host.mkdir(parents=True)
    inputs = host.parent / 'inputs'
    inputs.mkdir(exist_ok=True)
    copy_input(cfg['archive'], inputs / 'c15t.tgz')
    for row in PINS['wrappers']:
        if row['name'] != vendor:
            continue
        archive = download(cfg, row['tarball'], row['name'] + '-' + row['wrapperVersion'] + '.tgz', row['tarballSha256'])
        copy_input(archive, inputs / archive.name)
    for name in ('App.tsx', 'index.ts', 'metro.config.js', 'tsconfig.json'):
        shutil.copy2(HERE / 'fixtures/common' / name, host / name)
    for source, target in [(vendor + '.json', 'package.json'), (vendor + '.lock', 'bun.lock')]:
        shutil.copy2(HERE / 'fixtures/locks' / platform / source, host / target)
    (host / 'benchmark-config.ts').write_text(tenant_source(cfg))
    shutil.copy2(HERE / 'fixtures/adapters' / (vendor + '.tsx'), host / 'consent-adapter.tsx')
    import json
    app = {'name': 'c15t Size Host', 'slug': 'c15t-size-host', 'version': '1.0.0', 'platforms': [platform],
           'android': {'package': 'com.c15t.expodev'}, 'ios': {'bundleIdentifier': 'com.c15t.expodev', 'supportsTablet': True}}
    if vendor == 'c15t':
        shutil.copy2(cfg['policy'], host / 'c15t-policy.json')
        app['plugins'] = [['@c15t/react-native/expo-plugin', {'mode': 'hosted', 'backendURL': cfg['backendUrl'],
            'consentCategories': ['necessary', 'functionality', 'experience', 'measurement', 'marketing'], 'policyResource': './c15t-policy.json'}]]
    (host / 'app.json').write_text(json.dumps({'expo': app}, indent=2) + '\n')
    logs = root_for(cfg) / 'logs' / ('runtime' if runtime else ('android-optimized' if profile == 'android-optimized' else platform)) / vendor
    invoke(['bun', 'install', '--frozen-lockfile'], host, logs / 'install.log', cfg)
    verify_installed(cfg, host, vendor, before_build=True)
    invoke(['bun', 'x', 'expo', 'prebuild', '--platform', platform, '--no-install'], host, logs / 'prebuild.log', cfg)
    if platform == 'android':
        gradle = host / 'android'
        # Host-only profile settings. No vendor files or consumer rules are patched.
        if profile == 'android-optimized':
            app_build = gradle / 'app/build.gradle'
            original = app_build.read_text()
            require(original.count('getDefaultProguardFile("proguard-android.txt")') == 1, 'unexpected generated ProGuard defaults')
            app_build.write_text(original.replace('getDefaultProguardFile("proguard-android.txt")', 'getDefaultProguardFile("proguard-android-optimize.txt")'))
        with (gradle / 'gradle.properties').open('a') as stream:
            stream.write('\nandroid.minSdkVersion=24\nandroid.compileSdkVersion=36\nandroid.targetSdkVersion=36\nandroid.buildToolsVersion=36.0.0\nandroid.kotlinVersion=2.1.20\n')
        wrapper = gradle / 'gradle/wrapper/gradle-wrapper.properties'
        import re
        wrapper.write_text(re.sub(r'gradle-[\d.]+-(bin|all)\.zip', 'gradle-9.3.1-bin.zip', wrapper.read_text()))
        build = gradle / 'build.gradle'
        if vendor == 'c15t':
            build.write_text(build.read_text() + "\nallprojects { repositories { exclusiveContent { forRepository { maven { url = uri(System.getenv('C15T_MAVEN_URL')) } }; filter { includeGroup('com.c15t') } } } }\n")
        if vendor == 'onetrust':
            with (gradle / 'app/proguard-rules.pro').open('a') as stream:
                stream.write('\n' + (HERE / 'fixtures/onetrust.pro').read_text())
        # Use one generated development signing key for every release APK in this run.
        signing = root_for(cfg) / 'signing/debug.keystore'
        signing.parent.mkdir(exist_ok=True)
        if not signing.exists():
            shutil.copy2(gradle / 'app/debug.keystore', signing)
        shutil.copy2(signing, gradle / 'app/debug.keystore')
        if runtime:
            prepare_runtime(host, vendor)
    else:
        (host / 'ios/Podfile.lock').write_text(expected_pod_lock(host, vendor))
        invoke(['pod', 'install', '--deployment', '--project-directory=ios'], host, logs / 'pods.log', cfg)
        verify_pods(cfg, host, vendor)
    invoke(['node', 'node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false'], host, logs / 'types.log', cfg)
    write(host / 'prepared.json', {'schemaVersion': 1, 'vendor': vendor, 'platform': platform, 'runtime': runtime, 'profile': profile,
                                  'inputs': validate_inputs(cfg), 'files': manifest(host, EXCLUDED),
                                  'construction': {'harnessSha256': sha(HERE / 'harness.py'), 'coreSha256': sha(HERE / 'core.py'),
                                                   'pinsSha256': sha(HERE / 'pins.json'), 'fixtures': manifest(HERE / 'fixtures')}})
    print('Prepared', host)


def prepare_runtime(host, vendor):
    for name in ('App.tsx', 'runtime-types.ts'):
        shutil.copy2(HERE / 'fixtures/runtime' / name, host / name)
    shutil.copy2(HERE / 'fixtures/runtime' / (vendor + '.tsx'), host / 'consent-adapter.tsx')
    java = host / 'android/app/src/main/java/com/c15t/expodev'
    source = java / 'MainApplication.kt'
    text = source.read_text()
    old = 'class MainApplication : Application(), ReactApplication {'
    require(old in text and 'PackageList(this).packages.apply {' in text, 'unexpected generated MainApplication')
    text = text.replace(old, old + '\n  override fun attachBaseContext(base: android.content.Context) {\n    BenchmarkClock.start()\n    super.attachBaseContext(base)\n  }')
    text = text.replace('PackageList(this).packages.apply {', 'PackageList(this).packages.apply {\n          add(BenchmarkPackage())')
    source.write_text(text)
    shutil.copy2(HERE / 'fixtures/runtime/runtime-benchmark.kt', java / 'runtime-benchmark.kt')
    build = host / 'android/app/build.gradle'
    text = build.read_text()
    require('applicationId ' in text, 'missing applicationId')
    import re
    text, count = re.subn(r'(applicationId [^\n]+)', r'\1\n        applicationIdSuffix ".benchmark.' + vendor + '"', text, count=1)
    require(count == 1, 'unexpected applicationId declaration')
    build.write_text(text)


def verify_installed(cfg, host, vendor, *, before_build=False):
    for package, version in [('expo', '57.0.22'), ('react-native', '0.86.3'), ('react', '19.2.7')]:
        require(read(host / 'node_modules' / package / 'package.json')['version'] == version, f'installed {package} version mismatch')
    packages = {'c15t': '@c15t/react-native', **{row['name']: row['package'] for row in PINS['wrappers']}}
    for name, package in packages.items():
        tree = host / 'node_modules' / package
        if name != vendor:
            require(not tree.exists(), f'{name} contaminates {vendor} host')
    if vendor != 'baseline':
        archive = (Path(cfg['archive']) if vendor == 'c15t' else host.parent / 'inputs' / next(row['name'] + '-' + row['wrapperVersion'] + '.tgz' for row in PINS['wrappers'] if row['name'] == vendor))
        return verify_archive(archive, host / 'node_modules' / packages[vendor], generated_roots=() if before_build else WRAPPER_BUILD_OUTPUTS[vendor])
    return 0


def expo_core_spec(host):
    import json
    template = (HERE / 'fixtures/locks/ios/expo-modules-core.podspec.json').read_text()
    spec = json.loads(template.replace('__BENCHMARK_HOST__', json.dumps(str(host))[1:-1]))
    spec['source']['http'] = (host / 'node_modules/expo-modules-core/prebuilds/output/debug/xcframeworks/ExpoModulesCore.tar.gz').as_uri()
    return spec


def podspec_checksum(spec):
    import hashlib
    import json
    # CocoaPods 1.17 hashes the stored pretty JSON, including its final newline.
    return hashlib.sha1((json.dumps(spec, indent=2, ensure_ascii=False) + '\n').encode()).hexdigest()


def expected_pod_lock(host, vendor):
    import re
    checksum = podspec_checksum(expo_core_spec(host))
    require(re.fullmatch(r'[a-f0-9]{40}', checksum), 'invalid CocoaPods spec checksum')
    text = (HERE / 'fixtures/locks/ios' / (vendor + '.Podfile.lock')).read_text()
    text, count = re.subn(r'^  ExpoModulesCore: [a-f0-9]{40}$', '  ExpoModulesCore: ' + checksum, text, flags=re.M)
    require(count == 1, 'missing unique ExpoModulesCore lock checksum')
    return text


def verify_pods(cfg, host, vendor):
    lock = (host / 'ios/Podfile.lock').read_text()
    expected = expected_pod_lock(host, vendor)
    require(lock == expected, 'Pod dependency lock changed')
    require(read(host / 'ios/Pods/Local Podspecs/ExpoModulesCore.podspec.json') == expo_core_spec(host), 'ExpoModulesCore Podspec changed beyond its local archive path')
    owners = {'Didomi-XCFramework': 'didomi', 'OneTrust-CMP-XCFramework': 'onetrust', 'Usercentrics': 'usercentrics', 'UsercentricsUI': 'usercentrics', 'SPMobileCore': 'sourcepoint', 'ConsentViewController': 'sourcepoint'}
    for row in PINS['iosDistributions']:
        if owners[row['name']] != vendor:
            continue
        archive = download(cfg, row['downloadUrl'], row['name'] + '-' + row['version'] + ('.zip' if row['downloadUrl'].endswith('.zip') else '.tar.gz'), row['archiveSha256'])
        if archive.suffix == '.zip':
            handle = zipfile.ZipFile(archive)
            names = [n for n in handle.namelist() if not n.endswith('/')]
            get = handle.read
        else:
            handle = tarfile.open(archive)
            names = [m.name for m in handle if m.isfile()]
            get = lambda name: handle.extractfile(name).read()
        pod = host / 'ios/Pods' / row['name']
        files = manifest(pod)
        require(files, f'missing installed Pod: {row["name"]}')
        for entry in files:
            name = entry['path']
            candidates = [n for n in names if n == name or n.endswith('/' + name)]
            import hashlib
            require(any(hashlib.sha256(get(n)).hexdigest() == entry['sha256'] for n in candidates), f'installed Pod differs from exact distribution: {row["name"]}/{name}')
        handle.close()


def host_inputs(host):
    return [row for row in manifest(host, EXCLUDED) if row['path'] != 'prepared.json']


def common_inputs(host, platform):
    paths = ['App.tsx', 'index.ts', 'metro.config.js', 'tsconfig.json']
    if platform == 'android':
        paths += ['android/app/src/main/java/com/c15t/expodev/MainApplication.kt',
                  'android/app/src/main/java/com/c15t/expodev/MainActivity.kt', 'android/app/build.gradle', 'android/gradle.properties']
    return {name: sha(host / name) for name in paths}


def build(cfg, profile, vendor, runtime=False):
    platform = 'android' if profile in ANDROID_PROFILES else 'ios'
    preflight(cfg, platform, tools=True)
    host = host_for(cfg, platform, vendor, runtime, profile)
    require(not runtime or profile == 'android-release', 'runtime uses android-release')
    prepared = read(host / 'prepared.json')
    require(prepared.get('profile') in (None, profile) and (profile != 'android-optimized' or prepared.get('profile') == profile), 'prepared host profile mismatch')
    require(prepared['inputs'] == validate_inputs(cfg), 'prepared inputs changed')
    require(host_inputs(host) == [r for r in prepared['files'] if r['path'] != 'prepared.json'], 'host changed since prepare')
    verify_installed(cfg, host, vendor, before_build=True)
    if platform == 'ios':
        verify_pods(cfg, host, vendor)
    output = (root_for(cfg) / 'runtime/artifacts' / vendor) if runtime else out_for(cfg, profile, vendor)
    require(not output.exists(), f'build output exists, use a fresh root: {output}')
    output.mkdir(parents=True)
    write(output / 'build-start.json', {'profile': profile, 'vendor': vendor, 'inputs': validate_inputs(cfg), 'hostInputsSha256': digest(host_inputs(host))})
    if platform == 'android':
        extra = {'C15T_RESOLVED_OUT': str(output / 'dependencies.json'), 'C15T_SETTINGS_OUT': str(output / 'settings.json'), 'C15T_COMPILER_IDENTITY_OUT': str(output / 'compiler.json')}
        args = ['sh', 'android/gradlew', '-p', 'android', '--no-daemon', '--max-workers=3', '-PreactNativeArchitectures=arm64-v8a', '-Pandroid.enableMinifyInReleaseBuilds=true', '-Pandroid.enableShrinkResourcesInReleaseBuilds=true', ':app:assembleRelease', 'c15tEvidenceResolvedArtifacts', 'c15tEvidenceBuildSettings', ':app:c15tCompilerIdentity']
        for name in ('android-resolved-artifacts.gradle', 'android-build-settings.gradle', 'compiler-identity.gradle'):
            args += ['-I', str(HERE / 'fixtures/gradle' / name)]
        invoke(args + ['--console=plain'], host, output / 'build.log', cfg, extra)
        shutil.copy2(host / 'android/app/build/outputs/apk/release/app-release.apk', output / 'app-release.apk')
        r8 = host / 'android/app/build/outputs/mapping/release'
        for name in ('mapping.txt', 'configuration.txt', 'usage.txt', 'seeds.txt'):
            shutil.copy2(r8 / name, output / name)
        check_r8(profile, output / 'configuration.txt', output / 'mapping.txt')
        sdk = Path(environment(cfg)['ANDROID_HOME'])
        invoke([sdk / 'build-tools/36.0.0/apksigner', 'verify', '--verbose', '--print-certs', output / 'app-release.apk'], host, output / 'signing.txt', cfg)
        invoke([sdk / 'build-tools/36.0.0/aapt2', 'dump', 'badging', output / 'app-release.apk'], host, output / 'badging.txt', cfg)
    else:
        derived = root_for(cfg) / 'derived' / profile / vendor
        settings = ['CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGN_IDENTITY=', 'ONLY_ACTIVE_ARCH=YES', 'ARCHS=arm64', 'SWIFT_OPTIMIZATION_LEVEL=-O', 'GCC_OPTIMIZATION_LEVEL=s', 'DEAD_CODE_STRIPPING=YES', 'STRIP_INSTALLED_PRODUCT=YES', 'STRIP_STYLE=all', 'COPY_PHASE_STRIP=YES', 'DEBUG_INFORMATION_FORMAT=dwarf-with-dsym', 'LD_GENERATE_MAP_FILE=YES', 'LD_MAP_FILE_PATH=' + str(output / '$(TARGET_NAME)-$(CURRENT_ARCH).map'), 'DEPLOYMENT_POSTPROCESSING=' + ('YES' if profile == 'ios-postprocessed' else 'NO')]
        args = ['xcodebuild', '-workspace', 'ios/c15tSizeHost.xcworkspace', '-scheme', 'c15tSizeHost', '-configuration', 'Release', '-sdk', 'iphoneos', '-destination', 'generic/platform=iOS', '-derivedDataPath', str(derived), '-jobs', '4'] + settings
        text = invoke(args + ['-showBuildSettings', '-json'], host, output / 'settings.log', cfg)
        import json
        data = json.loads(text)
        effective = next(row['buildSettings'] for row in data if row['target'] == 'c15tSizeHost')
        write(output / 'settings.json', effective)
        invoke(args + ['build'], host, output / 'build.log', cfg)
        app = derived / 'Build/Products/Release-iphoneos/c15tSizeHost.app'
        shutil.copytree(app, output / app.name, symlinks=True)
        binary = output / app.name / 'c15tSizeHost'
        for command, name in [(['xcrun', 'nm', '-nm', str(binary)], 'symbols.txt'), (['strings', str(binary)], 'strings.txt')]:
            invoke(command, host, output / name, cfg)
        shutil.copy2(host / 'ios/Podfile.lock', output / 'Podfile.lock')
    write(output / 'build-complete.json', {'profile': profile, 'vendor': vendor, 'runtime': runtime,
          'host': str(host), 'hostInputsSha256': digest(host_inputs(host)), 'inputs': validate_inputs(cfg),
          'commonInputs': common_inputs(host, platform), 'artifacts': manifest(output)})
    print('Built', output)


def descriptor(cfg, profile, vendor):
    output = out_for(cfg, profile, vendor)
    complete = read(output / 'build-complete.json')
    require(complete['profile'] == profile and complete['vendor'] == vendor and not complete['runtime'], 'wrong build profile')
    require(complete['inputs'] == validate_inputs(cfg), 'c15t input provenance changed')
    require([row for row in manifest(output) if row['path'] != 'build-complete.json'] == complete['artifacts'], 'stale/changed build output')
    host = Path(complete['host'])
    require(digest(host_inputs(host)) == complete['hostInputsSha256'], 'host changed after build')
    verify_installed(cfg, host, vendor)
    base = {'profile': profile, 'vendor': vendor, 'host': str(host), 'settings': str(output / 'settings.json'), 'commonInputs': complete['commonInputs'], 'buildRecord': str(output / 'build-complete.json')}
    if profile in ANDROID_PROFILES:
        configuration = output / 'configuration.txt'
        if not configuration.exists():
            # Earlier harness builds retained this real output in their host.
            configuration = host / 'android/app/build/outputs/mapping/release/configuration.txt'
        return {**base, 'artifact': str(output / 'app-release.apk'), 'mapping': str(output / 'mapping.txt'), 'r8Configuration': str(configuration), 'compiler': str(output / 'compiler.json'), 'dependencies': str(output / 'dependencies.json'), 'signing': str(output / 'signing.txt'), 'badging': str(output / 'badging.txt')}
    return {**base, 'artifact': str(output / 'c15tSizeHost.app'), 'symbols': [str(output / 'symbols.txt'), str(output / 'strings.txt')], 'maps': [str(p) for p in output.glob('*.map')]}


def measure_descriptor(row, cfg):
    profile, vendor = row['profile'], row['vendor']
    require(profile in PROFILES and vendor in VENDORS, 'unsupported app/profile')
    settings = read(row['settings'])
    check_settings(profile, settings)
    files = [row['settings']]
    if profile in ANDROID_PROFILES:
        r8 = check_r8(profile, row['r8Configuration'], row['mapping'])
        if row.get('compiler'):
            compiler = read(row['compiler'])
            require(compiler.get('kotlinPluginSources') and all('/kotlin-gradle-plugin/2.1.20/' in source['location'] for source in compiler['kotlinPluginSources']), 'Kotlin plugin differs from 2.1.20')
            require(any('org.jetbrains.kotlin:kotlin-compiler-embeddable:2.1.20' in c['components'] for c in compiler['compilerConfigurations']), 'Kotlin compiler differs from 2.1.20')
            files.append(row['compiler'])
        deps = read(row['dependencies'])
        require(sorted([{k: v for k, v in d.items() if k in ('coordinate', 'size', 'sha256')} for d in deps], key=lambda d: (d['coordinate'], d['sha256'])) == sorted(PINS['androidArtifacts'][vendor], key=lambda d: (d['coordinate'], d['sha256'])), f'{vendor} resolved native artifact graph/hash differs')
        signer = android_metadata(Path(row['signing']).read_text(), Path(row['badging']).read_text())
        sdk = Path(environment(cfg).get('ANDROID_HOME', ''))
        signing_tool = sdk / 'build-tools/36.0.0/apksigner'
        badging_tool = sdk / 'build-tools/36.0.0/aapt2'
        require(signing_tool.is_file() and badging_tool.is_file(), 'Android build-tools 36.0.0 required for actual APK verification')
        actual_signing = subprocess.check_output([str(signing_tool), 'verify', '--verbose', '--print-certs', row['artifact']], env=environment(cfg), text=True)
        actual_badging = subprocess.check_output([str(badging_tool), 'dump', 'badging', row['artifact']], env=environment(cfg), text=True)
        require(android_metadata(actual_signing, actual_badging) == signer, 'actual signer differs from retained certificate proof')
        value = apk_measure(row['artifact'], row['mapping'], vendor)
        value['signerSha256'] = signer
        value['r8'] = r8
        files += [row[k] for k in ('artifact', 'mapping', 'r8Configuration', 'dependencies', 'signing', 'badging')]
    else:
        if row.get('appFileManifest'):
            verify_app_manifest(row['artifact'], row['appFileManifest'], row['expectedAppManifestSha256'])
            files.append(row['appFileManifest'])
        value = app_measure(row['artifact'], row['symbols'], row['maps'], vendor)
        files += [*row['symbols'], *row['maps']]
        files += [str(Path(row['artifact']) / f['path']) for f in manifest(row['artifact'])]
    if row.get('buildRecord'):
        files.append(row['buildRecord'])
    return {**value, 'settings': settings, 'files': bind_files(files)}


def collect(cfg, retained=None, partial=False):
    root = root_for(cfg)
    require(not (root / 'evidence.json').exists(), 'do not overwrite collected evidence; use a fresh output')
    preflight(cfg)
    if retained:
        source = read(retained)
        require(source.get('schemaVersion') == 1 and source.get('origin') == 'retained-artifacts', 'unsupported retained descriptor')
        descriptors = source['apps']
        require(all(row['profile'] in selected_profiles(cfg) for row in descriptors), 'retained descriptor profile outside sizeProfiles selection')
    else:
        descriptors = []
        for profile in selected_profiles(cfg):
            for vendor in VENDORS:
                if partial and not (out_for(cfg, profile, vendor) / 'build-complete.json').exists():
                    continue
                descriptors.append(descriptor(cfg, profile, vendor))
    measurements = []
    for profile in selected_profiles(cfg):
        cohort = [row for row in descriptors if row['profile'] == profile]
        if not cohort:
            continue
        baseline = next((row for row in cohort if row['vendor'] == 'baseline'), None)
        require(baseline, f'missing baseline for {profile}')
        common = common_inputs(Path(baseline['host']), 'android' if profile in ANDROID_PROFILES else 'ios')
        base_settings = read(baseline['settings'])
        cohort_hash = digest({'profile': profile, 'commonInputs': common, 'settings': check_settings(profile, base_settings), 'inputs': validate_inputs(cfg)})
        for row in cohort:
            host = Path(row['host'])
            require(common_inputs(host, 'android' if profile in ANDROID_PROFILES else 'ios') == common, f'{row["vendor"]} common host parity mismatch')
            value = measure_descriptor(row, cfg)
            check_settings(profile, value['settings'], base_settings)
            if retained:
                # Import requires an independently supplied artifact hash, never copied numeric results.
                require(value['artifactSha256'] == row.get('expectedArtifactSha256'), 'retained artifact hash mismatch')
                require(profile in ANDROID_PROFILES or row.get('appFileManifest'), 'retained iOS import requires frozen app-file manifest')
                verify_archive_for_retained(cfg, row)
            common_files = bind_files(host / name for name in common)
            measurements.append({**value, 'profile': profile, 'vendor': row['vendor'], 'status': 'measured', 'cohort': cohort_hash,
                                 'descriptor': row, 'commonFiles': common_files})
        if profile in ANDROID_PROFILES:
            signers = {row['signerSha256'] for row in measurements if row['profile'] == profile}
            require(len(signers) == 1, 'actual APK signing certificate mismatch')
    measurements = size_rows(measurements, complete=not partial, profiles=selected_profiles(cfg))
    evidence = {'schemaVersion': 1, 'origin': 'retained-artifacts' if retained else 'fresh-builds', 'complete': not partial, 'profiles': list(selected_profiles(cfg)),
                'inputs': validate_inputs(cfg), 'pinsSha256': sha(HERE / 'pins.json'), 'measurements': measurements}
    write(root / 'evidence.json', evidence)
    verify(cfg)
    print('Collected', len(measurements), 'apps into', root / 'evidence.json')


def verify_archive_for_retained(cfg, row):
    vendor = row['vendor']
    host = Path(row['host'])
    if row['profile'] not in ANDROID_PROFILES:
        verify_pods(cfg, host, vendor)
    if vendor == 'baseline':
        return
    package = '@c15t/react-native' if vendor == 'c15t' else next(r['package'] for r in PINS['wrappers'] if r['name'] == vendor)
    if vendor == 'c15t':
        archive = Path(cfg['archive'])
    else:
        pin = next(r for r in PINS['wrappers'] if r['name'] == vendor)
        archive = Path(row['wrapperArchive'])
        require(sha(archive) == pin['tarballSha256'], 'retained wrapper archive hash mismatch')
    verify_archive(archive, host / 'node_modules' / package, generated_roots=WRAPPER_BUILD_OUTPUTS[vendor])


def verify(cfg):
    evidence = read(root_for(cfg) / 'evidence.json')
    require(evidence['schemaVersion'] == 1 and evidence['inputs'] == validate_inputs(cfg) and evidence['pinsSha256'] == sha(HERE / 'pins.json'), 'evidence input provenance mismatch')
    checked = []
    for row in evidence['measurements']:
        verify_files(row['files'])
        verify_files(row['commonFiles'])
        if evidence['origin'] == 'retained-artifacts':
            require(row['profile'] in ANDROID_PROFILES or row['descriptor'].get('appFileManifest'), 'missing frozen iOS app manifest')
            verify_archive_for_retained(cfg, row['descriptor'])
        else:
            require(descriptor(cfg, row['profile'], row['vendor']) == row['descriptor'], 'stale build descriptor')
        actual = measure_descriptor(row['descriptor'], cfg)
        for key in actual:
            require(actual[key] == row[key], f'forged/stale measurement: {row["vendor"]}/{key}')
        checked.append(row)
    recalculated = size_rows(checked, complete=evidence['complete'], profiles=evidence.get('profiles', DEFAULT_PROFILES))
    require(recalculated == checked, 'size delta arithmetic changed')
    # Rebuild the cohort proof from real files, rather than trusting its label.
    for profile in evidence.get('profiles', DEFAULT_PROFILES):
        group = [r for r in checked if r['profile'] == profile]
        if not group:
            continue
        base = next(r for r in group if r['vendor'] == 'baseline')
        common = common_inputs(Path(base['descriptor']['host']), 'android' if profile in ANDROID_PROFILES else 'ios')
        expected = digest({'profile': profile, 'commonInputs': common, 'settings': check_settings(profile, base['settings']), 'inputs': evidence['inputs']})
        for row in group:
            require(row['cohort'] == expected and common_inputs(Path(row['descriptor']['host']), 'android' if profile in ANDROID_PROFILES else 'ios') == common, 'forged host parity evidence')
            check_settings(profile, row['settings'], base['settings'])
        if profile in ANDROID_PROFILES:
            require(len({r['signerSha256'] for r in group}) == 1, 'forged signing parity')
    return evidence


def report(cfg):
    evidence = verify(cfg)
    complete = evidence['complete']
    warnings = [] if complete else ['Incomplete cohort. Do not treat these measurements as a complete benchmark.']
    heading = '# Mobile CMP app bytes' + ('' if complete else ' (incomplete cohort)')
    lines = [heading, '']
    for warning in warnings:
        lines += [f'> {warning}', '']
    lines += ['This report counts signed APK files and regular-file lengths in unsigned arm64 .app bundles. It does not estimate store downloads.', '', '| Profile | SDK | App bytes | Added bytes |', '| --- | --- | ---: | ---: |']
    for row in evidence['measurements']:
        lines.append(f'| {row["profile"]} | {row["vendor"]} | {row["bytes"]:,} | {row["addedBytes"]:,} |')
    lines += ['', 'Runtime results require separate validated raw samples. Size retention does not prove usable tenant configuration. Sourcepoint stock UI uses WebView on both platforms.', '']
    path = root_for(cfg) / 'report.md'
    path.write_text('\n'.join(lines))
    extensions = []
    for name, target in cfg.get('extensions', {}).items():
        require(read(target).get('schemaVersion') == 1, f'unsupported extension schema: {name}')
        extensions.append({'name': name, **bind_files([target])[0]})
    write(root_for(cfg) / 'report.json', {'schemaVersion': 1, 'complete': complete, 'warnings': warnings, 'extensions': extensions, 'evidenceSha256': sha(root_for(cfg) / 'evidence.json'), 'measurements': [{k: r[k] for k in ('profile', 'vendor', 'status', 'bytes', 'addedBytes', 'artifactSha256')} for r in evidence['measurements']]})
    print(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=['plan', 'preflight', 'prepare', 'build', 'collect', 'verify', 'report', 'runtime'])
    parser.add_argument('--config', required=True)
    parser.add_argument('--platform', choices=['android', 'ios'])
    parser.add_argument('--vendor', choices=VENDORS)
    parser.add_argument('--profile', choices=PROFILES)
    parser.add_argument('--retained', help='JSON descriptors for read-only recollection of existing artifacts')
    parser.add_argument('--partial', action='store_true', help='explicit incomplete cohort, still requires a matched baseline')
    parser.add_argument('--runtime-build', action='store_true')
    parser.add_argument('--action', choices=['preflight', 'schedule', 'sample', 'verify'], default='preflight')
    parser.add_argument('--locked', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    cfg = config(args.config)
    if args.stage in ('prepare', 'build') or (args.stage == 'runtime' and args.action == 'sample'):
        if not args.locked:
            return lock_command(cfg, args.stage, sys.argv[1:])
    if args.stage in ('plan', 'preflight'):
        import json
        print(json.dumps(plan(cfg) if args.stage == 'plan' else preflight(cfg, args.platform, tools=bool(args.platform)), indent=2))
    elif args.stage == 'prepare':
        require(args.platform and args.vendor, 'prepare requires --platform and --vendor')
        prepare(cfg, args.platform, args.vendor, args.runtime_build, args.profile)
    elif args.stage == 'build':
        require(args.profile and args.vendor, 'build requires --profile and --vendor')
        build(cfg, args.profile, args.vendor, args.runtime_build)
    elif args.stage == 'collect':
        collect(cfg, args.retained, args.partial)
    elif args.stage == 'verify':
        print('Verified', len(verify(cfg)['measurements']), 'app measurements')
    elif args.stage == 'report':
        report(cfg)
    elif args.stage == 'runtime':
        import runtime
        runtime.run(cfg, args.action)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError) as error:
        print('Blocked:', error, file=sys.stderr)
        sys.exit(1)
