import type { Preview } from '@storybook/svelte-vite';

// The stylesheets ship the `defaultTheme` tokens themselves, so the canvas
// only has to opt into them — no `generateThemeCSS(defaultTheme)` injection.
import '../../../packages/sdk/svelte/src/styles.css';
import '../../../packages/sdk/svelte/src/iab/styles.css';

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
		layout: 'centered',
	},
};

export default preview;
