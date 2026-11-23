// Theme styles load after mount; compare the consent markup and track hydration warnings separately.
export const consentMarkup = (container: HTMLElement) => {
	const copy = container.cloneNode(true) as HTMLElement;
	copy.querySelectorAll('style#inth-theme').forEach((style) => style.remove());
	// The page announcement becomes a live region once mounted: a region
	// the server rendered live would announce its first text twice.
	copy
		.querySelectorAll('[data-testid="consent-banner-announcement"]')
		.forEach((region) => {
			for (const name of ['role', 'aria-live', 'aria-atomic']) {
				region.removeAttribute(name);
			}
		});
	// Branding appends the browser hostname after mount, without affecting consent.
	copy.querySelectorAll('a[data-branding]').forEach((link) => {
		const href = link.getAttribute('href');
		if (!href) {
			return;
		}
		const url = new URL(href);
		url.searchParams.delete('ref');
		link.setAttribute('href', url.toString().replace(/\/$/u, ''));
	});
	return copy.innerHTML;
};
