import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, test } from 'vite-plus/test';

import type { ConsentManagerOptions } from '../lib/manager-options.model';
import Fixture from './fixtures/dialog-motion-fixture.svelte';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

const ROOT = '[data-testid="consent-dialog-root"]';

const optionsWith = (disableAnimation: boolean) =>
	({
		disableAnimation,
		mode: transportMode({}),
		persistence: false,
		prefetch: policyFixture(),
	}) as ConsentManagerOptions;

describe('ConsentDialog disableAnimation prop', () => {
	test.each([
		{ expected: false, option: false, prop: undefined },
		{ expected: true, option: true, prop: undefined },
		{ expected: true, option: false, prop: true },
		{ expected: false, option: true, prop: false },
	])(
		'$prop over provider $option skips the animation: $expected',
		async ({ expected, option, prop }) => {
			render(Fixture, {
				disableAnimation: prop,
				options: optionsWith(option),
			});
			await waitFor(() => expect(document.querySelector(ROOT)).not.toBeNull());
			const root = document.querySelector(ROOT) as HTMLElement;
			// The stylesheet stops the open and close keyframes on
			// `data-animation="off"`.
			expect(root.getAttribute('data-animation')).toBe(expected ? 'off' : null);
		}
	);
});
