/**
 * The manifest runtime level of every manifest field, step field, step type,
 * runtime value and adapter. The parser knows exactly these names, and
 * `manifestFeatureLevel` reads a manifest's level from them, so a feature
 * cannot be runnable without a level.
 */
import { isObject, MAX_DEPTH, NESTED_STEP_LISTS, someStep } from './some-step';
import { RUNTIME_VALUE_KIND } from './types';
import type {
	ManifestCondition,
	ManifestStep,
	ResolvedManifest,
	RuntimeValue,
} from './types';

type Level = 1 | 2 | 3 | 4;

/**
 * Each manifest field's level, but `adapter`: its level is its adapter's
 * ({@link ADAPTER_LEVELS}), and the runtime's own parser refuses it, since
 * only `withAdapters` runs adapters.
 */
export const MANIFEST_FIELD_LEVELS: Readonly<
	Record<Exclude<keyof ResolvedManifest, 'adapter'>, Level>
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

type StepFields<Type extends ManifestStep['type']> = Readonly<
	Record<keyof Extract<ManifestStep, { type: Type }>, Level>
>;

/** The step types level 3 added, which its part of the runtime runs. */
type LevelThreeStepType = 'defer' | 'if' | 'listen' | 'setFlag';

/**
 * The step types and fields before level 3, and their levels: what the
 * runtime parses with no level 3 part. {@link STEP_FIELD_LEVELS} adds
 * level 3, which the parser reads from the part once it is installed, so
 * none of it is in `inth.manifests.js`.
 * @internal
 */
export const EARLIER_STEP_FIELD_LEVELS: {
	readonly [
		Type in Exclude<ManifestStep['type'], LevelThreeStepType>
	]: Type extends 'callGlobal'
		? Omit<StepFields<Type>, 'then'>
		: StepFields<Type>;
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
		ifNullish: 2,
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
 * Each step type's fields and their levels. `type` holds the level of the
 * step type itself.
 */
export const STEP_FIELD_LEVELS: {
	readonly [Type in ManifestStep['type']]: StepFields<Type>;
} = {
	...EARLIER_STEP_FIELD_LEVELS,
	// oxlint-disable-next-line unicorn/no-thenable -- The step field is named then.
	callGlobal: { ...EARLIER_STEP_FIELD_LEVELS.callGlobal, then: 3 },
	defer: { steps: 3, type: 3 },
	// oxlint-disable-next-line unicorn/no-thenable -- The step field is named then.
	if: { else: 3, then: 3, type: 3, when: 3 },
	listen: { event: 3, once: 3, steps: 3, target: 3, type: 3 },
	setFlag: { name: 3, type: 3, value: 3 },
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

/** Each `if` condition's level, by its key. */
export const CONDITION_LEVELS: Readonly<
	Record<keyof UnionKeys<ManifestCondition>, Level>
> = {
	all: 3,
	consent: 3,
	documentReady: 3,
	flag: 3,
	global: 3,
	is: 3,
	loaded: 3,
	lost: 3,
	not: 3,
};

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
 * Each adapter this SDK ships, by `adapter.id`, and its level. An ID not
 * listed here is one the parser refuses.
 */
export const ADAPTER_LEVELS = {
	activecampaign: 4,
	ada: 4,
	'adobe-target': 4,
	'amazon-ads': 4,
	'cloudflare-zaraz': 4,
	databuddy: 4,
	'default-com': 4,
	fullstory: 4,
	'gainsight-px': 4,
	hubspot: 4,
	'lucky-orange': 4,
	'oracle-eloqua': 4,
	'salesforce-pardot': 4,
	sentry: 4,
} as const satisfies Readonly<Record<string, Level>>;

/**
 * The script attributes `loadScript` may set besides `data-*` ones and the
 * few that only shape the fetch, by level. `id` is for vendors whose file
 * finds its own tag by id.
 */
export const SCRIPT_ATTRIBUTE_LEVELS: Readonly<Record<string, Level>> = {
	id: 2,
};

type UnionKeys<Union> = {
	[Key in Union extends unknown ? keyof Union : never]: true;
};

/** `table[name]` when `table` lists `name` itself, so `constructor` is not inherited. */
export const levelOf = <Entry = Level>(
	table: Readonly<Record<string, Entry>> | undefined,
	name: unknown
): Entry | undefined =>
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

/** The highest level of a condition and the conditions inside it. */
const conditionLevel = (condition: unknown, depth = 0): number => {
	if (depth > MAX_DEPTH || !isObject(condition)) {
		return 1;
	}
	let level = 1;
	for (const [key, value] of Object.entries(condition)) {
		level = Math.max(level, levelOf(CONDITION_LEVELS, key) ?? Infinity);
		if (key === 'not') {
			level = Math.max(level, conditionLevel(value, depth + 1));
		} else if (key === 'all' && Array.isArray(value)) {
			for (const entry of value) {
				level = Math.max(level, conditionLevel(entry, depth + 1));
			}
		}
	}
	return level;
};

const stepLevel = (step: ManifestStep, depth = 0): number => {
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
	if (step.type === 'if') {
		level = Math.max(level, conditionLevel(step.when));
	}
	if (depth < MAX_DEPTH) {
		for (const field of NESTED_STEP_LISTS) {
			const nested = (step as unknown as Record<string, unknown>)[field];
			if (Array.isArray(nested)) {
				for (const inner of nested as ManifestStep[]) {
					level = Math.max(level, stepLevel(inner, depth + 1));
				}
			}
		}
	}
	return level;
};

/**
 * The manifest runtime level of the newest feature `manifest` uses, from
 * its fields, steps, runtime values and adapter. `requires` does not count. A name
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
		level = Math.max(
			level,
			(field === 'adapter'
				? levelOf(ADAPTER_LEVELS, (value as { id?: unknown }).id)
				: levelOf(MANIFEST_FIELD_LEVELS, field)) ?? Infinity
		);
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

export { someStep };
