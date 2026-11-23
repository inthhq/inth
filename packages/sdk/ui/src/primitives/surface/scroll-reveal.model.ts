/**
 * How far to scroll a surface's scroll body to bring an opened region into
 * view (LAY-05, RIGHT-07), from the edges `reveal-disclosure.ts` measures.
 *
 * @packageDocumentation
 */

/** The vertical edges the reveal maths reads. */
type Edges = Pick<DOMRectReadOnly, 'bottom' | 'top'>;

/** Breathing room between a revealed region and the body's edge. */
const DEFAULT_MARGIN = 8;

/**
 * How far to scroll `body` so `target` is in view: `'nearest'` scrolls
 * the least distance, without pushing the target's top out; `'start'`
 * puts the target's top at the body's top.
 */
export const revealDelta = function revealDelta(
	body: Edges,
	target: Edges,
	mode: 'nearest' | 'start' = 'nearest',
	margin = DEFAULT_MARGIN
): number {
	if (mode === 'start') {
		return target.top - body.top - margin;
	}
	if (target.bottom > body.bottom) {
		return Math.min(
			target.bottom - body.bottom + margin,
			target.top - body.top - margin
		);
	}
	if (target.top < body.top) {
		return target.top - body.top - margin;
	}
	return 0;
};

/**
 * How far to scroll `body` after a disclosure opens: as much of `panel` as
 * fits, without scrolling its `trigger` out of view (LAY-05).
 */
export const disclosureRevealDelta = function disclosureRevealDelta(
	body: Edges,
	trigger: Edges,
	panel: Edges,
	margin = DEFAULT_MARGIN
): number {
	const over = panel.bottom - body.bottom + margin;
	if (over <= 0) {
		return 0;
	}
	const room = trigger.top - body.top - margin;
	return Math.max(0, Math.min(over, room));
};
