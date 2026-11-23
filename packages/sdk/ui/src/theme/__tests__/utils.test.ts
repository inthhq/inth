import { describe, expect, test } from 'vitest';

import type { Theme } from '../types';
import {
	defaultTheme,
	defaultThemeReferences,
	generateDefaultThemeCSS,
	generatePrimaryTintSupportsCSS,
	generateThemeCSS,
	getContrastColor,
	themeToVars,
} from '../utils';

/**
 * The `--inth-primary-tint` a browser with relative colour syntax would give
 * the root element for some generated theme CSS. It reads the theme's two
 * root selectors (`:root:root` and `:root:root.dark`), honours
 * `prefers-color-scheme: dark` and `@supports` blocks, and lets the higher
 * specificity win, then the later rule.
 */
const resolvedRootTint = function resolvedRootTint(
	css: string,
	{ darkClass, prefersDark }: { darkClass: boolean; prefersDark: boolean }
): string | undefined {
	let best: { order: number; specificity: number; value: string } | undefined;
	let order = 0;
	const walk = (block: string): void => {
		let index = 0;
		while (index < block.length) {
			const open = block.indexOf('{', index);
			if (open === -1) {
				return;
			}
			const prelude = block.slice(index, open).trim();
			let depth = 1;
			let close = open + 1;
			while (depth > 0) {
				if (block[close] === '{') {
					depth += 1;
				} else if (block[close] === '}') {
					depth -= 1;
				}
				close += 1;
			}
			const body = block.slice(open + 1, close - 1);
			index = close;
			if (prelude.startsWith('@media')) {
				if (prelude.includes('prefers-color-scheme:dark') && prefersDark) {
					walk(body);
				}
				continue;
			}
			if (prelude.startsWith('@supports')) {
				walk(body);
				continue;
			}
			// The last declaration in a rule wins.
			const value = [
				...body.matchAll(/--inth-primary-tint: (?<tint>[^;]+);/gu),
			].at(-1)?.groups?.tint;
			const selectors = prelude.split(',');
			let specificity = 0;
			if (selectors.includes(':root:root.dark')) {
				specificity = darkClass ? 3 : 0;
			} else if (selectors.includes(':root:root')) {
				specificity = 2;
			}
			order += 1;
			if (
				value &&
				specificity > 0 &&
				(!best || specificity >= best.specificity)
			) {
				best = { order, specificity, value };
			}
		}
	};
	walk(css);
	return best?.value;
};

describe('defaultTheme', () => {
	test('has all required color tokens', () => {
		expect(defaultTheme.colors.primary).toBeDefined();
		expect(defaultTheme.colors.surface).toBeDefined();
		expect(defaultTheme.colors.text).toBeDefined();
		expect(defaultTheme.colors.border).toBeDefined();
	});

	test('has typography settings', () => {
		expect(defaultTheme.typography.fontFamily).toBeDefined();
		expect(defaultTheme.typography.fontSize).toBeDefined();
		expect(defaultTheme.typography.fontWeight).toBeDefined();
	});

	test('has spacing scale', () => {
		expect(defaultTheme.spacing.xs).toBeDefined();
		expect(defaultTheme.spacing.sm).toBeDefined();
		expect(defaultTheme.spacing.md).toBeDefined();
		expect(defaultTheme.spacing.lg).toBeDefined();
		expect(defaultTheme.spacing.xl).toBeDefined();
	});

	test('has radius scale', () => {
		expect(defaultTheme.radius.sm).toBeDefined();
		expect(defaultTheme.radius.md).toBeDefined();
		expect(defaultTheme.radius.lg).toBeDefined();
		expect(defaultTheme.radius.full).toBeDefined();
	});

	test('has shadow scale', () => {
		expect(defaultTheme.shadows.sm).toBeDefined();
		expect(defaultTheme.shadows.md).toBeDefined();
		expect(defaultTheme.shadows.lg).toBeDefined();
	});

	test('has motion settings', () => {
		expect(defaultTheme.motion.duration).toBeDefined();
		expect(defaultTheme.motion.easing).toBeDefined();
		expect(defaultTheme.motion.easingOut).toBeDefined();
		expect(defaultTheme.motion.easingIn).toBeDefined();
		expect(defaultTheme.motion.easingInOut).toBeDefined();
		expect(defaultTheme.motion.easingSpring).toBeDefined();
	});
});

describe('themeToVars', () => {
	test('converts color tokens to CSS variables', () => {
		const theme: Theme = {
			colors: {
				primary: '#ff0000',
				surface: '#ffffff',
			},
		};
		const vars = themeToVars(theme);
		expect(vars['--inth-primary']).toBe('#ff0000');
		expect(vars['--inth-surface']).toBe('#ffffff');
	});

	test('converts switch color tokens to CSS variables', () => {
		const theme: Theme = {
			colors: {
				switchTrack: '#123456',
				switchTrackActive: '#654321',
			},
		};
		const vars = themeToVars(theme);
		expect(vars['--inth-switch-track']).toBe('#123456');
		expect(vars['--inth-switch-track-active']).toBe('#654321');
	});

	test('the on-track follows a custom primary, in a JS theme and in the stock sheet', () => {
		expect(
			themeToVars({ colors: { primary: '#ff0000' } })[
				'--inth-switch-track-active'
			]
		).toBe('#ff0000');
		expect(
			themeToVars({ dark: { primary: '#00ff00' } }, true)[
				'--inth-switch-track-active'
			]
		).toBe('#00ff00');
		// The stock tokens reference the primary, so a CSS-only theme moves it.
		expect(defaultThemeReferences.colors.switchTrackActive).toBe(
			'var(--inth-primary)'
		);
		expect(defaultThemeReferences.dark.switchTrackActive).toBe(
			'var(--inth-primary)'
		);
	});

	test('converts typography tokens to CSS variables', () => {
		const theme: Theme = {
			typography: {
				fontFamily: 'Arial, sans-serif',
				fontSize: {
					base: '1rem',
					sm: '0.875rem',
				},
				fontWeight: {
					medium: 500,
					normal: 400,
				},
			},
		};
		const vars = themeToVars(theme);
		expect(vars['--inth-font-family']).toBe('Arial, sans-serif');
		expect(vars['--inth-font-size-sm']).toBe('0.875rem');
		expect(vars['--inth-font-size-base']).toBe('1rem');
		expect(vars['--inth-font-weight-normal']).toBe('400');
		expect(vars['--inth-font-weight-medium']).toBe('500');
	});

	test('converts spacing tokens to CSS variables', () => {
		const theme: Theme = {
			spacing: {
				md: '1rem',
				sm: '0.5rem',
				xs: '0.25rem',
			},
		};
		const vars = themeToVars(theme);
		expect(vars['--inth-space-xs']).toBe('0.25rem');
		expect(vars['--inth-space-sm']).toBe('0.5rem');
		expect(vars['--inth-space-md']).toBe('1rem');
	});

	test('converts radius tokens to CSS variables', () => {
		const theme: Theme = {
			radius: {
				full: '9999px',
				lg: '12px',
				md: '8px',
				sm: '4px',
			},
		};
		const vars = themeToVars(theme);
		expect(vars['--inth-radius-sm']).toBe('4px');
		expect(vars['--inth-radius-md']).toBe('8px');
		expect(vars['--inth-radius-lg']).toBe('12px');
		expect(vars['--inth-radius-full']).toBe('9999px');
	});

	test('converts shadow tokens to CSS variables', () => {
		const theme: Theme = {
			shadows: {
				md: '0 4px 6px rgba(0,0,0,0.1)',
				sm: '0 1px 2px rgba(0,0,0,0.05)',
			},
		};
		const vars = themeToVars(theme);
		expect(vars['--inth-shadow-sm']).toBe('0 1px 2px rgba(0,0,0,0.05)');
		expect(vars['--inth-shadow-md']).toBe('0 4px 6px rgba(0,0,0,0.1)');
	});

	test('converts motion tokens to CSS variables', () => {
		const theme: Theme = {
			motion: {
				duration: {
					fast: '100ms',
					normal: '200ms',
				},
				easing: 'ease-in-out',
				easingIn: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
				easingInOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
				easingOut: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
				easingSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
			},
		};
		const vars = themeToVars(theme);
		expect(vars['--inth-duration-fast']).toBe('100ms');
		expect(vars['--inth-duration-normal']).toBe('200ms');
		expect(vars['--inth-easing']).toBe('ease-in-out');
		expect(vars['--inth-easing-out']).toBe(
			'cubic-bezier(0.215, 0.61, 0.355, 1)'
		);
		expect(vars['--inth-easing-in']).toBe(
			'cubic-bezier(0.55, 0.055, 0.675, 0.19)'
		);
		expect(vars['--inth-easing-in-out']).toBe(
			'cubic-bezier(0.645, 0.045, 0.355, 1)'
		);
		expect(vars['--inth-easing-spring']).toBe(
			'cubic-bezier(0.34, 1.56, 0.64, 1)'
		);
	});

	test('uses dark colors when isDark is true', () => {
		const theme: Theme = {
			colors: {
				surface: '#ffffff',
			},
			dark: {
				surface: '#000000',
			},
		};
		const lightVars = themeToVars(theme, false);
		const darkVars = themeToVars(theme, true);

		expect(lightVars['--inth-surface']).toBe('#ffffff');
		expect(darkVars['--inth-surface']).toBe('#000000');
	});

	test('returns empty object for empty theme', () => {
		const vars = themeToVars({});
		expect(Object.keys(vars)).toHaveLength(0);
	});

	test('only includes defined values', () => {
		const theme: Theme = {
			colors: {
				primary: '#ff0000',
			},
		};
		const vars = themeToVars(theme);
		expect(vars['--inth-primary']).toBe('#ff0000');
		expect(vars['--inth-surface']).toBeUndefined();
	});

	test('derives text-on-primary when primary is bright', () => {
		const vars = themeToVars({
			colors: {
				primary: '#2ed1c3',
			},
		});

		expect(vars['--inth-text-on-primary']).toBe('#000000');
	});

	test('derives text-on-primary from dark primary overrides', () => {
		const vars = themeToVars(
			{
				colors: {
					primary: '#fafafa',
				},
				dark: {
					primary: '#16324f',
				},
			},
			true
		);

		expect(vars['--inth-text-on-primary']).toBe('#ffffff');
	});

	test('preserves explicit text-on-primary overrides', () => {
		const vars = themeToVars({
			colors: {
				primary: '#2ed1c3',
				textOnPrimary: '#112233',
			},
		});

		expect(vars['--inth-text-on-primary']).toBe('#112233');
	});
});

describe('consent UI tokens', () => {
	test('[VIS-03] the default off-track meets 3:1 on the default surface', () => {
		expect(defaultTheme.colors.switchTrackOff).toBe('#8492a6');
		expect(defaultTheme.dark.switchTrackOff).toBe('#64748b');
	});

	test('[VIS-07] the radius scale adds container and nested steps', () => {
		const vars = themeToVars(defaultTheme);

		expect(vars['--inth-radius-container']).toBe('0.75rem');
		expect(vars['--inth-radius-nested']).toBe('0.5rem');
	});

	test('emits the colour and motion defaults in light and dark', () => {
		const light = themeToVars(defaultTheme);
		const dark = themeToVars(defaultTheme, true);

		expect(light['--inth-danger']).toBe('#dc2626');
		expect(dark['--inth-danger']).toBe('#f87171');
		expect(light['--inth-border-strong']).toBe('rgba(15, 23, 42, 0.16)');
		expect(dark['--inth-border-strong']).toBe('#3a404e');
		expect(light['--inth-overlay-block']).toBe('rgba(15, 23, 42, 0.62)');
		expect(dark['--inth-overlay-block']).toBe('rgba(0, 0, 0, 0.72)');
		expect(light['--inth-overlay-block-solid']).toBe('rgba(15, 23, 42, 0.78)');
		expect(dark['--inth-overlay-block-solid']).toBe('rgba(0, 0, 0, 0.85)');
		expect(light['--inth-easing-out-strong']).toBe(
			'cubic-bezier(0.23, 1, 0.32, 1)'
		);
	});

	test('[VIS-07] [VIS-01] [VIS-02] uses the consent UI defaults', () => {
		const light = themeToVars(defaultTheme);
		const dark = themeToVars(defaultTheme, true);

		expect(light['--inth-primary']).toBe('#2563eb');
		expect(dark['--inth-primary']).toBe('#2f66df');
		expect(dark['--inth-primary-text']).toBe('#8ab4ff');
		expect(light['--inth-radius-lg']).toBe('1rem');
		expect(light['--inth-radius-md']).toBe('0.625rem');
		expect(light['--inth-switch-track']).toBe('hsl(0, 0%, 85%)');
		expect(light['--inth-easing-out']).toBe(
			'cubic-bezier(0.215, 0.61, 0.355, 1)'
		);
	});

	test('[VIS-02] primary text follows a theme primary that sets nothing else', () => {
		const vars = themeToVars({ colors: { primary: '#0f766e' } });

		expect(vars['--inth-primary-text']).toBe('#0f766e');
	});

	test('[VIS-02] an explicit primary text wins over primary', () => {
		const vars = themeToVars(
			{ dark: { primary: '#2f66df', primaryText: '#8ab4ff' } },
			true
		);

		expect(vars['--inth-primary']).toBe('#2f66df');
		expect(vars['--inth-primary-text']).toBe('#8ab4ff');
	});

	test('the primary tint is primary mixed into the surface, 10% light and 18% dark', () => {
		const theme: Theme = {
			colors: { primary: '#2563eb', surface: '#ffffff' },
			dark: { primary: '#4f83f1', surface: '#14161a' },
		};

		expect(themeToVars(theme)['--inth-primary-tint']).toBe(
			'color-mix(in srgb, #2563eb 10%, #ffffff)'
		);
		expect(themeToVars(theme, true)['--inth-primary-tint']).toBe(
			'color-mix(in srgb, #4f83f1 18%, #14161a)'
		);
	});

	test('the primary tint reads the stylesheet surface when a theme sets only primary', () => {
		expect(
			themeToVars({ colors: { primary: '#0f766e' } })['--inth-primary-tint']
		).toBe('color-mix(in srgb, #0f766e 10%, var(--inth-surface))');
	});

	test('an explicit primary tint is kept as written', () => {
		expect(
			themeToVars({ colors: { primary: '#000', primaryTint: '#eef' } })[
				'--inth-primary-tint'
			]
		).toBe('#eef');
	});

	test('[VIS-03] a theme that sets only the old switch track keeps the 3:1 off-track', () => {
		// `switchTrack` is about 1.4:1 on the surface, so it is no fallback.
		const theme: Theme = {
			colors: { switchTrack: '#e5e5e5' },
			dark: { switchTrack: '#333333' },
		};

		expect(themeToVars(theme)['--inth-switch-track-off']).toBe('#8492a6');
		expect(themeToVars(theme, true)['--inth-switch-track-off']).toBe('#64748b');
		expect(themeToVars(theme)['--inth-switch-track']).toBe('#e5e5e5');
	});

	test('[VIS-03] an explicit off-track is kept as written', () => {
		expect(
			themeToVars({ colors: { switchTrack: '#eee', switchTrackOff: '#555' } })[
				'--inth-switch-track-off'
			]
		).toBe('#555');
	});

	test('[VIS-03] the primary tint is opaque when primary has alpha', () => {
		// `color-mix` keeps the alpha: 10% of a 50% primary over an opaque
		// surface is 95% opaque. Folding the alpha into the share gives the
		// colour the relative-colour form gives, at full opacity.
		const theme: Theme = {
			colors: { primary: 'rgb(37 99 235 / 50%)', surface: '#ffffff' },
			dark: { primary: '#2563eb80', surface: '#14161a' },
		};

		// 10% at alpha 0.5 weighs 5 against the surface's 90: 5 / 95.
		expect(themeToVars(theme)['--inth-primary-tint']).toBe(
			'color-mix(in srgb, rgb(37 99 235) 5.2632%, #ffffff)'
		);
		// 18% at alpha 128/255 weighs 9.035 against 82: 9.035 / 91.035.
		expect(themeToVars(theme, true)['--inth-primary-tint']).toBe(
			'color-mix(in srgb, rgb(37 99 235) 9.925%, #14161a)'
		);
	});

	test.each([
		['rgba(37, 99, 235, 0.5)', 'rgb(37 99 235) 5.2632%'],
		['hsl(220 83% 53% / 0.5)', 'rgb(36 102 235) 5.2632%'],
		['hsla(220, 83%, 53%, .5)', 'rgb(36 102 235) 5.2632%'],
		['#2563eb00', 'rgb(37 99 235) 0%'],
		['oklch(0.55 0.2 262 / 50%)', 'oklch(0.55 0.2 262) 5.2632%'],
		['color(srgb 0.1 0.4 0.9 / .5)', 'color(srgb 0.1 0.4 0.9) 5.2632%'],
		['lab(50 20 -60 / 0.5)', 'lab(50 20 -60) 5.2632%'],
	])('[VIS-03] reads the alpha of %s', (primary, mixed) => {
		expect(
			themeToVars({ colors: { primary, surface: '#fff' } })[
				'--inth-primary-tint'
			]
		).toBe(`color-mix(in srgb, ${mixed}, #fff)`);
	});

	test.each([
		['oklch(0.55 0.2 262 / 50%)', 'var(--inth-surface)'],
		['var(--brand)', '#ffffff'],
		['rebeccapurple', 'rgba(255, 255, 255, 0.8)'],
		['rgb(37 99 235 / 50%)', 'white'],
		['rgb(from red r g b / 50%)', '#ffffff'],
		['rgb(37 99 235 / calc(1 / 2))', '#ffffff'],
	])(
		'[VIS-03] the primary tint is the plain mix when the alpha of %s or %s is unknown',
		(primary, surface) => {
			// Relative colour syntax here would make a browser without it drop
			// the whole value, and the tint would go transparent; the
			// `@supports` block in the generated CSS makes it opaque instead.
			expect(
				themeToVars({ colors: { primary, surface } })['--inth-primary-tint']
			).toBe(`color-mix(in srgb, ${primary} 10%, ${surface})`);
		}
	);

	test('[VIS-03] the primary tint is opaque over a translucent surface', () => {
		// 10 against 90 at alpha 0.8, which is 72: 10 / 82.
		expect(
			themeToVars({
				colors: { primary: '#2563eb', surface: 'rgba(255, 255, 255, 0.8)' },
			})['--inth-primary-tint']
		).toBe('color-mix(in srgb, #2563eb 12.1951%, rgb(255 255 255))');
		// 10 at alpha 0.5 is 5, against 90 at alpha 0.5, which is 45: 5 / 50.
		expect(
			themeToVars({
				colors: {
					primary: 'oklch(0.55 0.2 262 / 50%)',
					surface: 'color(srgb 1 1 1 / .5)',
				},
			})['--inth-primary-tint']
		).toBe('color-mix(in srgb, oklch(0.55 0.2 262) 10%, color(srgb 1 1 1))');
	});

	test('[VIS-03] generated theme CSS makes a derived tint opaque behind @supports', () => {
		const css = generateThemeCSS(
			{
				colors: { primary: 'oklch(0.55 0.2 262 / 50%)' },
				dark: { primary: 'var(--brand-dark)', primaryTint: '#101020' },
			},
			'system'
		);
		const supports = [
			...css.matchAll(
				/@supports \(color: rgb\(from red r g b \/ 1\)\)\{(?<rule>[^{}]*\{[^{}]*\})\}/gu
			),
		].map((match) => match.groups?.rule);

		// The base value is the plain mix every browser reads.
		expect(css).toContain(
			'--inth-primary-tint: color-mix(in srgb, oklch(0.55 0.2 262 / 50%) 10%, var(--inth-surface));'
		);
		// Only the light root rule, right after the light root block. The dark
		// tint is set as written, so nothing overrides it.
		expect(supports).toEqual([
			':root:root,:host,.inth-theme-root.inth-theme-root{--inth-primary-tint: rgb(from color-mix(in srgb, oklch(0.55 0.2 262 / 50%) 10%, var(--inth-surface)) r g b / 1);}',
		]);
		expect(css.indexOf('@supports')).toBeLessThan(
			css.indexOf('prefers-color-scheme')
		);
		expect(css).not.toContain('rgb(from #101020');
	});

	test('[VIS-03] generated theme CSS covers the dark and system tints', () => {
		const theme: Theme = {
			colors: { primary: 'var(--brand)' },
			dark: { surface: 'var(--brand-surface)' },
		};
		const darkTint =
			'rgb(from color-mix(in srgb, var(--brand) 18%, var(--brand-surface)) r g b / 1)';

		const system = generateThemeCSS(theme, 'system');
		// The guarded dark rule closes the media block it sits in.
		expect(system).toContain(
			`}@supports (color: rgb(from red r g b / 1)){:root:root,:host,.inth-theme-root.inth-theme-root{--inth-primary-tint: ${darkTint};}}}`
		);
		expect(system.indexOf('@media(prefers-color-scheme:dark){')).toBeLessThan(
			system.indexOf(`--inth-primary-tint: ${darkTint}`)
		);
		expect(system).toContain(
			`.inth-dark .inth-theme-root.inth-theme-root{--inth-primary-tint: ${darkTint};}`
		);

		const dark = generateThemeCSS(theme, 'dark');
		expect(dark).toContain(
			`:root:root,:host,.inth-theme-root.inth-theme-root{--inth-primary-tint: ${darkTint};}`
		);
	});

	describe.each([
		{
			dark: { primaryTint: '#112233' },
			label: 'an explicit dark tint',
			light: {},
		},
		{
			dark: {},
			label: 'an explicit light tint',
			light: { primaryTint: '#eef2ff' },
		},
		{
			dark: { primaryTint: '#112233' },
			label: 'explicit light and dark tints',
			light: { primaryTint: '#eef2ff' },
		},
	])('[VIS-03] generated theme CSS with $label', ({ dark, light }) => {
		const theme: Theme = {
			colors: { primary: '#2563eb', ...light },
			dark,
		};
		// `colors` applies to both modes and `dark` overrides it, so a light
		// tint alone is also the dark tint.
		const explicitLight = theme.colors?.primaryTint;
		const explicitDark = theme.dark?.primaryTint ?? explicitLight;
		const lightTint =
			explicitLight ??
			`rgb(from ${themeToVars(theme)['--inth-primary-tint']} r g b / 1)`;
		const darkTint =
			explicitDark ??
			`rgb(from ${themeToVars(theme, true)['--inth-primary-tint']} r g b / 1)`;

		test.each([
			['system', false, false, 'light'],
			['system', true, false, 'dark'],
			['system', false, true, 'dark'],
			['system', true, true, 'dark'],
			['light', false, false, 'light'],
			['light', true, false, 'light'],
			['light', false, true, 'dark'],
			['dark', false, false, 'dark'],
			['dark', true, false, 'dark'],
			['dark', false, true, 'dark'],
		] as const)(
			'under %j (prefers dark %j, dark class %j) the root gets the %s tint',
			(colorScheme, prefersDark, darkClass, mode) => {
				const css = generateThemeCSS(theme, colorScheme);

				expect(resolvedRootTint(css, { darkClass, prefersDark })).toBe(
					mode === 'dark' ? darkTint : lightTint
				);
				// A tint the theme sets is never wrapped.
				const explicitTints = [explicitLight, explicitDark].filter(
					(tint): tint is string => tint !== undefined
				);
				for (const explicit of explicitTints) {
					expect(css).not.toContain(`rgb(from ${explicit}`);
				}
			}
		);
	});

	test('[VIS-03] generated theme CSS adds no @supports block without a derived tint', () => {
		expect(generateThemeCSS({ radius: { lg: '4px' } })).not.toContain(
			'@supports'
		);
		expect(
			generateThemeCSS({ colors: { primary: '#000', primaryTint: '#eef' } })
		).not.toContain('@supports');
	});

	test('[VIS-03] the stylesheet tint is opaque where relative colour syntax works', () => {
		const css = generatePrimaryTintSupportsCSS();

		expect(css).toMatch(/^@supports \(color: rgb\(from red r g b \/ 1\)\)\{/u);
		expect(css).toContain(
			':root,:host,.inth-theme-root{--inth-primary-tint: rgb(from color-mix(in srgb, var(--inth-primary) 10%, var(--inth-surface)) r g b / 1);}'
		);
		expect(css).toContain(
			'.inth-dark .inth-theme-root{--inth-primary-tint: rgb(from color-mix(in srgb, var(--inth-primary) 18%, var(--inth-surface)) r g b / 1);}'
		);
		expect(generatePrimaryTintSupportsCSS({ light: false })).not.toContain(
			':root,:host,.inth-theme-root{'
		);
	});

	test('container and nested radii follow the scale, capped at 12px and 8px', () => {
		const square = themeToVars({ radius: { lg: '0px', md: '0px' } });
		const round = themeToVars({ radius: { lg: '1rem', md: '10px' } });
		const explicit = themeToVars({
			radius: { container: '4px', lg: '1rem', nested: '2px' },
		});

		expect(square['--inth-radius-container']).toBe('min(0px, 0.75rem)');
		expect(square['--inth-radius-nested']).toBe('min(0px, 0.5rem)');
		expect(round['--inth-radius-container']).toBe('min(1rem, 0.75rem)');
		expect(round['--inth-radius-nested']).toBe('min(10px, 0.5rem)');
		expect(explicit['--inth-radius-container']).toBe('4px');
		expect(explicit['--inth-radius-nested']).toBe('2px');
	});

	test.each(['0', '-0', '0.0', '.0', ' 0 '])(
		'[VIS-07] a square theme with radius %j gets a valid capped radius',
		(zero) => {
			// `min(0, 0.75rem)` mixes a number and a length, which drops the
			// whole declaration.
			const vars = themeToVars({ radius: { lg: zero, md: zero } });

			expect(vars['--inth-radius-container']).toBe('min(0px, 0.75rem)');
			expect(vars['--inth-radius-nested']).toBe('min(0px, 0.5rem)');
		}
	);

	test('[VIS-07] a radius that only starts with 0 keeps its unit', () => {
		expect(
			themeToVars({ radius: { lg: '0.5rem' } })['--inth-radius-container']
		).toBe('min(0.5rem, 0.75rem)');
	});

	test('an empty theme still emits nothing', () => {
		expect(themeToVars({})).toEqual({});
		expect(themeToVars({}, true)).toEqual({});
	});

	test('generated theme CSS carries the derived tokens', () => {
		const css = generateThemeCSS({ colors: { primary: '#0f766e' } });

		expect(css).toContain('--inth-primary-text: #0f766e;');
		expect(css).toContain(
			'--inth-primary-tint: color-mix(in srgb, #0f766e 10%, var(--inth-surface));'
		);
	});
});

describe('getContrastColor', () => {
	test.each([
		['hsl(0, 100%, 50%)', '#000000'],
		['hsl(60, 100%, 50%)', '#000000'],
		['hsl(120, 100%, 50%)', '#000000'],
		['hsl(180, 100%, 50%)', '#000000'],
		['hsl(240, 100%, 50%)', '#ffffff'],
		['hsl(300, 100%, 50%)', '#000000'],
		['hsl(-120, 100%, 50%)', '#ffffff'],
		['hsl(600, 100%, 50%)', '#ffffff'],
		['hsl(120, 0%, 0%)', '#ffffff'],
		['hsl(240, 0%, 100%)', '#000000'],
		['hsl(1e308turn, 0%, 100%)', '#000000'],
		['#123', '#ffffff'],
		['#1230', '#ffffff'],
		['#ffffff00', '#000000'],
	])('preserves readable foregrounds for %s', (color, foreground) => {
		expect(getContrastColor(color)).toBe(foreground);
	});

	test('parses comma-separated colors with long channel whitespace', () => {
		const color = `rgb(255,214,10${' '.repeat(100_000)})`;
		const start = performance.now();
		const contrast = getContrastColor(color);
		expect(performance.now() - start).toBeLessThan(1_000);
		expect(contrast).toBe('#000000');
	});

	test.each([
		'rgb( 255 , 214 , 10 )',
		'rgb(255 214 10 / 50%)',
		'hsl( 0 , 0% , 100% )',
	])('preserves channel whitespace handling for %s', (color) => {
		expect(getContrastColor(color)).toBe('#000000');
	});

	test('returns dark text for bright backgrounds', () => {
		expect(getContrastColor('#2ed1c3')).toBe('#000000');
	});

	test('returns light text for dark backgrounds', () => {
		expect(getContrastColor('hsl(210, 57%, 20%)')).toBe('#ffffff');
	});

	test('supports rgb color inputs', () => {
		expect(getContrastColor('rgb(255, 214, 10)')).toBe('#000000');
	});
});

describe('generateDefaultThemeCSS', () => {
	test('preserves explicit light and dark active switch colors', () => {
		const css = generateDefaultThemeCSS({
			colors: { primary: '#008000', switchTrackActive: '#ff8000' },
			dark: { primary: '#80ff80', switchTrackActive: '#ff80ff' },
		});

		expect(css).toContain('--inth-switch-track-active: #ff8000');
		expect(css).toContain('--inth-switch-track-active: #ff80ff');
	});
});

describe('generateThemeCSS', () => {
	test('generates CSS with :root selector', () => {
		const theme: Theme = {
			colors: {
				primary: '#ff0000',
			},
		};
		const css = generateThemeCSS(theme);
		expect(css).toContain(':root');
		expect(css).toContain('.inth-theme-root');
	});

	test('includes light mode variables', () => {
		const theme: Theme = {
			colors: {
				primary: '#ff0000',
			},
		};
		const css = generateThemeCSS(theme);
		expect(css).toContain('--inth-primary: #ff0000');
	});

	test('includes switch token variables in generated CSS', () => {
		const theme: Theme = {
			colors: {
				switchTrack: '#123456',
				switchTrackActive: '#654321',
			},
		};
		const css = generateThemeCSS(theme);
		expect(css).toContain('--inth-switch-track: #123456');
		expect(css).toContain('--inth-switch-track-active: #654321');
	});

	test('includes dark mode selector', () => {
		const theme: Theme = {
			colors: {
				primary: '#ff0000',
			},
			dark: {
				primary: '#cc0000',
			},
		};
		const css = generateThemeCSS(theme);
		expect(css).toContain('.dark');
		expect(css).toContain('.inth-dark');
	});

	test('uses base colors in dark mode when dark overrides are not provided', () => {
		const theme: Theme = {
			colors: {
				primary: '#123456',
			},
		};
		const css = generateThemeCSS(theme);

		expect(css).toContain('--inth-primary: #123456');
		expect(css).not.toContain('--inth-surface: hsl(0, 0%, 7%)');
		expect(css).not.toContain('--inth-primary: hsl(228, 100%, 70%)');
	});

	test('generates valid CSS structure', () => {
		const theme: Theme = {
			colors: {
				primary: '#ff0000',
				surface: '#ffffff',
			},
		};
		const css = generateThemeCSS(theme);
		const openBraces = css.match(/\{/gu)?.length ?? 0;
		const closeBraces = css.match(/\}/gu)?.length ?? 0;
		expect(openBraces).toBe(closeBraces);
		expect(openBraces).toBeGreaterThanOrEqual(3);
	});

	test('uses compound selectors for dark mode on :root', () => {
		const theme: Theme = {
			colors: {
				primary: '#ff0000',
			},
			dark: {
				primary: '#cc0000',
			},
		};
		const css = generateThemeCSS(theme);

		expect(css).toContain(':root.dark');
		expect(css).toContain(':root.inth-dark');
		expect(css).not.toContain('.dark :root');
		expect(css).not.toContain('.inth-dark :root');

		expect(css).toContain('.dark .inth-theme-root');
		expect(css).toContain('.inth-dark .inth-theme-root');
	});

	test('includes no-transitions utility class', () => {
		const theme: Theme = {
			colors: {
				primary: '#ff0000',
			},
		};
		const css = generateThemeCSS(theme);
		expect(css).toContain('.inth-no-transitions');
		expect(css).toContain('transition: none !important');
		expect(css).toContain('animation: none !important');
	});
});
