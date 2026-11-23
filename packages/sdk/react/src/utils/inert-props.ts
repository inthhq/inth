import { version } from 'react';

/**
 * React 18 does not know `inert`: it drops a boolean value with a warning
 * and passes any string through as an attribute. React 19 treats it as a
 * boolean and drops an empty string. The peer range covers both, so the
 * value depends on the running React.
 */
const LEGACY_INERT = Number.parseInt(version, 10) < 19;

/**
 * Props that make an element `inert` when `on` is true, and leave the
 * attribute off otherwise, on React 18 and 19 alike. Spread them on the
 * element: `<div {...inertProps(!open)} />`.
 *
 * @param on - Whether the element takes no input and is hidden from
 * assistive technology.
 * @param reactVersion - The React version to target; tests pass one.
 * @internal
 */
export const inertProps = function inertProps(
	on: boolean,
	reactVersion?: string
): { inert?: boolean } {
	if (!on) {
		return {};
	}
	const legacy =
		reactVersion === undefined
			? LEGACY_INERT
			: Number.parseInt(reactVersion, 10) < 19;
	// The `''` is typed as React 19's boolean so the spread type-checks.
	return { inert: (legacy ? '' : true) as boolean };
};
