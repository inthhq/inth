"""Canonical cohort and read-only verification for fresh and recorded runs."""
import math
from pathlib import Path

from parser import NAMES, epoch, parse, require

PROFILE = 'authoritative-cached-policy-denial-v3'
CONSTANTS = {
    'protocol': PROFILE, 'timedAttemptsPerProfilePerSdk': 30,
    'cooldownSeconds': 1, 'backgroundSeconds': 2, 'coldDeadlineSeconds': 30,
    'warmDeadlineSeconds': 10, 'settlingSeconds': 15, 'postEndpointCaptureSeconds': .35,
    'coldEndpoint': 'Application.attachBaseContext to decor OnDraw after validated Ready layout',
    'warmEndpoint': 'Activity.onResume to decor OnDraw after fresh validated SDK read',
    'clock': 'SystemClock.elapsedRealtimeNanos', 'physicalDisplayFrame': False,
}


def attempts(names):
    require(names and list(names) == [n for n in NAMES if n in names], 'noncanonical participants')
    rows = []
    for round_index in range(30):
        offset = round_index % len(names)
        order = list(names[offset:]) + list(names[:offset])
        if (round_index // len(names)) % 2:
            order.reverse()
        for name in order:
            rows.append({'attempt': len(rows) + 1, 'round': round_index + 1, 'participant': name, 'profiles': ['cold', 'warm']})
    return rows


def percentile(values, fraction):
    return sorted(values)[math.ceil(fraction * len(values)) - 1] if values else None


def summary(rows, eligible):
    result = {}
    for profile in ('cold', 'warm'):
        result[profile] = {}
        for name in NAMES:
            own = [r for r in rows if r['participant'] == name and r['profile'] == profile]
            good = [r for r in own if r['accepted']]
            values = [r['elapsedMs'] for r in good]
            result[profile][name] = {
                'eligible': eligible[name], 'scheduled': 30 if eligible[name] else 0,
                'attempted': len(own), 'valid': len(good), 'failed': len(own) - len(good),
                'p50Ms': percentile(values, .5), 'p95Ms': percentile(values, .95),
                'samplesWithExposedRefreshError': sum(bool(r.get('refreshErrors')) for r in good),
                'failureReasons': [r['reason'] for r in own if not r['accepted']],
            }
    return result


def source_manifest():
    from core import HERE, sha
    own = HERE / 'cached-runtime'
    paths = [p for p in own.rglob('*') if p.is_file() and '__pycache__' not in p.parts]
    paths += [HERE / name for name in ('core.py', 'harness.py', 'pins.json', 'with-native-lock.py')]
    paths += [p for p in (HERE / 'fixtures').rglob('*') if p.is_file()]
    return {str(p.relative_to(HERE)): sha(p) for p in sorted(paths)}


def input_bindings(root):
    from core import read, sha
    paths = [root / 'prepared.json', root / 'builds.json', root / 'eligibility.json', root / 'device/ownership.json', root / 'device/fingerprint.json']
    for directory in ('calibration', 'offline', 'runtime/artifacts'):
        paths += [p for p in (root / directory).rglob('*') if p.is_file()]
    paths += [root / row['sourceMap'] for row in read(root / 'builds.json').values()]
    require(all(p.is_file() and not p.is_symlink() for p in paths), 'missing or symlinked frozen input')
    return {str(p.relative_to(root)): sha(p) for p in sorted(paths)}


def canonical_schedule(root):
    from core import read
    eligible = read(root / 'eligibility.json')
    require(set(eligible) == set(NAMES) and all(type(r['eligible']) is bool for r in eligible.values()), 'invalid eligibility')
    names = [n for n in NAMES if eligible[n]['eligible']]
    return {**CONSTANTS, 'schemaVersion': 1, 'attempts': attempts(names),
            'eligibility': {n: eligible[n]['eligible'] for n in NAMES},
            'device': read(root / 'device/fingerprint.json'),
            'builds': read(root / 'builds.json'), 'sources': source_manifest(),
            'inputs': input_bindings(root)}


def verify_schedule(schedule, expected):
    from core import digest
    require(digest(schedule) == digest(expected), 'schedule differs from canonical 30-round protocol or frozen inputs')


def verify_rows(root, schedule, rows, calibration, settings=None, historical=False):
    from core import sha
    require(len(rows) == 2 * len(schedule['attempts']), 'incomplete cohort, no replacements')
    last = {n: None for n in NAMES}
    checked = []
    for index, attempt in enumerate(schedule['attempts']):
        cold_pid = None
        for offset, profile in enumerate(('cold', 'warm')):
            row = rows[index * 2 + offset]
            require(all(row.get(k) == v for k, v in attempt.items()) and row['profile'] == profile, 'sample order differs from schedule')
            name = attempt['participant']
            path = root / 'samples' / ('%03d-%s' % (attempt['attempt'], name)) / (profile + '-logcat.txt')
            require(sha(path) == row['rawLogSha256'], 'raw log hash changed')
            captured = epoch(row['finishedUtc']) if historical else row.get('deviceEndEpochMs', 0)
            require(epoch(row['startedUtc']) <= epoch(row['finishedUtc']), 'invalid sample epoch bracket')
            parsed = parse(path.read_text(errors='replace'), name, calibration[name], profile, captured_epoch_ms=captured, settings=(settings or {}).get(name))
            accepted = parsed['accepted'] and row['completedWithinDeadline'] is True and row['actualPids'] == [str(parsed.get('pid'))]
            if not historical:
                stopped = row['allParticipantPidsAfterStop']
                require(set(stopped) == set(NAMES) and all(p == [] for p in stopped.values()), 'missing force-stop proof')
                if row.get('deviceStartEpochMs') is not None and captured:
                    require(row['deviceStartEpochMs'] <= captured and captured - row['deviceStartEpochMs'] <= 60_000, 'invalid device epoch bracket')
                else:
                    accepted = False
                accepted = accepted and row['launchExit'] == 0
            expected_pid = last[name] if profile == 'cold' else cold_pid
            accepted = accepted and parsed.get('pid') is not None and (parsed['pid'] != expected_pid if profile == 'cold' else parsed['pid'] == expected_pid)
            require(type(row['accepted']) is bool and row['accepted'] == accepted, 'forged acceptance or PID continuity')
            if accepted:
                require(row['elapsedNanos'] == parsed['elapsedNanos'] and row['elapsedMs'] == parsed['elapsedMs'] and row['denial'] == parsed['denial'], 'forged latency/decision')
            if profile == 'cold':
                cold_pid = parsed.get('pid')
                if cold_pid:
                    last[name] = cold_pid
            checked.append({**row, 'refreshErrors': parsed.get('refreshErrors', [])})
    return summary(checked, schedule['eligibility'])


def replay_completed(root):
    """The committed snapshot pins historical metadata, including sample epochs."""
    from core import HERE, read, sha
    snapshot = read(HERE / 'snapshots/2026-10-30-cached-runtime.json')
    require(sha(root / 'artifact-index.json') == snapshot['recordedEvidence']['artifactIndexSha256'], 'historical artifact index changed')
    index = {r['path']: r for r in read(root / 'artifact-index.json')['files']}
    def bound(relative):
        require(not Path(relative).is_absolute() and '..' not in Path(relative).parts, 'unsafe historical path')
        path = root / relative
        require(not path.is_symlink() and path.stat().st_size == index[relative]['bytes'] and sha(path) == index[relative]['sha256'], 'historical binding changed: ' + relative)
        return path
    schedule = read(bound('schedule.json'))
    require(sha(root / 'schedule.json') == snapshot['bindings']['schedule.json']['sha256'], 'historical schedule changed')
    require(schedule['protocol'] == PROFILE and schedule['attempts'] == attempts(list(NAMES)), 'invalid historical cohort')
    for key in ('cooldownSeconds', 'backgroundSeconds', 'coldDeadlineSeconds', 'warmDeadlineSeconds', 'settlingSeconds', 'postEndpointCaptureSeconds', 'timedAttemptsPerProfilePerSdk'):
        require(schedule[key] == CONSTANTS[key], 'modified historical timing constant')
    require(schedule['eligibility'] == dict.fromkeys(NAMES, True), 'modified historical eligibility')
    for relative, expected in schedule['inputs'].items():
        require(sha(bound(relative)) == expected, 'historical frozen input changed')
    for name, expected in schedule['apkSha256'].items():
        require(sha(bound('artifacts/' + name + '-release.apk')) == expected, 'historical APK changed')
    calibration = read(bound('calibration.json'))
    reported = read(bound('sample-results.json'))
    require(reported['scheduleSha256'] == sha(root / 'schedule.json'), 'wrong historical schedule binding')
    for row in reported['rows']:
        bound('samples/%03d-%s/%s-logcat.txt' % (row['attempt'], row['participant'], row['profile']))
    actual = verify_rows(root, schedule, reported['rows'], calibration, historical=True)
    for profile, values in actual.items():
        for name, cell in values.items():
            for key in ('attempted', 'valid', 'failed', 'p50Ms', 'p95Ms'):
                require(cell[key] == reported['summary'][profile][name][key] == snapshot['metrics'][profile][name][key], 'historical summary differs')
    return {'profileId': PROFILE, 'rawLogsReplayed': len(reported['rows']), 'clockAuthority': 'immutable sample finishedUtc, not replay wall clock', 'summary': actual}
