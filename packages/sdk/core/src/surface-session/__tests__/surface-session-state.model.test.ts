/**
 * The surface session's reducer and Escape ladder, without a kernel.
 */
import { describe, expect, test } from 'vitest';

import { resolveSurfaceEscape } from '../resolve-surface-escape';
import type { SurfaceEscapeInput } from '../resolve-surface-escape';
import {
	announcementText,
	initialSurfaceSession,
	isCurrentSurface,
	MAIN_LAYER,
	reduceSurfaceSession,
	topLayer,
} from '../surface-session-state.model';
import type {
	SurfaceSessionAction,
	SurfaceSessionState,
} from '../surface-session-state.model';

const run = function run(
	state: SurfaceSessionState,
	...actions: SurfaceSessionAction[]
): SurfaceSessionState {
	return actions.reduce(reduceSurfaceSession, state);
};

const dialog = () => initialSurfaceSession('dialog');
const banner = () => initialSurfaceSession('banner');

describe('transient state per surface', () => {
	test('[PERM-16] changing surface drops the confirmation, nudge, receipt Details, copy and announcement, and moves the token', () => {
		const busy = run(
			dialog(),
			{ right: 'sale', type: 'open-confirmation' },
			{ type: 'nudge-confirmation' },
			{ open: true, type: 'toggle-receipt' },
			{ type: 'begin-copy' },
			{ message: 'Saved.', type: 'announce' }
		);
		expect(busy.confirmation).toEqual({ nudges: 1, right: 'sale' });
		const left = reduceSurfaceSession(busy, {
			surface: 'banner',
			type: 'surface',
		});
		expect(left).toMatchObject({
			announcement: null,
			confirmation: null,
			copy: { status: 'idle' },
			receiptOpen: false,
			sheets: [],
			surface: 'banner',
		});
		expect(left.token).toBe(busy.token + 1);
		expect(left.copy.attempt).toBeGreaterThan(busy.copy.attempt);
	});

	test('[PERM-16] a delayed reveal scheduled on one surface is stale on the next', () => {
		const scheduled = dialog();
		const { token } = scheduled;
		expect(isCurrentSurface(scheduled, token)).toBe(true);
		const next = reduceSurfaceSession(scheduled, {
			surface: 'banner',
			type: 'surface',
		});
		expect(isCurrentSurface(next, token)).toBe(false);
	});

	test('explicit navigation to the same surface still clears it', () => {
		const busy = run(dialog(), { right: 'sale', type: 'open-confirmation' });
		const next = reduceSurfaceSession(busy, { type: 'navigate' });
		expect(next.confirmation).toBeNull();
		expect(next.token).toBe(busy.token + 1);
	});

	test('the same surface reported again changes nothing', () => {
		const state = dialog();
		expect(
			reduceSurfaceSession(state, { surface: 'dialog', type: 'surface' })
		).toBe(state);
	});

	test('[PERM-03] a commit folds the expanded banner and clears its confirmation', () => {
		const expanded = run(
			banner(),
			{ type: 'expand' },
			{ right: 'sale', type: 'open-confirmation' }
		);
		expect(expanded.expanded).toBe(true);
		const committed = reduceSurfaceSession(expanded, { type: 'commit' });
		expect(committed).toMatchObject({ confirmation: null, expanded: false });
		expect(committed.token).toBe(expanded.token + 1);
	});

	test('[PERM-13] a banner that ends does not carry its expanded state forward', () => {
		const expanded = run(banner(), { type: 'expand' });
		const ended = reduceSurfaceSession(expanded, {
			surface: 'none',
			type: 'surface',
		});
		expect(ended.expanded).toBe(false);
		const back = reduceSurfaceSession(ended, {
			surface: 'banner',
			type: 'surface',
		});
		expect(back.expanded).toBe(false);
	});

	test('only a banner expands', () => {
		const state = dialog();
		expect(reduceSurfaceSession(state, { type: 'expand' })).toBe(state);
	});
});

describe('confirmation', () => {
	test('[RIGHT-04] each extra press of Allow counts a nudge; closing clears it', () => {
		const nudged = run(
			dialog(),
			{ right: 'sale', type: 'open-confirmation' },
			{ type: 'nudge-confirmation' },
			{ type: 'nudge-confirmation' }
		);
		expect(nudged.confirmation?.nudges).toBe(2);
		const closed = reduceSurfaceSession(nudged, { type: 'close-confirmation' });
		expect(closed.confirmation).toBeNull();
		const reopened = reduceSurfaceSession(closed, {
			right: 'sale',
			type: 'open-confirmation',
		});
		expect(reopened.confirmation?.nudges).toBe(0);
	});

	test('no confirmation opens while no surface shows', () => {
		const state = initialSurfaceSession('none');
		expect(
			reduceSurfaceSession(state, { right: 'sale', type: 'open-confirmation' })
		).toBe(state);
	});
});

describe('phone sheets', () => {
	test('[PERM-01] sheets exist only inside the open dialog', () => {
		const state = banner();
		expect(
			reduceSurfaceSession(state, { id: 'cookies', type: 'push-sheet' })
		).toBe(state);
	});

	test('[NEST-02] at most two layers, the main card included', () => {
		const one = reduceSurfaceSession(dialog(), {
			id: 'cookies',
			opener: 'preferences-row',
			type: 'push-sheet',
		});
		expect(one.sheets).toEqual([{ id: 'cookies', opener: 'preferences-row' }]);
		expect(
			reduceSurfaceSession(one, { id: 'vendors:marketing', type: 'push-sheet' })
		).toBe(one);
	});

	test('[SR-02] pushing a sheet closes the confirmation the main card had open', () => {
		const confirming = reduceSurfaceSession(dialog(), {
			right: 'sale',
			type: 'open-confirmation',
		});
		const covered = reduceSurfaceSession(confirming, {
			id: 'cookies',
			type: 'push-sheet',
		});
		expect(covered.confirmation).toBeNull();
		const back = reduceSurfaceSession(covered, { type: 'pop-sheet' });
		expect(back.confirmation).toBeNull();
	});

	test('[NEST-06] leaving the dialog drops open sheets', () => {
		const one = reduceSurfaceSession(dialog(), {
			id: 'cookies',
			type: 'push-sheet',
		});
		const closed = reduceSurfaceSession(one, {
			surface: 'none',
			type: 'surface',
		});
		expect(closed.sheets).toEqual([]);
	});
});

describe('announcements', () => {
	test('[SR-03] a repeated message flips, so its text changes', () => {
		const first = reduceSurfaceSession(dialog(), {
			message: 'Saved.',
			type: 'announce',
		});
		const second = reduceSurfaceSession(first, {
			message: 'Saved.',
			type: 'announce',
		});
		expect(announcementText(first.announcement)).not.toBe(
			announcementText(second.announcement)
		);
		expect(announcementText(first.announcement).replace('​', '')).toBe('Saved.');
		expect(announcementText(null)).toBe('');
	});

	test('[SR-01] a message belongs to the top layer', () => {
		const sheet = reduceSurfaceSession(dialog(), {
			id: 'cookies',
			type: 'push-sheet',
		});
		expect(topLayer(sheet)).toBe('cookies');
		const spoken = reduceSurfaceSession(sheet, {
			message: 'Analytics on.',
			type: 'announce',
		});
		expect(spoken.announcement?.layer).toBe('cookies');
	});

	test('[SR-02] opening and closing a layer clears its message, and a closed layer cannot speak', () => {
		const spoken = run(dialog(), { message: 'Opted out.', type: 'announce' });
		expect(spoken.announcement?.layer).toBe(MAIN_LAYER);
		const pushed = reduceSurfaceSession(spoken, {
			id: 'cookies',
			type: 'push-sheet',
		});
		expect(pushed.announcement).toBeNull();
		const said = reduceSurfaceSession(pushed, {
			message: 'Analytics on.',
			type: 'announce',
		});
		const popped = reduceSurfaceSession(said, { type: 'pop-sheet' });
		expect(popped.announcement).toBeNull();
		expect(
			reduceSurfaceSession(popped, {
				layer: 'cookies',
				message: 'Late.',
				type: 'announce',
			})
		).toBe(popped);
	});
});

describe('copy attempts', () => {
	test('[CLIP-02] a result for an older attempt is ignored', () => {
		const first = reduceSurfaceSession(dialog(), { type: 'begin-copy' });
		const second = reduceSurfaceSession(first, { type: 'begin-copy' });
		expect(
			reduceSurfaceSession(second, {
				attempt: first.copy.attempt,
				ok: false,
				type: 'finish-copy',
			})
		).toBe(second);
		expect(
			reduceSurfaceSession(second, {
				attempt: second.copy.attempt,
				ok: true,
				type: 'finish-copy',
			}).copy.status
		).toBe('copied');
	});

	test('[CLIP-02][CLIP-04] closing the surface makes an in-flight attempt stale and resets feedback', () => {
		const pending = reduceSurfaceSession(dialog(), { type: 'begin-copy' });
		const closed = reduceSurfaceSession(pending, {
			surface: 'none',
			type: 'surface',
		});
		expect(closed.copy.status).toBe('idle');
		expect(
			reduceSurfaceSession(closed, {
				attempt: pending.copy.attempt,
				ok: false,
				type: 'finish-copy',
			})
		).toBe(closed);
	});
});

describe('Escape ladder', () => {
	const input = (
		overrides: Partial<SurfaceEscapeInput>
	): SurfaceEscapeInput => ({
		blocking: false,
		confirmation: false,
		expanded: false,
		focusInside: true,
		sheets: 0,
		surface: 'dialog',
		...overrides,
	});

	test('[FOC-04] in the dialog: top sheet, then confirmation, then the dialog', () => {
		expect(resolveSurfaceEscape(input({ confirmation: true, sheets: 1 }))).toBe(
			'close-sheet'
		);
		expect(resolveSurfaceEscape(input({ confirmation: true }))).toBe(
			'close-confirmation'
		);
		expect(resolveSurfaceEscape(input({}))).toBe('close-dialog');
	});

	test('[PERM-03] on a banner: confirmation, then the expanded panel; never the banner', () => {
		const onBanner = (overrides: Partial<SurfaceEscapeInput>) =>
			resolveSurfaceEscape(input({ surface: 'banner', ...overrides }));
		expect(onBanner({ confirmation: true, expanded: true })).toBe(
			'close-confirmation'
		);
		expect(onBanner({ expanded: true })).toBe('collapse');
		expect(onBanner({})).toBe('ignore');
	});

	test('[PERM-03] while blocking, Escape still folds, and otherwise is swallowed, never dismissing', () => {
		const blocking = (overrides: Partial<SurfaceEscapeInput>) =>
			resolveSurfaceEscape(
				input({
					blocking: true,
					focusInside: false,
					surface: 'banner',
					...overrides,
				})
			);
		expect(blocking({ confirmation: true })).toBe('close-confirmation');
		expect(blocking({ expanded: true })).toBe('collapse');
		expect(blocking({})).toBe('swallow');
	});

	test('[PERM-15] on a non-blocking banner, Escape acts only with focus inside', () => {
		expect(
			resolveSurfaceEscape(
				input({ expanded: true, focusInside: false, surface: 'banner' })
			)
		).toBe('ignore');
	});

	test('a leaving surface, or none, ignores Escape', () => {
		expect(resolveSurfaceEscape(input({ leaving: true }))).toBe('ignore');
		expect(resolveSurfaceEscape(input({ surface: 'none' }))).toBe('ignore');
	});
});
