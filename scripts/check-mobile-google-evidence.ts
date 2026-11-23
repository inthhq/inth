import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { decodeAdditionalConsent } from '../packages/sdk/iab/src/tcf/additional-consent-codec.model';
import { getTCFCore } from '../packages/sdk/iab/src/tcf/get-tcf-core';
import type { TCFCoreModule } from '../packages/sdk/iab/src/tcf/get-tcf-core';

type Scenario = 'fresh' | 'decision' | 'reject' | 'withdrawn';
type TCModel = InstanceType<Awaited<ReturnType<typeof getTCFCore>>['TCModel']>;

/** One native diagnostic export. It contains no protected consent record. */
export interface MobileGoogleEvidence {
	schemaVersion: 1;
	platform: 'ios' | 'android';
	capturedAtMs: number;
	app: { id: string; version: string; build: string };
	sdkVersion: string;
	configuration: {
		cmpId: number;
		cmpVersion: number;
		publisherCountry: string;
		vendorIds: number[] | null;
	};
	core: {
		policyPending: boolean;
		iabPolicy: boolean;
		tcString: string | null;
		additionalConsent: string | null;
		vendorListVersion: number | null;
		policyVersion: number | null;
	};
	disclosures: {
		vendorListVersion: number | null;
		policyVersion: number | null;
		iabStatus: string;
		googleVendor: {
			id: number;
			name: string | null;
			deleted: boolean;
			purposes: number[] | null;
			legIntPurposes: number[] | null;
			flexiblePurposes: number[] | null;
		} | null;
		additionalConsentStatus: string;
		adTechProviders: { id: number; name: string; policyUrl: string }[] | null;
	};
	storage: { key: string; type: string; value: string | null }[];
}

export interface EvidenceOptions {
	scenario: Scenario;
	cmpId: number;
	requireGoogle?: boolean;
	requireAC?: boolean;
}

export interface EvidenceResult {
	status: 'passed' | 'incomplete' | 'failed';
	issues: string[];
	summary: string;
}

const statuses = [
	'fresh',
	'cached',
	'offline',
	'stale',
	'missing',
	'unavailable',
];
const usableStatuses = new Set(['fresh', 'cached', 'offline']);
const numericKeys = new Set([
	'IABTCF_CmpSdkID',
	'IABTCF_CmpSdkVersion',
	'IABTCF_PolicyVersion',
	'IABTCF_gdprApplies',
	'IABTCF_PurposeOneTreatment',
	'IABTCF_UseNonStandardTexts',
]);
const grantKeys = new Set([
	'IABTCF_VendorConsents',
	'IABTCF_VendorLegitimateInterests',
	'IABTCF_PurposeConsents',
	'IABTCF_PurposeLegitimateInterests',
	'IABTCF_SpecialFeaturesOptIns',
	'IABTCF_PublisherConsent',
	'IABTCF_PublisherLegitimateInterests',
	'IABTCF_PublisherCustomPurposesConsents',
	'IABTCF_PublisherCustomPurposesLegitimateInterests',
]);
const binaryKeys = new Set([...grantKeys, 'IABTCF_DisclosedVendors']);
const textKeys = new Set([
	'IABTCF_PublisherCC',
	'IABTCF_TCString',
	...binaryKeys,
	'IABTCF_AddtlConsent',
]);
const restrictionKey =
	/^IABTCF_PublisherRestrictions(?:[1-9]|[1-5]\d|6[0-3])$/u;
const binary = /^[01]*$/u;
const unsignedInteger = /^(?:0|[1-9]\d*)$/u;
const countryCode = /^[A-Z]{2}$/u;
const tcCharacters = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/u;
const acCharacters =
	/^2~(?:[1-9]\d*(?:\.[1-9]\d*)*)?~dv(?:\.(?:[1-9]\d*(?:\.[1-9]\d*)*)?)?$/u;
const storageTypes = [
	'String',
	'Int',
	'Long',
	'Bool',
	'Boolean',
	'Float',
	'Number',
	'absent',
	'unsupported',
];

const record = function record(
	value: unknown,
	path: string
): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${path} must be an object.`);
	}
	return Object.fromEntries(Object.entries(value));
};

const fields = function fields(value: unknown, path: string, names: string[]) {
	const result = record(value, path);
	if (
		Object.keys(result).some((key) => !names.includes(key)) ||
		names.some((key) => !(key in result))
	) {
		throw new Error(`${path} must contain exactly the documented fields.`);
	}
	return result;
};

const text = function text(
	value: unknown,
	path: string,
	allowEmpty = false
): string {
	if (
		typeof value !== 'string' ||
		(!allowEmpty && value.length === 0) ||
		value.length > 1_000_000
	) {
		throw new Error(`${path} must be a bounded string.`);
	}
	return value;
};

const integer = function integer(
	value: unknown,
	path: string,
	max = Number.MAX_SAFE_INTEGER,
	min = 0
): number {
	if (
		typeof value !== 'number' ||
		!Number.isSafeInteger(value) ||
		value < min ||
		value > max
	) {
		throw new Error(`${path} must be an integer in the documented range.`);
	}
	return value;
};

const boolean = function boolean(value: unknown, path: string): boolean {
	if (typeof value !== 'boolean') {
		throw new Error(`${path} must be a boolean.`);
	}
	return value;
};

const nullableText = function nullableText(value: unknown, path: string) {
	return value === null ? null : text(value, path);
};

const nullableInteger = function nullableInteger(
	value: unknown,
	path: string,
	max: number
) {
	return value === null ? null : integer(value, path, max, 1);
};

const list = function list(value: unknown, path: string): unknown[] {
	if (!Array.isArray(value) || value.length > 65_535) {
		throw new Error(`${path} must be a bounded array.`);
	}
	return value;
};

const ids = function ids(
	value: unknown,
	path: string,
	max: number
): number[] | null {
	if (value === null) {
		return null;
	}
	const result = list(value, path).map((item) => integer(item, path, max, 1));
	if (new Set(result).size !== result.length) {
		throw new Error(`${path} must not repeat an ID.`);
	}
	return result;
};

const parseAvailability = function parseAvailability(
	value: unknown,
	path: string
): string {
	const result = text(value, path);
	if (!statuses.includes(result)) {
		throw new Error(`${path} is not a documented availability status.`);
	}
	return result;
};

/** Validate the exported envelope without coercing platform values or keeping extra fields. */
export const parseMobileGoogleEvidence = function parseMobileGoogleEvidence(
	input: unknown
): MobileGoogleEvidence {
	const root = fields(input, 'evidence', [
		'schemaVersion',
		'platform',
		'capturedAtMs',
		'app',
		'sdkVersion',
		'configuration',
		'core',
		'disclosures',
		'storage',
	]);
	if (
		root.schemaVersion !== 1 ||
		(root.platform !== 'ios' && root.platform !== 'android')
	) {
		throw new Error('Unsupported evidence schemaVersion or platform.');
	}
	const app = fields(root.app, 'app', ['id', 'version', 'build']);
	const config = fields(root.configuration, 'configuration', [
		'cmpId',
		'cmpVersion',
		'publisherCountry',
		'vendorIds',
	]);
	const core = fields(root.core, 'core', [
		'policyPending',
		'iabPolicy',
		'tcString',
		'additionalConsent',
		'vendorListVersion',
		'policyVersion',
	]);
	const disclosures = fields(root.disclosures, 'disclosures', [
		'vendorListVersion',
		'policyVersion',
		'iabStatus',
		'googleVendor',
		'additionalConsentStatus',
		'adTechProviders',
	]);
	const country = text(
		config.publisherCountry,
		'configuration.publisherCountry'
	);
	if (!countryCode.test(country)) {
		throw new Error(
			'configuration.publisherCountry must be two uppercase ASCII letters.'
		);
	}
	const google =
		disclosures.googleVendor === null
			? null
			: fields(disclosures.googleVendor, 'disclosures.googleVendor', [
					'id',
					'name',
					'deleted',
					'purposes',
					'legIntPurposes',
					'flexiblePurposes',
				]);
	const providers =
		disclosures.adTechProviders === null
			? null
			: list(disclosures.adTechProviders, 'disclosures.adTechProviders').map(
					(item) => {
						const provider = fields(item, 'adTechProvider', [
							'id',
							'name',
							'policyUrl',
						]);
						const policyUrl = text(
							provider.policyUrl,
							'adTechProvider.policyUrl'
						);
						let url: URL;
						try {
							url = new URL(policyUrl);
						} catch {
							throw new Error(
								'adTechProvider.policyUrl must be an HTTP or HTTPS URL.'
							);
						}
						if (
							!['http:', 'https:'].includes(url.protocol) ||
							url.username ||
							url.password
						) {
							throw new Error(
								'adTechProvider.policyUrl must be an HTTP or HTTPS URL without credentials.'
							);
						}
						return {
							id: integer(
								provider.id,
								'adTechProvider.id',
								Number.MAX_SAFE_INTEGER,
								1
							),
							name: text(provider.name, 'adTechProvider.name'),
							policyUrl,
						};
					}
				);
	if (
		providers &&
		new Set(providers.map((item) => item.id)).size !== providers.length
	) {
		throw new Error('adTechProviders must not repeat an ID.');
	}
	const storage = list(root.storage, 'storage').map((item) => {
		const row = fields(item, 'storage row', ['key', 'type', 'value']);
		const key = text(row.key, 'storage.key');
		if (
			!numericKeys.has(key) &&
			!textKeys.has(key) &&
			!restrictionKey.test(key) &&
			key !== 'IABTCF_PublisherRestrictions'
		) {
			throw new Error('storage contains a key outside the SDK-owned table.');
		}
		const type = text(row.type, 'storage.type');
		if (!storageTypes.includes(type)) {
			throw new Error('storage.type is not a documented platform type.');
		}
		const empty = type === 'absent' || type === 'unsupported';
		if (empty && row.value !== null) {
			throw new Error('Absent or unsupported storage values must be null.');
		}
		return {
			key,
			type,
			value: empty ? null : text(row.value, 'storage.value', true),
		};
	});
	if (new Set(storage.map((item) => item.key)).size !== storage.length) {
		throw new Error('storage must not repeat a key.');
	}
	return {
		app: {
			build: text(app.build, 'app.build'),
			id: text(app.id, 'app.id'),
			version: text(app.version, 'app.version'),
		},
		capturedAtMs: integer(
			root.capturedAtMs,
			'capturedAtMs',
			Number.MAX_SAFE_INTEGER,
			1
		),
		configuration: {
			cmpId: integer(config.cmpId, 'configuration.cmpId', 4095, 2),
			cmpVersion: integer(config.cmpVersion, 'configuration.cmpVersion', 4095),
			publisherCountry: country,
			vendorIds: ids(config.vendorIds, 'configuration.vendorIds', 65_535),
		},
		core: {
			additionalConsent: nullableText(
				core.additionalConsent,
				'core.additionalConsent'
			),
			iabPolicy: boolean(core.iabPolicy, 'core.iabPolicy'),
			policyPending: boolean(core.policyPending, 'core.policyPending'),
			policyVersion: nullableInteger(
				core.policyVersion,
				'core.policyVersion',
				63
			),
			tcString: nullableText(core.tcString, 'core.tcString'),
			vendorListVersion: nullableInteger(
				core.vendorListVersion,
				'core.vendorListVersion',
				65_535
			),
		},
		disclosures: {
			adTechProviders: providers,
			additionalConsentStatus: parseAvailability(
				disclosures.additionalConsentStatus,
				'disclosures.additionalConsentStatus'
			),
			googleVendor:
				google === null
					? null
					: {
							deleted: boolean(google.deleted, 'googleVendor.deleted'),
							flexiblePurposes: ids(
								google.flexiblePurposes,
								'googleVendor.flexiblePurposes',
								63
							),
							id: integer(google.id, 'googleVendor.id', 755, 755),
							legIntPurposes: ids(
								google.legIntPurposes,
								'googleVendor.legIntPurposes',
								63
							),
							name:
								google.name === null
									? null
									: text(google.name, 'googleVendor.name'),
							purposes: ids(google.purposes, 'googleVendor.purposes', 63),
						},
			iabStatus: parseAvailability(
				disclosures.iabStatus,
				'disclosures.iabStatus'
			),
			policyVersion: nullableInteger(
				disclosures.policyVersion,
				'disclosures.policyVersion',
				63
			),
			vendorListVersion: nullableInteger(
				disclosures.vendorListVersion,
				'disclosures.vendorListVersion',
				65_535
			),
		},
		platform: root.platform,
		schemaVersion: 1,
		sdkVersion: text(root.sdkVersion, 'sdkVersion'),
		storage,
	};
};

const vectorBits = (
	vector: { maxId: number; has: (id: number) => boolean },
	width = vector.maxId
) =>
	Array.from({ length: width }, (_, index) =>
		vector.has(index + 1) ? '1' : '0'
	).join('');

interface VendorWidths {
	consents: number;
	legitimateInterests: number;
	disclosed: number;
}

// The reference Vector retains set IDs, not the encoded maximum. Native buses
// preserve that maximum, even for an all-zero vector. Read only those widths
// with the same oracle primitives and sequence used by its full decoder.
const vendorWidths = function vendorWidths(
	tcString: string,
	model: TCModel,
	oracle: TCFCoreModule
): VendorWidths {
	const { Base64Url, BitLength, FieldSequence, IntEncoder, Segment } = oracle;
	const lengths = new Map<string, unknown>(Object.entries(BitLength));
	const segments = tcString.split('.');
	const core = Base64Url.decode(segments[0] ?? '');
	let offset = 0;
	for (const key of new FieldSequence()['2'][Segment.CORE] ?? []) {
		if (key === 'vendorConsents') {
			break;
		}
		const width: unknown = lengths.get(key);
		if (typeof width !== 'number') {
			throw new Error('Unexpected reference field sequence.');
		}
		offset += width;
	}
	const read = (bits: string, start: number) =>
		IntEncoder.decode(
			bits.slice(start, start + BitLength.maxId),
			BitLength.maxId
		);
	const disclosed = segments
		.slice(1)
		.map((segment) => Base64Url.decode(segment))
		.find(
			(bits) =>
				IntEncoder.decode(
					bits.slice(0, BitLength.segmentType),
					BitLength.segmentType
				) === 1
		);
	const widths = {
		consents: read(core, offset),
		disclosed: disclosed ? read(disclosed, BitLength.segmentType) : 0,
		legitimateInterests: read(core, offset + model.vendorConsents.bitLength),
	};
	if (
		model.vendorConsents.maxId > widths.consents ||
		model.vendorLegitimateInterests.maxId > widths.legitimateInterests ||
		model.vendorsDisclosed.maxId > widths.disclosed
	) {
		throw new Error('A decoded vendor ID exceeds its declared maximum.');
	}
	return widths;
};

const expectedStorage = function expectedStorage(
	model: TCModel,
	tcString: string,
	publisher: boolean,
	widths: VendorWidths
): Map<string, string> {
	const values = new Map([
		['IABTCF_CmpSdkID', String(model.cmpId)],
		['IABTCF_CmpSdkVersion', String(model.cmpVersion)],
		['IABTCF_PolicyVersion', String(model.policyVersion)],
		['IABTCF_gdprApplies', '1'],
		['IABTCF_PublisherCC', model.publisherCountryCode],
		['IABTCF_TCString', tcString],
		['IABTCF_PurposeOneTreatment', String(Number(model.purposeOneTreatment))],
		['IABTCF_UseNonStandardTexts', String(Number(model.useNonStandardTexts))],
		['IABTCF_PurposeConsents', vectorBits(model.purposeConsents, 24)],
		[
			'IABTCF_PurposeLegitimateInterests',
			vectorBits(model.purposeLegitimateInterests, 24),
		],
		[
			'IABTCF_SpecialFeaturesOptIns',
			vectorBits(model.specialFeatureOptins, 12),
		],
		[
			'IABTCF_VendorConsents',
			vectorBits(model.vendorConsents, widths.consents),
		],
		[
			'IABTCF_VendorLegitimateInterests',
			vectorBits(model.vendorLegitimateInterests, widths.legitimateInterests),
		],
		[
			'IABTCF_DisclosedVendors',
			vectorBits(model.vendorsDisclosed, widths.disclosed),
		],
	]);
	if (publisher) {
		values.set(
			'IABTCF_PublisherConsent',
			vectorBits(model.publisherConsents, 24)
		);
		values.set(
			'IABTCF_PublisherLegitimateInterests',
			vectorBits(model.publisherLegitimateInterests, 24)
		);
		values.set(
			'IABTCF_PublisherCustomPurposesConsents',
			vectorBits(model.publisherCustomConsents, Number(model.numCustomPurposes))
		);
		values.set(
			'IABTCF_PublisherCustomPurposesLegitimateInterests',
			vectorBits(
				model.publisherCustomLegitimateInterests,
				Number(model.numCustomPurposes)
			)
		);
	}
	const restrictions = model.publisherRestrictions;
	for (const purpose of restrictions.getPurposes()) {
		values.set(
			`IABTCF_PublisherRestrictions${purpose}`,
			Array.from({ length: restrictions.getMaxVendorId() }, (_, index) =>
				String(restrictions.getRestrictionType(index + 1, purpose) ?? '_')
			).join('')
		);
	}
	return values;
};

const evidenceResult = function evidenceResult(
	status: EvidenceResult['status'],
	issues: string[],
	platform?: string,
	scenario?: string
): EvidenceResult {
	return {
		issues,
		status,
		summary: `Local signal observation ${status}${platform ? ` (${platform}, ${scenario})` : ''}. This is not certification or ad-serving eligibility. Screenshots, device journeys and Google SDK reads remain separate checks.`,
	};
};

const checkAC = function checkAC(
	ac: string | null,
	decoded: TCModel,
	disclosures: MobileGoogleEvidence['disclosures'],
	options: EvidenceOptions,
	issues: string[]
) {
	if (ac === null) {
		if (options.requireAC) {
			issues.push('This decision requires a committed ACv2 string.');
		}
		return;
	}
	const signal = acCharacters.test(ac) ? decodeAdditionalConsent(ac) : null;
	if (!signal) {
		issues.push('Additional Consent is not a valid ACv2 signal.');
		return;
	}
	if (
		!usableStatuses.has(disclosures.additionalConsentStatus) ||
		disclosures.adTechProviders === null
	) {
		issues.push(
			'Existing Additional Consent lacks usable retained provider disclosures.'
		);
	}
	const shown =
		disclosures.adTechProviders?.map((provider) => provider.id) ?? [];
	if (
		signal.disclosed.length !== shown.length ||
		signal.disclosed.some((id) => !shown.includes(id))
	) {
		issues.push(
			'ACv2 consented/disclosed scope differs from the retained provider disclosures.'
		);
	}
	if (
		signal.consented.length > 0 &&
		(![1, 3, 4].every((id) => decoded.purposeConsents.has(id)) ||
			options.scenario === 'reject' ||
			options.scenario === 'withdrawn')
	) {
		issues.push(
			'ACv2 provider grants lack purpose 1/3/4 consent or occur after rejection/withdrawal.'
		);
	}
};

const finish = function finish(
	issues: string[],
	evidence: MobileGoogleEvidence,
	options: EvidenceOptions,
	incomplete = false
) {
	const failed = issues.length > 0;
	if (failed) {
		issues.push(
			'Native storage observations are not atomic. Refresh after transitions; persistent mismatches need investigation.'
		);
	} else if (incomplete) {
		issues.push(
			'Policy/GVL authority is pending or unavailable. This capture is incomplete; refresh when loaded.'
		);
	}
	let outcome: EvidenceResult['status'] = incomplete ? 'incomplete' : 'passed';
	if (failed) {
		outcome = 'failed';
	}
	return evidenceResult(outcome, issues, evidence.platform, options.scenario);
};

type ExpectValue = (key: string, expected: string | null) => void;

const checkStorageRows = function checkStorageRows(
	evidence: MobileGoogleEvidence,
	issues: string[]
) {
	for (const row of evidence.storage) {
		if (row.type === 'absent') {
			continue;
		}
		if (
			row.type === 'unsupported' ||
			(numericKeys.has(row.key)
				? row.type !== 'Int' || !unsignedInteger.test(row.value ?? '')
				: row.type !== 'String')
		) {
			issues.push(
				`${row.key} has the wrong actual platform type or value format.`
			);
		}
		if (binaryKeys.has(row.key) && !binary.test(row.value ?? '')) {
			issues.push(`${row.key} is not a binary vector.`);
		}
	}
};

const checkConfiguredIdentity = function checkConfiguredIdentity(
	evidence: MobileGoogleEvidence,
	options: EvidenceOptions,
	issues: string[]
) {
	const { configuration } = evidence;
	if (configuration.cmpId !== options.cmpId) {
		issues.push(
			'Configured CMP ID does not match the explicitly expected identity.'
		);
	}
};

const checkRequiredDisclosures = function checkRequiredDisclosures(
	evidence: MobileGoogleEvidence,
	options: EvidenceOptions,
	issues: string[]
) {
	const { configuration, disclosures } = evidence;
	if (
		options.requireGoogle &&
		(!disclosures.googleVendor ||
			disclosures.googleVendor.deleted ||
			configuration.vendorIds?.includes(755) === false)
	) {
		issues.push(
			'A non-deleted Google vendor 755 is required in the loaded configured scope.'
		);
	}
	if (
		options.requireAC &&
		(!usableStatuses.has(disclosures.additionalConsentStatus) ||
			!disclosures.adTechProviders?.length)
	) {
		issues.push(
			'Additional Consent requires a usable, nonempty retained provider disclosure list.'
		);
	}
};

const checkFreshEvidence = function checkFreshEvidence(
	evidence: MobileGoogleEvidence,
	options: EvidenceOptions,
	issues: string[],
	expectValue: ExpectValue,
	usableIAB: boolean
) {
	const { core, disclosures } = evidence;
	const rows = new Map(evidence.storage.map((row) => [row.key, row]));
	if (
		core.tcString !== null ||
		core.additionalConsent !== null ||
		core.vendorListVersion !== null ||
		core.policyVersion !== null
	) {
		issues.push(
			'Fresh requires no native committed TC/AC authority or committed versions.'
		);
	}
	for (const [key, row] of rows) {
		if (grantKeys.has(key) && row.value?.includes('1')) {
			issues.push(`${key} contains grants in a fresh observation.`);
		}
	}
	if (disclosures.policyVersion !== null) {
		expectValue('IABTCF_PolicyVersion', String(disclosures.policyVersion));
	}
	if (usableIAB) {
		expectValue('IABTCF_gdprApplies', '1');
	}
	return finish(issues, evidence, options, !usableIAB);
};

const checkDecodedMetadata = function checkDecodedMetadata(
	decoded: TCModel,
	evidence: MobileGoogleEvidence,
	options: EvidenceOptions,
	issues: string[]
) {
	const { core, configuration, disclosures } = evidence;
	if (
		Number(decoded.version) !== 2 ||
		Number(decoded.cmpId) !== options.cmpId ||
		Number(decoded.cmpVersion) !== configuration.cmpVersion ||
		decoded.publisherCountryCode !== configuration.publisherCountry ||
		!decoded.isServiceSpecific
	) {
		issues.push(
			'Decoded TC version, identity, publisher country or service-specific scope differs from configuration.'
		);
	}
	if (
		Number(decoded.vendorListVersion) !== core.vendorListVersion ||
		core.vendorListVersion !== disclosures.vendorListVersion ||
		Number(decoded.policyVersion) !== core.policyVersion ||
		core.policyVersion !== disclosures.policyVersion
	) {
		issues.push(
			'Decoded, committed and disclosed GVL/policy versions do not agree.'
		);
	}
};

const checkDecodedGrants = function checkDecodedGrants(
	decoded: TCModel,
	evidence: MobileGoogleEvidence,
	options: EvidenceOptions,
	issues: string[]
) {
	const { configuration } = evidence;
	const grants = [
		decoded.purposeConsents,
		decoded.purposeLegitimateInterests,
		decoded.specialFeatureOptins,
		decoded.vendorConsents,
		decoded.vendorLegitimateInterests,
		decoded.publisherConsents,
		decoded.publisherLegitimateInterests,
		decoded.publisherCustomConsents,
		decoded.publisherCustomLegitimateInterests,
	];
	if (
		(options.scenario === 'reject' || options.scenario === 'withdrawn') &&
		grants.some((vector) => vector.size > 0)
	) {
		issues.push(
			'Reject/withdrawn must contain no consent, special-feature or legitimate-interest grants.'
		);
	}
	for (const vector of [
		decoded.vendorConsents,
		decoded.vendorLegitimateInterests,
	]) {
		if ([...vector.values()].some((id) => !decoded.vendorsDisclosed.has(id))) {
			issues.push('A vendor grant lacks decoded disclosure.');
		}
	}
	if (
		configuration.vendorIds &&
		[...decoded.vendorsDisclosed.values()].some(
			(id) => !configuration.vendorIds?.includes(id)
		)
	) {
		issues.push(
			'Decoded disclosed vendors exceed the configured vendor scope.'
		);
	}
	if (options.requireGoogle && !decoded.vendorsDisclosed.has(755)) {
		issues.push('Google vendor 755 is missing from decoded DisclosedVendors.');
	}
};

const usableIABAuthority = function usableIABAuthority(
	evidence: MobileGoogleEvidence
) {
	const { core, disclosures } = evidence;
	return (
		!core.policyPending &&
		core.iabPolicy &&
		usableStatuses.has(disclosures.iabStatus) &&
		disclosures.vendorListVersion !== null &&
		disclosures.policyVersion !== null
	);
};

/** Check one non-atomic native observation. No result establishes approval or ad eligibility. */
export const checkMobileGoogleEvidence =
	async function checkMobileGoogleEvidence(
		input: unknown,
		options: EvidenceOptions
	): Promise<EvidenceResult> {
		let evidence: MobileGoogleEvidence;
		try {
			evidence = parseMobileGoogleEvidence(input);
			integer(options.cmpId, 'Expected CMP ID', 4095, 2);
			if (
				!['fresh', 'decision', 'reject', 'withdrawn'].includes(options.scenario)
			) {
				throw new Error('An explicit supported scenario is required.');
			}
		} catch (error) {
			return evidenceResult('failed', [
				error instanceof Error ? error.message : 'Invalid evidence envelope.',
			]);
		}
		const issues: string[] = [];
		const { core, configuration, disclosures } = evidence;
		const rows = new Map(evidence.storage.map((row) => [row.key, row]));
		const value = (key: string) => rows.get(key)?.value ?? null;
		const expectValue = (key: string, expected: string | null) => {
			if (value(key) !== expected) {
				issues.push(
					`${key} does not match the current core/configuration or decoded TC data.`
				);
			}
		};
		checkStorageRows(evidence, issues);
		checkConfiguredIdentity(evidence, options, issues);
		expectValue('IABTCF_CmpSdkID', String(options.cmpId));
		expectValue('IABTCF_CmpSdkVersion', String(configuration.cmpVersion));
		expectValue('IABTCF_TCString', core.tcString);
		expectValue('IABTCF_AddtlConsent', core.additionalConsent);
		const usableIAB = usableIABAuthority(evidence);
		checkRequiredDisclosures(evidence, options, issues);
		if (options.scenario === 'fresh') {
			return checkFreshEvidence(
				evidence,
				options,
				issues,
				expectValue,
				usableIAB
			);
		}
		if (!usableIAB) {
			issues.push(
				'A committed decision requires current usable IAB policy/GVL disclosures.'
			);
		}
		if (core.tcString === null) {
			issues.push(
				'This scenario requires a native committed TC String. Refresh after the decision completes.'
			);
			return finish(issues, evidence, options);
		}
		if (!tcCharacters.test(core.tcString)) {
			issues.push('The committed TC String has invalid framing.');
			return finish(issues, evidence, options);
		}
		let decoded: TCModel;
		let segmentTypes: number[];
		let widths: VendorWidths;
		try {
			const oracle = await getTCFCore();
			const { TCString, Base64Url } = oracle;
			segmentTypes = core.tcString
				.split('.')
				.slice(1)
				.map((segment) =>
					Number.parseInt(Base64Url.decode(segment).slice(0, 3), 2)
				);
			if (
				new Set(segmentTypes).size !== segmentTypes.length ||
				segmentTypes.some((type) => type !== 1 && type !== 3)
			) {
				throw new Error('Unsupported or duplicated TC segments.');
			}
			decoded = TCString.decode(core.tcString);
			widths = vendorWidths(core.tcString, decoded, oracle);
		} catch {
			issues.push(
				'The committed TC String could not be decoded by the IAB reference decoder.'
			);
			return finish(issues, evidence, options);
		}
		if (!segmentTypes.includes(1)) {
			issues.push('The mandatory DisclosedVendors segment is missing.');
		}
		checkDecodedMetadata(decoded, evidence, options, issues);
		const expected = expectedStorage(
			decoded,
			core.tcString,
			segmentTypes.includes(3),
			widths
		);
		for (const [key, expectedValue] of expected) {
			expectValue(key, expectedValue);
		}
		for (const key of rows.keys()) {
			if (key !== 'IABTCF_AddtlConsent' && !expected.has(key)) {
				expectValue(key, null);
			}
		}
		checkDecodedGrants(decoded, evidence, options, issues);
		checkAC(core.additionalConsent, decoded, disclosures, options, issues);
		return finish(issues, evidence, options);
	};

const usage =
	'Usage: bun scripts/check-mobile-google-evidence.ts <report.json|-> --scenario fresh|decision|reject|withdrawn --cmp-id 490 [--require-google] [--require-ac]';

/** Read a file or stdin and emit a privacy-preserving local result. */
export const runEvidenceCLI = async function runEvidenceCLI(
	args: string[],
	io: {
		read: (path: string) => Promise<string>;
		out: (text: string) => void;
		error: (text: string) => void;
	}
): Promise<number> {
	try {
		const { values, positionals } = parseArgs({
			allowPositionals: true,
			args,
			options: {
				'cmp-id': { type: 'string' },
				'require-ac': { type: 'boolean' },
				'require-google': { type: 'boolean' },
				scenario: { type: 'string' },
			},
			strict: true,
		});
		const { scenario } = values;
		if (
			positionals.length !== 1 ||
			!['fresh', 'decision', 'reject', 'withdrawn'].includes(scenario ?? '') ||
			!unsignedInteger.test(values['cmp-id'] ?? '')
		) {
			io.error(usage);
			return 1;
		}
		if (
			scenario !== 'fresh' &&
			scenario !== 'decision' &&
			scenario !== 'reject' &&
			scenario !== 'withdrawn'
		) {
			io.error(usage);
			return 1;
		}
		let input: unknown;
		try {
			input = JSON.parse(await io.read(positionals[0] ?? '-'));
		} catch {
			io.error(
				'Could not read valid evidence JSON. No input contents were logged.'
			);
			return 1;
		}
		const checked = await checkMobileGoogleEvidence(input, {
			cmpId: Number(values['cmp-id']),
			requireAC: values['require-ac'],
			requireGoogle: values['require-google'],
			scenario,
		});
		io.out(checked.summary);
		for (const issue of checked.issues) {
			io.error(issue);
		}
		if (checked.status === 'passed') {
			return 0;
		}
		return checked.status === 'incomplete' ? 2 : 1;
	} catch {
		io.error(usage);
		return 1;
	}
};

/**
 * Opening `/dev/stdin` fails with ENXIO on Linux when stdin is a socket, which
 * is what Node's `spawnSync({ input })` provides. Reading the stream works for
 * pipes, sockets and files alike.
 */
const readStdin = async (): Promise<string> => {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString('utf8');
};

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	process.exitCode = await runEvidenceCLI(process.argv.slice(2), {
		error: (message) => process.stderr.write(`${message}\n`),
		out: (message) => process.stdout.write(`${message}\n`),
		read: (path) => (path === '-' ? readStdin() : readFile(path, 'utf8')),
	});
}
