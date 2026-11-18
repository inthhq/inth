#!/usr/bin/env bun

/**
 * Regenerate the rasterised brand marks the branding tag renders.
 *
 * The marks are SVG paths owned by the web: `BRAND_MARKS` in
 * `@inth/sdk/ui/utils/branding`. React Native ships no SVG renderer, so the
 * paths cannot be drawn at runtime the way the web draws them. This script
 * rasterises each mark once, with the Chromium already in the Playwright
 * cache, and writes the bytes into a committed module as `data:` URIs. Running
 * it is deliberate: it is never wired into a build, so a missing browser can
 * never break a build, and the committed module is what a checkout and a
 * tarball both render from.
 *
 * Re-run it when a web mark changes, after building `@inth/sdk`:
 *
 * ```bash
 * bun run --cwd packages/react-native scripts/generate-branding-mark.ts
 * ```
 *
 * Point it at a specific browser with `INTH_CHROME_PATH` when the Playwright
 * cache is somewhere unusual.
 */

import { execFileSync } from 'node:child_process';
import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BRAND_MARKS, brandMarkSvg } from '@inth/sdk/ui/utils/branding';

/** One raster to emit, and the device-pixel scale it is meant for. */
interface RenderTarget {
	/** Square edge length in device pixels. */
	readonly pixels: number;
	/** The `PixelRatio` this raster serves. */
	readonly scale: 1 | 2 | 3;
}

/**
 * The three densities the tag can appear on: a 1x drawable, an xxhdpi phone, and
 * an xxxhdpi phone. A screen above 3 gets the largest, which downsamples.
 */
const TARGETS: readonly RenderTarget[] = [
	{ pixels: 13, scale: 1 },
	{ pixels: 26, scale: 2 },
	{ pixels: 39, scale: 3 },
];

/**
 * The CSS height the mark is drawn at on a phone: `.brandingInth` under the
 * `max-width: 480px` query, `0.8125rem`.
 */
const MARK_HEIGHT_CSS = 13;

/**
 * A transparent render of this size compresses to a few dozen bytes, so anything
 * under this floor means the glyph did not reach the canvas.
 */
const MIN_BYTES = 128;

/** The module this script writes. */
const OUTPUT_URL = new URL(
	'../src/components/internal/branding-mark.ts',
	import.meta.url
);

/**
 * The browsers cache location Playwright writes to.
 *
 * @returns An absolute directory, or `null` when there is no home to hang one on.
 */
const cacheRoot = function cacheRoot(): string | null {
	const override = process.env.PLAYWRIGHT_BROWSERS_PATH;

	if (override !== undefined && override !== '') {
		return override;
	}

	const home = process.env.HOME ?? process.env.USERPROFILE;

	if (home === undefined) {
		return null;
	}

	if (process.platform === 'darwin') {
		return join(home, 'Library/Caches/ms-playwright');
	}

	if (process.platform === 'win32') {
		return join(
			process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'),
			'ms-playwright'
		);
	}

	return join(home, '.cache/ms-playwright');
};

/**
 * The executable names a Playwright Chromium install goes by.
 *
 * `chrome-headless-shell` is the same engine with no UI layer, and it takes the
 * same screenshot flags, so it is a fine fallback on a machine that has only the
 * headless shell installed.
 */
const EXECUTABLE_NAMES = [
	'Google Chrome for Testing',
	'Chromium',
	'chrome',
	'chrome-headless-shell',
] as const;

/**
 * Whether a path is a file rather than a directory of the same name.
 *
 * @param path - Candidate path.
 * @returns `true` when it exists and is a regular file.
 */
const isFile = function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
};

/**
 * The browser binary inside one cache directory, if it holds one.
 *
 * The layouts differ by platform and by browser generation, and a couple of them
 * are a `.app` bundle two levels down, so this looks for the known executable
 * names one and two levels in rather than hardcoding a path per platform.
 *
 * @param root - The browsers cache root.
 * @param directory - One entry inside it, e.g. `chromium-1243`.
 * @returns An absolute path, or `null`.
 */
const executableIn = function executableIn(
	root: string,
	directory: string
): string | null {
	const dirPath = join(root, directory);

	const names = (path: string): string[] => {
		try {
			return readdirSync(path);
		} catch {
			return [];
		}
	};

	/** A plain executable or a macOS `.app` bundle, at one depth. */
	const at = (path: string, name: string): string | null => {
		const loose = join(path, name);

		if (isFile(loose)) {
			return loose;
		}

		const bundled = join(path, `${name}.app`, 'Contents', 'MacOS', name);

		return isFile(bundled) ? bundled : null;
	};

	for (const stage of names(dirPath)) {
		const stagePath = join(dirPath, stage);

		for (const name of EXECUTABLE_NAMES) {
			const found = at(stagePath, name);

			if (found !== null) {
				return found;
			}

			for (const nested of names(stagePath)) {
				const deeper = at(join(stagePath, nested), name);

				if (deeper !== null) {
					return deeper;
				}
			}
		}
	}

	return null;
};

/**
 * Find a Chromium that can take a screenshot.
 *
 * The cache keeps a directory per build and an install does not delete the old
 * ones, so the highest build number is the current browser.
 *
 * @returns An absolute path to the executable.
 * @throws {Error} When no browser is installed. Failing here is the point: the
 * alternative is writing a blank mark into a committed module and letting a
 * green build ship a badge with no glyph in it.
 */
const findChromium = function findChromium(): string {
	const override = process.env.INTH_CHROME_PATH;

	if (override !== undefined && override !== '') {
		if (!isFile(override)) {
			throw new Error(
				`generate-branding-mark: INTH_CHROME_PATH points at ${override}, which is not a readable file.`
			);
		}

		return override;
	}

	const root = cacheRoot();

	const installed =
		root === null || !existsSync(root)
			? []
			: readdirSync(root, { withFileTypes: true })
					.filter((entry) => entry.isDirectory())
					.map((entry) => entry.name)
					// `chromium-9` must not outrank `chromium-12`, and the build number
					// is the only part of the name that orders them. The full browser
					// is preferred over the headless shell at the same build, so a tie
					// breaks on the name too.
					.sort((a, b) => {
						const build =
							(Number.parseInt(b.replace(/[^\d]/gu, ''), 10) || 0) -
							(Number.parseInt(a.replace(/[^\d]/gu, ''), 10) || 0);

						return build === 0 ? a.localeCompare(b) : build;
					});

	for (const directory of installed) {
		const found = root === null ? null : executableIn(root, directory);

		if (found !== null) {
			return found;
		}
	}

	throw new Error(
		'generate-branding-mark: no Chromium found. Run `bunx playwright install chromium`, or set INTH_CHROME_PATH to a browser binary. Refusing to write the module with a blank mark.'
	);
};

/**
 * The brand the tag shows. React Native snapshots carry no `branding`, and the
 * web shows the Inth mark for a snapshot without one (`resolveBrandMark`).
 */
const MARK = 'inth';

/**
 * One page, just the glyph, on a transparent canvas.
 *
 * The page draws the same `<svg>` the web writes, sized to the target and
 * filled white through `currentColor`. The viewBox keeps the drawing
 * proportional inside the square.
 *
 * @param target - Edge length to render at.
 * @returns An HTML document.
 */
const pageFor = function pageFor(target: RenderTarget): string {
	return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;color:#FFFFFF}svg{display:block;width:${target.pixels}px;height:${target.pixels}px}</style></head><body>${brandMarkSvg(MARK)}</body></html>`;
};

/**
 * The signature and `IHDR` of a PNG, without a decoder.
 *
 * @param bytes - File contents.
 * @returns Edge length, or `null` when this is not a PNG.
 */
const pngEdge = function pngEdge(bytes: Buffer): number | null {
	if (
		bytes.length < 24 ||
		!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
	) {
		return null;
	}

	const width = bytes.readUInt32BE(16);
	const height = bytes.readUInt32BE(20);
	const [bitDepth, colorType] = bytes.subarray(24, 26);

	// 8-bit truecolour with alpha: the only thing worth accepting for a glyph.
	if (width !== height || bitDepth !== 8 || colorType !== 6) {
		return null;
	}

	return width;
};

/**
 * Render one scale and return its data URI.
 *
 * @param binary - Chromium executable.
 * @param target - Edge length to render at.
 * @param html - The page to render.
 * @returns A `data:image/png;base64,` URI.
 * @throws {Error} When the screenshot is missing, the wrong shape, or too small
 * to contain the glyph.
 */
const renderScale = function renderScale(
	binary: string,
	target: RenderTarget,
	html: string
): string {
	const stamp = `${Date.now()}-${target.pixels}`;
	const htmlPath = join(tmpdir(), `inth-mark-${stamp}.html`);
	const pngPath = join(tmpdir(), `inth-mark-${stamp}.png`);

	writeFileSync(htmlPath, html);

	execFileSync(binary, [
		'--headless',
		'--disable-gpu',
		'--hide-scrollbars',
		// Without this a machine on a 2x display screenshots the window at 2x and
		// the 15px raster comes out 30px wide.
		'--force-device-scale-factor=1',
		'--default-background-color=00000000',
		`--window-size=${target.pixels},${target.pixels}`,
		`--screenshot=${pngPath}`,
		`file://${htmlPath}`,
	]);

	if (!existsSync(pngPath)) {
		throw new Error(
			`generate-branding-mark: Chromium exited without writing a screenshot at ${target.pixels}px.`
		);
	}

	const bytes = readFileSync(pngPath);
	const edge = pngEdge(bytes);

	if (edge !== target.pixels) {
		throw new Error(
			`generate-branding-mark: the ${target.pixels}px raster came back as ${edge === null ? 'something that is not a square 8-bit RGBA PNG' : `${edge}px`}.`
		);
	}

	if (bytes.length < MIN_BYTES) {
		throw new Error(
			`generate-branding-mark: the ${target.pixels}px raster is only ${bytes.length} bytes, which is what a blank canvas compresses to. The path did not render.`
		);
	}

	return `data:image/png;base64,${bytes.toString('base64')}`;
};

/**
 * The generated module.
 *
 * A data URI rather than a `.png` beside it: Metro only resolves an image
 * `require` through a plugin the host app installs, so a bundled asset is one
 * missing config away from rendering nothing. These need no resolver, no
 * build-time copy step, and no entry in the published `files` list.
 *
 * Assembled line by line rather than as one template literal, because the
 * comment it writes is full of backticks and a template would have to escape
 * every one of them.
 *
 * @param entries - One row per scale.
 * @returns Contents of the module to write.
 */
const moduleFor = function moduleFor(
	entries: readonly { scale: RenderTarget['scale']; uri: string }[]
): string {
	const tick = '`';
	const code = (text: string): string => `${tick}${text}${tick}`;
	const rows = entries
		.map((entry) => `\t${entry.scale}: '${entry.uri}',`)
		.join('\n');

	return [
		'/**',
		' * The Inth mark as transparent PNGs, one per device-pixel scale.',
		' *',
		` * Generated by ${code('scripts/generate-branding-mark.ts')} from`,
		` * ${code(`BRAND_MARKS.${MARK}`)} in ${code('@inth/sdk/ui/utils/branding')}, the same paths the`,
		' * web tag draws. Do not hand-edit: re-run the script, which rewrites this',
		' * whole file, so a regenerated mark and the web keep agreeing by construction.',
		' *',
		` * The viewBox is ${BRAND_MARKS[MARK].viewBox}. Each raster is square: the glyph is`,
		' * centred in a square viewport at its own aspect, not stretched.',
		' */',
		'',
		'/** Device-pixel scales {@link BRANDING_MARK_DATA_URI} carries. */',
		'export const BRANDING_MARK_SCALES = [1, 2, 3] as const;',
		'',
		'/** One of {@link BRANDING_MARK_SCALES}. */',
		'export type BrandingMarkScale = (typeof BRANDING_MARK_SCALES)[number];',
		'',
		`/** The mark at each scale, as a ${code('data:image/png;base64,')} URI. */`,
		'export const BRANDING_MARK_DATA_URI: Readonly<',
		'\tRecord<BrandingMarkScale, string>',
		'> = {',
		rows,
		'};',
		'',
		'/**',
		' * Pick the raster for a screen.',
		' *',
		` * ${code('PixelRatio.get()')} answers 2.75 or 3.5 on real hardware, so the value is`,
		' * rounded and clamped: the nearest raster is the right one, and above 3 there',
		' * is nothing larger to hand back.',
		' *',
		' * @example',
		' * ```ts',
		` * Image.source={{ uri: ${code('selectBrandingMark(PixelRatio.get())')} }}`,
		' * ```',
		' *',
		` * @param pixelRatio - Value from ${code('PixelRatio.get()')}.`,
		' * @returns A data URI for the nearest raster.',
		' */',
		'export const selectBrandingMark = function selectBrandingMark(',
		'\tpixelRatio: number',
		'): string {',
		'\tconst rounded = Math.round(pixelRatio);',
		'\tconst scale = Math.min(',
		'\t\t3,',
		'\t\tMath.max(1, Number.isFinite(rounded) ? rounded : 1)',
		'\t) as BrandingMarkScale;',
		'',
		'\treturn BRANDING_MARK_DATA_URI[scale];',
		'};',
		'',
	].join('\n');
};

const main = function main(): void {
	const binary = findChromium();

	const entries = TARGETS.map((target) => ({
		scale: target.scale,
		uri: renderScale(binary, target, pageFor(target)),
	}));

	writeFileSync(OUTPUT_URL, moduleFor(entries), 'utf8');

	process.stdout.write(
		`generate-branding-mark: wrote ${TARGETS.length} rasters (1x, 2x, 3x, ${MARK_HEIGHT_CSS}dp) to ${OUTPUT_URL.pathname}\n`
	);
};

main();
