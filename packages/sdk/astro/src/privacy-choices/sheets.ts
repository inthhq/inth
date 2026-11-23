/**
 * The Privacy Choices stylesheets a page carries, and how the browser adds
 * the ones it lacks.
 *
 * A page renders the theme tokens, the button rules, the shell, and the
 * sheet of the one presentation it shows (Card, Banner or Drawer), never
 * another presentation's. The options Customize opens bring `expand` and
 * `privacy-choices-dialog` with their own chunk, and the dialog brings its
 * sheets when it opens. Each sheet goes in once, as
 * `<style data-inth-styles="<id>">`, the marker React's surfaces dedupe
 * by too.
 *
 * @internal
 */

/** A stylesheet from `@inth/sdk/ui/styles/sheets/*`. */
export interface PrivacyChoicesSheet {
	readonly id: string;
	readonly css: string;
}

/** Marks every Inth `<style>`; the value is the sheet's id. */
export const SHEET_ATTRIBUTE = 'data-inth-styles';

/**
 * Add the sheets the document does not hold yet, in order, after the last
 * Inth sheet already on the page (else at the end of `<head>`). The
 * server inlines the first-paint sheets beside the prompt, so a later
 * sheet lands after them and keeps React's cascade order: the tokens, the
 * buttons and the shell first, the options and the dialog after.
 *
 * @param sheets - The sheets, in cascade order.
 * @param nonce - The page's CSP nonce, put on each `<style>`.
 * @param target - The document to add them to.
 */
export const insertSheets = function insertSheets(
	sheets: readonly PrivacyChoicesSheet[],
	nonce: string | undefined,
	target: Document = document
): void {
	for (const sheet of sheets) {
		if (target.querySelector(`style[${SHEET_ATTRIBUTE}="${sheet.id}"]`)) {
			continue;
		}
		const style = target.createElement('style');
		style.setAttribute(SHEET_ATTRIBUTE, sheet.id);
		if (nonce) {
			style.nonce = nonce;
		}
		style.textContent = sheet.css;
		const last = [...target.querySelectorAll(`style[${SHEET_ATTRIBUTE}]`)].at(
			-1
		);
		if (last) {
			last.after(style);
		} else {
			target.head.append(style);
		}
	}
};
