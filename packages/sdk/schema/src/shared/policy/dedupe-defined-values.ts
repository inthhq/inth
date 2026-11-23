export const dedupeDefinedValues = function dedupeDefinedValues<T>(
	values?: readonly T[] | null
): T[] | undefined {
	if (!values || values.length === 0) {
		return undefined;
	}

	return [...new Set(values)];
};
