"""Artifact readers and evidence checks. Python standard library only."""
import hashlib
import json
import math
import os
from pathlib import Path
import plistlib
import re
import struct
import tarfile
import zipfile

HERE = Path(__file__).resolve().parent
VENDORS = ('baseline', 'c15t', 'onetrust', 'didomi', 'usercentrics', 'sourcepoint')
PROFILES = ('android-release', 'ios-local', 'ios-postprocessed')
PREFIXES = {
    'c15t': ('com.c15t.core.', 'com.c15t.android.', 'com.c15t.consentui.', 'com.c15t.reactnative.'),
    'onetrust': ('com.onetrust.',), 'didomi': ('io.didomi.',),
    'usercentrics': ('com.usercentrics.',), 'sourcepoint': ('com.sourcepoint.',),
}
SYMBOLS = {
    'c15t': ('C15tReactNativeModule', 'isAllowed|snapshot', 'presentPreferences'),
    'onetrust': ('OneTrust', 'getConsentStatusForCategory', 'showPreferenceCenterUI'),
    'didomi': ('RNDidomi', 'getCurrentUserStatus', 'showPreferences'),
    'usercentrics': ('RNUsercentrics', 'getConsents', 'showSecondLayer'),
    'sourcepoint': ('ReactNativeCmp', 'getUserData', 'loadGDPRPrivacyManager'),
}
ANDROID_SETTINGS = {
    'gradleVersion': '9.3.1', 'agpVersion': 'Android Gradle Plugin version 8.12.0',
    'javaVersion': '17.0.20', 'applicationId': 'com.c15t.expodev', 'minSdk': '24',
    'targetSdk': '36', 'compileSdk': '36', 'buildTools': '36.0.0',
    'ndkVersion': '27.1.12297006', 'minifyEnabled': True, 'shrinkResources': True,
    'hermesEnabled': 'true', 'newArchEnabled': 'true', 'architectures': 'arm64-v8a',
    'jniLegacyPackaging': False,
}
IOS_SETTINGS = {
    'ARCHS': 'arm64', 'SDK_VERSION': '27.1', 'PLATFORM_NAME': 'iphoneos',
    'IPHONEOS_DEPLOYMENT_TARGET': '16.4', 'SWIFT_OPTIMIZATION_LEVEL': '-O',
    'GCC_OPTIMIZATION_LEVEL': 's', 'DEAD_CODE_STRIPPING': 'YES',
    'STRIP_INSTALLED_PRODUCT': 'YES', 'STRIP_STYLE': 'all', 'COPY_PHASE_STRIP': 'YES',
    'DEBUG_INFORMATION_FORMAT': 'dwarf-with-dsym', 'CODE_SIGNING_ALLOWED': 'NO',
    'CODE_SIGNING_REQUIRED': 'NO',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def manifest(root, exclude=()):
    root = Path(root)
    rows = []
    for directory, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in exclude)
        for name in sorted(files):
            path = Path(directory) / name
            if path.is_file() and not path.is_symlink():
                rows.append({'path': path.relative_to(root).as_posix(), 'bytes': path.stat().st_size, 'sha256': sha(path)})
    return sorted(rows, key=lambda row: row['path'])


def bind_files(paths):
    return [{'path': str(Path(p).resolve()), 'sha256': sha(p), 'bytes': Path(p).stat().st_size} for p in paths]


def verify_files(rows):
    require(bool(rows), 'empty evidence file set')
    for row in rows:
        path = Path(row['path'])
        require(path.is_file() and not path.is_symlink(), f'missing regular evidence file: {path}')
        require(path.stat().st_size == row['bytes'] and sha(path) == row['sha256'], f'changed evidence: {path}')


def verify_archive(archive, installed):
    """Compare every packaged regular file, including native sources, after install."""
    count = 0
    with tarfile.open(archive) as handle:
        for member in handle:
            relative = Path(member.name)
            require(relative.parts and relative.parts[0] == 'package' and '..' not in relative.parts, 'unsafe npm archive member')
            if member.isfile():
                target = Path(installed) / Path(*relative.parts[1:])
                require(target.is_file() and not target.is_symlink() and target.read_bytes() == handle.extractfile(member).read(), f'archive-installed mismatch: {relative}')
                count += 1
    require(count > 0, 'empty npm archive')
    return count


def dex_classes(data):
    require(data[:4] == b'dex\n', 'invalid DEX header')
    def u32(offset):
        return struct.unpack_from('<I', data, offset)[0]
    strings = []
    for index in range(u32(56)):
        offset = u32(u32(60) + index * 4)
        while data[offset] & 128:
            offset += 1
        offset += 1
        strings.append(data[offset:data.index(0, offset)].decode('utf-8', errors='replace'))
    types = [strings[u32(u32(68) + index * 4)] for index in range(u32(64))]
    return {types[u32(u32(100) + index * 32)] for index in range(u32(96))}


def apk_measure(apk, mapping, vendor):
    require(vendor in VENDORS, f'unsupported app: {vendor}')
    groups = {}
    classes = set()
    entries = []
    with zipfile.ZipFile(apk) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)), 'duplicate APK entries')
        require('AndroidManifest.xml' in names, 'APK lacks Android manifest')
        bundle = archive.read('assets/index.android.bundle')
        require(bundle[:4] == bytes.fromhex('c61fbc03'), 'APK bundle is not Hermes')
        for item in archive.infolist():
            if item.is_dir():
                continue
            name = item.filename
            group = ('dex' if re.fullmatch(r'classes\d*\.dex', name) else
                     'nativeLibraries' if name.startswith('lib/') else
                     'javascript' if name == 'assets/index.android.bundle' else
                     'resources' if name.startswith('res/') or name == 'resources.arsc' else 'other')
            row = groups.setdefault(group, {'compressedBytes': 0, 'uncompressedBytes': 0})
            row['compressedBytes'] += item.compress_size
            row['uncompressedBytes'] += item.file_size
            entries.append({'path': name, 'compressedBytes': item.compress_size, 'bytes': item.file_size})
            if group == 'dex':
                classes |= dex_classes(archive.read(item))
            if name.startswith('lib/'):
                require(name.startswith('lib/arm64-v8a/'), f'non-arm64 native library: {name}')
    require(classes, 'APK lacks DEX classes')
    retained = {}
    if vendor != 'baseline':
        mapping_text = Path(mapping).read_text()
        mapped = dict(re.findall(r'^([^ #\s].*) -> ([^\s]+):$', mapping_text, re.M))
        retained = {a: b for a, b in mapped.items() if a.startswith(PREFIXES[vendor]) and 'L' + b.replace('.', '/') + ';' in classes}
        require(retained, f'no retained {vendor} R8 destinations in actual DEX')
        # The mounted stock action must also survive JS compilation.
        require(SYMBOLS[vendor][-1].encode() in bundle, f'{vendor} stock action absent from Hermes')
    else:
        all_prefixes = tuple('L' + p.replace('.', '/') for values in PREFIXES.values() for p in values)
        require(not any(name.startswith(all_prefixes) for name in classes), 'baseline contains an SDK')
    compressed = sum(row['compressedBytes'] for row in groups.values())
    return {'bytes': Path(apk).stat().st_size, 'artifactSha256': sha(apk), 'groups': groups,
            'compressedPayloadBytes': compressed, 'zipAndSigningOverheadBytes': Path(apk).stat().st_size - compressed,
            'uncompressedPayloadBytes': sum(row['uncompressedBytes'] for row in groups.values()),
            'sdkUniqueDexDestinations': len(set(retained.values())), 'dexClasses': len(classes)}


def device_macho(data):
    require(len(data) >= 32 and data[:4] == b'\xcf\xfa\xed\xfe' and struct.unpack_from('<I', data, 4)[0] == 0x100000c, 'expected thin arm64 Mach-O')
    count, command_bytes = struct.unpack_from('<II', data, 16)
    end = 32 + command_bytes
    require(end <= len(data), 'truncated Mach-O load commands')
    offset = 32
    platforms = []
    legacy_ios = False
    for _ in range(count):
        require(offset + 8 <= end, 'missing Mach-O load command')
        command, size = struct.unpack_from('<II', data, offset)
        require(size >= 8 and offset + size <= end, 'invalid Mach-O load command')
        if command == 0x32:
            require(size >= 24, 'truncated LC_BUILD_VERSION')
            platforms.append(struct.unpack_from('<I', data, offset + 8)[0])
        elif command == 0x25:
            require(size >= 16, 'truncated LC_VERSION_MIN_IPHONEOS')
            legacy_ios = True
        offset += size
    require(offset == end and (platforms == [2] or (not platforms and legacy_ios)), 'Mach-O is not an iOS device binary')


def app_measure(app, symbols, maps, vendor):
    app = Path(app)
    require(app.is_dir() and app.suffix == '.app' and not app.is_symlink(), f'missing regular .app: {app}')
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    require(info['CFBundleIdentifier'] == 'com.c15t.expodev', 'unexpected bundle identifier')
    require(info.get('DTPlatformName') == 'iphoneos' and info.get('CFBundleSupportedPlatforms') == ['iPhoneOS'], 'expected iOS device app, not simulator')
    executable = info['CFBundleExecutable']
    require(Path(executable).name == executable, 'invalid executable path')
    binary = app / executable
    data = binary.read_bytes()
    device_macho(data)
    bundle = (app / 'main.jsbundle').read_bytes()
    require(bundle[:4] == bytes.fromhex('c61fbc03'), 'iOS bundle is not Hermes')
    files = manifest(app)
    groups = {'executable': 0, 'frameworks': 0, 'javascript': 0, 'resources': 0}
    for row in files:
        name = row['path']
        if name.startswith('Frameworks/'):
            embedded = (app / name).read_bytes()
            if embedded[:4] in (b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf', b'\xce\xfa\xed\xfe', b'\xfe\xed\xfa\xce', b'\xca\xfe\xba\xbe', b'\xbe\xba\xfe\xca', b'\xca\xfe\xba\xbf', b'\xbf\xba\xfe\xca'):
                device_macho(embedded)
        group = 'executable' if name == executable else 'frameworks' if name.startswith('Frameworks/') else 'javascript' if name == 'main.jsbundle' else 'resources'
        groups[group] += row['bytes']
    haystack = '\n'.join(Path(path).read_text(errors='replace') for path in [*symbols, *maps])
    if vendor != 'baseline':
        require(maps, 'missing link map')
        for pattern in SYMBOLS[vendor]:
            require(re.search(pattern, haystack), f'{vendor} native symbol/action absent: {pattern}')
        require(SYMBOLS[vendor][-1].encode() in bundle, f'{vendor} stock action absent from Hermes')
    else:
        require(not re.search('C15tReactNativeModule|OTPublishersHeadlessSDK|RNDidomi|RNUsercentrics|SPMobileCore|SPConsentManager', haystack), 'baseline contains SDK symbols')
    return {'bytes': sum(row['bytes'] for row in files), 'artifactSha256': sha(binary),
            'appManifestSha256': digest(files), 'groups': groups, 'fileCount': len(files)}


def check_settings(profile, settings, baseline=None):
    require(profile in PROFILES, f'unsupported profile: {profile}')
    expected = dict(ANDROID_SETTINGS if profile == 'android-release' else IOS_SETTINGS)
    if profile != 'android-release':
        expected['DEPLOYMENT_POSTPROCESSING'] = 'YES' if profile == 'ios-postprocessed' else 'NO'
    for key, value in expected.items():
        require(settings.get(key) == value and type(settings.get(key)) is type(value), f'{profile} setting mismatch: {key}: {settings.get(key)!r}, expected {value!r}')
    if baseline is not None and profile == 'android-release':
        for key in ['signingStoreSha256', 'signingAlias']:
            require(settings.get(key) and settings[key] == baseline.get(key), f'unmatched signing: {key}')
    return {key: settings[key] for key in expected}


def size_rows(measurements, complete=True):
    require(len({(row['profile'], row['vendor']) for row in measurements}) == len(measurements), 'duplicate app measurement')
    indexed = {(row['profile'], row['vendor']): row for row in measurements}
    if complete:
        require(set(indexed) == {(p, v) for p in PROFILES for v in VENDORS}, 'expected all 18 app measurements')
    rows = []
    for row in measurements:
        require(row['profile'] in PROFILES and row['vendor'] in VENDORS, 'unsupported measurement')
        require(row.get('status') == 'measured', 'missing/error measurement cannot become zero')
        require(type(row.get('bytes')) is int and row['bytes'] > 0, 'invalid app byte count')
        base = indexed.get((row['profile'], 'baseline'))
        require(base and type(base.get('bytes')) is int and base['bytes'] > 0, 'missing matched baseline')
        require(row.get('cohort') and row['cohort'] == base.get('cohort'), 'host/cohort parity mismatch')
        rows.append({**row, 'addedBytes': row['bytes'] - base['bytes']})
    return rows


def percentile(values, fraction):
    require(0 < fraction <= 1, 'invalid percentile')
    require(all(type(v) in (int, float) and math.isfinite(v) and v > 0 for v in values), 'invalid timing value')
    return sorted(values)[math.ceil(fraction * len(values)) - 1] if values else None


def android_metadata(signing, badging):
    require('Verifies' in signing and 'Number of signers: 1' in signing, 'APK signature verification did not pass')
    certificates = re.findall(r'(?:Signer #\d+|V2 Signer:) certificate SHA-256 digest: ([a-fA-F0-9]{64})', signing)
    require(len(certificates) == 1, 'missing/ambiguous verified APK signer')
    require("package: name='com.c15t.expodev'" in badging and re.search(r"(?:minSdkVersion|sdkVersion):'24'", badging)
            and "targetSdkVersion:'36'" in badging and "compileSdkVersion='36'" in badging
            and re.search(r"^native-code: 'arm64-v8a'$", badging, re.M), 'actual APK badging differs from profile')
    return certificates[0].lower()


def verify_app_manifest(app, manifest_path, expected_sha256):
    require(sha(manifest_path) == expected_sha256, 'retained app-file manifest hash mismatch')
    rows = read(manifest_path)
    expected = sorted([{key: row[key] for key in ('path', 'bytes', 'sha256')} for row in rows if row['kind'] == 'file'], key=lambda row: row['path'])
    require(manifest(app) == expected, 'retained .app files differ from frozen manifest')
