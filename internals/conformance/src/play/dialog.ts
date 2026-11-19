import { expect, userEvent, within } from 'storybook/test';
import type { PlayFunction } from 'storybook/types';

const getDefined = <Value>(
	value: Value,
	message = 'Expected value to be defined'
): NonNullable<Value> => {
	if (value === null || value === undefined) {
		throw new Error(message);
	}
	return value;
};

/**
 * Verifies dialog open/close flow: trigger opens dialog, close button closes it.
 */
export const openAndClose: PlayFunction = async ({ canvasElement }) => {
	const canvas = within(canvasElement);
	const body = within(document.body);

	const trigger = canvas.getByRole('button');
	await userEvent.click(trigger);

	const dialog = await body.findByRole('dialog');
	await expect(dialog).toBeInTheDocument();

	// The close button is the last button in the dialog.
	const closeButtons = within(dialog).getAllByRole('button');
	const closeButton = getDefined(closeButtons[closeButtons.length - 1]);
	await userEvent.click(closeButton);

	await expect(body.queryByRole('dialog')).not.toBeInTheDocument();
};

/**
 * Verifies ESC key closes the dialog.
 */
export const escCloses: PlayFunction = async ({ canvasElement }) => {
	const canvas = within(canvasElement);
	const body = within(document.body);

	const trigger = canvas.getByRole('button');
	await userEvent.click(trigger);
	await expect(await body.findByRole('dialog')).toBeInTheDocument();

	await userEvent.keyboard('{Escape}');
	await expect(body.queryByRole('dialog')).not.toBeInTheDocument();
};
