import type { CommitIntent, OptionalConsentCategory } from '@inth/react-native';

/**
 * The categories an `explicit` intent may name. A `Record` over the type, so a
 * missing or invented category fails the type check. A value import from
 * `@inth/react-native` would load React Native, which this file must not.
 */
const OPTIONAL_CATEGORIES: Record<OptionalConsentCategory, true> = {
	experience: true,
	functionality: true,
	marketing: true,
	measurement: true,
};

/**
 * `consents` as both native decoders accept it: a JSON object, not an array,
 * whose keys are optional categories and whose values are booleans. `necessary`
 * is nobody's choice, so it is refused like an unknown name.
 */
const isConsentMap = (value: unknown): boolean =>
	typeof value === 'object' &&
	value !== null &&
	!Array.isArray(value) &&
	Object.entries(value).every(
		([name, granted]) =>
			Object.hasOwn(OPTIONAL_CATEGORIES, name) && typeof granted === 'boolean'
	);

/**
 * Read a commit intent the way both native decoders do: `explicit` takes
 * `action` and `consents`, `all` and `necessary` take `action` alone, and
 * anything else is refused rather than widened to the whole choice scope.
 *
 * @param text - The JSON the module received.
 * @returns The intent, or `null` for `invalid-intent`.
 */
export const readIntent = (text: string): CommitIntent | null => {
	let intent: Record<string, unknown>;
	try {
		const parsed: unknown = JSON.parse(text);
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return null;
		}
		intent = parsed as Record<string, unknown>;
	} catch {
		return null;
	}
	const allowed: readonly string[] =
		intent.action === 'explicit' ? ['action', 'consents'] : ['action'];
	if (
		!['all', 'necessary', 'explicit'].includes(String(intent.action)) ||
		Object.keys(intent).some((key) => !allowed.includes(key)) ||
		(intent.action === 'explicit' && !isConsentMap(intent.consents))
	) {
		return null;
	}
	return intent as unknown as CommitIntent;
};
