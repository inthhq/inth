/**
 * Option kinds for remote integrations, and `defineRemote`, which a vendor
 * file uses to describe the options the Inth server may set.
 *
 * Kept apart from `remote.ts` so a vendor file can import it without pulling
 * in every other vendor.
 */
import type { BuiltInScriptIntegrationKey } from './registry';
import type { ResolvedManifest } from './types';

/**
 * An ID that must match `pattern`, a regular expression with the `u` flag,
 * anchored at both ends.
 */
export interface RemoteIdOption {
	kind: 'id';
	label: string;
	pattern: string;
	example: string;
	required: boolean;
}

/**
 * A DNS name such as `go.example.com`: lowercase labels, with no scheme,
 * port, path, credentials or IP address. Only for a vendor whose tracker
 * runs on the customer's own domain.
 */
export interface RemoteHostnameOption {
	kind: 'hostname';
	label: string;
	example: string;
	required: boolean;
}

/** One of `values`. A missing value takes `default`. */
export interface RemoteEnumOption {
	kind: 'enum';
	label: string;
	values: readonly string[];
	default: string;
}

/** `true` or `false`. A missing value takes `default`. */
export interface RemoteBooleanOption {
	kind: 'boolean';
	label: string;
	default: boolean;
}

/** A finite number, within `min` and `max` when set. */
export interface RemoteNumberOption {
	kind: 'number';
	label: string;
	example: number;
	required: boolean;
	min?: number;
	max?: number;
	/** Refuses a number with a fraction. */
	integer?: boolean;
}

/**
 * Up to `maxItems` distinct IDs, each matching `pattern`. A required list
 * needs at least one ID.
 */
export interface RemoteIdListOption {
	kind: 'idList';
	label: string;
	pattern: string;
	example: string;
	maxItems: number;
	required: boolean;
}

/**
 * Up to `maxEntries` keys matching `keyPattern`, each mapped to one of
 * `values`. `__proto__`, `prototype` and `constructor` are never keys.
 */
export interface RemoteMapOption {
	kind: 'map';
	label: string;
	keyPattern: string;
	keyExample: string;
	values: readonly string[];
	maxEntries: number;
	required: boolean;
}

/** A single value an object field can hold. */
export type RemoteScalarOption =
	| RemoteIdOption
	| RemoteHostnameOption
	| RemoteEnumOption
	| RemoteBooleanOption
	| RemoteNumberOption;

/** An object inside an object option. Its fields are scalars. */
export interface RemoteNestedObjectOption {
	kind: 'object';
	label: string;
	fields: Readonly<Record<string, RemoteScalarOption>>;
	required: boolean;
}

/**
 * An object with the declared `fields` only. Fields are scalars or one more
 * object of scalars, so an option is at most two levels deep.
 */
export interface RemoteObjectOption {
	kind: 'object';
	label: string;
	fields: Readonly<
		Record<string, RemoteScalarOption | RemoteNestedObjectOption>
	>;
	required: boolean;
}

/**
 * One option of a remote integration. A dashboard form renders from it.
 * Values are JSON. No kind takes a URL: a script URL is built from a fixed
 * vendor host and validated values.
 */
export type RemoteOptionSpec =
	| RemoteScalarOption
	| RemoteIdListOption
	| RemoteObjectOption
	| RemoteMapOption;

/** A validated option value. */
export type RemoteOptionValue =
	| string
	| number
	| boolean
	| string[]
	| { [name: string]: RemoteOptionValue };

type SpecValue<TSpec> = TSpec extends {
	kind: 'enum';
	values: readonly (infer TValue)[];
}
	? TValue
	: TSpec extends { kind: 'boolean' }
		? boolean
		: TSpec extends { kind: 'number' }
			? number
			: TSpec extends { kind: 'idList' }
				? string[]
				: TSpec extends { kind: 'map'; values: readonly (infer TValue)[] }
					? Record<string, TValue>
					: TSpec extends { kind: 'object'; fields: infer TFields }
						? RemoteOptionValues<TFields>
						: string;

type AlwaysSet<TSpec> = TSpec extends { kind: 'enum' | 'boolean' }
	? true
	: TSpec extends { required: true }
		? true
		: false;

type Simplify<T> = { [K in keyof T]: T[K] };

/** The options `resolve` receives for a set of option specs. */
export type RemoteOptionValues<TSpecs> = Simplify<
	{
		[
			K in keyof TSpecs as AlwaysSet<TSpecs[K]> extends true ? K : never
		]: SpecValue<TSpecs[K]>;
	} & {
		[
			K in keyof TSpecs as AlwaysSet<TSpecs[K]> extends true ? never : K
		]?: SpecValue<TSpecs[K]>;
	}
>;

/** What a vendor file exports as `remote`. */
export interface RemoteDefinition<
	TSpecs extends Readonly<Record<string, RemoteOptionSpec>> = Readonly<
		Record<string, RemoteOptionSpec>
	>,
> {
	/** Registry key, such as `metaPixel`. */
	readonly key: BuiltInScriptIntegrationKey;
	readonly options: TSpecs;
	/**
	 * The vendor's manifest resolver, the same function its npm helper calls.
	 * Receives options that passed validation.
	 */
	readonly resolve: (options: RemoteOptionValues<TSpecs>) => ResolvedManifest;
}

const deepFreeze = function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === 'object') {
		for (const child of Object.values(value)) {
			deepFreeze(child);
		}
		Object.freeze(value);
	}
	return value;
};

/**
 * Describes the options the Inth server may set for a vendor, and the
 * resolver that turns them into a manifest. A vendor file exports the result
 * as `remote`, beside the resolver its npm helper calls; the catalogue in
 * `@inth/integrations/remote` finds it through the registry.
 *
 * @example
 * ```ts
 * export const remote = defineRemote(
 * 	'metaPixel',
 * 	{ pixelId: { example: '123', kind: 'id', label: 'Pixel ID', pattern: '^[0-9]+$', required: true } },
 * 	resolveMetaPixelManifest
 * );
 * ```
 */
// A vendor file calls this at load. The annotation lets a bundler drop the
// call from an npm bundle that never reads `remote`.
// oxlint-disable-next-line no-inline-comments -- Bundlers require this annotation at the function.
export const defineRemote = /* #__NO_SIDE_EFFECTS__ */ function defineRemote<
	const TSpecs extends Readonly<Record<string, RemoteOptionSpec>>,
>(
	key: BuiltInScriptIntegrationKey,
	options: TSpecs,
	resolve: (options: RemoteOptionValues<TSpecs>) => ResolvedManifest
): RemoteDefinition<TSpecs> {
	return Object.freeze({ key, options: deepFreeze(options), resolve });
};
