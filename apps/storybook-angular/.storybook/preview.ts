import type { Preview } from '@analogjs/storybook-angular';

// The same stylesheet set every other Storybook loads: the parity runner
// compares computed CSS custom properties per element, so the IAB sheet is
// loaded even for non-IAB stories. The stock surfaces also insert the rules
// they use themselves; those are the same `@inth/sdk/ui` rules.
import '../../../packages/sdk/angular/src/styles.css';
import '../../../packages/sdk/angular/src/iab/styles.css';

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
