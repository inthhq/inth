/**
 * The page links that open the consent dialog: "Your Privacy Choices", a
 * `ConsentDialogLink`, and the script tag's `#inth-preferences` anchor.
 * The banner's Customize expands its options in place and never opens the
 * dialog, so a bench that measures opening the dialog presses one of these,
 * as a visitor does.
 */
export const dialogLinkSelector = [
	'[data-testid="privacy-choices-link"]',
	'[data-testid="consent-dialog-link"]',
	'a[href="#inth-preferences"]',
].join(', ');

/** The label every bench page and example gives its dialog link. */
export const dialogLinkLabel = /privacy settings|your privacy choices/iu;
