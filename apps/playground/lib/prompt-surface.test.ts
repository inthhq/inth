import { describe, expect, it } from 'vitest';

import {
	applySurfaceParams,
	demoExperiment,
	EMPTY_SURFACE,
	parseSurfaceParams,
	setSurfaceContainer,
	surfacePositionOptions,
	withSurface,
} from './prompt-surface';

describe('prompt surface params', () => {
	it('reads a valid container, position and blocking flag', () => {
		expect(
			parseSurfaceParams(
				new URLSearchParams('container=banner&position=top&blocking=1')
			)
		).toEqual({
			...EMPTY_SURFACE,
			blocking: true,
			container: 'banner',
			position: 'top',
		});
		expect(parseSurfaceParams(new URLSearchParams(''))).toEqual(EMPTY_SURFACE);
	});

	it('reads the experiment flag and a forced arm', () => {
		expect(parseSurfaceParams(new URLSearchParams('experiment=1'))).toEqual({
			...EMPTY_SURFACE,
			experiment: true,
		});
		expect(
			parseSurfaceParams(new URLSearchParams('experiment=1&arm=banner'))
		).toEqual({ ...EMPTY_SURFACE, arm: 'banner', experiment: true });
		// An unknown arm is dropped; an arm without the experiment is ignored.
		expect(
			parseSurfaceParams(new URLSearchParams('experiment=1&arm=wall'))
		).toEqual({ ...EMPTY_SURFACE, experiment: true });
		expect(parseSurfaceParams(new URLSearchParams('arm=banner'))).toEqual(
			EMPTY_SURFACE
		);
		expect(
			applySurfaceParams(new URLSearchParams('arm=banner'), {
				...EMPTY_SURFACE,
				arm: 'banner',
				experiment: true,
			}).toString()
		).toBe('experiment=1&arm=banner');
		expect(
			applySurfaceParams(new URLSearchParams('experiment=1&arm=banner'), {
				...EMPTY_SURFACE,
				arm: 'banner',
			}).toString()
		).toBe('');
	});

	it('builds the demo experiment only when asked', () => {
		expect(demoExperiment(EMPTY_SURFACE)).toBeUndefined();
		const picked = demoExperiment({ ...EMPTY_SURFACE, experiment: true });
		expect(picked?.id).toBe('banner-shape');
		// Inth picks the arm when the URL names none.
		expect(picked).not.toHaveProperty('arm');
		// `control` is the base presentation, so it is never listed in `arms`.
		expect(Object.keys(picked?.arms ?? {})).toEqual(['banner']);
		expect(
			demoExperiment({ ...EMPTY_SURFACE, arm: 'banner', experiment: true })?.arm
		).toBe('banner');
		expect(
			demoExperiment({ ...EMPTY_SURFACE, arm: 'control', experiment: true })
				?.arm
		).toBe('control');
	});

	it('keeps the banner arm valid for an opt-out notice prompt', () => {
		const forced = demoExperiment({
			...EMPTY_SURFACE,
			arm: 'banner',
			experiment: true,
		});
		// A notice never blocks, so the arm under test is a bottom Banner,
		// which both `choice` and `notice` accept.
		expect(forced?.arms.banner).toEqual({
			prompt: { container: { edge: 'bottom', type: 'banner' } },
		});
		expect(forced?.arms.banner?.prompt?.blockUntilChoice).toBeUndefined();
	});

	it('drops unknown containers and positions the container does not accept', () => {
		// An unknown container is dropped; the position survives on its own
		// because some container accepts it.
		expect(
			parseSurfaceParams(new URLSearchParams('container=sheet&position=center'))
		).toEqual({ ...EMPTY_SURFACE, position: 'center' });
		expect(
			parseSurfaceParams(new URLSearchParams('container=banner&position=start'))
		).toEqual({ ...EMPTY_SURFACE, container: 'banner' });
		expect(parseSurfaceParams(new URLSearchParams('blocking=true'))).toEqual(
			EMPTY_SURFACE
		);
	});

	it('round-trips through search params and clears stale keys', () => {
		const params = applySurfaceParams(
			new URLSearchParams('country=DE&container=card&position=center'),
			{
				...EMPTY_SURFACE,
				blocking: true,
				container: 'banner',
				position: 'bottom',
			}
		);
		expect(params.toString()).toBe(
			'country=DE&container=banner&position=bottom&blocking=1'
		);
		expect(
			applySurfaceParams(
				new URLSearchParams('container=banner'),
				EMPTY_SURFACE
			).toString()
		).toBe('');
	});

	it('narrows positions when the container changes', () => {
		const card = setSurfaceContainer(
			{ ...EMPTY_SURFACE, position: 'end' },
			'card'
		);
		expect(card.position).toBe('end');
		expect(setSurfaceContainer(card, 'banner').position).toBe('');
		expect(setSurfaceContainer(card, 'drawer').position).toBe('end');
		expect(surfacePositionOptions('card')).toEqual(['start', 'end', 'center']);
		expect(surfacePositionOptions('')).toEqual([]);
	});

	it('layers the surface over a scenario presentation', () => {
		const base = { prompt: { layout: ['accept', 'reject'] } } as const;
		expect(withSurface(base, EMPTY_SURFACE)).toBe(base);
		expect(withSurface(undefined, EMPTY_SURFACE)).toBeUndefined();
		expect(
			withSurface(base, {
				...EMPTY_SURFACE,
				blocking: true,
				container: 'banner',
				position: 'top',
			})
		).toEqual({
			prompt: {
				blockUntilChoice: true,
				container: { edge: 'top', type: 'banner' },
				layout: ['accept', 'reject'],
			},
		});
	});
});
