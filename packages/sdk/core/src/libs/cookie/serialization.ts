/**
 * @packageDocumentation
 * Reads the v2 compact cookie format, `key:value,key:value`. Nothing
 * writes it now; a v2 cookie is read once and replaced by a v3 record.
 */

/**
 * Parses a compact string format back to a flattened object.
 * Format: "key1:value1,key2:value2,key3:value3"
 *
 * @param str - Compact string representation
 *
 * @remarks
 * Handles both optimized format (without false values) and legacy format.
 * Missing keys from the optimized format will not be present in the result.
 *
 * @internal
 *
 * @example
 * ```typescript
 * // Optimized format (false values omitted)
 * stringToFlat("c.necessary:1,i.t:123")
 * // Returns: { 'c.necessary': '1', 'i.t': '123' }
 *
 * // Legacy format (with explicit false values)
 * stringToFlat("c.necessary:1,c.analytics:0")
 * // Returns: { 'c.necessary': '1', 'c.analytics': '0' }
 * ```
 */
export const stringToFlat = function stringToFlat(
	str: string
): Record<string, string> {
	if (!str) {
		return {};
	}

	const result: Record<string, string> = {};
	const pairs = str.split(',');

	for (const pair of pairs) {
		const colonIndex = pair.indexOf(':');
		if (colonIndex === -1) {
			continue;
		}

		const key = pair.substring(0, colonIndex);
		const value = pair.substring(colonIndex + 1);
		result[key] = value;
	}

	return result;
};
