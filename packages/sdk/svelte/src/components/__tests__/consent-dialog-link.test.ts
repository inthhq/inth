/**
 * Tests for ConsentDialogLink component.
 *
 * ConsentDialogLink is a thin wrapper around ConsentButton
 * with action="open-consent-dialog" and noStyle=true by default.
 */

import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import DialogLinkFixture from '../../__tests__/fixtures/dialog-link-fixture.svelte';
import { policyFixture } from '../../__tests__/policy-fixture';
import { testOffline } from '../../__tests__/test-offline';
import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';

const getDefined = <Value>(
	value: Value,
	message = 'Expected value to be defined'
): NonNullable<Value> => {
	if (value === null || value === undefined) {
		throw new Error(message);
	}
	return value;
};

const defaultOptions: ConsentManagerOptions = {
	mode: testOffline(),
};

const OPT_OUT_RULE = {
	id: 'svelte-us-opt-out',
	model: 'opt-out' as const,
	prompt: 'notice' as const,
	rights: ['disclosure', 'preferences', 'opt-out'] as const,
};

/** A US opt-out page whose opt-out link reads "Your Privacy Choices". */
const optOutOptions = (noStyle: boolean): ConsentManagerOptions => ({
	mode: testOffline([OPT_OUT_RULE]),
	noStyle,
	overrides: { country: 'US', gpc: false, region: 'CA' },
	persistence: false,
	prefetch: policyFixture(undefined, OPT_OUT_RULE),
	presentation: { optOutLink: 'privacy-choices' },
});

const optOutIcon = (): SVGSVGElement | null =>
	document.querySelector(
		'[data-testid="consent-dialog-link"] svg[aria-hidden="true"]'
	);

describe('ConsentDialogLink', () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.clearAllMocks();
	});

	test('renders with default data-testid', async () => {
		render(DialogLinkFixture, { options: defaultOptions });

		await waitFor(() => {
			const link = document.querySelector(
				'[data-testid="consent-dialog-link"]'
			);
			expect(link).toBeInTheDocument();
		});
	});

	test('renders children content', async () => {
		render(DialogLinkFixture, { options: defaultOptions });

		await waitFor(() => {
			const link = document.querySelector(
				'[data-testid="consent-dialog-link"]'
			);
			expect(link).toBeInTheDocument();
			expect(link?.textContent).toContain('Manage Preferences');
		});
	});

	test('emits the shared styled-button data contract', async () => {
		render(DialogLinkFixture, { options: defaultOptions, styled: true });

		await waitFor(() => {
			const link = document.querySelector(
				'[data-testid="consent-dialog-link"]'
			);
			expect(link).toHaveAttribute('data-variant', 'neutral');
			expect(link).toHaveAttribute('data-mode', 'stroke');
			expect(link).toHaveAttribute('data-size', 'small');
			expect(link).toHaveAttribute(
				'data-inth-rights',
				'disclosure preferences'
			);
		});
	});

	test('sizes the CPPA icon of an opt-out link, as PrivacyChoicesLink does', async () => {
		const view = render(DialogLinkFixture, {
			options: optOutOptions(false),
			right: 'opt-out',
		});
		// A page that loads no sheet sizing it would let it fill the line.
		const icon = await waitFor(() => getDefined(optOutIcon()));
		expect(icon).toHaveAttribute('height', '14');
		expect(icon).toHaveAttribute('width', '30');
		view.unmount();
	});

	test('leaves the CPPA icon unsized under the provider noStyle', async () => {
		const view = render(DialogLinkFixture, {
			options: optOutOptions(true),
			right: 'opt-out',
		});
		const icon = await waitFor(() => getDefined(optOutIcon()));
		expect(icon).not.toHaveAttribute('height');
		expect(icon).not.toHaveAttribute('width');
		view.unmount();
	});

	test('opens dialog on click', async () => {
		render(DialogLinkFixture, { options: defaultOptions });

		await waitFor(() => {
			const link = document.querySelector(
				'[data-testid="consent-dialog-link"]'
			);
			expect(link).toBeInTheDocument();
		});

		const link = getDefined(
			document.querySelector('[data-testid="consent-dialog-link"]')
		);
		await Promise.resolve();
		await Promise.resolve();
		await fireEvent.click(link);

		await waitFor(() => {
			const dialog = document.querySelector(
				'[data-testid="consent-dialog-root"]'
			);
			expect(dialog).toBeInTheDocument();
		});
	});
});
