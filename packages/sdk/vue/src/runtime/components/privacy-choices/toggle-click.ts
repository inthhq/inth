/**
 * Whether a click on a row's text should toggle its switch (CAT-10): not
 * on a link or control, nor while the visitor selected text.
 *
 * @internal
 */
export const isToggleClick = function isToggleClick(
	event: MouseEvent
): boolean {
	const target = event.target as Element | null;
	if (target?.closest('a, button, input')) {
		return false;
	}
	const row = event.currentTarget as Element | null;
	const selection = row?.ownerDocument.getSelection();
	return !selection || selection.isCollapsed;
};

/** The opener key for a category's vendor trigger, where focus returns (NEST-04). */
export const vendorOpenerKey = (category: string): string =>
	`vendors:${category}`;
