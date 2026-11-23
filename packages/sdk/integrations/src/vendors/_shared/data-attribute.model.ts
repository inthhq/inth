import { trimToUndefined } from './script-url.model';

/**
 * Converts an optional boolean into a script `data-*` attribute value.
 * `undefined` stays `undefined` so the manifest compiler omits the attribute.
 */
export const booleanDataAttribute = function booleanDataAttribute(
	value: boolean | undefined
): string | undefined {
	if (value === undefined) {
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
