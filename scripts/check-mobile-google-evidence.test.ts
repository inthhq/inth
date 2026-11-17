import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { encodeAdditionalConsent } from '../packages/sdk/iab/src/tcf/additional-consent-codec';
import { getTCFCore } from '../packages/sdk/iab/src/tcf/lazy-load';
import {
	checkMobileGoogleEvidence,
	parseMobileGoogleEvidence,
	runEvidenceCLI,
} from './check-mobile-google-evidence';
import type { MobileGoogleEvidence } from './check-mobile-google-evidence';

const oracle = await getTCFCore();
type Model = InstanceType<typeof oracle.TCModel>;
const options = {
	cmpId: 490,
	requireAC: true,
	requireGoogle: true,
	scenario: 'decision',
} as const;

// SegmentEncoder is the reference encoder underneath TCString.encode. Using it
// directly also lets negative tests encode deliberately prohibited LI choices.
const encodedModel = function encodedModel(granted = false) {
	const model = new oracle.TCModel();
	model.cmpId = 490;
	model.cmpVersion = 7;
	model.publisherCountryCode = 'GB';
	model.vendorListVersion = 123;
	model.policyVersion = 5;
	model.isServiceSpecific = true;
	model.created = new Date('2026-11-02T00:00:00Z');
	model.lastUpdated = model.created;
	model.vendorsDisclosed.set([2, 755]);
	if (granted) {
		model.purposeConsents.set([1, 3, 4]);
		model.vendorConsents.set(755);
	}
	return model;
};

const bits = (
	vector: { maxId: number; has: (id: number) => boolean },
	width = vector.maxId
) =>
	Array.from({ length: width }, (_, i) => (vector.has(i + 1) ? '1' : '0')).join(
		''
	);

const decision = function decision(
	granted = false,
	modify?: (model: Model) => void,
	publisher = false
): MobileGoogleEvidence {
	const model = encodedModel(granted);
	modify?.(model);
	const segments = [oracle.Segment.CORE, oracle.Segment.VENDORS_DISCLOSED];
	if (publisher) {
		segments.push(oracle.Segment.PUBLISHER_TC);
	}
	const tcString = segments
		.map((segment) => oracle.SegmentEncoder.encode(model, segment))
		.join('.');
	const decoded = oracle.TCString.decode(tcString);
	const ac = encodeAdditionalConsent({
		consented: granted ? [35] : [],
		disclosed: [35, 42],
	});
	const numeric = {
		IABTCF_CmpSdkID: 490,
		IABTCF_CmpSdkVersion: 7,
		IABTCF_PolicyVersion: 5,
		IABTCF_PurposeOneTreatment: 0,
		IABTCF_UseNonStandardTexts: 0,
		IABTCF_gdprApplies: 1,
	};
	const textual: Record<string, string> = {
		IABTCF_AddtlConsent: ac,
		IABTCF_DisclosedVendors: bits(decoded.vendorsDisclosed),
		IABTCF_PublisherCC: 'GB',
		IABTCF_PurposeConsents: bits(decoded.purposeConsents, 24),
		IABTCF_PurposeLegitimateInterests: bits(
			decoded.purposeLegitimateInterests,
			24
		),
		IABTCF_SpecialFeaturesOptIns: bits(decoded.specialFeatureOptins, 12),
		IABTCF_TCString: tcString,
		IABTCF_VendorConsents: bits(decoded.vendorConsents),
		IABTCF_VendorLegitimateInterests: bits(decoded.vendorLegitimateInterests),
	};
	if (publisher) {
		Object.assign(textual, {
			IABTCF_PublisherConsent: bits(decoded.publisherConsents, 24),
			IABTCF_PublisherCustomPurposesConsents: bits(
				decoded.publisherCustomConsents,
				Number(decoded.numCustomPurposes)
			),
			IABTCF_PublisherCustomPurposesLegitimateInterests: bits(
				decoded.publisherCustomLegitimateInterests,
				Number(decoded.numCustomPurposes)
			),
			IABTCF_PublisherLegitimateInterests: bits(
				decoded.publisherLegitimateInterests,
				24
			),
		});
	}
	return {
		app: { build: '1', id: 'com.c15t.demo', version: '1.0' },
		capturedAtMs: Date.parse('2026-11-02T00:01:00Z'),
		configuration: {
			cmpId: 490,
			cmpVersion: 7,
			publisherCountry: 'GB',
			vendorIds: null,
		},
		core: {
			additionalConsent: ac,
			iabPolicy: true,
			policyPending: false,
			policyVersion: 5,
			tcString,
			vendorListVersion: 123,
		},
		disclosures: {
			adTechProviders: [
				{ id: 35, name: 'First', policyUrl: 'https://first.test/privacy' },
				{ id: 42, name: 'Second', policyUrl: 'https://second.test/privacy' },
			],
			additionalConsentStatus: 'fresh',
			googleVendor: {
				deleted: false,
				flexiblePurposes: [2, 7, 9, 10],
				id: 755,
				legIntPurposes: [2, 7, 9, 10],
				name: 'Google Advertising Products',
				purposes: [1, 3, 4],
			},
			iabStatus: 'fresh',
			policyVersion: 5,
			vendorListVersion: 123,
		},
		platform: 'ios',
		schemaVersion: 1,
		sdkVersion: '0.1.0',
		storage: [
			...Object.entries(numeric).map(([key, value]) => ({
				key,
				type: 'Int',
				value: String(value),
			})),
			...Object.entries(textual).map(([key, value]) => ({
				key,
				type: 'String',
				value,
			})),
		],
	};
};

const fresh = function fresh(): MobileGoogleEvidence {
	const evidence = decision();
	evidence.core.tcString = null;
	evidence.core.additionalConsent = null;
	evidence.core.vendorListVersion = null;
	evidence.core.policyVersion = null;
	evidence.storage = evidence.storage.filter((row) =>
		[
			'IABTCF_CmpSdkID',
			'IABTCF_CmpSdkVersion',
			'IABTCF_PolicyVersion',
			'IABTCF_gdprApplies',
		].includes(row.key)
	);
	return evidence;
};

const storageRow = function storageRow(
	evidence: MobileGoogleEvidence,
	key: string
) {
	const result = evidence.storage.find((item) => item.key === key);
	if (!result) {
		throw new Error('Test setup is missing a storage row.');
	}
	return result;
};

const replaceAC = function replaceAC(
	evidence: MobileGoogleEvidence,
	ac: string | null
) {
	evidence.core.additionalConsent = ac;
	if (ac === null) {
		evidence.storage = evidence.storage.filter(
			(item) => item.key !== 'IABTCF_AddtlConsent'
		);
	} else {
		storageRow(evidence, 'IABTCF_AddtlConsent').value = ac;
	}
};

describe('native Google signal observations', () => {
	it.each(['ios', 'android'] as const)(
		'checks a decoded deny decision without requiring any Google grant on %s',
		async (platform) => {
			const evidence = decision();
			evidence.platform = platform;
			expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
				'passed'
			);
		}
	);

	it('checks a reference-encoded choice and ACv2 with its purpose prerequisites', async () => {
		expect(
			(await checkMobileGoogleEvidence(decision(true), options)).status
		).toBe('passed');
	});

	it('accepts a complete fresh capture without manufacturing committed authority', async () => {
		expect(
			(
				await checkMobileGoogleEvidence(fresh(), {
					...options,
					scenario: 'fresh',
				})
			).status
		).toBe('passed');
	});

	it('keeps a pending first capture incomplete', async () => {
		const evidence = fresh();
		evidence.core.policyPending = true;
		evidence.disclosures.iabStatus = 'missing';
		evidence.disclosures.vendorListVersion = null;
		evidence.disclosures.policyVersion = null;
		const checked = await checkMobileGoogleEvidence(evidence, {
			cmpId: 490,
			scenario: 'fresh',
		});
		expect(checked.status).toBe('incomplete');
	});

	it.each(['reject', 'withdrawn'] as const)(
		'requires no grants after %s',
		async (scenario) => {
			expect(
				(await checkMobileGoogleEvidence(decision(), { ...options, scenario }))
					.status
			).toBe('passed');
			const checked = await checkMobileGoogleEvidence(decision(true), {
				...options,
				scenario,
			});
			expect(checked.status).toBe('failed');
			expect(checked.issues.join(' ')).toContain('no consent');
		}
	);

	it('refuses legitimate-interest-only grants after rejection or withdrawal', async () => {
		const evidence = decision(false, (model) => {
			model.purposeLegitimateInterests.set(2);
			model.vendorLegitimateInterests.set(755);
		});
		await Promise.all(
			(['reject', 'withdrawn'] as const).map(async (scenario) => {
				expect(
					(await checkMobileGoogleEvidence(evidence, { ...options, scenario }))
						.status
				).toBe('failed');
			})
		);
	});

	it('preserves declared all-zero and range-encoded vendor widths', async () => {
		const evidence = decision();
		const segments = evidence.core.tcString?.split('.') ?? [];
		const core = oracle.Base64Url.decode(segments[0] ?? '');
		const disclosed = oracle.Base64Url.decode(segments[1] ?? '');
		// TCF v2's fixed header ends at bit 213. The native storage bus must
		// retain MaxVendorId even when the oracle's Vector has no set IDs.
		const consent = `${oracle.IntEncoder.encode(755, 16)}0${'0'.repeat(755)}`;
		const li = `${oracle.IntEncoder.encode(755, 16)}1${oracle.IntEncoder.encode(0, 12)}`;
		const tcString = `${oracle.Base64Url.encode(core.slice(0, 213) + consent + li + core.slice(247))}.${oracle.Base64Url.encode(disclosed.slice(0, 3) + oracle.IntEncoder.encode(800, 16) + disclosed.slice(19))}`;
		evidence.core.tcString = tcString;
		storageRow(evidence, 'IABTCF_TCString').value = tcString;
		storageRow(evidence, 'IABTCF_VendorConsents').value = '0'.repeat(755);
		storageRow(evidence, 'IABTCF_VendorLegitimateInterests').value = '0'.repeat(
			755
		);
		storageRow(evidence, 'IABTCF_DisclosedVendors').value += '0'.repeat(45);
		expect(
			(
				await checkMobileGoogleEvidence(evidence, {
					...options,
					scenario: 'reject',
				})
			).status
		).toBe('passed');
		storageRow(evidence, 'IABTCF_VendorConsents').value = '';
		expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
			'failed'
		);
	});

	it('checks publisher segments and numbered restriction rows', async () => {
		const evidence = decision(
			false,
			(model) => {
				model.numCustomPurposes = 3;
				model.publisherConsents.set(2);
				model.publisherCustomConsents.set(1);
				model.publisherRestrictions.add(
					755,
					new oracle.PurposeRestriction(
						2,
						oracle.RestrictionType.REQUIRE_CONSENT
					)
				);
			},
			true
		);
		evidence.storage.push({
			key: 'IABTCF_PublisherRestrictions2',
			type: 'String',
			value: `${'_'.repeat(754)}1`,
		});
		expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
			'passed'
		);
		storageRow(evidence, 'IABTCF_PublisherCustomPurposesConsents').value =
			'000';
		expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
			'failed'
		);
		storageRow(evidence, 'IABTCF_PublisherCustomPurposesConsents').value =
			'100';
		storageRow(evidence, 'IABTCF_PublisherRestrictions2').value = '0';
		expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
			'failed'
		);
	});

	it('does not accept category policy or pending authority as a decision', async () => {
		await Promise.all(
			(['iabPolicy', 'policyPending'] as const).map(async (property) => {
				const evidence = decision();
				evidence.core[property] = property === 'policyPending';
				expect(
					(await checkMobileGoogleEvidence(evidence, options)).status
				).toBe('failed');
			})
		);
	});

	it.each(['Int', 'String', 'Bool', 'Boolean', 'Float', 'Long', 'Number'])(
		'does not coerce actual numeric-key type %s',
		async (type) => {
			const evidence = decision();
			storageRow(evidence, 'IABTCF_CmpSdkID').type = type;
			expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
				type === 'Int' ? 'passed' : 'failed'
			);
		}
	);

	it.each([
		'IABTCF_TCString',
		'IABTCF_AddtlConsent',
		'IABTCF_PurposeConsents',
		'IABTCF_DisclosedVendors',
	])('detects independent platform drift in %s', async (key) => {
		const evidence = decision();
		storageRow(evidence, key).value = key.endsWith('Consents')
			? '1'.repeat(24)
			: 'not-the-core-value';
		const checked = await checkMobileGoogleEvidence(evidence, options);
		expect(checked.status).toBe('failed');
		expect(checked.issues.join(' ')).toContain(key);
		expect(checked.issues.join(' ')).toContain('not atomic');
	});

	it('refuses a fixture identity even when core and bus agree with it', async () => {
		const evidence = decision(false, (model) => {
			model.cmpId = 53;
		});
		evidence.configuration.cmpId = 53;
		storageRow(evidence, 'IABTCF_CmpSdkID').value = '53';
		expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
			'failed'
		);
	});

	it.each(['cmpVersion', 'publisherCountry'] as const)(
		'binds decoded metadata to configured %s',
		async (key) => {
			const evidence = decision();
			if (key === 'cmpVersion') {
				evidence.configuration.cmpVersion = 8;
			} else {
				evidence.configuration.publisherCountry = 'FR';
			}
			expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
				'failed'
			);
		}
	);

	it.each(['core', 'disclosures'] as const)(
		'requires matching %s GVL and policy versions',
		async (source) => {
			const evidence = decision();
			evidence[source].vendorListVersion = 124;
			evidence[source].policyVersion = 6;
			expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
				'failed'
			);
		}
	);

	it('does not accept stale retained GVL bytes as current authority', async () => {
		const evidence = decision();
		evidence.disclosures.iabStatus = 'stale';
		expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
			'failed'
		);
	});

	it.each(['fresh', 'cached', 'offline'])(
		'accepts an explicitly usable retained status %s',
		async (status) => {
			const evidence = decision();
			evidence.disclosures.iabStatus = status;
			evidence.disclosures.additionalConsentStatus = status;
			expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
				'passed'
			);
		}
	);

	it('requires a real DisclosedVendors segment, including for a deny choice', async () => {
		const evidence = decision();
		evidence.core.tcString = evidence.core.tcString?.split('.')[0] ?? null;
		storageRow(evidence, 'IABTCF_TCString').value = evidence.core.tcString;
		const checked = await checkMobileGoogleEvidence(evidence, options);
		expect(checked.status).toBe('failed');
		expect(checked.issues.join(' ')).toContain('mandatory DisclosedVendors');
	});

	it('refuses undecodable or duplicate-segment TC data without logging it', async () => {
		await Promise.all(
			[
				'private-malformed-tc-string',
				`${decision().core.tcString}.${decision().core.tcString?.split('.')[1]}`,
			].map(async (tc) => {
				const evidence = decision();
				evidence.core.tcString = tc;
				storageRow(evidence, 'IABTCF_TCString').value = tc;
				const checked = await checkMobileGoogleEvidence(evidence, options);
				expect(checked.status).toBe('failed');
				expect(JSON.stringify(checked)).not.toContain(tc);
			})
		);
	});

	it('checks Google disclosure without inventing unknown legal basis declarations', async () => {
		const evidence = decision();
		if (!evidence.disclosures.googleVendor) {
			throw new Error('Test setup');
		}
		evidence.disclosures.googleVendor.name = null;
		evidence.disclosures.googleVendor.purposes = null;
		evidence.disclosures.googleVendor.legIntPurposes = null;
		evidence.disclosures.googleVendor.flexiblePurposes = null;
		expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
			'passed'
		);
	});

	it('rejects a missing, deleted or out-of-scope Google disclosure when required', async () => {
		await Promise.all(
			['missing', 'deleted', 'filtered'].map(async (mutation) => {
				const evidence = decision();
				if (mutation === 'missing') {
					evidence.disclosures.googleVendor = null;
				} else if (
					mutation === 'deleted' &&
					evidence.disclosures.googleVendor
				) {
					evidence.disclosures.googleVendor.deleted = true;
				} else {
					evidence.configuration.vendorIds = [2];
				}
				expect(
					(await checkMobileGoogleEvidence(evidence, options)).status
				).toBe('failed');
			})
		);
	});

	it('requires Google in decoded disclosure even if its loaded row exists', async () => {
		const evidence = decision(false, (model) => {
			model.vendorsDisclosed.unset(755);
		});
		expect(
			(await checkMobileGoogleEvidence(evidence, options)).issues.join(' ')
		).toContain('missing from decoded DisclosedVendors');
	});

	it('does not require AC when absent unless explicitly requested', async () => {
		const evidence = decision();
		replaceAC(evidence, null);
		evidence.disclosures.adTechProviders = null;
		evidence.disclosures.additionalConsentStatus = 'missing';
		expect(
			(
				await checkMobileGoogleEvidence(evidence, {
					cmpId: 490,
					scenario: 'decision',
				})
			).status
		).toBe('passed');
		expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
			'failed'
		);
	});

	it.each(['1~35.42', '2~35~dv.99', '2~0~dv.35', '2~1e3~dv.'])(
		'validates any existing AC even without the flag: %s',
		async (ac) => {
			const evidence = decision();
			replaceAC(evidence, ac);
			expect(
				(
					await checkMobileGoogleEvidence(evidence, {
						cmpId: 490,
						scenario: 'decision',
					})
				).status
			).toBe('failed');
		}
	);

	it.each(['stale', 'missing', 'unavailable'])(
		'refuses AC grants or retained bytes with %s provider authority',
		async (status) => {
			const evidence = decision(true);
			evidence.disclosures.additionalConsentStatus = status;
			expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
				'failed'
			);
		}
	);

	it('requires every consented or disclosed AC provider to have retained disclosures', async () => {
		const evidence = decision(true);
		evidence.disclosures.adTechProviders =
			evidence.disclosures.adTechProviders?.slice(0, 1) ?? null;
		expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
			'failed'
		);
	});

	it('accepts HTTP policy links from retained provider data and refuses credentials or other protocols', async () => {
		await Promise.all(
			[
				'http://provider.test/privacy',
				'https://user:password@provider.test/privacy',
				'ftp://provider.test/privacy',
			].map(async (url) => {
				const evidence = decision();
				const provider = evidence.disclosures.adTechProviders?.[0];
				if (!provider) {
					throw new Error('Test setup');
				}
				provider.policyUrl = url;
				const checked = await checkMobileGoogleEvidence(evidence, options);
				expect(checked.status).toBe(
					url.startsWith('http:') ? 'passed' : 'failed'
				);
				expect(JSON.stringify(checked)).not.toContain(url);
			})
		);
	});

	it.each([1, 3, 4])(
		'rejects positive ATP consent without TC purpose %i',
		async (purpose) => {
			const evidence = decision(true, (model) => {
				model.purposeConsents.unset(purpose);
			});
			expect((await checkMobileGoogleEvidence(evidence, options)).status).toBe(
				'failed'
			);
		}
	);

	it('catches fresh vector grants and malformed binary values without committed TC data', async () => {
		await Promise.all(
			['1', 'not-binary'].map(async (value) => {
				const evidence = fresh();
				evidence.storage.push({
					key: 'IABTCF_PurposeConsents',
					type: 'String',
					value,
				});
				expect(
					(
						await checkMobileGoogleEvidence(evidence, {
							...options,
							scenario: 'fresh',
						})
					).status
				).toBe('failed');
			})
		);
	});

	it('rejects invalid JSON shapes, unknown protected fields, duplicate rows and bad versions', async () => {
		const valid = decision();
		const invalid: unknown[] = [
			null,
			[],
			{ ...valid, schemaVersion: 2 },
			{ ...valid, subjectId: 'never-log-private-value' },
			{ ...valid, capturedAtMs: '123' },
			{ ...valid, core: { ...valid.core, policyVersion: undefined } },
			{ ...valid, storage: [...valid.storage, valid.storage[0]] },
		];
		await Promise.all(
			invalid.map(async (input) => {
				const checked = await checkMobileGoogleEvidence(input, options);
				expect(checked.status).toBe('failed');
				expect(JSON.stringify(checked)).not.toContain(
					'never-log-private-value'
				);
			})
		);
	});

	it('retains null rather than silently manufacturing optional declarations', () => {
		const evidence = decision();
		evidence.disclosures.googleVendor = null;
		expect(
			parseMobileGoogleEvidence(evidence).disclosures.googleVendor
		).toBeNull();
	});

	it('never echoes a hostile storage key or value', async () => {
		const evidence = decision();
		evidence.storage.push({
			key: 'private-subject-token',
			type: 'String',
			value: 'private-storage-payload',
		});
		const checked = await checkMobileGoogleEvidence(evidence, options);
		expect(checked.status).toBe('failed');
		expect(JSON.stringify(checked)).not.toContain('private-');
	});
});

describe('evidence checker CLI', () => {
	it('requires explicit scenario and CMP identity without echoing unknown input', async () => {
		await Promise.all(
			[
				[],
				['report.json'],
				['report.json', '--scenario', 'decision'],
				['report.json', '--cmp-id', '490'],
				['report.json', '--private-secret-token'],
			].map(async (args) => {
				const errors: string[] = [];
				const code = await runEvidenceCLI(args, {
					error: (value) => errors.push(value),
					out: () => undefined,
					read: () => Promise.resolve('{}'),
				});
				expect(code).toBe(1);
				expect(errors.join(' ')).toContain('Usage:');
				expect(errors.join(' ')).not.toContain('private-secret-token');
			})
		);
	});

	it('fails malformed JSON and read errors without dumping input contents', async () => {
		await Promise.all(
			[
				() => Promise.resolve('private-invalid-json'),
				() => Promise.reject(new Error('private-path')),
			].map(async (read) => {
				const errors: string[] = [];
				const code = await runEvidenceCLI(
					['report.json', '--scenario', 'decision', '--cmp-id', '490'],
					{ error: (value) => errors.push(value), out: () => undefined, read }
				);
				expect(code).toBe(1);
				expect(errors.join(' ')).toContain('valid evidence JSON');
				expect(errors.join(' ')).not.toContain('private-');
			})
		);
	});

	it('returns a separate exit code for incomplete fresh authority and fails wrong CMP identity', async () => {
		const evidence = fresh();
		evidence.core.policyPending = true;
		const io = {
			error: () => undefined,
			out: () => undefined,
			read: () => Promise.resolve(JSON.stringify(evidence)),
		};
		expect(
			await runEvidenceCLI(['-', '--scenario', 'fresh', '--cmp-id', '490'], io)
		).toBe(2);
		expect(
			await runEvidenceCLI(['-', '--scenario', 'fresh', '--cmp-id', '53'], io)
		).toBe(1);
	});

	it('runs the actual Bun CLI on both a file and stdin and prints no TC bytes', async () => {
		const folder = await mkdtemp(join(tmpdir(), 'c15t-google-evidence-'));
		try {
			const evidence = decision(true);
			const file = join(folder, 'capture.json');
			const json = JSON.stringify(evidence);
			await writeFile(file, json);
			const script = fileURLToPath(
				new URL('./check-mobile-google-evidence.ts', import.meta.url)
			);
			for (const source of [file, '-']) {
				const output = spawnSync(
					'bun',
					[
						script,
						source,
						'--scenario',
						'decision',
						'--cmp-id',
						'490',
						'--require-google',
						'--require-ac',
					],
					{ encoding: 'utf8', input: source === '-' ? json : undefined }
				);
				expect(output.status, output.stderr).toBe(0);
				expect(output.stdout).toContain('Local signal observation passed');
				expect(output.stdout).toContain('not certification');
				expect(output.stdout).not.toContain(evidence.core.tcString);
				expect(output.stdout).not.toContain(evidence.app.id);
			}
		} finally {
			await rm(folder, { force: true, recursive: true });
		}
	});
});
