/**
 * Checks a consent condition that arrived as JSON, such as a remote
 * script's category. Imports nothing, so the script loader's chunk and the
 * manifest runtime's can both carry it.
 */

// The names of `allConsentNames`, inlined so this module imports nothing.
const CATEGORY_NAMES: ReadonlySet<string> = new Set([
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
]);

const MAX_DEPTH = 16;

/**
 * Whether `value` is a known category name, or an `and` / `or` / `not`
 * condition over them with nothing else in it.
 *
 * @internal
 */
export const isCategoryCondition = function isCategoryCondition(
	value: unknown,
	depth = 0
): boolean {
	if (typeof value === 'string') {
		return CATEGORY_NAMES.has(value);
	}
	if (
		typeof value !== 'object' ||
		value === null ||
		Array.isArray(value) ||
		depth > MAX_DEPTH
	) {
		return false;
	}
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record);
	if (keys.length !== 1) {
		return false;
	}
	if (Object.hasOwn(record, 'not')) {
		return isCategoryCondition(record.not, depth + 1);
	}
	const operands = Object.hasOwn(record, 'and') ? record.and : record.or;
	return (
		(Object.hasOwn(record, 'and') || Object.hasOwn(record, 'or')) &&
		Array.isArray(operands) &&
		operands.length > 0 &&
		operands.every((operand) => isCategoryCondition(operand, depth + 1))
	);
};
