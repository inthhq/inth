/**
 * The layout the rows an IAB disclosure is made of share.
 *
 * Three shapes, one per thing the model can hand over: a row with one toggle, a
 * stack that groups N toggles, and a partner whose claims are listed rather than
 * switched. Each is the web's own card -- a hairline on `--inth-radius-md`, a
 * 12-point header, and 12 between the text, the disclosure, and the control --
 * and each keeps the disclosure's own switch and glyph sizes, which are a sixth
 * smaller than the consent dialog's.
 *
 * None of them owns a decision. A row reads one boolean and reports a press;
 * the selection lives in the drawer, which is what lets the surface hold every
 * edit locally and write the whole of it once.
 */

import type { ViewStyle } from 'react-native';

import { MIN_TAP_TARGET } from '../theme/consent-theme-parts';
import type { ConsentResolvedParts } from '../theme/consent-theme-parts';

/** The text column takes what the glyph and the control do not need. */
export const TEXT_COLUMN: ViewStyle = { flex: 1, minWidth: 0 };

/**
 * The glyph and the label as one group.
 *
 * `.purposeTrigger` is `gap: .5rem` between a 16-point arrow and the text, and
 * it is that pair which then sits 12 from the switch, so the two gaps belong to
 * two different containers: 8 here and the header's own 12 outside.
 */
export const LABEL_ROW: ViewStyle = {
	alignItems: 'flex-start',
	flex: 1,
	flexDirection: 'row',
	gap: 8,
	minWidth: 0,
};

/** The control keeps its own width at the trailing end of the header. */
export const CONTROL_COLUMN: ViewStyle = { alignItems: 'flex-end' };

/** The stack of lines a stack or partner opens to. */
export const STACKED: ViewStyle = { gap: 8 };

/**
 * `Pressable`'s touch inset, in plain points.
 *
 * Spelled per file for the reason `consent-button.tsx` gives: the `hitSlop` type
 * is a structural shape React Native has renamed between releases, and these
 * components only ever pass numbers.
 */
export interface TouchInset {
	bottom?: number;
	left?: number;
	right?: number;
	top?: number;
}

/**
 * The touch area a row header asks for.
 *
 * A collapsed row is 12 + a line of title + 12, which is under the 44 a fingertip
 * needs, so the shortfall goes on the hit area and never on the drawn box -- the
 * same bargain every other control here makes.
 *
 * @param parts - Parts in force for this surface.
 * @returns An inset for `hitSlop`, or `undefined` when the box clears the floor.
 */
export const hitSlopFor = function hitSlopFor(
	parts: ConsentResolvedParts
): TouchInset | undefined {
	const header = parts.rowHeader;
	// Either spelling of the inset, and only when it is a plain number: a part may
	// carry a percentage or an em, and a row header that does is not worth a
	// derived inset, so it falls back to the drawn line alone.
	const declared = header.padding ?? header.paddingVertical ?? 0;
	const padding = typeof declared === 'number' ? declared : 0;
	const title = parts.rowTitle;
	const drawn = padding * 2 + (title.lineHeight ?? 0) + 2;
	const inset = Math.ceil((MIN_TAP_TARGET - drawn) / 2);

	if (inset <= 0) {
		return undefined;
	}

	return { bottom: inset, left: inset, right: inset, top: inset };
};
