/**
 * Read the JSON a banner component left in its spot.
 *
 * @param spot - The placeholder element.
 * @param attribute - The attribute carrying the JSON.
 * @returns The parsed value, or `null` when it is missing or malformed.
 */
export const readSpot = function readSpot(
	spot: HTMLElement,
	attribute: string
): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(spot.getAttribute(attribute) ?? '');
		return parsed && typeof parsed === 'object'
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
};
