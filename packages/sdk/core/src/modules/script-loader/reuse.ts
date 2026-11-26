import type { Script, ScriptCallbackInfo } from './types';

const registrationStates = new WeakMap<
	ScriptCallbackInfo,
	readonly ScriptCallbackInfo[]
>();

/**
 * Read each loader's state before evaluating compound feature conditions:
 * the combined info's own `registrations`, which survive a bundle boundary
 * such as an adapter file, else this module's record, else `info` alone.
 * @internal
 */
export const getScriptRegistrations = (
	info: ScriptCallbackInfo
): readonly ScriptCallbackInfo[] =>
	info.registrations ?? registrationStates.get(info) ?? [info];

type ConfigFields = Record<PropertyKey, unknown>;
type ConfigCopy = ConfigFields | unknown[];

/** Copy only configuration data; callbacks and SDK instances keep their identity. */
const isConfigObject = (value: unknown): value is ConfigFields => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const prototype: unknown = Object.getPrototypeOf(value);
	return (
		(Array.isArray(value) && prototype === Array.prototype) ||
		prototype === Object.prototype ||
		prototype === null
	);
};

const snapshotConfig = (
	value: unknown,
	seen = new WeakMap<ConfigFields, ConfigCopy>()
): unknown => {
	if (!isConfigObject(value)) {
		return value;
	}
	const known = seen.get(value);
	if (known) {
		return known;
	}
	const copy: ConfigCopy = Array.isArray(value)
		? Array.prototype.slice.call(value)
		: Object.create(Object.getPrototypeOf(value));
	seen.set(value, copy);
	for (const key of Reflect.ownKeys(value)) {
		if (Object.prototype.propertyIsEnumerable.call(value, key)) {
			Object.defineProperty(copy, key, {
				configurable: true,
				enumerable: true,
				value: snapshotConfig(value[key], seen),
				writable: true,
			});
		}
	}
	return copy;
};

const configKeys = (value: ConfigFields): (string | symbol)[] =>
	Reflect.ownKeys(value).filter(
		(key) =>
			Object.prototype.propertyIsEnumerable.call(value, key) &&
			value[key] !== undefined
	);

/** Compare configuration data by value, ignoring undefined object fields. @internal */
export const equalConfig = (
	previous: unknown,
	next: unknown,
	seen = new WeakMap<ConfigFields, ConfigFields>()
): boolean => {
	if (Object.is(previous, next)) {
		return true;
	}
	if (!isConfigObject(previous) || !isConfigObject(next)) {
		return false;
	}
	if (
		Object.getPrototypeOf(previous) !== Object.getPrototypeOf(next) ||
		(Array.isArray(previous) && previous.length !== next.length)
	) {
		return false;
	}
	const known = seen.get(previous);
	if (known) {
		return known === next;
	}
	seen.set(previous, next);
	const keys = configKeys(previous);
	return (
		keys.length === configKeys(next).length &&
		keys.every(
			(key) =>
				Object.hasOwn(next, key) && equalConfig(previous[key], next[key], seen)
		)
	);
};

/**
 * Reuse browser scripts with equal options before mounting and across rerenders.
 * Only callers retain configurations; disposal releases the running lifecycle.
 * Functions and SDK instances compare by identity; data compares by value.
 * The npm helpers in `@inth/integrations` and the script loader's remote
 * scripts share it, so both combine several registrations the same way.
 *
 * With `deniedView`, a callback whose combined registrations deny the
 * script sees every category denied and the vendor off, so a manifest's
 * `consent` conditions fail too, even for a negated category.
 *
 * @returns A factory scoped to one integration.
 * @internal
 */
export const createScriptReuse = <OptionsType extends object>({
	deniedView = false,
}: { deniedView?: boolean } = {}) => {
	interface Entry {
		options: OptionsType;
		script: Script;
	}
	const entries = new Set<WeakRef<Entry>>();
	const collected = new FinalizationRegistry<WeakRef<Entry>>((reference) => {
		entries.delete(reference);
	});

	return (
		options: OptionsType,
		create: (options: OptionsType) => Script
	): Script => {
		if (typeof document !== 'undefined') {
			for (const reference of entries) {
				const entry = reference.deref();
				if (!entry) {
					entries.delete(reference);
				} else if (equalConfig(entry.options, options)) {
					return entry.script;
				}
			}
		}
		const savedOptions = snapshotConfig(options) as OptionsType;
		let current: Script | undefined = create(savedOptions);
		const script: Script = { ...current };
		const entry = { options: savedOptions, script };
		const reference = new WeakRef(entry);
		collected.register(entry, reference);
		const register = (): void => {
			if (typeof document !== 'undefined') {
				entries.add(reference);
			}
		};
		register();
		const standaloneRegistration = Symbol('script-registration');
		const registrations = new Map<symbol, ScriptCallbackInfo>();
		const registrationOf = (info: ScriptCallbackInfo): symbol =>
			info.registration ??
			registrations.keys().next().value ??
			standaloneRegistration;
		const combine = (info: ScriptCallbackInfo): ScriptCallbackInfo => {
			const states = [...registrations.values()];
			const vendor = states.find((state) => state.vendor)?.vendor;
			const hasConsent = states.every((state) => state.hasConsent);
			// Only another registration's denial: a registration's own denied
			// category leaves its other categories as they are, as a script
			// no other loader shares sees them.
			const own = registrationOf(info);
			const denied =
				deniedView &&
				[...registrations].some(
					([registration, state]) => registration !== own && !state.hasConsent
				);
			const combined = {
				...info,
				hasConsent,
				vendor: vendor
					? {
							...vendor,
							granted:
								!denied &&
								states.every((state) => state.vendor?.granted !== false),
						}
					: undefined,
			};
			if (denied) {
				combined.consents = Object.fromEntries(
					Object.keys(info.consents).map((name) => [name, false])
				) as ScriptCallbackInfo['consents'];
			}
			// The spread copies only enumerable fields; keep the loader's
			// non-enumerable ones, such as the registration a script keys its
			// own state by and the consent and error readers.
			for (const key of Reflect.ownKeys(info)) {
				const field = Object.getOwnPropertyDescriptor(info, key);
				if (field && !field.enumerable && key !== 'registrations') {
					Object.defineProperty(combined, key, field);
				}
			}
			registrationStates.set(combined, states);
			Object.defineProperty(combined, 'registrations', { value: states });
			return combined;
		};
		const activate = (info: ScriptCallbackInfo): Script => {
			current ??= create(entry.options);
			registrations.set(registrationOf(info), info);
			register();
			return current;
		};
		const originalBeforeLoad = script.onBeforeLoad;
		const originalServerStart = script.serverStart;
		const onBeforeLoad: Script['onBeforeLoad'] = (info) =>
			activate(info).onBeforeLoad?.(combine(info));
		script.onBeforeLoad = onBeforeLoad;
		if (originalServerStart) {
			script.serverStart = (info, started) =>
				started.onBeforeLoad === onBeforeLoad
					? originalServerStart(info, {
							...started,
							onBeforeLoad: originalBeforeLoad,
						})
					: undefined;
		}
		script.onConsentChange = (info) =>
			activate(info).onConsentChange?.(combine(info));
		script.onDispose = (info) => {
			const removed = registrations.delete(registrationOf(info));
			const remaining = registrations.values().next().value;
			if (remaining) {
				if (removed) {
					current?.onConsentChange?.(combine(remaining));
				}
				return;
			}
			// Keep the weak reservation for callers that retain and remount this script.
			const previous = current;
			current = undefined;
			previous?.onDispose?.(info);
		};
		script.onLoad = (info) => activate(info).onLoad?.(combine(info));
		// The running script's, not the first one built: a disposed and
		// remounted script has a new one.
		if (script.onError) {
			script.onError = (info) => current?.onError?.(combine(info));
		}
		return script;
	};
};
