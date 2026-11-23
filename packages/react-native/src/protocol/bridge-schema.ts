/**
 * The key names of every JSON payload that crosses the TurboModule.
 *
 * The bridge passes JSON strings, because Codegen cannot express the unions in
 * these payloads and its object types would not help anyway: a returned object
 * reaches Kotlin as an untyped `WritableMap` and Swift as an `NSDictionary`, and
 * an object argument cannot tell an omitted key from an explicit `null`, which
 * `setOverrides` depends on. So a key renamed on one side is invisible to every
 * compiler. This table is the one place the names are written down, and three
 * checks hold each side to it:
 *
 * - TypeScript: `__tests__/bridge-schema.type-test.ts` fails `check-types` when
 *   a protocol type and this table disagree about a key, its optionality, its
 *   nullability or its enum values.
 * - Kotlin and Swift: `packages/native-protocol/bridge/payloads.json` is generated from
 *   this table (`bun run --cwd packages/react-native generate:bridge-schema`),
 *   and each binding's tests check every encoder's output and every decoder's
 *   input against it.
 * - At runtime, {@link describeBridgePayloadDrift} names the keys a native
 *   payload got wrong, and the consent client warns with it in development.
 *
 * @packageDocumentation
 */

import { COMMIT_FAILURE_REASONS } from './commit-payload.model';
import { POLICY_RESOLUTION_FAILURES } from './consent-snapshot.model';
import {
	TRACKING_AUTHORIZATION_STATUSES,
	TRACKING_PRESENTATIONS,
	TRACKING_REQUEST_STAGES,
} from './tracking-protocol.model';
import {
	ACTIVE_SURFACES,
	NATIVE_MODELS,
	OPT_OUT_HOLDERS,
	OPT_OUT_METHODS,
	PROMPT_REASONS,
} from './consent-vocabulary.model';

/** JSON value kinds a field can hold. */
export type BridgeValueKind =
	| 'string'
	| 'number'
	| 'boolean'
	| 'array'
	| 'object';

/**
 * A field written as its kind, with `?` when the key may be absent and
 * `| null` when its value may be `null`, such as `'string? | null'`.
 */
export type BridgeFieldShorthand =
	`${BridgeValueKind}${'' | '?'}${'' | ' | null'}`;

/** A string field limited to listed values. */
export interface BridgeEnumField {
	readonly enum: readonly string[];
	readonly optional?: true;
	readonly nullable?: true;
}

/** An object field whose own keys are checked. */
export interface BridgeObjectField {
	readonly fields: BridgeFields;
	readonly optional?: true;
	readonly nullable?: true;
}

/** One field of a payload. */
export type BridgeFieldSpec =
	| BridgeFieldShorthand
	| BridgeEnumField
	| BridgeObjectField;

/** The fields of one payload or nested object, by key. */
export interface BridgeFields {
	readonly [key: string]: BridgeFieldSpec;
}

/**
 * Every bridge payload, by name.
 *
 * Native-to-JavaScript payloads are the method results and event bodies the
 * encoders write. `commitIntent` and `overridesInput` travel the other way and
 * are what the native decoders read.
 */
export const BRIDGE_PAYLOADS = {
	autoPresentSettings: {
		autoPresent: 'boolean',
		privacyPolicyURL: 'string | null',
	},
	bootstrap: {
		commitRevision: 'boolean',
		hasStoredSnapshot: 'boolean',
		maxSupportedProtocolVersion: 'number',
		minSupportedProtocolVersion: 'number',
		nativeSdkVersion: 'string',
		nativeUI: 'boolean',
		protocolVersion: 'number',
		subjectId: 'string | null',
	},
	commitIntent: {
		action: { enum: ['all', 'necessary', 'explicit', 'iab'] },
		choices: { fields: {}, optional: true },
		consents: { fields: {}, optional: true },
		revision: 'number?',
	},
	commitResult: {
		confirmed: 'array',
		delivered: 'boolean?',
		detail: 'string?',
		ok: 'boolean',
		queued: 'boolean',
		reason: { enum: COMMIT_FAILURE_REASONS, optional: true },
		revision: 'number | null',
		subjectId: 'string | null',
	},
	errorEvent: {
		code: 'string',
		message: 'string',
	},
	initializedEvent: {
		dirty: 'boolean',
		policyPending: 'boolean',
		ready: 'boolean',
		revision: 'number',
	},
	overridesInput: {
		country: 'string? | null',
		gpc: 'boolean? | null',
		language: 'string?',
		region: 'string? | null',
	},
	presenterOutcome: {
		kind: { enum: ['committed', 'acknowledged', 'dismissed', 'unavailable'] },
		revision: 'number',
		sessionId: 'string',
	},
	presenterPresented: {
		automatic: 'boolean',
		presentation: { enum: ['prompt', 'preferences'] },
		sessionId: 'string',
	},
	presenterSession: {
		presentation: { enum: ['prompt', 'preferences'], optional: true },
		sessionId: 'string | null',
		status: { enum: ['presented', 'already-presented', 'not-required'] },
	},
	presenterUnavailable: {
		code: 'string',
		message: 'string',
	},
	snapshot: {
		activeUI: { enum: ACTIVE_SURFACES, nullable: true },
		consentCategories: 'array | null',
		effectivePermissions: {
			fields: {
				experience: 'boolean',
				functionality: 'boolean',
				marketing: 'boolean',
				measurement: 'boolean',
				necessary: 'boolean',
			},
		},
		error: { fields: { code: 'string', message: 'string' }, nullable: true },
		evaluatedAt: 'number',
		explicitChoice: {
			fields: { categories: 'object', version: 'number' },
			nullable: true,
		},
		gppString: 'string | null',
		iab: {
			fields: {
				acceptAll: 'object | null',
				committed: {
					fields: {
						addtlConsent: 'string | null',
						choices: 'object',
						tcString: 'string',
					},
					nullable: true,
				},
				// Older binaries leave out `customVendors` and `disclosure`;
				// `ADDITIVE_IAB_DEFAULTS` in `snapshot-wire-shape.model.ts` fills them before a snapshot
				// is read or graded.
				customVendors: 'array',
				disclosure: {
					fields: {
						adTechProviderPurposeIds: 'array',
						adTechProviders: 'array | null',
						bannerSummary: {
							fields: {
								displayItems: 'array',
								remainingCount: 'number',
								vendorCount: 'number',
							},
						},
						consentStorageMaxDays: 'number | null',
						declaredPurposeIds: 'array',
						declaredSpecialFeatureIds: 'array',
						language: 'string',
						purposes: 'object',
						vendors: 'object',
					},
					nullable: true,
				},
				editable: 'boolean',
				gvl: 'object | null',
				headlessUnsupported: 'array',
			},
			nullable: true,
		},
		iabMarketingPurposes: 'boolean | null',
		location: {
			fields: { countryCode: 'string | null', regionCode: 'string | null' },
			nullable: true,
		},
		model: { enum: NATIVE_MODELS },
		nextDeadline: 'number | null',
		optOut: {
			fields: {
				heldBy: { enum: OPT_OUT_HOLDERS },
				method: { enum: OPT_OUT_METHODS },
				recordedAt: 'number',
				rights: 'array',
			},
			nullable: true,
		},
		overrides: {
			fields: {
				country: 'string | null',
				gpc: 'boolean | null',
				language: 'string',
				region: 'string | null',
			},
		},
		policyPending: 'boolean',
		policySnapshotToken: 'string | null',
		privacySignals: {
			fields: {
				gpc: {
					fields: {
						active: 'boolean',
						detected: 'boolean',
						override: 'boolean | null',
					},
				},
			},
		},
		promptOwedSince: 'number | null',
		promptRequirement: {
			fields: {
				kind: { enum: ['choice', 'notice', 'none'] },
				reason: { enum: PROMPT_REASONS, optional: true },
			},
		},
		ready: 'boolean',
		resolution: {
			fields: {
				fingerprint: 'string | null',
				policyId: 'string | null',
				reason: { enum: POLICY_RESOLUTION_FAILURES, optional: true },
				status: { enum: ['unconfigured', 'matched', 'no-match', 'failed'] },
			},
		},
		restrictions: 'object',
		revision: 'number',
		subject: {
			fields: {
				externalId: 'string?',
				subjectId: 'string?',
			},
			nullable: true,
		},
		translations: 'object | null',
	},
	snapshotEvent: {
		dirty: 'boolean',
		revision: 'number',
	},
	trackingAuthorization: {
		answeredAt: 'number?',
		status: { enum: TRACKING_AUTHORIZATION_STATUSES },
	},
	trackingRequest: {
		presentation: { enum: TRACKING_PRESENTATIONS, optional: true },
		stage: { enum: TRACKING_REQUEST_STAGES },
		status: { enum: TRACKING_AUTHORIZATION_STATUSES },
	},
	trackingRequestOptions: {
		additionalInformation: 'boolean?',
	},
} as const satisfies Readonly<Record<string, BridgeFields>>;

/** The name of one bridge payload. */
export type BridgePayloadName = keyof typeof BRIDGE_PAYLOADS;

/** Payloads JavaScript sends to native; every other payload goes the other way. */
export const JS_TO_NATIVE_PAYLOADS = [
	'autoPresentSettings',
	'commitIntent',
	'overridesInput',
	'trackingRequestOptions',
] as const satisfies readonly BridgePayloadName[];

/** The explicit form of a field, as `payloads.json` carries it. */
export interface BridgeField {
	readonly type: BridgeValueKind;
	readonly required: boolean;
	readonly nullable: boolean;
	readonly values?: readonly string[];
	readonly fields?: Readonly<Record<string, BridgeField>>;
}

/**
 * Expand one field to its explicit form.
 *
 * @param spec - A shorthand string or an enum or object field.
 * @returns The field with every property spelled out.
 */
export const normalizeBridgeField = function normalizeBridgeField(
	spec: BridgeFieldSpec
): BridgeField {
	if (typeof spec === 'string') {
		const nullable = spec.endsWith(' | null');
		const head = nullable ? spec.slice(0, -' | null'.length) : spec;
		const optional = head.endsWith('?');
		return {
			nullable,
			required: !optional,
			type: (optional ? head.slice(0, -1) : head) as BridgeValueKind,
		};
	}
	const base = {
		nullable: spec.nullable === true,
		required: spec.optional !== true,
	};
	if ('enum' in spec) {
		return { ...base, type: 'string', values: [...spec.enum] };
	}
	const { fields } = spec;
	return {
		...base,
		fields: Object.fromEntries(
			Object.keys(fields)
				.sort()
				.map((key) => [
					key,
					normalizeBridgeField(fields[key] as BridgeFieldSpec),
				])
		),
		type: 'object',
	};
};

const normalizeFields = function normalizeFields(
	fields: BridgeFields
): Readonly<Record<string, BridgeField>> {
	return normalizeBridgeField({ fields }).fields ?? {};
};

/**
 * The document written to `packages/native-protocol/bridge/payloads.json`.
 *
 * @returns Every payload with its direction and explicit fields, keys sorted.
 */
export const renderBridgeSchema = function renderBridgeSchema() {
	const names = Object.keys(BRIDGE_PAYLOADS).sort() as BridgePayloadName[];
	return {
		$comment:
			'Generated from packages/react-native/src/protocol/bridge-schema.ts by `bun run --cwd packages/react-native generate:bridge-schema`. Do not edit by hand.',
		payloads: Object.fromEntries(
			names.map((name) => [
				name,
				{
					direction: (JS_TO_NATIVE_PAYLOADS as readonly string[]).includes(name)
						? 'js-to-native'
						: 'native-to-js',
					fields: normalizeFields(BRIDGE_PAYLOADS[name]),
				},
			])
		),
	};
};

const kindOf = function kindOf(value: unknown): BridgeValueKind | 'null' {
	if (value === null) {
		return 'null';
	}
	if (Array.isArray(value)) {
		return 'array';
	}
	return typeof value as BridgeValueKind;
};

const describeFields = function describeFields(
	fields: Readonly<Record<string, BridgeField>>,
	value: Record<string, unknown>,
	path: string,
	allowUnknownKeys: boolean,
	problems: string[]
): void {
	for (const [key, field] of Object.entries(fields)) {
		const at = `${path}${key}`;
		if (!Object.hasOwn(value, key)) {
			if (field.required) {
				problems.push(`${at}: required, absent from the payload`);
			}
			continue;
		}
		const item = value[key];
		const kind = kindOf(item);
		if (kind === 'null') {
			if (!field.nullable) {
				problems.push(`${at}: null where a ${field.type} is required`);
			}
			continue;
		}
		if (kind !== field.type) {
			problems.push(`${at}: expected ${field.type}, found ${kind}`);
			continue;
		}
		if (field.values && !field.values.includes(item as string)) {
			problems.push(
				`${at}: "${String(item)}" is not one of ${field.values.join(', ')}`
			);
		}
		if (field.fields && Object.keys(field.fields).length > 0) {
			describeFields(
				field.fields,
				item as Record<string, unknown>,
				`${at}.`,
				allowUnknownKeys,
				problems
			);
		}
	}
	if (!allowUnknownKeys) {
		for (const key of Object.keys(value)) {
			if (!Object.hasOwn(fields, key)) {
				problems.push(`${path}${key}: not a key this payload declares`);
			}
		}
	}
};

/**
 * Name every way a parsed bridge payload departs from its declared shape.
 *
 * @param name - Which payload `value` is.
 * @param value - The parsed JSON.
 * @param options - `allowUnknownKeys` accepts keys a newer native build added.
 * @returns One line per problem, empty when the payload matches.
 *
 * @example
 * ```ts
 * const problems = describeBridgePayloadDrift(
 * 	'bootstrap',
 * 	JSON.parse(nativeModule.getBootstrap())
 * );
 * ```
 */
export const describeBridgePayloadDrift = function describeBridgePayloadDrift(
	name: BridgePayloadName,
	value: unknown,
	options: { readonly allowUnknownKeys?: boolean } = {}
): string[] {
	if (kindOf(value) !== 'object') {
		return [`${name}: the payload is not a JSON object`];
	}
	const problems: string[] = [];
	describeFields(
		normalizeFields(BRIDGE_PAYLOADS[name]),
		value as Record<string, unknown>,
		'',
		options.allowUnknownKeys === true,
		problems
	);
	return problems;
};
