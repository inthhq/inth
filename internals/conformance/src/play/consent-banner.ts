import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { PlayFunction } from 'storybook/types';

import {
	assertDomContract,
	assertStableElements,
} from '../assertions/dom-contract';
import {
	assertInitialFocus,
	assertVisibleFocusIndicator,
} from '../assertions/focus';

/**
 * Full DOM contract check for the consent banner: every declared element is
 * present with the expected role and attributes. Run this on the `Default`
 * story of every framework's banner to catch structural drift.
 */
export const bannerContract: PlayFunction = async () => {
	const body = within(document.body);
	await body.findByTestId('consent-banner-root');
	assertDomContract(document.body, 'consentBanner');
	assertStableElements(document.body, 'consentBanner');
	const title = body.getByTestId('consent-banner-title');
	const accept = body.getByTestId('consent-banner-accept-button');
	expect(getComputedStyle(accept).paddingBlockStart).toBe('8px');
	expect(getComputedStyle(title).marginBlockStart).toBe('0px');
	expect(getComputedStyle(title).marginBlockEnd).toBe('0px');
};

/**
 * Clicks Customize and verifies the choices open inside the banner: the
 * expand panel opens with the category switches and Save, and no dialog
 * opens. The dialog opens only from the page's link. The story keeps its
 * name so the parity runner still pairs it across frameworks.
 */
export const bannerToDialogFlow: PlayFunction = async () => {
	const body = within(document.body);
	const customize = await body.findByTestId('consent-banner-customize-button');
	expect(customize).toHaveAttribute('aria-expanded', 'false');
	await userEvent.click(customize);

	const panel = body.getByTestId('consent-banner-expand-panel');
	await waitFor(() => expect(panel).toHaveAttribute('data-open', 'true'));
	// The options fade in.
	const save = await body.findByTestId('consent-banner-save-button');
	const toggle = await body.findByTestId(
		'consent-banner-category-switch-functionality'
	);
	await waitFor(() => {
		expect(save).toBeVisible();
		expect(toggle).toBeVisible();
	});
	expect(body.queryByTestId('consent-dialog-root')).not.toBeInTheDocument();
};

/**
 * Verifies keyboard activation of the accept button dismisses the banner.
 */
export const bannerAcceptViaKeyboard: PlayFunction = async () => {
	const body = within(document.body);
	const accept = await body.findByTestId('consent-banner-accept-button');
	(accept as HTMLElement).focus();
	expect(document.activeElement).toBe(accept);
	await userEvent.keyboard('{Enter}');
	await waitFor(() => {
		expect(body.queryByTestId('consent-banner-root')).not.toBeInTheDocument();
	});
};

/**
 * Verifies the banner's focus behaviour for its resolved blocking state and
 * that every action button renders a visible keyboard-focus indicator.
 *
 * A blocking banner (`data-blocking="true"` on the root) is a modal dialog:
 * the shell around the card carries the dialog role, and the card receives
 * focus on open. A non-blocking banner card is a labelled region that must
 * leave focus on the page.
 */
export const bannerFocusManagement: PlayFunction = async () => {
	const body = within(document.body);
	const root = await body.findByTestId('consent-banner-root');
	const card = await body.findByTestId('consent-banner-card');
	if (root.getAttribute('data-blocking') === 'true') {
		const shell = body.getByTestId('consent-banner-shell');
		expect(shell).toHaveAttribute('role', 'dialog');
		expect(shell).toHaveAttribute('aria-modal', 'true');
		expect(shell).toHaveAccessibleName(
			(body.getByTestId('consent-banner-title').textContent ?? '').trim()
		);
		expect(card).not.toHaveAttribute('role');
		await assertInitialFocus(document.body, 'consent-banner-card');
	} else {
		expect(card).toHaveAttribute('role', 'region');
		expect(card).not.toHaveAttribute('aria-modal');
		await waitFor(() => {
			expect(card.contains(document.activeElement)).toBe(false);
		});
	}

	// Visible focus rings: the shared button CSS uses high-specificity
	// variant selectors that can silently override the :focus-visible ring.
	await assertVisibleFocusIndicator(
		document.body,
		'consent-banner-reject-button'
	);
	await assertVisibleFocusIndicator(
		document.body,
		'consent-banner-accept-button'
	);
	await assertVisibleFocusIndicator(
		document.body,
		'consent-banner-customize-button'
	);
};
