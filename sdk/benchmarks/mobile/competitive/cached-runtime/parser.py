"""Pinned cached-policy proof and native marker reader. No device access."""
import datetime
import json
import re

NAMES = ('c15t', 'didomi', 'usercentrics', 'sourcepoint')
TARGETS = {'c15t': 'measurement', 'didomi': 'cookies', 'usercentrics': '9V8bg4D63'}
TRANSPORT = r'Unable to resolve host|No address associated|ENETUNREACH|Network is unreachable|Failed to connect|Connection refused'


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def epoch(value):
    if type(value) in (int, float):
        return value
    stamp = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(stamp.tzinfo is not None, 'epoch requires timezone')
    return stamp.timestamp() * 1000


def validate(name, payload, captured_epoch_ms, calibration=None, settings=None):
    """Check authority at capture time, never at the date of a later replay."""
    require(type(captured_epoch_ms) in (int, float) and captured_epoch_ms > 0, 'missing capture epoch')
    require(name in NAMES and payload.get('valid') is True, 'fixture not ready')
    raw, target = payload['raw'], payload['targetId']
    settings = settings or {}
    expected = settings.get('target', TARGETS.get(name))
    require(isinstance(target, str) and target and (expected is None or target == expected), 'wrong configured target')
    errors = []
    if name == 'c15t':
        require(raw['ready'] is True and raw['policyPending'] is False, 'policy pending or not ready')
        resolution = raw['resolution']
        require(resolution['status'] == 'matched' and resolution['policyId'] and resolution['fingerprint'], 'unresolved policy')
        require(raw['promptRequirement']['kind'] == 'none' and raw['nextDeadline'] > captured_epoch_ms, 'collection required or expired')
        require(target in raw['consentCategories'] and raw['effectivePermissions'][target] is False, 'gate not denied')
        choice = raw['explicitChoice']['categories'][target]
        require(choice['value'] is False and type(choice['confirmedAt']) is int and 0 < choice['confirmedAt'] <= captured_epoch_ms and choice['basis'], 'no explicit choice')
        require('explicit-denial' in raw['restrictions'][target], 'denial not authoritative')
        error = raw['error']
        if error is not None:
            require(error.get('code') == 'transport' and re.search(TRANSPORT, error.get('message', ''), re.I), 'unknown or non-transport error')
            errors.append(error)
        denial = {'confirmedAt': choice['confirmedAt'], 'basis': choice['basis'], 'policyId': resolution['policyId'], 'policyFingerprint': resolution['fingerprint']}
    elif name == 'didomi':
        require(raw.get('error') is None and not raw.get('errors') and raw['shouldUserStatusBeCollected'] is False, 'collection or SDK failure')
        status = raw['currentUserStatus']
        purpose = status['purposes'][target]
        require(target in raw['requiredPurposeIds'] and purpose['id'] == target and purpose['enabled'] is False, 'purpose not denied')
        require(status['consent_string'] and 0 < epoch(status['updated']) <= captured_epoch_ms, 'missing or future status')
        denial = {'updated': status['updated'], 'consentString': status['consent_string']}
    elif name == 'usercentrics':
        require(raw.get('error') is None and not raw.get('errors') and raw['shouldCollectConsent'] is False, 'collection or SDK failure')
        services = [s for s in raw['consents'] if s['templateId'] == target]
        require(len(services) == 1, 'missing or duplicate target')
        service = services[0]
        require(service['isEssential'] is False and service['status'] is False and type(service['type']) is int and service['type'] == 0, 'not explicit optional denial')
        history = [h for h in service['history'] if h['status'] is False and type(h['type']) is int and h['type'] == 0 and type(h['timestampInMillis']) is int and -2**31 <= h['timestampInMillis'] < 2**31]
        require(history, 'no signed32 explicit denial history')
        denial = {'history': history}
    else:
        gdpr = raw['userData']['gdpr']
        require(gdpr['applies'] is True and gdpr['uuid'] and gdpr['euconsent'], 'no applicable consent')
        require(gdpr.get('expirationDate') is None or epoch(gdpr['expirationDate']) > captured_epoch_ms, 'expired public consent')
        require(gdpr['statuses']['rejectedAny'] is True and gdpr['statuses']['consentedAll'] is False, 'no rejected status')
        vendor, purpose = target.split(':')
        grant = gdpr['vendorGrants'][vendor]
        require(grant['granted'] is False and grant['purposes'][purpose] is False, 'API target not denied')
        cache = raw['cacheEvidence']
        stored, meta = cache['gdpr']['consents'], cache['gdpr']['metaData']
        web = json.loads(stored['webConsentPayload'])
        require(cache['accountId'] == settings.get('accountId', 22) and cache['propertyId'] == settings.get('propertyId', 16893), 'wrong cached configuration')
        require(stored['applies'] is True and stored['consentStatus']['hasConsentData'] is True and stored['consentStatus']['granularStatus']['defaultConsent'] is False, 'default or missing cached consent')
        require(stored['uuid'] == gdpr['uuid'] and stored['euconsent'] == gdpr['euconsent'] and stored['dateCreated'] == gdpr['createdDate'], 'cache/API identity mismatch')
        require(0 < epoch(stored['dateCreated']) <= captured_epoch_ms and web['euconsent'] == gdpr['euconsent'] and epoch(web['expirationDate']) > captured_epoch_ms, 'expired or mismatched cached payload')
        for grants in (stored['grants'], web['grants']):
            require(grants[vendor]['vendorGrant'] is False and grants[vendor]['purposeGrants'][purpose] is False, 'cached target not denied')
        require(meta['vendorListId'] and epoch(meta['legalBasisChangeDate']) <= epoch(stored['dateCreated']) and epoch(meta['additionsChangeDate']) <= epoch(stored['dateCreated']), 'policy invalidated after consent')
        for error in raw['refreshErrors']:
            require(error == {'name': 'NoInternetConnection', 'description': 'No Internet connection.'}, 'unknown Sourcepoint error class')
            errors.append(error)
        denial = {'uuid': gdpr['uuid'], 'euconsent': gdpr['euconsent'], 'createdDate': gdpr.get('createdDate'), 'expirationDate': gdpr.get('expirationDate'), 'vendor': vendor, 'purpose': purpose, 'grant': grant, 'cachedPolicy': meta, 'cachedExpirationDate': web['expirationDate']}
    if calibration is not None:
        require(target == calibration['targetId'] and denial == calibration['denial'], 'wrong saved decision')
    return {'targetId': target, 'denial': denial, 'refreshErrors': errors}


def events(text):
    rows = []
    for line in text.splitlines():
        if 'CMP_BENCH' not in line:
            continue
        match = re.search(r'\s(\d+)\s+\d+\s+I\s+CMP_BENCH\s*:\s*(\{.*)$', line)
        require(match is not None, 'malformed native marker')
        event = json.loads(match[2])
        require(type(event.get('pid')) is int and event['pid'] > 0 and event['pid'] == int(match[1]), 'logcat/native PID mismatch')
        rows.append(event)
    return rows


def snapshots(rows):
    groups = {}
    for event in rows:
        if event.get('event') != 'SNAPSHOT':
            continue
        require(type(event['sequence']) is int and event['sequence'] > 0, 'invalid sequence')
        groups.setdefault((event['pid'], event['sequence']), []).append(event)
    result = []
    for (pid, sequence), chunks in groups.items():
        parts = chunks[0]['parts']
        require(type(parts) is int and 1 <= parts <= 1000 and len(chunks) == parts and all(type(c['parts']) is int and c['parts'] == parts and type(c['part']) is int for c in chunks), 'incomplete/inconsistent chunks')
        require(sorted(c['part'] for c in chunks) == list(range(parts)), 'duplicate/missing chunks')
        result.append({'pid': pid, 'sequence': sequence, 'payload': json.loads(''.join(c['body'] for c in sorted(chunks, key=lambda c: c['part'])))})
    return result


def parse(text, name, calibration=None, profile='cold', *, captured_epoch_ms, settings=None):
    result = {'accepted': False, 'reason': None}
    try:
        require(profile in ('cold', 'warm'), 'unknown profile')
        rows = events(text)
        def one(kind):
            matches = [r for r in rows if r.get('event') == kind]
            require(len(matches) == 1, 'expected one ' + kind)
            return matches[0]
        def nanos(row, key='nanos'):
            require(isinstance(row[key], str) and re.fullmatch(r'[1-9]\d*', row[key]), 'invalid nanoseconds')
            return int(row[key])
        start = one('ATTACH_BASE_CONTEXT' if profile == 'cold' else 'ACTIVITY_RESUME')
        draw = one('READY_DRAW' if profile == 'cold' else 'WARM_DRAW')
        require(all(r['pid'] == start['pid'] for r in rows), 'mixed or stale process markers')
        require(rows.index(start) < rows.index(draw), 'reordered start/draw')
        began, ended = nanos(start), nanos(draw)
        elapsed = nanos(draw, 'elapsedNanos')
        require(began < ended and nanos(draw, 'startNanos') == began and elapsed == ended - began, 'marker arithmetic/order')
        require(elapsed <= (30 if profile == 'cold' else 10) * 10**9, 'native deadline exceeded')
        if profile == 'cold':
            layout = one('READY_LAYOUT')
            require(rows.index(start) < rows.index(layout) < rows.index(draw) and began < nanos(layout) <= ended, 'invalid cold layout')
        require(not any(r.get('event') == ('WARM_DRAW' if profile == 'cold' else 'READY_DRAW') for r in rows), 'mixed profile markers')
        chunks = [r for r in rows if r.get('event') == 'SNAPSHOT']
        require(chunks and all(rows.index(r) > rows.index(draw) for r in chunks), 'snapshot precedes draw')
        proofs = snapshots(rows)
        require(len(proofs) == 1 and proofs[0]['payload'].get('kind') == profile, 'expected one profile snapshot')
        payload = proofs[0]['payload']
        proof = validate(name, payload, captured_epoch_ms, calibration, settings)
        result.update(accepted=True, pid=start['pid'], snapshot=payload, elapsedNanos=elapsed, elapsedMs=elapsed / 1e6, **proof)
    except (ValueError, KeyError, TypeError, IndexError, OverflowError) as error:
        result['reason'] = str(error)
    return result


def denial_in_interval(name, proof, first, last):
    require(type(first) is int and type(last) is int and 0 < first <= last and last - first <= 300_000, 'invalid stock rejection bracket')
    denial = proof['denial']
    if name == 'c15t':
        valid = first <= denial['confirmedAt'] <= last
    elif name == 'didomi':
        valid = first // 1000 <= epoch(denial['updated']) // 1000 <= last // 1000
    elif name == 'sourcepoint':
        valid = first // 1000 <= epoch(denial['createdDate']) // 1000 <= last // 1000
    else:
        valid = any(first <= h['timestampInMillis'] + k * 2**32 <= last for h in denial['history'] for k in range(first // 2**32 - 1, last // 2**32 + 2))
    require(valid, 'saved decision outside actual stock rejection bracket')
