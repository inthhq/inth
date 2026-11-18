#!/usr/bin/env python3
"""Verify captured expiry receipts from the actual Release app journey."""
import hashlib,json,pathlib,sys
out=pathlib.Path(sys.argv[1])
optional=['functionality','experience','measurement','marketing']
events=[json.loads(x) for x in (out/'events.jsonl').read_text().splitlines()]
native=[e['body'] for e in events if e['path']=='/e2e/native']
attempts=[json.loads(x) for x in (out/'delivery-attempts.jsonl').read_text().splitlines()]
resource=json.loads(json.loads((out/'policy-assets/inth-policy.json').read_text())['payload'])
expiry=resource['expiresAt']
def values(n): return n['snapshot']['explicitChoice']['categories'] if n['snapshot']['explicitChoice'] else {}
def denial(n): return all(values(n).get(c,{}).get('value') is False and n['gates'][c] is False for c in optional)
all_grants=[n for n in native if all(values(n).get(c,{}).get('value') is True for c in optional)]
assert all_grants
narrowed=[n for n in all_grants if n['snapshot']['consentCategories']==['necessary','measurement'] and not n['snapshot']['policyPending']]
assert narrowed and narrowed[0]['process'] != all_grants[0]['process']
boundary=[n for n in native if n['clock']==expiry and n['snapshot']['evaluatedAt']==expiry and n['snapshot']['policyPending'] and all(values(n).get(c,{}).get('value') is True for c in optional)]
assert boundary
withdrawals=[n for n in native if denial(n)]
assert len({n['process'] for n in withdrawals if n['snapshot']['policyPending']})>=2
for n in withdrawals:
 assert all(values(n)[c]['confirmedAt']==expiry for c in optional)
live=[x for x in attempts if x['online']]
assert len(live)==1 and live[0]['body']['consentAction']=='necessary'
offline=[x for x in attempts if not x['online'] and x['body']['consentAction']=='necessary']
assert offline and live[0]['rawHex']==offline[0]['rawHex']
assert all(x['body']['consentAction']!='all' for x in live)
restored=[n for n in withdrawals if not n['snapshot']['policyPending'] and len(n['snapshot']['consentCategories'])==5]
assert restored
assert restored[-1]['snapshot']['resolution']['fingerprint']==all_grants[0]['snapshot']['resolution']['fingerprint']
assert live[0]['body']['answer']['categories']=={c:r for c,r in restored[-1]['snapshot']['explicitChoice']['categories'].items() if c!='necessary'}
result={'passed':True,'expiresAt':expiry,'issuedAt':resource['issuedAt'],'earlierAllProcesses':sorted({n['process'] for n in all_grants}), 'narrowedProcesses':sorted({n['process'] for n in narrowed}), 'denialProcesses':sorted({n['process'] for n in withdrawals}), 'exactBoundaryReadings':len(boundary), 'deniedReadings':len(withdrawals), 'acceptedProtocolDeliveries':len(live),'offlineDenialAttempts':len(offline), 'exactReplayBodySha256':hashlib.sha256(bytes.fromhex(live[0]['rawHex'])).hexdigest(), 'sameFingerprint':restored[-1]['snapshot']['resolution']['fingerprint'], 'liveHostedReceiptAcceptance':False}
(out/'expiry-verification.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
