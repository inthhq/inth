import type { Preview } from '@storybook/html-vite';

// The shipped stylesheet, the same one an Astro site imports. It now
// carries the default theme tokens, so nothing has to inject a theme at
// runtime — which is the whole point of a server-rendered banner.
import '@inth/astro/styles.css';
// What a `styles: false` site with the Svelte dialog imports too: the
// Svelte IAB dialog renders its rows with the primitives class maps.
import '@inth/astro/primitives.css';
import '@inth/sdk/ui/iab/styles.css';

const storybookCanvasStyleId = 'inth-storybook-canvas';
const canvasCSS = `
	:root {
		color: var(--inth-text);
		background: var(--inth-surface-hover);
		font-family: var(--inth-font-family);
	}

	body {
		font-family: var(--inth-font-family);
		color: var(--inth-text);
		background: var(--inth-surface-hover);
	}
`;

const ensureGlobalStyle = function ensureGlobalStyle(
	id: string,
	cssText: string
) {
	if (typeof document === 'undefined') {
		return;
	}

	if (document.getElementById(id)) {
		return;
	}

	const style = document.createElement('style');
	style.id = id;
	style.textContent = cssText;
	document.head.appendChild(style);
};

ensureGlobalStyle(storybookCanvasStyleId, canvasCSS);

const preview: Preview = {
	parameters: {
		layout: 'fullscreen',
	},
};

export default preview;
