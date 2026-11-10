import type { CommitIntent } from '@c15t/react-native';

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
		(intent.action === 'explicit' &&
			(typeof intent.consents !== 'object' || intent.consents === null))
	) {
		return null;
	}
	return intent as unknown as CommitIntent;
};
