/**
 * The manifest runtime level of every manifest field, step field, step type
 * and runtime value. The parser knows exactly these names, and
 * `manifestFeatureLevel` reads a manifest's level from them, so a feature
 * cannot be runnable without a level.
 */
import { RUNTIME_VALUE_KIND } from './types';
import type { ManifestStep, ResolvedManifest, RuntimeValue } from './types';

type Level = 1 | 2;

/** Each manifest field's level. */
export const MANIFEST_FIELD_LEVELS: Readonly<
	Record<keyof ResolvedManifest, Level>
> = {
	afterLoadSteps: 1,
	alwaysLoad: 1,
	bootstrapSteps: 1,
	category: 1,
	consentMapping: 1,
	consentSignal: 1,
	consentSignalDefaults: 1,
	consentSignalTarget: 1,
	globals: 2,
	kind: 1,
	loadScript: 1,
	observeConsentBeforeLoad: 2,
	onBeforeLoadDeniedSteps: 1,
	onBeforeLoadGrantedSteps: 1,
	onConsentChangeSteps: 1,
	onConsentDeniedSteps: 1,
	onConsentGrantedSteps: 1,
	onDisposeSteps: 2,
	onLoadDeniedSteps: 1,
	onLoadGrantedSteps: 1,
	persistAfterConsentRevoked: 1,
	persistAfterDispose: 2,
	requires: 1,
	resourceKey: 2,
	schemaVersion: 1,
	setupSteps: 1,
	target: 2,
	vendor: 1,
	vendorDetails: 1,
};

/**
 * Each step type's fields and their levels. `type` holds the level of the
 * step type itself.
 */
export const STEP_FIELD_LEVELS: {
	readonly [Type in ManifestStep['type']]: Readonly<
		Record<keyof Extract<ManifestStep, { type: Type }>, Level>
	>;
} = {
	callGlobal: {
		args: 1,
		global: 1,
		literalArgs: 1,
		method: 1,
		path: 2,
		type: 1,
	},
	constructGlobal: {
		args: 1,
		assignTo: 1,
		constructor: 1,
		copyAssignedValueToArgProperty: 1,
		type: 1,
	},
	defineGlobalMethods: { ifGlobalIsQueue: 1, methods: 1, target: 1, type: 1 },
	defineQueueClass: {
		methods: 1,
		name: 1,
		queueProperty: 1,
		target: 1,
		type: 1,
	},
	defineQueueFunction: {
		ifUndefined: 1,
		name: 1,
		pushStyle: 1,
		queue: 1,
		type: 1,
	},
	defineQueueMethods: {
		methods: 1,
		preserveExisting: 1,
		queue: 1,
		queueFormat: 1,
		returnTarget: 1,
		target: 1,
		type: 1,
	},
	defineQueueProxy: { name: 1, queue: 1, type: 1 },
	defineStubFunction: {
		aliases: 1,
		dispatchProperty: 1,
		ifUndefined: 1,
		name: 1,
		properties: 1,
		queue: 1,
		queueFormat: 1,
		selfReferences: 1,
		type: 1,
	},
	loadScript: {
		async: 1,
		attributes: 1,
		defer: 1,
		fetchPriority: 1,
		src: 1,
		type: 1,
	},
	loadScriptStep: {
		async: 2,
		attributes: 2,
		id: 2,
		src: 2,
		type: 2,
		unlessGlobal: 2,
	},
	pushToQueue: { queue: 1, type: 1, value: 1 },
	removeScript: { id: 2, type: 2 },
	setCookie: { cookie: 1, type: 1 },
	setGlobal: {
		ifUndefined: 1,
		keepExistingQueue: 1,
		name: 1,
		type: 1,
		value: 1,
	},
	setGlobalPath: {
		ifGlobalIsQueue: 1,
		ifUndefined: 1,
		path: 1,
		type: 1,
		value: 1,
	},
};

/**
 * Values of a step field above level 1, by step type and field. A value
 * not listed here is level 1.
 */
export const STEP_VALUE_LEVELS: {
	readonly [Type in ManifestStep['type']]?: {
		readonly [Field in keyof Extract<ManifestStep, { type: Type }>]?: Readonly<
			Record<string, Level>
		>;
	};
} = {
	defineQueueMethods: { queueFormat: { nameAndArguments: 2 } },
};

/** The `queueFormat` values `defineQueueMethods` takes. */
export const QUEUE_METHOD_FORMATS: ReadonlySet<unknown> = new Set([
	'tuple',
	'nameAndArgs',
	'methodCall',
	'wrappedMethodCall',
	'voidMethodCall',
	'callback',
	'nameAndArguments',
]);

/** Each runtime value's level. */
export const RUNTIME_VALUE_LEVELS: Readonly<
	Record<RuntimeValue['value'], Level>
> = {
	consentGate: 2,
	consents: 2,
	date: 1,
	hasConsent: 2,
	scriptElement: 2,
	scriptNonce: 2,
	timestamp: 1,
};

/**
 * The script attributes `loadScript` may set besides `data-*` ones and the
 * few that only shape the fetch, by level. `id` is for vendors whose file
 * finds its own tag by id.
 */
export const SCRIPT_ATTRIBUTE_LEVELS: Readonly<Record<string, Level>> = {
	id: 2,
};

const MAX_DEPTH = 32;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

/** `table[name]` when `table` lists `name` itself, so `constructor` is not inherited. */
export const levelOf = (
	table: Readonly<Record<string, Level>> | undefined,
	name: unknown
): Level | undefined =>
	table && typeof name === 'string' && Object.hasOwn(table, name)
		? table[name]
		: undefined;

/** The highest level of a runtime value inside `value`. */
const valueLevel = (value: unknown, depth = 0): number => {
	if (depth > MAX_DEPTH || !isObject(value)) {
		return 1;
	}
	if (!Array.isArray(value) && value.kind === RUNTIME_VALUE_KIND) {
		return levelOf(RUNTIME_VALUE_LEVELS, value.value) ?? Infinity;
	}
	let level = 1;
	for (const entry of Object.values(value)) {
		level = Math.max(level, valueLevel(entry, depth + 1));
	}
	return level;
};

const stepLevel = (step: ManifestStep): number => {
	const tables = STEP_FIELD_LEVELS as Record<string, Record<string, Level>>;
	const valueTables = STEP_VALUE_LEVELS as Record<
		string,
		Record<string, Record<string, Level>>
	>;
	const fields = Object.hasOwn(tables, step.type)
		? tables[step.type]
		: undefined;
	const values = Object.hasOwn(valueTables, step.type)
		? valueTables[step.type]
		: undefined;
	let level = valueLevel(step);
	for (const [field, value] of Object.entries(step)) {
		if (value === undefined) {
			continue;
		}
		const valueLevels =
			values && Object.hasOwn(values, field) ? values[field] : undefined;
		level = Math.max(
			level,
			levelOf(fields, field) ?? Infinity,
			levelOf(valueLevels, value) ?? 1
		);
	}
	if (step.type === 'loadScript') {
		for (const name of Object.keys(step.attributes ?? {})) {
			level = Math.max(level, levelOf(SCRIPT_ATTRIBUTE_LEVELS, name) ?? 1);
		}
	}
	return level;
};

/**
 * The manifest runtime level of the newest feature `manifest` uses, from
 * its fields, steps and runtime values. `requires` does not count. A name
 * this table does not list counts as `Infinity`.
 */
export const manifestFeatureLevel = function manifestFeatureLevel(
	manifest: ResolvedManifest
): number {
	let level = 1;
	for (const [field, value] of Object.entries(manifest)) {
		if (value === undefined) {
			continue;
		}
		level = Math.max(level, levelOf(MANIFEST_FIELD_LEVELS, field) ?? Infinity);
		if (field === 'loadScript') {
			level = Math.max(level, stepLevel(value as ManifestStep));
		} else if (field.endsWith('Steps') && Array.isArray(value)) {
			for (const step of value as ManifestStep[]) {
				level = Math.max(level, stepLevel(step));
			}
		}
	}
	return level;
};
