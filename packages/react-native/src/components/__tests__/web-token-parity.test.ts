/**
 * The web surfaces are the specification for these values, and this is the
 * guard that keeps them a specification rather than a screenshot someone
 * remembered.
 *
 * Every number is read out of the web package at test time. The palette, radii,
 * spacing and type scale come from the `defaultTheme` literal in
 * `packages/sdk/ui/src/theme/utils.ts`, and the rules that pick which token paints
 * which part come from the CSS modules that actually draw a banner, a dialog, a
 * button and a switch. The link between the two is `themeCSSVariableResolvers`,
 * the table that turns a `var(--inth-space-md)` in a stylesheet into a theme
 * token, so this file follows the same indirection a browser does instead of
 * guessing at a naming convention.
 *
 * Nothing is copied into this file, so a token moved on the web fails here
 * instead of shipping as an app banner that quietly stopped matching the site
 * next to it. That drift has already happened once: the banner was built from
 * the dialog's type scale, which put a 14 semibold heading over 16 body copy
 * where the web banner leads with 16 medium over 14. It happened again when the
 * web moved to its one consent UI, with a new accent, larger radii and a new
 * dialog type pair, and this file was still reading the retired sheets.
 *
 * `@inth/sdk/ui` is deliberately not imported. It is not a dependency of this
 * package, runtime or otherwise, and a parity test is not a reason to give an
 * app a stylesheet it will never load. The same reason keeps `@inth/sdk/engine` out
 * of everything but `src/protocol/__tests__`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vite-plus/test';

import {
	defaultConsentTheme,
	resolveConsentTypeRoles,
} from '../theme/create-consent-theme';
import { CONSENT_SWITCH_GEOMETRY } from '../theme/use-consent-styles';

/** The stock type roles, from the stock type tokens. */
const lightRoles = resolveConsentTypeRoles(defaultConsentTheme.typography);

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repository root, five levels above `src/components/__tests__`. */
const ROOT = resolve(HERE, '../../../../..');

/** One file under `packages/sdk/ui`. */
const ui = function ui(path: string): string {
	return join(ROOT, 'packages/sdk/ui', path);
};

const THEME_SOURCE = ui('src/theme/utils.ts');
const SURFACE_CSS = ui('src/styles/components/consent-surface.module.css');
const DIALOG_CSS = ui('src/styles/components/consent-dialog.module.css');
const BUTTON_CSS = ui('src/styles/primitives/button.module.css');
const SWITCH_CSS = ui('src/styles/primitives/switch.module.css');

type Literal = number | string | undefined | { [key: string]: Literal };

const read = function read(path: string): string {
	return readFileSync(path, 'utf8');
};

/** The first index at or after `from` that is neither space nor a comment. */
const code = function code(source: string, from: number): number {
	let index = from;
	for (;;) {
		const character = source[index];
		if (character === '/' && source[index + 1] === '*') {
			index = source.indexOf('*/', index) + 2;
		} else if (character === '/' && source[index + 1] === '/') {
			const newline = source.indexOf('\n', index);
			index = newline === -1 ? source.length : newline + 1;
		} else if (character === undefined || !/\s/u.test(character)) {
			return index;
		} else {
			index += 1;
		}
	}
};

const QUOTED_KEY = /^'(?<quoted>[^']*)'/u;
const BARE_KEY = /^(?<bare>[\w$]+)/u;
const NUMBER = /^(?<number>-?[\d.]+)/u;

/**
 * The object literal that follows some text in a source file.
 *
 * A parser rather than a regex because the theme nests, and a regex that stops
 * at the first `}` silently reads a half-token. Comments are skipped, which the
 * theme needs because its motion block annotates every easing. A value that is
 * not a literal (an imported palette, a function) comes back as `undefined`,
 * which is the honest answer: this file only ever asks for plain data.
 *
 * @param source - TypeScript source.
 * @param anchor - Text immediately before the `{` that opens the object.
 * @returns The literal's keys, in the shape the source writes them.
 */
const objectLiteral = function objectLiteral(
	source: string,
	anchor: string
): { [key: string]: Literal } {
	const open = source.indexOf('{', source.indexOf(anchor));
	if (open === -1) {
		throw new Error(`No object literal after ${anchor}`);
	}

	// The object and value parsers call each other, so the object parser arrives
	// as an argument rather than a name that has not been defined yet.
	const parseValue = function parseValue(
		from: number,
		entries: (from: number) => [Record<string, Literal>, number]
	): [Literal, number] {
		const character = source[from];

		if (character === '{') {
			return entries(from);
		}

		if (character === "'") {
			const close = source.indexOf("'", from + 1);
			return [source.slice(from + 1, close), close + 1];
		}

		if (character !== undefined && /[-\d.]/u.test(character)) {
			const token = NUMBER.exec(source.slice(from))?.groups?.number as string;
			return [Number(token), from + token.length];
		}

		// Anything else is an expression this file has no use for, so it is
		// walked over rather than evaluated.
		let index = from;
		let depth = 0;
		while (index < source.length) {
			const walker = source[index] as string;
			if ('([{'.includes(walker)) {
				depth += 1;
			} else if (')]}'.includes(walker)) {
				if (depth === 0) {
					break;
				}
				depth -= 1;
			} else if (walker === ',' && depth === 0) {
				break;
			}
			index += 1;
		}
		return [undefined, index];
	};

	const parseObject = function parseObject(
		from: number
	): [Record<string, Literal>, number] {
		const entries: Record<string, Literal> = {};
		let index = from + 1;

		for (;;) {
			index = code(source, index);

			// A trailing comma is legal, so a closing brace can be what comes next
			// even though the last entry ended with one.
			if (source[index] === '}') {
				return [entries, index + 1];
			}

			const rest = source.slice(index);
			const key =
				QUOTED_KEY.exec(rest)?.groups?.quoted ??
				BARE_KEY.exec(rest)?.groups?.bare;
			if (key === undefined) {
				throw new Error(`Unparsed key at offset ${index} of ${anchor}`);
			}

			index = code(
				source,
				index + key.length + (source[index] === "'" ? 2 : 0)
			);
			// Past the colon, which the source may pad.
			index = code(source, index + 1);

			const [value, end] = parseValue(index, parseObject);
			entries[key] = value;
			index = code(source, end);

			if (source[index] !== ',') {
				return [entries, index + 1];
			}
			index += 1;
		}
	};

	const [parsed] = parseObject(open);
	return parsed;
};

/**
 * Which theme token each `--inth-*` CSS variable reads.
 *
 * Read from `themeCSSVariableResolvers`, the same table the web build
 * serialises, so a token renamed there is a name this test cannot resolve
 * rather than a name it invents. A key is quoted only when it needs to be, so
 * `border:` and `'font-size-sm':` are entries of one map.
 */
const variablePaths = function variablePaths(): Map<string, string[]> {
	const source = read(THEME_SOURCE);
	const map = new Map<string, string[]>();

	for (const groups of source
		.slice(source.indexOf('themeCSSVariableResolvers'))
		.matchAll(
			/^\t*'?(?<suffix>[a-z][\w-]*)'?\s*:\s*\([^)]*\)\s*=>\s*(?<body>[^,\n]*(?:\n\s*[^,\n]*)*?),$/gmu
		)) {
		const walk = /(?<root>(?:theme|colors)\??(?:\.[\w$]+\??)+)/u.exec(
			groups.groups?.body ?? ''
		);
		const parts = walk?.groups?.root
			?.split('.')
			.filter((segment) => segment.length > 0)
			.map((segment) => segment.replace('?', ''));
		const suffix = groups.groups?.suffix;
		if (parts === undefined || suffix === undefined) {
			continue;
		}

		// `theme` is the whole object and is implied by the walk itself, while
		// `colors` names which of the two palettes to read, so that one stays.
		const [root, ...rest] = parts;
		map.set(suffix, root === 'colors' ? ['colors', ...rest] : rest);
	}

	if (map.size < 30) {
		throw new Error(
			`Resolved only ${map.size} CSS variables from the web theme map`
		);
	}

	return map;
};

const VARS = variablePaths();
const WEB_THEME = objectLiteral(
	read(THEME_SOURCE),
	'export const defaultTheme'
);
const WEB_DARK = objectLiteral(
	read(THEME_SOURCE),
	'export const defaultDarkColors'
);

/** One file's `--name: value` declarations, first definition winning. */
const declarationsCache = new Map<string, Map<string, string>>();
const declarationsIn = function declarationsIn(
	source: string
): Map<string, string> {
	const cached = declarationsCache.get(source);
	if (cached !== undefined) {
		return cached;
	}

	const out = new Map<string, string>();
	for (const groups of source.matchAll(
		/(?<name>--[\w-]+):\s*(?<value>[^;]+);/gu
	)) {
		const name = groups.groups?.name;
		const value = groups.groups?.value;
		if (name !== undefined && value !== undefined && !out.has(name)) {
			out.set(name, value.trim());
		}
	}
	declarationsCache.set(source, out);
	return out;
};

/** The web palette for one scheme, as the theme literal declares it. */
const palette = function palette(dark: boolean): Literal {
	return dark ? WEB_DARK : (WEB_THEME.colors as Literal);
};

/**
 * One entry of the web theme, walked by the path the variable map names.
 *
 * A colour path reads the dark palette when asked for the dark scheme, which is
 * how the web itself swaps them: one map, two palettes.
 */
const themeValue = function themeValue(
	path: readonly string[],
	dark: boolean
): string {
	const isColor = path[0] === 'colors';
	let walked: Literal = isColor ? palette(dark) : WEB_THEME;

	for (const segment of isColor ? path.slice(1) : path) {
		if (typeof walked !== 'object' || walked === null) {
			throw new Error(`${path.join('.')} walks off a non-object at ${segment}`);
		}
		walked = walked[segment];
	}

	if (typeof walked !== 'string' && typeof walked !== 'number') {
		throw new Error(`${path.join('.')} resolves to nothing in the web theme`);
	}

	return String(walked);
};

/**
 * What a suffix of `--inth-*` is worth, straight out of the web theme.
 *
 * @param suffix - The variable name with the `--inth-` prefix removed.
 * @param dark - Read the dark palette for a colour token.
 */
const tokenBySuffix = function tokenBySuffix(
	suffix: string,
	dark = false
): string {
	const path = VARS.get(suffix);
	if (path === undefined) {
		throw new Error(`No web theme token behind --inth-${suffix}`);
	}
	return themeValue(path, dark);
};

// `var(--name)`, or `var(--name, fallback)` as the sheets read their own
// hooks; the fallback is found again by `readFallback` when `--name`
// is never declared.
const VAR_REFERENCE = /^var\(\s*(?<reference>--[\w-]+)\s*(?:,[\s\S]*)?\)$/u;

/**
 * The default a stylesheet gives a variable it reads but never declares: the
 * fallback in its first `var(name, fallback)`. The sheets read their own hooks
 * this way, so that a value a site sets on any ancestor wins.
 *
 * @param source - The stylesheet the variable is read in.
 * @param variable - The variable, with its `--` prefix.
 */
const readFallback = function readFallback(
	source: string,
	variable: string
): string | undefined {
	// A custom property name is letters, digits, `-` and `_`: nothing to escape.
	const opening = new RegExp(`var\\(\\s*${variable}\\s*,`, 'u').exec(source);
	if (opening === null) {
		return undefined;
	}

	const start = opening.index + opening[0].length;
	let depth = 1;
	for (let index = start; index < source.length; index += 1) {
		const character = source[index];
		if (character === '(') {
			depth += 1;
		} else if (character === ')') {
			depth -= 1;
			if (depth === 0) {
				return source.slice(start, index).trim();
			}
		}
	}
	return undefined;
};

/**
 * What a CSS variable is worth, following `var()` hops the way a browser does.
 *
 * A `--inth-*` variable is the theme itself. Anything else, such as
 * `--button-font-size`, is a local alias declared in the same stylesheet, which
 * is followed first and then resolved the same way.
 *
 * @param source - The stylesheet the variable is used in.
 * @param name - The variable, with or without the `--inth-` prefix.
 * @param dark - Read the dark palette for a colour token.
 */
const webToken = function webToken(
	source: string,
	name: string,
	dark = false
): string {
	const variable = name.startsWith('--') ? name : `--inth-${name}`;
	if (variable.startsWith('--inth-')) {
		return tokenBySuffix(variable.slice('--inth-'.length), dark);
	}

	const declared =
		declarationsIn(source).get(variable) ?? readFallback(source, variable);
	if (declared === undefined) {
		throw new Error(`${variable} is never declared`);
	}

	const reference = VAR_REFERENCE.exec(declared)?.groups?.reference;
	return reference === undefined ? declared : webToken(source, reference, dark);
};

const clamp = function clamp(value: number, max: number): number {
	return Math.min(Math.max(value, 0), max);
};

/**
 * Which of `chroma`, the intermediate channel, and zero each of red, green and
 * blue carries, indexed by hue sector.
 */
const HUE_SECTORS: readonly (readonly [number, number, number])[] = [
	[0, 1, 2],
	[1, 0, 2],
	[2, 0, 1],
	[2, 1, 0],
	[1, 2, 0],
	[0, 2, 1],
];

const HSL =
	/^hsla?\((?<h>[\d.]+),\s*(?<s>[\d.]+)%,\s*(?<l>[\d.]+)%(?:,\s*(?<a>[\d.]+))?\)$/u;

const HEX = /^#(?<digits>[\da-f]{3}|[\da-f]{6})$/iu;

const RGB =
	/^rgba?\((?<r>\d+),\s*(?<g>\d+),\s*(?<b>\d+)(?:,\s*(?<a>[\d.]+))?\)$/u;

/** Red, green and blue as the hex this package writes, or `rgba()` with an alpha. */
const nativeFromChannels = function nativeFromChannels(
	channels: readonly [number, number, number],
	alpha?: string
): string {
	const [red, green, blue] = channels;
	if (alpha !== undefined) {
		return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
	}

	return `#${channels
		.map((one) => one.toString(16).padStart(2, '0'))
		.join('')
		.toUpperCase()}`;
};

/**
 * A CSS colour in a shape `packages/sdk/ui` writes it, as the shape this package
 * writes it: hex for an opaque colour, `rgba()` when there is an alpha.
 *
 * @param value - A hex, `rgb()`, `rgba()`, `hsl()` or `hsla()` literal.
 * @returns The same colour as React Native can apply it.
 */
const asNativeColor = function asNativeColor(value: string): string {
	const hex = HEX.exec(value)?.groups?.digits;
	if (hex !== undefined) {
		const full =
			hex.length === 3
				? [...hex].map((digit) => `${digit}${digit}`).join('')
				: hex;
		return `#${full.toUpperCase()}`;
	}

	const rgb = RGB.exec(value)?.groups;
	if (rgb?.r !== undefined && rgb.g !== undefined && rgb.b !== undefined) {
		return nativeFromChannels(
			[Number(rgb.r), Number(rgb.g), Number(rgb.b)],
			rgb.a
		);
	}

	const channels = HSL.exec(value)?.groups;
	if (
		channels?.h === undefined ||
		channels.s === undefined ||
		channels.l === undefined
	) {
		throw new Error(`Unreadable web colour: ${value}`);
	}

	const saturation = Number(channels.s) / 100;
	const lightness = Number(channels.l) / 100;
	const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const hue = Number(channels.h) / 60;
	const intermediate = chroma * (1 - Math.abs((hue % 2) - 1));
	const base = [chroma, intermediate, 0];
	const offset = lightness - chroma / 2;
	const channel = function channel(index: number): number {
		return Math.round(clamp((base[index] as number) + offset, 1) * 255);
	};

	const sector = HUE_SECTORS[
		clamp(Math.floor(hue), HUE_SECTORS.length - 1)
	] as readonly [number, number, number];
	return nativeFromChannels(
		[channel(sector[0]), channel(sector[1]), channel(sector[2])],
		channels.a
	);
};

const RATIO = /^[\d.]+$/u;

/**
 * A CSS length or ratio in the points React Native sizes in.
 *
 * A bare number is a line-height ratio and only becomes a length next to a font
 * size, which is exactly how the web treats it.
 */
const measure = function measure(value: string, againstFont?: number): number {
	if (RATIO.test(value)) {
		if (againstFont === undefined) {
			throw new Error(`${value} is a ratio and needs a font size`);
		}
		return Number(value) * againstFont;
	}
	return Number.parseFloat(value) * 16;
};

const CALC = /^calc\(\s*(?<operand>[\s\S]+?)\s*\*\s*(?<factor>[\d.]+)\s*\)$/u;

/**
 * A declared value with every `var()` hop followed, as a browser would.
 *
 * @param source - The stylesheet the value is declared in.
 * @param raw - The value as written.
 */
const resolved = function resolved(source: string, raw: string): string {
	const reference = VAR_REFERENCE.exec(raw.trim())?.groups?.reference;
	return reference === undefined ? raw.trim() : webToken(source, reference);
};

/**
 * {@link measure} for a declared value, which may be a `var()` or a
 * `calc(<length> * <factor>)`, the one shape of `calc` the sheets size type
 * with.
 */
const length = function length(
	source: string,
	raw: string,
	againstFont?: number
): number {
	const value = resolved(source, raw);
	const product = CALC.exec(value)?.groups;
	if (product?.operand !== undefined && product.factor !== undefined) {
		return (
			length(source, product.operand, againstFont) * Number(product.factor)
		);
	}
	return measure(value, againstFont);
};

const DECLARATION = /(?<property>[\w-]+):\s*(?<value>[^;]+);/gu;

/** The declaration block for one selector, as key/value pairs. */
const cssBlock = function cssBlock(
	source: string,
	selector: string
): Record<string, string> {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
	const block = new RegExp(`(?<rule>${escaped}\\s*\\{[^}]*\\})`, 'u').exec(
		source
	)?.groups?.rule;
	if (block === undefined) {
		throw new Error(`No CSS rule for ${selector}`);
	}

	const declarations: Record<string, string> = {};
	for (const groups of block.matchAll(DECLARATION)) {
		const property = groups.groups?.property;
		const value = groups.groups?.value;
		if (property !== undefined && value !== undefined) {
			declarations[property] = value.trim();
		}
	}
	return declarations;
};

/**
 * The text style one rule asks for, with a second rule to fall back on.
 *
 * A size variant sets the font size and line-height while the base rule carries
 * the weight, so both are read rather than guessed at.
 */
const webType = function webType(
	source: string,
	selector: string,
	fallback?: string
): { fontSize: number; fontWeight: number; lineHeight: number } {
	const blocks = [cssBlock(source, selector)];
	if (fallback !== undefined) {
		blocks.push(cssBlock(source, fallback));
	}

	const declared = function declared(
		property: string,
		inherited?: string
	): string {
		const raw =
			blocks
				.map((block) => block[property])
				.find((value) => value !== undefined) ?? inherited;
		if (raw === undefined) {
			throw new Error(`${selector} declares no ${property}`);
		}
		return raw;
	};

	// A rule that sets no weight draws at the one it inherits, and no consent
	// surface sets a weight above its text rules, so that is `normal`.
	const weight = resolved(source, declared('font-weight', 'normal'));
	const fontSize = length(source, declared('font-size'));
	return {
		fontSize,
		fontWeight: weight === 'normal' ? 400 : Number(weight),
		lineHeight: length(source, declared('line-height'), fontSize),
	};
};

/**
 * One React Native text role against the web rule that draws it.
 *
 * The sheets write some sizes as `calc(sm * 0.9286)`, a rounded 13/14, so the
 * points are compared to a hundredth rather than exactly.
 */
const expectType = function expectType(
	role: { fontSize: number; lineHeight: number; weight: string },
	web: { fontSize: number; fontWeight: number; lineHeight: number }
): void {
	expect(role.weight).toBe(String(web.fontWeight));
	expect(role.fontSize).toBeCloseTo(web.fontSize, 2);
	expect(role.lineHeight).toBeCloseTo(web.lineHeight, 2);
};

/** Maps a web colour token onto the part of a consent surface it paints. */
const COLOR_PARITY: readonly (readonly [
	web: string,
	mobile: keyof typeof defaultConsentTheme.colors,
])[] = [
	['border', 'border'],
	['overlay', 'overlay'],
	['primary', 'primary'],
	['primary-text', 'primaryText'],
	['surface', 'surface'],
	['surface-hover', 'surfaceHover'],
	['switch-thumb', 'switchThumb'],
	['switch-track', 'switchTrack'],
	['switch-track-active', 'switchTrackActive'],
	['text', 'text'],
	['text-muted', 'textMuted'],
	['text-on-primary', 'textOnPrimary'],
];

describe('web token parity', () => {
	test('every light colour is the web colour', () => {
		for (const [web, mobile] of COLOR_PARITY) {
			expect({ [web]: asNativeColor(tokenBySuffix(web)) }, web).toEqual({
				[web]: defaultConsentTheme.colors[mobile],
			});
		}
	});

	test('every dark colour is the web dark colour', () => {
		for (const [web, mobile] of COLOR_PARITY) {
			expect({ [web]: asNativeColor(tokenBySuffix(web, true)) }, web).toEqual({
				[web]: defaultConsentTheme.dark[mobile],
			});
		}
	});

	test('corners follow the web radii', () => {
		// The card is `radius.lg` and a control is `radius.md`: the banner card
		// and the dialog round at `--inth-radius-lg`, a dialog control at
		// `--inth-radius-md`.
		expect(defaultConsentTheme.radius.lg).toBe(
			measure(tokenBySuffix('radius-lg'))
		);
		expect(defaultConsentTheme.radius.md).toBe(
			measure(tokenBySuffix('radius-md'))
		);
	});

	test('the spacing scale is the web scale', () => {
		expect(defaultConsentTheme.spacing).toEqual({
			lg: measure(tokenBySuffix('space-lg')),
			md: measure(tokenBySuffix('space-md')),
			sm: measure(tokenBySuffix('space-sm')),
			xl: measure(tokenBySuffix('space-xl')),
			xs: measure(tokenBySuffix('space-xs')),
		});
	});

	test('the banner leads with its own heading pair', () => {
		// `consent-surface.module.css` draws the banner card's head, and it is not
		// the dialog: the heading is larger than the copy underneath it. Getting
		// this pair the wrong way round is the exact drift this test exists to
		// catch.
		const surface = read(SURFACE_CSS);

		expectType(lightRoles.bannerTitle, webType(surface, '.title'));
		expectType(lightRoles.bannerBody, webType(surface, '.description'));
		expect(lightRoles.bannerTitle.fontSize).toBeGreaterThan(
			lightRoles.bannerBody.fontSize
		);
	});

	test('the dialog follows its own heading pair', () => {
		// The dialog heading is a step above `base`, over an intro a step under
		// `sm`, each through its own `--consent-dialog-*` hook.
		const dialog = read(DIALOG_CSS);

		expectType(lightRoles.title, webType(dialog, '.title'));
		expectType(lightRoles.body, webType(dialog, '.intro'));
		expect(lightRoles.title.fontSize).toBeGreaterThan(lightRoles.body.fontSize);
	});

	test('a button label is the web small button label', () => {
		const label = webType(read(BUTTON_CSS), '.button-small', '.button');

		expect(lightRoles.label).toEqual({
			fontSize: label.fontSize,
			lineHeight: label.lineHeight,
			weight: String(label.fontWeight) as '500',
		});
	});

	test('the switch is the web small switch', () => {
		const small = cssBlock(read(SWITCH_CSS), '.root-small');
		const size = function size(property: string): number {
			return measure(small[`--switch-${property}`] as string);
		};

		expect(CONSENT_SWITCH_GEOMETRY).toEqual({
			height: size('height'),
			padding: size('padding'),
			thumb: size('thumb-size'),
			width: size('width'),
		});
	});
});
