/**
 * The vendor-list entry types both native cores accept: the Android core's typed
 * GVL model and `GVLFieldType` in core-swift's `GlobalVendorList.swift`.
 *
 * The CLI (`packages/cli/vendor/c15t-mobile/src/mobile/gvl-fields.ts`) and the Expo plugin
 * (`packages/react-native/src/expo-plugin/gvl-fields.ts`) each carry this file,
 * byte for byte; a test fails when the copies differ. Cases live in
 * `packages/native-protocol/bundled-policy/invalid-resources.json`.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The type of one GVL field, as both native cores read it. Every
 * field may be absent or null; a present value must have this type. Maps are
 * JSON objects whose values are never null, lists never hold null, and numbers
 * are whole. Unknown keys are ignored.
 */
type GvlFieldType =
	| 'boolean'
	| 'string'
	| 'whole'
	| { list: GvlFieldType }
	| { map: GvlFieldType; keys: 'int' | 'string' }
	| { fields: Record<string, GvlFieldType>; required?: string[] };

const ids: GvlFieldType = { list: 'whole' };
const definition: GvlFieldType = {
	fields: {
		description: 'string',
		descriptionLegal: 'string',
		id: 'whole',
		illustrations: { list: 'string' },
		name: 'string',
	},
};
const definitions: GvlFieldType = { keys: 'int', map: definition };
const vendor: GvlFieldType = {
	fields: {
		cookieMaxAgeSeconds: 'whole',
		cookieRefresh: 'boolean',
		dataDeclaration: ids,
		dataRetention: {
			fields: {
				purposes: { keys: 'string', map: 'whole' },
				specialPurposes: { keys: 'string', map: 'whole' },
				stdRetention: 'whole',
			},
		},
		deletedDate: 'string',
		deviceStorageDisclosureUrl: 'string',
		features: ids,
		flexiblePurposes: ids,
		id: 'whole',
		legIntPurposes: ids,
		name: 'string',
		overflow: { fields: { httpGetLimit: 'whole' } },
		purposes: ids,
		specialFeatures: ids,
		specialPurposes: ids,
		urls: {
			list: {
				fields: { langId: 'string', legIntClaim: 'string', privacy: 'string' },
			},
		},
		usesCookies: 'boolean',
		usesNonCookieAccess: 'boolean',
	},
};
const vendorListFields: GvlFieldType = {
	fields: {
		dataCategories: definitions,
		features: definitions,
		gvlSpecificationVersion: 'whole',
		lastUpdated: 'string',
		purposes: definitions,
		specialFeatures: definitions,
		specialPurposes: definitions,
		stacks: {
			keys: 'int',
			map: {
				fields: {
					description: 'string',
					id: 'whole',
					name: 'string',
					purposes: ids,
					specialFeatures: ids,
				},
			},
		},
		standardTexts: {
			fields: {
				features: 'string',
				purposes: 'string',
				specialFeatures: 'string',
				specialPurposes: 'string',
			},
			required: ['features'],
		},
		vendors: { keys: 'int', map: vendor },
	},
};

const INT32 = 2_147_483_647;
const isIntKey = (key: string) =>
	/^[+-]?\d+$/u.test(key) && Math.abs(Number(key)) <= INT32;

type Check = (
	value: unknown,
	type: GvlFieldType,
	path: string
) => string | null;

const listProblem = function listProblem(
	value: unknown,
	item: GvlFieldType,
	path: string,
	check: Check
): string | null {
	if (!Array.isArray(value)) {
		return `${path} must be a list`;
	}
	for (const [index, entry] of value.entries()) {
		if (entry === null) {
			return `${path}[${index}] must not be null`;
		}
		const problem = check(entry, item, `${path}[${index}]`);
		if (problem !== null) {
			return problem;
		}
	}
	return null;
};

const mapProblem = function mapProblem(
	value: Record<string, unknown>,
	type: { map: GvlFieldType; keys: 'int' | 'string' },
	path: string,
	check: Check
): string | null {
	for (const [key, entry] of Object.entries(value)) {
		if (type.keys === 'int' && !isIntKey(key)) {
			return `${path} key "${key}" must be a number`;
		}
		if (entry === null) {
			return `${path}.${key} must not be null`;
		}
		const problem = check(entry, type.map, `${path}.${key}`);
		if (problem !== null) {
			return problem;
		}
	}
	return null;
};

const fieldsProblem = function fieldsProblem(
	value: Record<string, unknown>,
	type: { fields: Record<string, GvlFieldType>; required?: string[] },
	path: string,
	check: Check
): string | null {
	for (const [key, field] of Object.entries(type.fields)) {
		const entry = value[key];
		if (entry === undefined || entry === null) {
			if (type.required?.includes(key)) {
				return `${path}.${key} is required`;
			}
			continue;
		}
		const problem = check(entry, field, `${path}.${key}`);
		if (problem !== null) {
			return problem;
		}
	}
	return null;
};

/** Where `value` breaks `type`, or null. `value` is present and not null. */
const fieldProblem: Check = function fieldProblem(value, type, path) {
	if (type === 'whole') {
		return Number.isSafeInteger(value)
			? null
			: `${path} must be a whole number`;
	}
	if (type === 'boolean' || type === 'string') {
		return typeof value === type ? null : `${path} must be a ${type}`;
	}
	if ('list' in type) {
		return listProblem(value, type.list, path, fieldProblem);
	}
	if (!isRecord(value)) {
		return `${path} must be an object`;
	}
	return 'map' in type
		? mapProblem(value, type, path, fieldProblem)
		: fieldsProblem(value, type, path, fieldProblem);
};

/** The first entry in a vendor list both native cores refuse, or null. */
export const gvlEntryProblem = function gvlEntryProblem(
	data: unknown
): string | null {
	return isRecord(data) ? fieldProblem(data, vendorListFields, 'gvl') : null;
};
