import { trimToUndefined } from './script-url';

/**
 * Converts an optional boolean into a script `data-*` attribute value.
 * `undefined` stays `undefined` so the manifest compiler omits the attribute.
 * So does `vendorDefault`, the value the vendor's script assumes when the
 * attribute is missing: a site that passes it and one that leaves it out,
 * and the remote form that always fills it, then build the same tag.
 */
export const booleanDataAttribute = function booleanDataAttribute(
	value: boolean | undefined,
	vendorDefault?: boolean
): string | undefined {
	if (value === undefined || value === vendorDefault) {
		return undefined;
	}

	if (value) {
		return 'true';
	}

	return 'false';
};

/**
 * Converts a string or string list into a comma-separated script `data-*`
 * attribute value, the list format vendor trackers such as Umami and Pirsch
 * split on.
 *
 * @returns The trimmed string, the trimmed non-empty items joined with commas,
 * or `undefined` when nothing remains so the manifest compiler can omit the
 * attribute.
 */
export const listDataAttribute = function listDataAttribute(
	value: string[] | string | undefined
): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (Array.isArray(value)) {
		const items = value
			.map((item) => item.trim())
			.filter((item) => item.length > 0);

		if (items.length === 0) {
			return undefined;
		}

		return items.join(',');
	}

	return trimToUndefined(value);
};
