import type { Preview } from '@analogjs/storybook-angular';

// The same stylesheet set every other Storybook loads: the parity runner
// compares computed CSS custom properties per element, so the IAB sheet is
// loaded even for non-IAB stories. The stock surfaces also insert the rules
// they use themselves; those are the same `@c15t/ui` rules.
import '../../../packages/angular/src/styles.css';
import '../../../packages/angular/src/iab/styles.css';

const storybookCanvasStyleId = 'c15t-storybook-canvas';

const canvasCSS = `
	:root {
		color: var(--c15t-text);
		background: var(--c15t-surface-hover);
		font-family: var(--c15t-font-family);
	}

	body {
		font-family: var(--c15t-font-family);
		color: var(--c15t-text);
		background: var(--c15t-surface-hover);
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
