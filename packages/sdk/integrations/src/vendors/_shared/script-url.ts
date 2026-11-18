/**
 * Trims an optional string and treats empty or whitespace-only values as
 * missing.
 */
export const trimToUndefined = function trimToUndefined(
	value: string | undefined
): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return undefined;
	}

	return trimmed;
};

/** Whether `value` parses as an absolute `https:` URL. */
export const isHttpsUrl = function isHttpsUrl(value: string): boolean {
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
};

/**
 * A script URL override, trimmed, or `undefined` when it is unset or blank.
 *
 * @param vendor - The helper's name, for the error.
 * @throws {Error} When the override is not an absolute `https:` URL.
 */
export const httpsScriptUrl = function httpsScriptUrl(
	vendor: string,
	value: string | undefined
): string | undefined {
	const scriptUrl = trimToUndefined(value);
	if (scriptUrl !== undefined && !isHttpsUrl(scriptUrl)) {
		throw new Error(`${vendor}: scriptUrl must be a valid https URL`);
	}
	return scriptUrl;
};

/**
 * Resolves a script URL from an optional override and a required fallback.
 * An empty or whitespace-only override counts as unset.
 */
export const resolveScriptUrl = function resolveScriptUrl(
	override: string | undefined,
	fallback: string
): string {
	return trimToUndefined(override) ?? fallback;
};

/**
 * Removes leading slash characters without using a regular expression.
 *
 * This helper is used on caller-controlled URL fragments, so it intentionally
 * stays linear even for very long repeated slash input.
 */
export const stripLeadingSlashes = function stripLeadingSlashes(
	value: string
): string {
	let index = 0;
	while (index < value.length && value.charCodeAt(index) === 47) {
		index += 1;
	}

	return index === 0 ? value : value.slice(index);
};

/**
 * Removes trailing slash characters without using a regular expression.
 *
 * This helper is used on caller-controlled URL fragments, so it intentionally
 * stays linear even for very long repeated slash input.
 */
export const stripTrailingSlashes = function stripTrailingSlashes(
	value: string
): string {
	let end = value.length;
	while (end > 0 && value.charCodeAt(end - 1) === 47) {
		end -= 1;
	}

	return end === value.length ? value : value.slice(0, end);
};

/**
 * Joins a base URL and path with exactly one slash between them.
 */
export const joinUrlPath = function joinUrlPath(
	base: string,
	path: string
): string {
	const trimmedBase = base.trim();
	const trimmedPath = path.trim();

	if (trimmedBase.length === 0) {
		throw new TypeError(
			`joinUrlPath requires a non-empty base URL. Received base=${JSON.stringify(
				base
			)}, path=${JSON.stringify(path)}.`
		);
	}

	if (trimmedPath.length === 0) {
		throw new TypeError(
			`joinUrlPath requires a non-empty path. Received base=${JSON.stringify(
				base
			)}, path=${JSON.stringify(path)}.`
		);
	}

	return `${stripTrailingSlashes(trimmedBase)}/${stripLeadingSlashes(trimmedPath)}`;
};
