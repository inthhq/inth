/**
 * The two-stage script tag in Chromium, on the built files: `inth.js` (the
 * init script) and `inth.hosted.js` (the engine), with the files they load
 * (`inth.records.js`, `inth.choices.js`), against a test backend
 * (`fixtures/init-script-server.ts`).
 *
 * The init script renders no UI and records no choice: the engine renders
 * the banner from `inth.choices.js` and the dialog from its chunk
 * `inth.choices-dialog.js`, and runs every consent call made before it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

type PageWindow = Window & {
	__heard: string[];
	__ran: string[];
	inth: Record<string, unknown> & {
		acceptAll: () => Promise<unknown>;
		client: {
			getSnapshot: () => {
				activeUI: string;
				explicitChoice: unknown;
			};
		} | null;
		getSnapshot: () => { activeUI: string; explicitChoice: unknown };
		on: (event: string, listener: (payload: unknown) => void) => () => void;
		openDialog: () => void;
		push: (...calls: unknown[]) => number;
		version: string;
	};
};

const frames: HTMLIFrameElement[] = [];

const clearStorage = function clearStorage(): void {
	localStorage.clear();
	sessionStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
};

const wait = (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

/**
 * Load the fixture page and wait for it to load, or, with `parsed`, only for
 * its document to be parsed. A page owed a banner loads the engine at once,
 * which holds `load` (as does a held-back `hero` image): a test that acts
 * before the engine waits for `parsed`.
 */
const open = async function open(
	query: Record<string, string | number | true>,
	{ parsed = false } = {}
): Promise<PageWindow> {
	const frame = document.createElement('iframe');
	const params = new URLSearchParams(
		Object.entries(query).map(([key, value]) => [
			key,
			value === true ? '' : String(value),
		])
	);
	frame.src = `/__inth-init__/page?${params}`;
	frame.style.width = '800px';
	frame.style.height = '600px';
	frames.push(frame);
	document.body.append(frame);
	if (parsed) {
		await expect
			.poll(() => {
				const doc = frame.contentDocument;
				return Boolean(
					doc?.URL.includes('/__inth-init__/page') &&
					doc.readyState !== 'loading'
				);
			})
			.toBe(true);
		return frame.contentWindow as PageWindow;
	}
	await new Promise((resolve) => {
		frame.addEventListener('load', resolve, { once: true });
	});
	return frame.contentWindow as PageWindow;
};

const shadowOf = (win: PageWindow): ShadowRoot | null =>
	win.document.querySelector('[data-inth-ui]')?.shadowRoot ?? null;

const bannerOf = (win: PageWindow): HTMLElement | null =>
	shadowOf(win)?.querySelector<HTMLElement>(
		'[data-testid="consent-banner-root"]'
	) ?? null;

const dialogOf = (win: PageWindow): HTMLElement | null =>
	shadowOf(win)?.querySelector<HTMLElement>(
		'[data-testid="consent-dialog-root"]'
	) ?? null;

const buttonOf = (win: PageWindow, action: string): HTMLButtonElement | null =>
	bannerOf(win)?.querySelector<HTMLButtonElement>(
		`[data-testid="consent-banner-${action}-button"]`
	) ?? null;

/** Whether the page added a script tag for `file` yet. */
const added = (win: PageWindow, file: string): boolean =>
	Boolean(win.document.querySelector(`script[src*="${file}"]`));

/** The URLs the page fetched that name `file`. */
const requested = (win: PageWindow, file: string): string[] =>
	win.performance
		.getEntriesByType('resource')
		.map((entry) => entry.name)
		.filter((name) => name.includes(file));

const choicesPreload = (win: PageWindow): HTMLLinkElement | null =>
	win.document.querySelector<HTMLLinkElement>(
		'link[rel="preload"][href*="inth.choices.js"]'
	);

const setInitDelay = async (ms: number): Promise<void> => {
	await fetch(`/__inth-init__/init-delay?ms=${ms}`);
};

const initsSoFar = async (): Promise<number> =>
	(await (await fetch('/__inth-init__/inits')).json()) as number;

const savesSoFar = async (): Promise<number> =>
	(await (await fetch('/__inth-init__/saves')).json()) as number;

const hostedRequestsSoFar = async (): Promise<number> =>
	(await (await fetch('/__inth-init__/hosted-requests')).json()) as number;

/** A first visit that accepts on the engine's banner, storing the choice. */
const acceptOnFirstVisit =
	async function acceptOnFirstVisit(): Promise<PageWindow> {
		const first = await open({ 'hosted-delay': 200 });
		await expect
			.poll(() => first.inth.client, { timeout: 5000 })
			.not.toBeNull();
		await expect
			.poll(() => buttonOf(first, 'accept'), { timeout: 5000 })
			.not.toBeNull();
		buttonOf(first, 'accept')?.click();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		return first;
	};

beforeEach(async () => {
	clearStorage();
	await setInitDelay(0);
	await savesSoFar();
	await initsSoFar();
	await hostedRequestsSoFar();
});

afterEach(() => {
	for (const frame of frames.splice(0)) {
		frame.remove();
	}
	clearStorage();
});

describe('inth.js before the engine', () => {
	it('fetches the engine and inth.choices.js at once when a banner is owed, and shows no banner of its own', async () => {
		// The priority image would hold the engine for 10 s.
		const win = await open(
			{ hero: 10_000, 'hosted-delay': 1500 },
			{ parsed: true }
		);

		await expect.poll(() => added(win, 'inth.hosted.js')).toBe(true);
		expect(win.inth.getSnapshot().activeUI).toBe('banner');
		// The consent UI file downloads beside the engine, with the
		// engine's URL for it.
		expect(choicesPreload(win)?.getAttribute('as')).toBe('script');
		expect(choicesPreload(win)?.href).toMatch(
			new RegExp(
				`/__inth-dist__/inth\\.choices\\.js\\?v=${win.inth.version.replaceAll('.', '\\.')}$`,
				'u'
			)
		);
		await expect
			.poll(() => requested(win, 'inth.choices.js'), { timeout: 1000 })
			.toHaveLength(1);
		// Nothing on screen until the engine renders it.
		expect(win.inth.client).toBeNull();
		expect(bannerOf(win)).toBeNull();

		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		await expect.poll(() => bannerOf(win), { timeout: 3000 }).not.toBeNull();
		expect(bannerOf(win)?.textContent).toContain('Backend title');
		// The engine's load used the preloaded file.
		expect(requested(win, 'inth.choices.js')).toHaveLength(1);
	});

	it('records an accept tapped on the engine’s banner once, with one /init', async () => {
		const win = await open({ 'hosted-delay': 300 });
		await expect
			.poll(() => buttonOf(win, 'accept'), { timeout: 5000 })
			.not.toBeNull();

		buttonOf(win, 'accept')?.click();

		await expect
			.poll(() => win.inth.getSnapshot().explicitChoice)
			.not.toBeNull();
		await expect
			.poll(() => win.__ran.toSorted())
			.toEqual(['marketing', 'measurement']);
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		await expect.poll(() => bannerOf(win)).toBeNull();
		await wait(300);
		// The engine started from the init script's /init answer.
		expect(await savesSoFar()).toBe(0);
		expect(await initsSoFar()).toBe(1);
		expect(win.__ran).toHaveLength(2);
	});

	it('starts a plain script once, with one /init and one save', async () => {
		const win = await open({ 'hosted-delay': 300, manual: true });
		const init = win.inth.init as (options: {
			scripts: { category: string; id: string; src: string }[];
		}) => PageWindow['inth'];
		init({
			scripts: [
				{
					category: 'measurement',
					id: 'plain',
					src: '/__inth-init__/gated.js?name=plain',
				},
			],
		});
		await expect
			.poll(() => buttonOf(win, 'accept'), { timeout: 5000 })
			.not.toBeNull();
		buttonOf(win, 'accept')?.click();
		await expect.poll(() => win.__ran).toContain('plain');

		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		await wait(300);
		expect(win.__ran.filter((name) => name === 'plain')).toHaveLength(1);
		expect(await initsSoFar()).toBe(1);
	});

	it('records an acceptAll() called before the engine once, through the engine', async () => {
		const win = await open({ 'hosted-delay': 1000 }, { parsed: true });

		const accepted = win.inth.acceptAll();

		// Nothing commits before the engine is ready.
		expect(win.inth.client).toBeNull();
		expect(added(win, 'inth.hosted.js')).toBe(true);
		await wait(300);
		expect(win.inth.client).toBeNull();
		expect(win.localStorage.getItem('inth')).toBeNull();
		expect(win.__ran).toEqual([]);
		expect(await savesSoFar()).toBe(0);

		await accepted;
		expect(win.inth.client?.getSnapshot().explicitChoice).not.toBeNull();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		await expect
			.poll(() => win.__ran.toSorted())
			.toEqual(['marketing', 'measurement']);
		await wait(300);
		expect(await savesSoFar()).toBe(0);
		expect(win.__ran).toHaveLength(2);
		expect(bannerOf(win)).toBeNull();
	});

	it('replays calls made before the engine, in order', async () => {
		const win = await open({ 'hosted-delay': 1000, manual: true, queue: true });
		// The page inits itself, then calls the API before the engine.
		const init = win.inth.init as (
			options: Record<string, never>
		) => PageWindow['inth'];
		const client = init({});
		client.on('ready', () => win.__heard.push('ready'));
		win.inth.openDialog();
		expect(win.inth.client).toBeNull();

		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		await expect.poll(() => win.__heard).toEqual(['queued ready', 'ready']);
		await expect.poll(() => dialogOf(win)).not.toBeNull();
		expect(win.inth.getSnapshot().activeUI).toBe('dialog');
	});

	it('loads the engine at once for a page action clicked before it, which opens the dialog', async () => {
		// No /init answer yet, and the priority image would hold the engine
		// for 10 s.
		await setInitDelay(1000);
		const win = await open({ hero: 10_000 }, { parsed: true });
		expect(added(win, 'inth.hosted.js')).toBe(false);

		win.document.querySelector<HTMLButtonElement>('#page-customize')?.click();

		expect(added(win, 'inth.hosted.js')).toBe(true);
		expect(win.inth.client).toBeNull();
		expect(dialogOf(win)).toBeNull();
		await expect
			.poll(() => win.inth.client?.getSnapshot(), { timeout: 5000 })
			.toMatchObject({ activeUI: 'dialog' });
		await expect.poll(() => dialogOf(win), { timeout: 3000 }).not.toBeNull();
		expect(await savesSoFar()).toBe(0);
	});

	it('starts a returning visitor’s scripts before /init answers', async () => {
		const first = await acceptOnFirstVisit();
		expect(first.localStorage.getItem('inth-init-policy')).not.toBeNull();

		// Second visit: /init and the engine both take seconds.
		await setInitDelay(4000);
		const started = performance.now();
		const second = await open({ 'hosted-delay': 4000 }, { parsed: true });
		await expect
			.poll(() => second.__ran.toSorted(), { timeout: 2000 })
			.toEqual(['marketing', 'measurement']);
		expect(performance.now() - started).toBeLessThan(3000);
		expect(second.inth.client).toBeNull();
		expect(bannerOf(second)).toBeNull();
	});

	it('never fetches inth.choices.js for a returning visitor', async () => {
		await acceptOnFirstVisit();

		const second = await open({ 'hosted-delay': 200 });
		await expect
			.poll(() => second.inth.client, { timeout: 5000 })
			.not.toBeNull();
		await (second.inth.ready as () => Promise<unknown>)();
		await wait(300);
		expect(second.inth.client?.getSnapshot().explicitChoice).not.toBeNull();
		expect(choicesPreload(second)).toBeNull();
		expect(requested(second, 'inth.choices.js')).toEqual([]);
		expect(bannerOf(second)).toBeNull();
		expect(await savesSoFar()).toBe(0);
	});

	it('leaves an engine that arrives after dispose() without a client, until init()', async () => {
		const win = await open({ 'hosted-delay': 600 }, { parsed: true });
		await expect.poll(() => added(win, 'inth.hosted.js')).toBe(true);

		(win.inth.dispose as () => void)();

		// The engine, already on its way, installs itself and leaves the
		// page alone.
		await expect
			.poll(() => win.inth.__inthBoot, { timeout: 5000 })
			.toBeUndefined();
		await wait(300);
		expect(win.inth.client).toBeNull();
		expect(bannerOf(win)).toBeNull();

		(win.inth.init as () => unknown)();
		await expect.poll(() => win.inth.client).not.toBeNull();
		await expect.poll(() => bannerOf(win), { timeout: 5000 }).not.toBeNull();
	});
});

describe('inth.hosted.js failing to load', () => {
	it('loads the engine on the second try, and runs the queued calls', async () => {
		const win = await open({ 'hosted-fail': 1, queue: true });

		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		await expect.poll(() => win.__heard).toEqual(['queued ready']);
		expect(await hostedRequestsSoFar()).toBe(2);
		// The failed tag went with its failure.
		expect(
			win.document.querySelectorAll('script[src*="inth.hosted.js"]')
		).toHaveLength(1);
	});

	it('gives up after three tries with one error, and rejects what waits for the engine', async () => {
		const win = await open({ 'hosted-fail': 3 }, { parsed: true });
		const errors: unknown[][] = [];
		win.console.error = (...args: unknown[]) => {
			errors.push(args);
		};
		const ready = (win.inth.ready as () => Promise<unknown>)();
		const dismissed = (win.inth.dismissNotice as () => Promise<unknown>)();
		const failure = {
			message: expect.stringContaining('inth.hosted.js failed to load 3 times'),
		};

		await expect(ready).rejects.toMatchObject(failure);
		await expect(dismissed).rejects.toMatchObject(failure);
		expect(errors).toHaveLength(1);
		expect(String(errors[0]?.[0])).toContain('inth.hosted.js');
		// A call after that fails at once.
		await expect(
			(win.inth.ready as () => Promise<unknown>)()
		).rejects.toMatchObject(failure);
		// No fourth try, even with the longest retry wait gone by.
		await wait(2500);
		expect(await hostedRequestsSoFar()).toBe(3);
		expect(errors).toHaveLength(1);
		expect(win.inth.client).toBeNull();
		// Without the engine there is no banner, and no choice was made.
		expect(bannerOf(win)).toBeNull();
		expect(win.localStorage.getItem('inth')).toBeNull();
		expect(await savesSoFar()).toBe(0);
	}, 15_000);

	it('after giving up, its own controls fail quietly and init() after dispose() tries again', async () => {
		const win = await open({ 'hosted-fail': 3 });
		win.console.error = () => undefined;
		const unhandled: unknown[] = [];
		win.addEventListener('unhandledrejection', (event) => {
			unhandled.push(event.reason);
		});
		await expect(
			(win.inth.ready as () => Promise<unknown>)()
		).rejects.toBeInstanceOf(win.Error);

		const control = win.document.createElement('button');
		control.dataset.inthAction = 'dismiss';
		win.document.body.append(control);
		control.click();
		await wait(100);
		expect(unhandled).toEqual([]);

		(win.inth.dispose as () => void)();
		(win.inth.init as () => unknown)();
		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		expect(await hostedRequestsSoFar()).toBe(4);
	}, 15_000);

	it('rejects what waits for the engine when dispose() runs first', async () => {
		const win = await open({ 'hosted-delay': 5000 }, { parsed: true });
		const ready = (win.inth.ready as () => Promise<unknown>)();

		(win.inth.dispose as () => void)();

		await expect(ready).rejects.toMatchObject({
			message: expect.stringContaining('dispose() ran before inth.hosted.js'),
		});
	});

	it('stops retrying after dispose(), and init() loads the engine again', async () => {
		const win = await open({ 'hosted-fail': 1 }, { parsed: true });
		await expect.poll(() => requested(win, 'inth.hosted.js')).toHaveLength(1);

		(win.inth.dispose as () => void)();
		await wait(1500);
		expect(await hostedRequestsSoFar()).toBe(1);

		(win.inth.init as () => unknown)();
		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		expect(await hostedRequestsSoFar()).toBe(1);
	});
});

describe('inth.records.js', () => {
	it('is never fetched on a first visit', async () => {
		const win = await acceptOnFirstVisit();
		expect(requested(win, 'inth.records.js')).toEqual([]);
	});

	it('leaves a returning visitor to the engine when it fails', async () => {
		await acceptOnFirstVisit();

		const second = await open({ 'hosted-delay': 300, records: 'fail' });
		await expect
			.poll(() => second.inth.client, { timeout: 5000 })
			.not.toBeNull();
		expect(second.inth.client?.getSnapshot().explicitChoice).not.toBeNull();
		await expect
			.poll(() => second.__ran.toSorted())
			.toEqual(['marketing', 'measurement']);
		expect(bannerOf(second)).toBeNull();
		expect(await savesSoFar()).toBe(0);
	});
});

describe('inth.choices.js', () => {
	it('carries the banner, and loads the dialog beside it, at its version [BNR-04]', async () => {
		const win = await open({});
		await expect.poll(() => bannerOf(win), { timeout: 4000 }).not.toBeNull();
		const [src] = requested(win, 'inth.choices.js');
		expect(src).toMatch(
			new RegExp(
				`/__inth-dist__/inth\\.choices\\.js\\?v=${win.inth.version.replaceAll('.', '\\.')}$`,
				'u'
			)
		);
		// The banner and the engine share one session: Customize expands in
		// place, and the dialog the engine opens is the same file's.
		buttonOf(win, 'customize')?.click();
		await expect
			.poll(() => bannerOf(win)?.getAttribute('data-expanded'))
			.toBe('true');
		win.inth.openDialog();
		await expect.poll(() => dialogOf(win), { timeout: 4000 }).not.toBeNull();
		expect(requested(win, 'inth.choices.js')).toHaveLength(1);
		expect(requested(win, 'inth.choices-dialog.js')).toEqual([
			src?.replace('inth.choices.js', 'inth.choices-dialog.js'),
		]);
	});

	it('never fetches the dialog for a first visit that only answers the banner', async () => {
		const win = await open({});
		await expect
			.poll(() => buttonOf(win, 'accept'), { timeout: 4000 })
			.not.toBeNull();
		// The banner's options still warm in idle time; the dialog does not.
		buttonOf(win, 'customize')?.click();
		await expect
			.poll(() => bannerOf(win)?.getAttribute('data-expanded'))
			.toBe('true');
		await wait(600);
		bannerOf(win)
			?.querySelector<HTMLButtonElement>(
				'[data-testid="consent-banner-accept-button"]'
			)
			?.click();
		await expect.poll(savesSoFar, { timeout: 4000 }).toBe(1);
		await wait(600);
		expect(requested(win, 'inth.choices.js')).toHaveLength(1);
		expect(requested(win, 'inth.choices-dialog.js')).toEqual([]);
		expect(added(win, 'inth.choices-dialog.js')).toBe(false);
	});

	it('loads the dialog from data-choices-dialog-src', async () => {
		const win = await open({ 'choices-dialog': 0 });
		await expect.poll(() => bannerOf(win), { timeout: 4000 }).not.toBeNull();
		win.inth.openDialog();
		await expect.poll(() => dialogOf(win), { timeout: 4000 }).not.toBeNull();
		expect(requested(win, 'inth.choices-dialog.js')).toEqual([
			new URL(
				'/__inth-dist__/inth.choices-dialog.js?delay=0',
				win.location.href
			).href,
		]);
	});

	it('tries the dialog again at a URL of its own after a failed load', async () => {
		const win = await open({ 'choices-dialog': 'fail-once' });
		const errors: string[] = [];
		win.console.error = (...args: unknown[]) => {
			errors.push(String(args[0]));
		};
		await expect.poll(() => bannerOf(win), { timeout: 4000 }).not.toBeNull();
		win.inth.openDialog();
		await expect
			.poll(() => errors, { timeout: 4000 })
			.toContainEqual(
				expect.stringContaining('the preference centre failed to load')
			);
		expect(dialogOf(win)).toBeNull();
		// The banner is still there to answer.
		expect(bannerOf(win)).not.toBeNull();

		win.inth.openDialog();
		await expect.poll(() => dialogOf(win), { timeout: 4000 }).not.toBeNull();
		const dialogRequests = requested(win, 'inth.choices-dialog.js');
		expect(dialogRequests).toHaveLength(2);
		expect(
			new URL(dialogRequests[1] ?? '').searchParams.get('inth-retry')
		).toBe('1');
	});

	it('reports a failed load, with no banner and no choice', async () => {
		const win = await open(
			{ choices: 'fail', 'hosted-delay': 300 },
			{ parsed: true }
		);
		const errors: unknown[][] = [];
		win.console.error = (...args: unknown[]) => {
			errors.push(args);
		};
		await expect.poll(() => win.inth.client, { timeout: 4000 }).not.toBeNull();
		await expect
			.poll(() => errors.map((args) => String(args[0])), { timeout: 4000 })
			.toContainEqual(
				expect.stringContaining('the consent banner failed to load')
			);
		expect(bannerOf(win)).toBeNull();
		expect(win.inth.getSnapshot().explicitChoice).toBeNull();
		expect(await savesSoFar()).toBe(0);
	});

	it('tries the file again after a failed load', async () => {
		const win = await open(
			{ choices: 'fail-once', 'hosted-delay': 300 },
			{ parsed: true }
		);
		const errors: string[] = [];
		win.console.error = (...args: unknown[]) => {
			errors.push(String(args[0]));
		};
		await expect.poll(() => win.inth.client, { timeout: 4000 }).not.toBeNull();
		await expect
			.poll(() => errors, { timeout: 4000 })
			.toContainEqual(
				expect.stringContaining('the consent banner failed to load')
			);
		expect(bannerOf(win)).toBeNull();

		win.inth.openDialog();
		await expect.poll(() => dialogOf(win), { timeout: 4000 }).not.toBeNull();
		expect(requested(win, 'inth.choices.js').length).toBeGreaterThan(1);
	});
});
