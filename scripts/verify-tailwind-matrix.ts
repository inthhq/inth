/**
 * Tailwind CSS compatibility across frameworks.
 *
 * Serves every built fixture in `benchmarks/tailwind-matrix/{v3,v4}` and
 * checks, in Chromium, the contract the shared Tailwind docs page states:
 *
 * - Inth's component styles survive Tailwind's preflight: the banner card
 *   keeps its background and border, the header, footer and buttons keep
 *   their padding, and the lazily loaded dialog is styled too. On Tailwind 3
 *   this also proves the Inth rules were not purged.
 * - A utility passed to an Inth part wins over Inth's own rule for the same
 *   property: a bare utility on Tailwind 4, an important one (`!p-[7px]`)
 *   on Tailwind 3. The fixtures put padding on the banner root, which Inth
 *   also sets, so the check fails if the utility loses.
 * - A `dark` class on `<html>` turns on Tailwind's `dark:` variant for that
 *   utility and, where the fixture says Inth follows it, Inth's dark tokens.
 *   The script tag's shadow root follows its own `colorScheme` option.
 *   This is checked on the early frame below and again once settled.
 * - Opening the dialog loads its stylesheet, which is styled too.
 * - The banner the page paints before the consent engine loads passes the
 *   same checks. Every script is held from navigation on and released one
 *   at a time, in request order, only until the banner card is visible, so
 *   a page that renders its banner from a chunk gets that chunk and
 *   nothing after it. A deferred stylesheet whose text is still loading
 *   keeps its surface at opacity 0 (`data-inth-pending`), so the release
 *   goes on until no sheet is pending. The reading is taken with the rest
 *   still held. Short of input or their 10 s fallback, the adapters start
 *   the engine at the window `load` event at the earliest, after every
 *   script the page itself asked for, so the engine's chunks queue behind
 *   the banner's and stay held unless the banner needs a later one. Each
 *   cell reports `document.readyState` at the reading, how many scripts
 *   were released, the file names still held, and whether the served HTML
 *   already carried the banner. A cell with nothing held proves nothing
 *   about the engine: all the banner needed came with it.
 *
 * Build first: `pnpm sdk:compat:styles:build`.
 *
 * ```sh
 * pnpm --dir scripts run compat:styles:matrix
 * TAILWIND_MATRIX_VERSIONS=v3 TAILWIND_MATRIX_FIXTURES=vue,nuxt pnpm --dir scripts run compat:styles:matrix
 * ```
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright';
import type { Browser, Locator, Page, Route } from 'playwright';

import { TAILWIND_MATRIX_FIXTURES } from '../benchmarks/tailwind-matrix/fixtures';
import type {
	TailwindMatrixFixture,
	TailwindMatrixPage,
} from '../benchmarks/tailwind-matrix/fixtures';
import { startStaticServer } from '../internals/next-compat/shared/src/suite/static-server';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '../packages/sdk/schema/src/types';
import type { InitOutput } from '../packages/sdk/schema/src/types';
import { translations as enTranslations } from '../packages/sdk/translations/src/translations/en';

const MATRIX_ROOT = resolve(
	import.meta.dirname,
	'../benchmarks/tailwind-matrix'
);
const VERSIONS = ['v3', 'v4'] as const;
type Version = (typeof VERSIONS)[number];

/** Padding the fixtures put on the banner root, light and dark. */
const SLOT_PADDING = { dark: '11px', light: '7px' } as const;

/**
 * `/init` for every fixture. Vue and Nuxt call `/api/inth` on their own
 * origin; the others name the placeholder project URL, which has no
 * backend, so the verifier answers for it. There is no manifest: manifest
 * mode falls back to `/init`.
 */
const initResponse: InitOutput = {
	branding: 'inth',
	location: { countryCode: 'DE', regionCode: null },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			countryCode: 'DE',
			regionCode: null,
			rules: [
				{
					id: 'tailwind-matrix',
					match: { isDefault: true },
					model: 'opt-in',
					prompt: 'choice',
				},
			],
		})
	),
	translations: { language: 'en', translations: enTranslations },
};

/** The project URL the fixtures name. Nothing serves it. */
const PROJECT_URL = 'https://your-project.inth.app';

/** Where the fixtures' consent requests go: their own origin, or the placeholder project. */
const BACKEND_ROUTES = ['**/api/inth/**', `${PROJECT_URL}/**`];

const answerBackend = async function answerBackend(route: Route) {
	const { pathname } = new URL(route.request().url());
	if (pathname.endsWith('/init')) {
		await route.fulfill({ json: initResponse });
		return;
	}
	if (pathname.endsWith('/manifest')) {
		await route.fulfill({ status: 404 });
		return;
	}
	await route.fulfill({ json: {} });
};

const pick = function pick(name: string): Set<string> | undefined {
	const value = process.env[name];
	return value ? new Set(value.split(',').filter(Boolean)) : undefined;
};

const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent']);

interface Styles {
	backgroundColor: string;
	borderTopColor: string;
	borderTopStyle: string;
	borderTopWidth: string;
	color: string;
	padding: string;
}

const readStyles = function readStyles(locator: Locator): Promise<Styles> {
	return locator.evaluate((element) => {
		const styles = window.getComputedStyle(element);
		return {
			backgroundColor: styles.backgroundColor,
			borderTopColor: styles.borderTopColor,
			borderTopStyle: styles.borderTopStyle,
			borderTopWidth: styles.borderTopWidth,
			color: styles.color,
			padding: styles.padding,
		};
	});
};

const hasPadding = (styles: Styles) =>
	styles.padding.split(' ').some((value) => Number.parseFloat(value) > 0);

const hasBorder = (styles: Styles) =>
	styles.borderTopStyle !== 'none' &&
	Number.parseFloat(styles.borderTopWidth) > 0 &&
	!TRANSPARENT.has(styles.borderTopColor);

const byTestId = (page: Page, id: string) =>
	page.locator(`[data-testid="${id}"]`).first();

/** Script requests held, in order, until the early reading is done. */
interface ScriptHold {
	active: boolean;
	held: Route[];
}

const SCRIPT_URL = /\.m?js(?:\?|$)/u;

interface BannerStyles {
	accept: Styles;
	card: Styles;
	footer: Styles;
	header: Styles;
	root: Styles;
}

const readBanner = async function readBanner(
	page: Page
): Promise<BannerStyles> {
	const [root, card, header, footer, accept] = await Promise.all([
		readStyles(byTestId(page, 'consent-banner-root')),
		readStyles(byTestId(page, 'consent-banner-card')),
		readStyles(byTestId(page, 'consent-banner-header')),
		readStyles(byTestId(page, 'consent-banner-footer')),
		readStyles(byTestId(page, 'consent-banner-accept-button')),
	]);
	return { accept, card, footer, header, root };
};

/** The preflight and slot checks, for one reading of the banner. */
const checkBanner = function checkBanner(
	banner: BannerStyles,
	options: TailwindMatrixPage,
	expect: (condition: boolean, message: string) => void
) {
	const { accept, card, footer, header, root } = banner;
	expect(
		!TRANSPARENT.has(card.backgroundColor),
		`banner card lost its background (${card.backgroundColor})`
	);
	expect(
		hasBorder(card),
		`banner card lost its border (${card.borderTopStyle} ${card.borderTopWidth} ${card.borderTopColor})`
	);
	expect(hasPadding(header), 'banner header lost its padding');
	expect(hasPadding(footer), 'banner footer lost its padding');
	expect(hasPadding(accept), 'accept button lost its padding');
	expect(
		!TRANSPARENT.has(accept.backgroundColor),
		`accept button lost its background (${accept.backgroundColor})`
	);
	if (options.slots) {
		expect(
			root.padding === SLOT_PADDING.light,
			`utility on the banner root lost to Inth: padding ${root.padding}, expected ${SLOT_PADDING.light}`
		);
	}
};

/**
 * Puts `dark` on `<html>`, checks the `dark:` utility and Inth's dark
 * tokens the page declares, and takes the class off again.
 */
const checkDark = async function checkDark(
	page: Page,
	options: TailwindMatrixPage,
	expect: (condition: boolean, message: string) => void
): Promise<void> {
	if (!(options.slots || options.darkTokens)) {
		return;
	}
	const title = byTestId(page, 'consent-banner-title');
	const lightTitle = await readStyles(title);
	await page.evaluate(() => {
		document.documentElement.classList.add('dark');
	});
	const [darkRoot, darkTitle] = await Promise.all([
		readStyles(byTestId(page, 'consent-banner-root')),
		readStyles(title),
	]);
	if (options.darkTokens) {
		expect(
			darkTitle.color !== lightTitle.color,
			`Inth ignored the dark class: title color stayed ${darkTitle.color}`
		);
	}
	if (options.slots) {
		expect(
			darkRoot.padding === SLOT_PADDING.dark,
			`dark: utility on the banner root did not apply: padding ${darkRoot.padding}, expected ${SLOT_PADDING.dark}`
		);
	}
	await page.evaluate(() => {
		document.documentElement.classList.remove('dark');
	});
};

const checkPage = async function checkPage(
	page: Page,
	url: string,
	options: TailwindMatrixPage,
	hold: ScriptHold
): Promise<{ note: string; problems: string[] }> {
	const problems: string[] = [];
	const expect = (condition: boolean, message: string) => {
		if (!condition) {
			problems.push(message);
		}
	};

	// Hold every script from navigation on. The adapters start the engine
	// from the window `load` event at the earliest, and in-page `load`
	// listeners run before Playwright reports the event, so a hold armed at
	// `load` can miss the engine's request. A banner that a chunk renders
	// needs that chunk: release held scripts one at a time, oldest first,
	// until the card is visible, then read with the rest held.
	hold.active = true;
	await page.goto(url, { waitUntil: 'commit' });

	const card = byTestId(page, 'consent-banner-card');
	const pendingSheet = page.locator('style[data-inth-pending]');
	const deadline = Date.now() + 15_000;
	let released = 0;
	// oxlint-disable-next-line no-await-in-loop -- Polls the page between releases.
	while (!(await card.isVisible()) || (await pendingSheet.count()) > 0) {
		if (Date.now() > deadline) {
			// oxlint-disable-next-line no-await-in-loop -- Only on the way out.
			const pending = await pendingSheet.count();
			throw new Error(
				`banner card did not appear within 15 s (${released} script(s) released, ${hold.held.length} held, ${pending} sheet(s) pending)`
			);
		}
		const next = hold.held.shift();
		if (next) {
			released += 1;
			// oxlint-disable-next-line no-await-in-loop -- One release per turn.
			await next.continue();
		}
		// oxlint-disable-next-line no-await-in-loop -- Gives the released script a turn.
		await page.waitForTimeout(25);
	}
	const early = await readBanner(page);
	const readyState = await page.evaluate(() => document.readyState);
	const served = await (await fetch(url)).text();
	const serverBanner = served.includes('data-testid="consent-banner-card"');
	const heldNames = hold.held.map(
		(route) => new URL(route.request().url()).pathname.split('/').pop() ?? ''
	);
	const note = `early read at readyState ${readyState} after releasing ${released} script(s), ${heldNames.length} still held${heldNames.length ? ` (${heldNames.join(', ')})` : ''}; banner ${serverBanner ? 'in' : 'not in'} the served HTML`;
	const expectEarly = (condition: boolean, message: string) =>
		expect(condition, `before the engine: ${message}`);
	checkBanner(early, options, expectEarly);
	await checkDark(page, options, expectEarly);

	hold.active = false;
	await Promise.all(hold.held.splice(0).map((route) => route.continue()));
	await page.waitForLoadState('networkidle');

	const probe = await readStyles(byTestId(page, 'tailwind-probe'));
	expect(
		!TRANSPARENT.has(probe.backgroundColor),
		'Tailwind utilities are missing from the page (probe has no background)'
	);

	const settled = await readBanner(page);
	checkBanner(settled, options, expect);

	await checkDark(page, options, expect);

	await byTestId(page, 'consent-banner-customize-button').click();
	const dialogCard = byTestId(page, 'consent-dialog-card');
	try {
		await dialogCard.waitFor({ timeout: 15_000 });
		const dialog = await readStyles(dialogCard);
		expect(
			!TRANSPARENT.has(dialog.backgroundColor),
			`dialog card lost its background (${dialog.backgroundColor})`
		);
		expect(hasBorder(dialog), 'dialog card lost its border');
	} catch (error) {
		problems.push(`dialog did not open: ${String(error).split('\n')[0]}`);
	}

	return { note, problems };
};

interface Result {
	version: Version;
	fixture: string;
	page: string;
	problems: string[];
	note?: string;
}

const checkFixture = async function checkFixture(
	browser: Browser,
	version: Version,
	fixture: TailwindMatrixFixture
): Promise<Result[]> {
	const outDir = join(MATRIX_ROOT, version, fixture.id, fixture.outDir);
	const label = (page: TailwindMatrixPage) =>
		page.label ? `${fixture.label} (${page.label})` : fixture.label;
	if (!existsSync(outDir)) {
		return fixture.pages.map((page) => ({
			fixture: fixture.id,
			page: label(page),
			problems: [`missing build output ${outDir}`],
			version,
		}));
	}
	const server = await startStaticServer(outDir);
	const results: Result[] = [];
	try {
		for (const options of fixture.pages) {
			// oxlint-disable-next-line no-await-in-loop -- One page per server keeps failures attributable.
			const context = await browser.newContext({
				viewport: { height: 900, width: 1280 },
			});
			// oxlint-disable-next-line no-await-in-loop -- Registered before navigation.
			for (const backend of BACKEND_ROUTES) {
				// oxlint-disable-next-line no-await-in-loop -- Registered before navigation.
				await context.route(backend, answerBackend);
			}
			const hold: ScriptHold = { active: false, held: [] };
			// oxlint-disable-next-line no-await-in-loop -- Registered before navigation.
			await context.route(SCRIPT_URL, (route) => {
				if (hold.active) {
					hold.held.push(route);
					return;
				}
				void route.continue();
			});
			// oxlint-disable-next-line no-await-in-loop -- Pages share the fixture server.
			const page = await context.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			try {
				// oxlint-disable-next-line no-await-in-loop -- Sequential browser checks.
				const { note, problems } = await checkPage(
					page,
					`${server.url}${options.path}`,
					options,
					hold
				);
				results.push({
					fixture: fixture.id,
					note,
					page: label(options),
					problems:
						problems.length > 0 && errors.length > 0
							? [...problems, `page errors: ${errors.join('; ')}`]
							: problems,
					version,
				});
			} catch (error) {
				results.push({
					fixture: fixture.id,
					page: label(options),
					problems: [
						String(error).split('\n')[0] ?? 'unknown error',
						...(errors.length > 0 ? [`page errors: ${errors.join('; ')}`] : []),
					],
					version,
				});
			} finally {
				// oxlint-disable-next-line no-await-in-loop -- Close before the next page.
				await context.close();
			}
		}
	} finally {
		await server.close();
	}
	return results;
};

const main = async function main() {
	const versions = pick('TAILWIND_MATRIX_VERSIONS');
	const fixtures = pick('TAILWIND_MATRIX_FIXTURES');
	const browser = await chromium.launch({ headless: true });
	const results: Result[] = [];
	try {
		for (const version of VERSIONS) {
			if (versions && !versions.has(version)) {
				continue;
			}
			for (const fixture of TAILWIND_MATRIX_FIXTURES) {
				if (fixtures && !fixtures.has(fixture.id)) {
					continue;
				}
				// oxlint-disable-next-line no-await-in-loop -- One static server at a time.
				const fixtureResults = await checkFixture(browser, version, fixture);
				results.push(...fixtureResults);
				for (const result of fixtureResults) {
					const status = result.problems.length === 0 ? 'ok' : 'FAIL';
					console.log(
						`${status} Tailwind ${version.slice(1)} ${result.page}${result.note ? ` (${result.note})` : ''}`
					);
					for (const problem of result.problems) {
						console.log(`     ${problem}`);
					}
				}
			}
		}
	} finally {
		await browser.close();
	}

	const rows = results.map(
		(result) =>
			`| ${result.page} | ${result.version.slice(1)} | ${result.problems.length === 0 ? 'Passed' : `Failed: ${result.problems.join('; ')}`} |`
	);
	mkdirSync('.ci-reports', { recursive: true });
	writeFileSync(
		'.ci-reports/tailwind-matrix.md',
		`## Tailwind framework matrix\n\n| Framework | Tailwind | Result |\n| --- | --- | --- |\n${rows.join('\n')}\n`
	);
	const failures = results.filter((result) => result.problems.length > 0);
	if (failures.length > 0) {
		throw new Error(`${failures.length} Tailwind matrix cell(s) failed`);
	}
};

await main();
