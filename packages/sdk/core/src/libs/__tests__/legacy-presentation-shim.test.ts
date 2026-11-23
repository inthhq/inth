/**
 * The temporary shim the not-yet-converted adapters resolve through. It
 * goes with them in phase B.
 */
import { normalizePolicyRule } from '@inth/sdk-schema/types';
import { describe, expect, it } from 'vitest';

import {
	resolveConsentDesign,
	resolveLegacyConsentPresentation,
} from '../legacy-presentation-shim';

const choice = normalizePolicyRule({
	id: 'choice',
	match: { fallback: true },
	model: 'opt-in',
	prompt: 'choice',
});

describe('legacy presentation shim', () => {
	it('always resolves the one consent UI', () => {
		expect(resolveConsentDesign({ design: 'classic' })).toBe('privacy-choices');
		expect(
			resolveLegacyConsentPresentation({
				policy: choice,
				presentation: { design: 'classic' },
				surface: 'prompt',
			}).design
		).toBe('privacy-choices');
	});

	it.each([
		[{ variant: 'bar', position: 'top' }, 'banner-top', 'bar', 'top'],
		[{ variant: 'wall' }, 'card-center', 'wall', 'center'],
		[{ variant: 'widget' }, 'card-end', 'floating', 'bottom-right'],
		[{ position: 'bottom-right' }, 'card-end', 'floating', 'bottom-right'],
		[{}, 'card-start', 'floating', 'bottom-left'],
	] as const)(
		'maps %j onto a container and back',
		(prompt, placement, variant, position) => {
			const result = resolveLegacyConsentPresentation({
				policy: choice,
				presentation: { prompt },
				surface: 'prompt',
			});
			expect(result.container?.desktop.placement).toBe(placement);
			expect(result.variant).toBe(variant);
			expect(result.position).toBe(position);
		}
	);

	it.each([{ scrollLock: true }, { trapFocus: true }])(
		'maps %j onto blocking',
		(prompt) => {
			const result = resolveLegacyConsentPresentation({
				policy: choice,
				presentation: { prompt },
				surface: 'prompt',
			});
			expect(result.blocking).toBe(true);
			expect(result.scrollLock).toBe(true);
			expect(result.trapFocus).toBe(true);
		}
	);

	it('lets an override container win over its own legacy geometry', () => {
		const result = resolveLegacyConsentPresentation({
			override: {
				container: { side: 'end', type: 'drawer' },
				variant: 'bar',
			},
			policy: choice,
			surface: 'prompt',
		});
		expect(result.container?.desktop.placement).toBe('drawer-end');
		expect(result.positionSource).toBe('default');
	});
});
