import type { ConsentSnapshot } from '@inth/sdk-core';
/**
 * The init script renders only the classic banner. A page whose design
 * resolves to Privacy Choices, from its own `presentation` or from its
 * policy's surface, gets no early banner: the engine renders the prompt.
 */
import { pendingSnapshot } from '@inth/sdk-core/runtime/deferred-snapshot';
import { describe, expect, it } from 'vitest';

import { usesPrivacyChoicesDesign } from '../init/run';

const snapshot = (surface?: ConsentSnapshot['policyRule']['surface']) => {
	const base = pendingSnapshot({});
	return {
		...base,
		policyRule: { ...base.policyRule, surface },
	} as ConsentSnapshot;
};

describe('usesPrivacyChoicesDesign', () => {
	it('keeps the classic design when nothing opts in', () => {
		expect(usesPrivacyChoicesDesign({}, snapshot())).toBe(false);
	});

	it('leaves the banner to the engine for design: privacy-choices', () => {
		expect(
			usesPrivacyChoicesDesign(
				{ presentation: { design: 'privacy-choices' } },
				snapshot()
			)
		).toBe(true);
	});

	it('leaves the banner to the engine when a prompt container opts in', () => {
		expect(
			usesPrivacyChoicesDesign(
				{ presentation: { prompt: { container: { type: 'card' } } } },
				snapshot()
			)
		).toBe(true);
	});

	// Until the default flips, only the page's own `container` or `design`
	// selects Privacy Choices; a policy surface alone keeps the classic banner.
	it('keeps the classic banner when only the policy surface sets a container', () => {
		expect(
			usesPrivacyChoicesDesign(
				{},
				snapshot({ container: { side: 'bottom', type: 'drawer' } })
			)
		).toBe(false);
	});

	it('keeps the classic banner when the page asks for it explicitly', () => {
		expect(
			usesPrivacyChoicesDesign(
				{
					presentation: {
						design: 'classic',
						prompt: { container: { type: 'card' } },
					},
				},
				snapshot()
			)
		).toBe(false);
	});
});
