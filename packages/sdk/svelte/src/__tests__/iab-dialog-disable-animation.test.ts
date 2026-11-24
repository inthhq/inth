import { resolvePolicyRules } from '@inth/sdk/schema/types';
import styles from '@inth/sdk/ui/styles/components/iab-consent-dialog';
import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, test } from 'vite-plus/test';

import { completeGVL } from '../../../iab/src/__tests__/fixtures/gvl-sample';
import type { ConsentManagerOptions } from '../lib/types';
import Fixture from './fixtures/iab-dialog-motion-fixture.svelte';
import { transportMode } from './fixtures/transport-mode';

const OVERLAY = '[data-testid="iab-consent-dialog-overlay"]';

const options = {
	disableAnimation: false,
	iab: { cmpId: 28 },
	mode: transportMode({}),
	persistence: false,
	prefetch: {
		initialIab: { cmpId: 28, enabled: true, gvl: completeGVL },
		initialPolicyResolution: resolvePolicyRules({
			countryCode: 'DE',
			regionCode: null,
			rules: [
				{
					id: 'iab',
					match: { isDefault: true },
					model: 'iab',
					prompt: 'choice',
				},
			],
		}),
	},
} as ConsentManagerOptions;

describe('IABConsentDialog disableAnimation prop', () => {
	test.each([
		{ disableAnimation: undefined, entering: true },
		{ disableAnimation: true, entering: false },
	])(
		'disableAnimation $disableAnimation fades the backdrop in: $entering',
		async ({ disableAnimation, entering }) => {
			render(Fixture, { disableAnimation, options });
			await waitFor(() =>
				expect(document.querySelector(OVERLAY)).not.toBeNull()
			);
			const overlay = document.querySelector(OVERLAY) as HTMLElement;
			expect(styles.overlayEntering).toBeTruthy();
			expect(overlay.classList.contains(styles.overlayVisible as string)).toBe(
				true
			);
			expect(overlay.classList.contains(styles.overlayEntering as string)).toBe(
				entering
			);
		}
	);
});
