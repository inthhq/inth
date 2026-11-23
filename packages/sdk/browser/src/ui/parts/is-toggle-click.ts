/**
 * Whether a click on a row's text should toggle its switch (CAT-10): not
 * on a link or control, nor while the visitor selected text.
 */
export const isToggleClick = function isToggleClick(
	event: Event,
	row: Element
): boolean {
	const target = event.target as Element | null;
	if (target?.closest('a, button, input')) {
		return false;
	}
	const root = row.getRootNode() as Document | ShadowRoot;
	const selection =
		'getSelection' in root && typeof root.getSelection === 'function'
			? (root.getSelection as () => Selection | null)()
			: row.ownerDocument.getSelection();
	return !selection || selection.isCollapsed;
};
