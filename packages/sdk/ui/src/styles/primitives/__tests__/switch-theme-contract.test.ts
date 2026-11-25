import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vite-plus/test';

const packageRoot = existsSync(
	resolve(process.cwd(), 'src/styles/primitives/switch.module.css')
)
	? process.cwd()
	: resolve(process.cwd(), 'packages/sdk/ui');

const switchCss = readFileSync(
	resolve(packageRoot, 'src/styles/primitives/switch.module.css'),
	'utf8'
);

describe('switch theme contract', () => {
	test('defines internal switch variables on the root element', () => {
		expect(switchCss).toContain('.root {');
		expect(switchCss).toContain('box-sizing: border-box;');
		expect(switchCss).toContain('padding: 0;');
		expect(switchCss).toContain(
			'--switch-background-color: var(--inth-switch-track-off);'
		);
		expect(switchCss).toContain(
			'--switch-background-color-checked: var(--inth-switch-track-active);'
		);
		expect(switchCss).not.toContain(':root {');
	});

	test('uses the token-backed variables for checked and unchecked track states', () => {
		expect(switchCss).toContain('.track {');
		expect(switchCss).toContain('height: 100%;');
		expect(switchCss).toContain('width: 100%;');
		expect(switchCss).toContain('overflow: hidden;');
		expect(switchCss).toContain(
			'background-color: var(--switch-background-color);'
		);
		expect(switchCss).toContain(".root[data-state='checked'] .track {");
		expect(switchCss).toContain(
			'background-color: var(--switch-background-color-checked);'
		);
	});
});
