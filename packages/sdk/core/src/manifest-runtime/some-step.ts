/**
 * Walking a manifest's step lists, nested ones included. A file of its own,
 * apart from the level tables in `features.ts`, so `inth.js`, which only
 * looks for level 3 steps, carries none of those tables.
 */

/** Step fields that hold a list of nested steps. */
export const NESTED_STEP_LISTS = ['then', 'else', 'steps'] as const;

/** The deepest nesting a walk follows. */
export const MAX_DEPTH = 32;

export const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

/** Whether `test` holds for a step in `steps`, or a step nested in one. */
export const someStep = (
	steps: unknown,
	test: (step: Record<string, unknown>) => boolean,
	depth = 0
): boolean =>
	Array.isArray(steps) &&
	depth <= MAX_DEPTH &&
	steps.some(
		(step) =>
			isObject(step) &&
			(test(step) ||
				NESTED_STEP_LISTS.some((field) =>
					someStep(step[field], test, depth + 1)
				))
	);
