import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { PlayFunction } from 'storybook/types';

/**
 * A visitor who has already opted out follows the page's opt-out link back:
 * the consent dialog opens on the receipt that confirms the opt-out, with
 * focus on it, instead of a separate confirmation.
 */
const expectReceipt = async function expectReceipt(
	text: RegExp
): Promise<HTMLElement> {
	const body = within(document.body);
	const receipt = await body.findByTestId('consent-dialog-receipt');
	await waitFor(() => expect(receipt).toHaveAttribute('data-open', 'true'));
	await waitFor(() => expect(receipt).toHaveTextContent(text));
	await waitFor(() => expect(document.activeElement).toBe(receipt));
	return receipt;
};

const clickOptOutLink = async function clickOptOutLink(): Promise<void> {
	await userEvent.click(
		await within(document.body).findByTestId('consent-dialog-link')
	);
};

/**
 * The dialog is open on a receipt for an opt-out made by a Global Privacy
 * Control signal: the receipt names the signal, and Allow is unavailable
 * while the signal is on.
 */
const expectSignalReceipt =
	async function expectSignalReceipt(): Promise<void> {
		await expectReceipt(/Honoring Global Privacy Control/u);
		await expect(
			within(document.body).getByTestId(
				'consent-dialog-right-option-sale-allow'
			)
		).toHaveAttribute('aria-disabled', 'true');
	};
export const signalReceiptShown: PlayFunction = expectSignalReceipt;

/**
 * The dialog is open on a receipt for an opt-out adopted from the visitor's
 * account: the receipt says where the choice is saved.
 */
const expectAccountReceipt =
	async function expectAccountReceipt(): Promise<void> {
		await expectReceipt(/Saved to your account/u);
	};
export const accountReceiptShown: PlayFunction = expectAccountReceipt;

/** Follows the opt-out link, then checks {@link signalReceiptShown}. */
export const signalHonored: PlayFunction = async () => {
	await clickOptOutLink();
	await expectSignalReceipt();
};

/** Follows the opt-out link, then checks {@link accountReceiptShown}. */
export const accountAdopted: PlayFunction = async () => {
	await clickOptOutLink();
	await expectAccountReceipt();
};
