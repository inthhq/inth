import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { PlayFunction } from 'storybook/types';

import {
	assertDomContract,
	assertStableElements,
} from '../assertions/dom-contract';
import { assertFocusReturnsTo, assertInitialFocus } from '../assertions/focus';
import { assertEscapeDismisses } from '../assertions/keyboard';

/**
 * The page links that open the consent dialog. Customize on the banner
 * opens the choices inside the banner, so the dialog opens only from the
 * page: the stock "Your Privacy Choices" link, a dialog link, or the
 * floating trigger.
 */
const DIALOG_OPENERS = [
	'privacy-choices-link',
	'consent-dialog-link',
	'consent-dialog-trigger',
];

const findDialogOpener = function findDialogOpener(): Promise<HTMLElement> {
	const selector = DIALOG_OPENERS.map(
		(testId) => `[data-testid="${testId}"]`
	).join(',');
	return waitFor(() => {
		const opener = document.body.querySelector<HTMLElement>(selector);
		expect(
			opener,
			`a dialog opener (${DIALOG_OPENERS.join(', ')})`
		).not.toBeNull();
		return opener as HTMLElement;
	});
};

/** Opens the dialog from the page's link and waits for its card. */
const openDialogFromPage =
	async function openDialogFromPage(): Promise<HTMLElement> {
		await userEvent.click(await findDialogOpener());
		return within(document.body).findByTestId('consent-dialog-card');
	};

/**
 * DOM contract check for the opened consent dialog: the card is a labelled
 * modal dialog, focus moves into it, and its category switches work from
 * the keyboard and drive Save, which stays disabled until a switch changes.
 */
export const dialogContract: PlayFunction = async () => {
	const body = within(document.body);
	const card = await openDialogFromPage();
	assertDomContract(document.body, 'consentDialog');
	assertStableElements(document.body, 'consentDialog');
	const title = body.getByTestId('consent-dialog-title');
	expect(card).toHaveAccessibleName(
		(title.textContent ?? '').replace(/\s+/gu, ' ').trim()
	);
	expect(getComputedStyle(title).marginBlockStart).toBe('0px');
	expect(getComputedStyle(title).marginBlockEnd).toBe('0px');
	await waitFor(() => {
		const focused = document.activeElement;
		expect(card.contains(focused)).toBe(true);
		if (
			focused instanceof HTMLElement &&
			getComputedStyle(focused).outlineStyle !== 'none'
		) {
			expect(focused.getBoundingClientRect().width).toBeLessThanOrEqual(
				card.getBoundingClientRect().width + 4
			);
		}
	});
	// Native controls must work through browser keyboard activation.
	const toggle = body.getByTestId(
		'consent-dialog-category-switch-functionality'
	);
	const save = body.getByTestId('consent-dialog-save-button');
	expect(save).toBeDisabled();
	const previous = toggle.getAttribute('aria-checked');
	toggle.focus();
	await userEvent.keyboard(' ');
	await waitFor(() =>
		expect(toggle.getAttribute('aria-checked')).not.toBe(previous)
	);
	await waitFor(() => expect(save).toBeEnabled());
	await userEvent.keyboard(' ');
	await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', previous));
	await waitFor(() => expect(save).toBeDisabled());
	title.focus();
};

/**
 * Opens the dialog from the page link, changes a category, saves, and
 * verifies the dialog closes with the choice recorded: reopened, it shows
 * the saved switch, and Save is disabled again.
 */
export const saveFlow: PlayFunction = async () => {
	const body = within(document.body);
	await openDialogFromPage();
	const save = body.getByTestId('consent-dialog-save-button');
	expect(save).toBeDisabled();
	const toggle = body.getByTestId(
		'consent-dialog-category-switch-functionality'
	);
	expect(toggle).toHaveAttribute('aria-checked', 'false');
	await userEvent.click(toggle);
	await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
	await waitFor(() => expect(save).toBeEnabled());
	await userEvent.click(save);

	await waitFor(() => {
		expect(body.queryByTestId('consent-dialog-root')).not.toBeInTheDocument();
	});

	await openDialogFromPage();
	await waitFor(() =>
		expect(
			body.getByTestId('consent-dialog-category-switch-functionality')
		).toHaveAttribute('aria-checked', 'true')
	);
	expect(body.getByTestId('consent-dialog-save-button')).toBeDisabled();
};

/**
 * Open the dialog from the page link, press Escape, verify it closes.
 */
export const dialogEscapeCloses: PlayFunction = async () => {
	await openDialogFromPage();
	await assertEscapeDismisses(document.body, 'consent-dialog-root');
};

/**
 * Opens the dialog from the persistent floating trigger, verifies initial
 * focus lands on the dialog's title, then verifies Escape returns focus to
 * the trigger.
 *
 * The trigger itself unmounts while the dialog is open and re-renders on
 * close; the dialog re-targets it by testid.
 */
export const dialogFocusManagement: PlayFunction = async () => {
	const body = within(document.body);
	const trigger = await body.findByTestId('consent-dialog-trigger');
	(trigger as HTMLElement).focus();
	await userEvent.click(trigger);
	await body.findByTestId('consent-dialog-card');
	await assertInitialFocus(document.body, 'consent-dialog-title');
	await assertFocusReturnsTo(
		document.body,
		'consent-dialog-trigger',
		async () => {
			await userEvent.keyboard('{Escape}');
		}
	);
};

/**
 * Opted out by an active Global Privacy Control signal: the dialog honors
 * the signal, so Allow on the sale-and-sharing row is unavailable while Opt
 * out stays, and the receipt names the signal.
 */
export const optOutGpcLocked: PlayFunction = async () => {
	const body = within(document.body);
	const allow = await body.findByTestId(
		'consent-dialog-right-option-sale-allow'
	);
	await waitFor(() => expect(allow).toHaveAttribute('aria-disabled', 'true'));
	expect(
		body.getByTestId('consent-dialog-right-option-sale-protect')
	).not.toHaveAttribute('aria-disabled');
	expect(body.getByTestId('consent-dialog-rights-row-sale')).toHaveTextContent(
		/Global Privacy Control/u
	);
	await waitFor(() =>
		expect(body.getByTestId('consent-dialog-receipt')).toHaveTextContent(
			/Honoring Global Privacy Control/u
		)
	);
};

/** The opt-in confirmation's open state, read from its open/close wrapper. */
const confirmationOpen = function confirmationOpen(): string | null {
	const confirm = document.body.querySelector(
		'[data-testid="consent-dialog-confirm"]'
	);
	return confirm?.closest('[data-open]')?.getAttribute('data-open') ?? null;
};

/**
 * Opted out by a request: allowing sale and sharing again is two steps.
 * Allow opens the confirmation, with focus on the safe choice, and the
 * visitor stays opted out until they confirm.
 */
export const optInConfirmation: PlayFunction = async () => {
	const body = within(document.body);
	const allow = await body.findByTestId(
		'consent-dialog-right-option-sale-allow'
	);
	await waitFor(() => expect(confirmationOpen()).toBe('false'));
	await userEvent.click(allow);
	await waitFor(() => expect(confirmationOpen()).toBe('true'));
	const cancel = body.getByTestId('consent-dialog-confirm-cancel');
	await waitFor(() => expect(document.activeElement).toBe(cancel));
	// The confirmation fades in.
	await waitFor(() =>
		expect(body.getByTestId('consent-dialog-confirm')).toBeVisible()
	);
	expect(body.getByTestId('consent-dialog-receipt')).toHaveAttribute(
		'data-open',
		'true'
	);
};

/**
 * Opted out with the refused rights confirmed by the backend: Allow still
 * asks first, and the visitor stays opted out, with the receipt showing,
 * until they confirm.
 */
export const optInConfirmationConfirmedRights: PlayFunction = async () => {
	const body = within(document.body);
	const allow = await body.findByTestId(
		'consent-dialog-right-option-sale-allow'
	);
	await userEvent.click(allow);
	await waitFor(() => expect(confirmationOpen()).toBe('true'));
	await waitFor(() =>
		expect(body.getByTestId('consent-dialog-confirm-allow')).toBeVisible()
	);
	expect(body.getByTestId('consent-dialog-receipt')).toHaveAttribute(
		'data-open',
		'true'
	);
};
