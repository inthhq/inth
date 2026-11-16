import type { TestElement } from '@angular/cdk/testing';

/**
 * Clicks a surface's action button, or throws a message that names the
 * surface and the action when the surface does not offer it.
 *
 * @param button - The located button, or `null`.
 * @param surface - The surface's name, for the error.
 * @param action - The action's name, for the error.
 * @throws {Error} When `button` is `null`.
 * @internal
 */
export const clickAction = async function clickAction(
	button: TestElement | null,
	surface: string,
	action: string
): Promise<void> {
	if (!button) {
		throw new Error(`The ${surface} offers no "${action}" action.`);
	}
	await button.click();
};
