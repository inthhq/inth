/** Whether `value` is a plain object: not `null` and not an array. */
export const isRecord = function isRecord(
	value: unknown
): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
};
