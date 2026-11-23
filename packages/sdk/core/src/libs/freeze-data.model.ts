/** Freeze owned plain data recursively, reusing already-frozen branches. */
export const deepFreeze = function deepFreeze(value: unknown): void {
	if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
		return;
	}
	Object.freeze(value);
	for (const nested of Object.values(value as Record<string, unknown>)) {
		deepFreeze(nested);
	}
};

/**
 * A frozen copy of the script registry's sources, so a snapshot never
 * shares, or changes with, the caller's object. `null` when there are none,
 * or when they are not plain data.
 *
 * @internal
 */
export const ownScriptRegistry = function ownScriptRegistry<SourcesType>(
	sources: SourcesType | null | undefined
): Readonly<SourcesType> | null {
	if (sources === null || sources === undefined) {
		return null;
	}
	try {
		const copy = structuredClone(sources);
		deepFreeze(copy);
		return copy;
	} catch {
		return null;
	}
};
