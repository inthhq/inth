/**
 * The two-stage script tag in Chromium, on the built files: `inth.js` (the
 * init script) and `inth.hosted.js` (the engine), against a test backend
 * (`fixtures/init-script-server.ts`).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

type PageWindow = Window & {
	__heard: string[];
	__ran: string[];
	inth: Record<string, unknown> & {
		client: { getSnapshot: () => { explicitChoice: unknown } } | null;
		getSnapshot: () => { activeUI: string; explicitChoice: unknown };
		on: (event: string, listener: (payload: unknown) => void) => () => void;
		openDialog: () => void;
		push: (...calls: unknown[]) => number;
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

/**
 * Load the fixture page and wait for it to load, or, with `parsed`, only for
 * its document to be parsed (a held-back `hero` image holds `load`).
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

const bannerOf = (win: PageWindow): HTMLElement | null =>
	win.document
		.querySelector('[data-inth-ui]')
		?.shadowRoot?.querySelector<HTMLElement>(
			'[data-testid="consent-banner-root"]'
		) ?? null;

const buttonOf = (win: PageWindow, action: string): HTMLButtonElement | null =>
	bannerOf(win)?.querySelector<HTMLButtonElement>(
		`[data-testid="consent-banner-${action}-button"]`
	) ?? null;

const setInitDelay = async (ms: number): Promise<void> => {
	await fetch(`/__inth-init__/init-delay?ms=${ms}`);
};

const initsSoFar = async (): Promise<number> =>
	(await (await fetch('/__inth-init__/inits')).json()) as number;

const savesSoFar = async (): Promise<number> =>
	(await (await fetch('/__inth-init__/saves')).json()) as number;

const hostedRequestsSoFar = async (): Promise<number> =>
	(await (await fetch('/__inth-init__/hosted-requests')).json()) as number;

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
	it('shows the banner from /init without loading the engine', async () => {
		const win = await open({ 'hosted-delay': 4000 });

		await expect.poll(() => bannerOf(win), { timeout: 3000 }).not.toBeNull();
		expect(bannerOf(win)?.textContent).toContain('Backend title');
		// The stand-in is installed and no engine has run.
		expect(win.inth.__inthBoot).toBeDefined();
		expect(win.inth.client).toBeNull();
		expect(win.inth.getSnapshot().activeUI).toBe('banner');
		// The banner's sheet is in the shadow root (the full one replaces it
		// later; see the handoff test).
		const style = win.document
			.querySelector('[data-inth-ui]')
			?.shadowRoot?.querySelector('style');
		expect(style?.textContent?.length ?? 0).toBeGreaterThan(1000);
	});

	it('records an accept tapped before the engine once, and starts its scripts', async () => {
		const win = await open({ 'hosted-delay': 1500 });
		await expect.poll(() => buttonOf(win, 'accept')).not.toBeNull();

		buttonOf(win, 'accept')?.click();

		// In the tap's task: the stand-in holds the choice and the banner goes.
		expect(win.inth.getSnapshot().explicitChoice).not.toBeNull();
		await expect
			.poll(() => win.__ran.toSorted())
			.toEqual(['marketing', 'measurement']);
		// Stored before the engine.
		await expect.poll(() => win.localStorage.getItem('inth')).not.toBeNull();
		await expect.poll(() => bannerOf(win)).toBeNull();

		// The engine takes over from the stored record and records nothing
		// again: one save, no second banner, each script ran once.
		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		expect(win.inth.client?.getSnapshot().explicitChoice).not.toBeNull();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});
		expect(bannerOf(win)).toBeNull();
		expect(win.__ran).toHaveLength(2);
		expect(await savesSoFar()).toBe(0);
	});

	it('starts a plain script once across the handoff, with one /init and one save', async () => {
		const win = await open({ 'hosted-delay': 1500, manual: true });
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
		await expect.poll(() => buttonOf(win, 'accept')).not.toBeNull();
		buttonOf(win, 'accept')?.click();
		await expect.poll(() => win.__ran).toContain('plain');

		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});
		// The engine started from the init script's /init answer and adopted
		// the script element: nothing ran or was asked for twice.
		expect(win.__ran.filter((name) => name === 'plain')).toHaveLength(1);
		expect(await initsSoFar()).toBe(1);
	});

	it('hands the banner to the engine without a second banner or entry', async () => {
		const win = await open({ 'hosted-delay': 800 });
		await expect.poll(() => bannerOf(win)).not.toBeNull();
		const host = win.document.querySelector('[data-inth-ui]');
		const style = host?.shadowRoot?.querySelector('style');
		const bannerSheet = style?.textContent?.length ?? 0;

		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		await (win.inth.ready as () => Promise<unknown>)();

		// Same host and style element; the full sheet replaced the banner's.
		expect(win.document.querySelectorAll('[data-inth-ui]')).toHaveLength(1);
		expect(win.document.querySelector('[data-inth-ui]')).toBe(host);
		expect(host?.shadowRoot?.querySelectorAll('style')).toHaveLength(1);
		expect(style?.textContent?.length ?? 0).toBeGreaterThan(bannerSheet);
		const banners = host?.shadowRoot?.querySelectorAll(
			'[data-testid="consent-banner-root"]'
		);
		expect(banners).toHaveLength(1);
		// Rebuilt in place: not marked for a late fade-in.
		expect(banners?.[0]?.getAttribute('data-entry')).toBeNull();
		expect(win.getComputedStyle(banners?.[0] as Element).opacity).toBe('1');
		// The engine's buttons work.
		buttonOf(win, 'reject')?.click();
		await expect
			.poll(() => win.inth.getSnapshot().explicitChoice)
			.not.toBeNull();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		expect(win.__ran).toEqual([]);
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
		await expect
			.poll(() =>
				win.document
					.querySelector('[data-inth-ui]')
					?.shadowRoot?.querySelector('[data-testid="consent-dialog-root"]')
			)
			.not.toBeNull();
		expect(win.inth.getSnapshot().activeUI).toBe('dialog');
	});

	it('opens the dialog for a page action clicked before the engine', async () => {
		const win = await open({ 'hosted-delay': 600 });
		await expect.poll(() => bannerOf(win)).not.toBeNull();

		win.document.querySelector<HTMLButtonElement>('#page-customize')?.click();

		await expect
			.poll(() => win.inth.client?.getSnapshot(), { timeout: 5000 })
			.toMatchObject({ activeUI: 'dialog' });
	});

	it('starts a returning visitor’s scripts before /init answers', async () => {
		// First visit: accept on the engine's banner, which stores the choice
		// and the policy.
		const first = await open({ 'hosted-delay': 200 });
		await expect
			.poll(() => first.inth.client, { timeout: 5000 })
			.not.toBeNull();
		await expect.poll(() => buttonOf(first, 'accept')).not.toBeNull();
		buttonOf(first, 'accept')?.click();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		expect(first.localStorage.getItem('inth-init-policy')).not.toBeNull();

		// Second visit: /init and the engine both take seconds.
		await setInitDelay(4000);
		const started = performance.now();
		const second = await open({ 'hosted-delay': 4000 });
		await expect
			.poll(() => second.__ran.toSorted(), { timeout: 2000 })
			.toEqual(['marketing', 'measurement']);
		expect(performance.now() - started).toBeLessThan(3000);
		expect(second.inth.client).toBeNull();
		expect(bannerOf(second)).toBeNull();
	});

	it('leaves an engine that arrives after dispose() without a client, until init()', async () => {
		const win = await open({ 'hosted-delay': 600 });
		await expect.poll(() => bannerOf(win)).not.toBeNull();

		(win.inth.dispose as () => void)();
		expect(bannerOf(win)).toBeNull();

		// The engine, already on its way, installs itself and leaves the
		// page alone.
		await expect
			.poll(() => win.inth.__inthBoot, { timeout: 5000 })
			.toBeUndefined();
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});
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
		const win = await open({ 'hosted-fail': 3 });
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
		await new Promise((resolve) => {
			setTimeout(resolve, 2500);
		});
		expect(await hostedRequestsSoFar()).toBe(3);
		expect(errors).toHaveLength(1);
		expect(win.inth.client).toBeNull();
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
		await new Promise((resolve) => {
			setTimeout(resolve, 100);
		});
		expect(unhandled).toEqual([]);

		(win.inth.dispose as () => void)();
		(win.inth.init as () => unknown)();
		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		expect(await hostedRequestsSoFar()).toBe(4);
	}, 15_000);

	it('shows the banner again when neither inth.commit.js nor the engine records a tap', async () => {
		const win = await open({ commit: 'fail', 'hosted-fail': 3 });
		win.console.error = () => undefined;
		await expect.poll(() => buttonOf(win, 'accept')).not.toBeNull();

		buttonOf(win, 'accept')?.click();
		await expect.poll(() => bannerOf(win)).toBeNull();

		await expect
			.poll(() => buttonOf(win, 'accept'), { timeout: 8000 })
			.not.toBeNull();
		expect(await hostedRequestsSoFar()).toBe(3);
	}, 15_000);

	it('rejects what waits for the engine when dispose() runs first', async () => {
		const win = await open({ 'hosted-delay': 5000 });
		const ready = (win.inth.ready as () => Promise<unknown>)();

		(win.inth.dispose as () => void)();

		await expect(ready).rejects.toMatchObject({
			message: expect.stringContaining('dispose() ran before inth.hosted.js'),
		});
	});

	it('stops retrying after dispose(), and init() loads the engine again', async () => {
		const win = await open({ 'hosted-fail': 1 });
		await expect
			.poll(() =>
				win.performance
					.getEntriesByType('resource')
					.some(({ name }) => name.includes('inth.hosted.js'))
			)
			.toBe(true);

		(win.inth.dispose as () => void)();
		await new Promise((resolve) => {
			setTimeout(resolve, 1500);
		});
		expect(await hostedRequestsSoFar()).toBe(1);

		(win.inth.init as () => unknown)();
		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		expect(await hostedRequestsSoFar()).toBe(1);
	});
});

describe('the engine after a banner press', () => {
	/** Whether the page added a script tag for `file` yet. */
	const added = (win: PageWindow, file: string): boolean =>
		Boolean(win.document.querySelector(`script[src*="${file}"]`));

	const press = (win: PageWindow, action: string): void => {
		const button = buttonOf(win, action);
		button?.dispatchEvent(
			new win.PointerEvent('pointerdown', { bubbles: true, composed: true })
		);
		button?.click();
	};

	it('starts the scripts and inth.commit.js before the engine on an accept', async () => {
		// The priority image holds the engine back until the press.
		const win = await open({ hero: 10_000 }, { parsed: true });
		await expect.poll(() => buttonOf(win, 'accept')).not.toBeNull();
		expect(added(win, 'inth.hosted.js')).toBe(false);

		press(win, 'accept');

		expect(added(win, 'inth.commit.js')).toBe(true);
		expect(added(win, 'inth.hosted.js')).toBe(false);
		await expect
			.poll(() => win.__ran.toSorted())
			.toEqual(['marketing', 'measurement']);
		// Once the choice is stored, the engine loads.
		await expect.poll(() => added(win, 'inth.hosted.js')).toBe(true);
		expect(win.localStorage.getItem('inth')).not.toBeNull();
	});

	it('fetches inth.dialog.js, not the engine, with the press on Customize', async () => {
		const win = await open({ hero: 10_000 }, { parsed: true });
		await expect.poll(() => buttonOf(win, 'customize')).not.toBeNull();

		buttonOf(win, 'customize')?.dispatchEvent(
			new win.PointerEvent('pointerdown', { bubbles: true, composed: true })
		);

		expect(added(win, 'inth.dialog.js')).toBe(true);
		expect(added(win, 'inth.commit.js')).toBe(false);
		expect(added(win, 'inth.hosted.js')).toBe(false);
	});

	it('loads the engine with any other press', async () => {
		const win = await open({ hero: 10_000 }, { parsed: true });
		await expect.poll(() => buttonOf(win, 'customize')).not.toBeNull();

		win.document
			.querySelector('p')
			?.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true }));

		expect(added(win, 'inth.hosted.js')).toBe(true);
		expect(added(win, 'inth.dialog.js')).toBe(false);
	});
});

describe('inth.commit.js and inth.records.js', () => {
	const wait = (ms: number) =>
		new Promise((resolve) => {
			setTimeout(resolve, ms);
		});

	it('stores a tap in the next task when a press already fetched inth.commit.js', async () => {
		const win = await open({ 'hosted-delay': 4000 });
		await expect.poll(() => buttonOf(win, 'accept')).not.toBeNull();
		// Not fetched before the visitor presses the banner.
		const fetchedCommit = () =>
			win.performance
				.getEntriesByType('resource')
				.some(({ name }) => name.includes('inth.commit.js'));
		expect(fetchedCommit()).toBe(false);

		win.document
			.querySelector('[data-inth-ui]')
			?.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true }));
		await expect.poll(fetchedCommit).toBe(true);
		await wait(100);
		buttonOf(win, 'accept')?.click();

		// The tap's task: the choice, the scripts and the marker.
		expect(win.inth.getSnapshot().explicitChoice).not.toBeNull();
		expect(win.localStorage.getItem('inth-pending-tap')).not.toBeNull();
		await wait(50);
		// The next task: the record is stored and the marker gone.
		expect(win.localStorage.getItem('inth')).not.toBeNull();
		expect(win.localStorage.getItem('inth-pending-tap')).toBeNull();
		await expect
			.poll(() => win.__ran.toSorted())
			.toEqual(['marketing', 'measurement']);
	});

	it('records a tap on the next page when the visitor left before inth.commit.js arrived', async () => {
		const first = await open({ commit: 5000, 'hosted-delay': 10_000 });
		await expect.poll(() => buttonOf(first, 'accept')).not.toBeNull();
		buttonOf(first, 'accept')?.click();
		await expect
			.poll(() => first.__ran.toSorted())
			.toEqual(['marketing', 'measurement']);
		expect(first.localStorage.getItem('inth')).toBeNull();
		const marker = JSON.parse(
			first.localStorage.getItem('inth-pending-tap') ?? 'null'
		) as {
			c: string;
		} | null;
		expect(marker?.c).toBe('all');
		// The visitor leaves: nothing was stored or sent.
		frames.pop()?.remove();
		expect(await savesSoFar()).toBe(0);

		const second = await open({ 'hosted-delay': 200 });
		// The engine records the tap once, from the marker.
		await expect
			.poll(() => second.inth.client?.getSnapshot().explicitChoice, {
				timeout: 5000,
			})
			.toBeTruthy();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		expect(second.localStorage.getItem('inth')).not.toBeNull();
		expect(second.localStorage.getItem('inth-pending-tap')).toBeNull();
		await expect.poll(() => bannerOf(second)).toBeNull();
		await expect
			.poll(() => second.__ran.toSorted())
			.toEqual(['marketing', 'measurement']);
		await wait(300);
		expect(await savesSoFar()).toBe(0);
	});

	it('hands the tap to the engine, which records it once, when inth.commit.js fails', async () => {
		const win = await open({ commit: 'fail', 'hosted-delay': 500 });
		await expect.poll(() => buttonOf(win, 'accept')).not.toBeNull();
		buttonOf(win, 'accept')?.click();
		expect(win.inth.getSnapshot().explicitChoice).not.toBeNull();

		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		await expect
			.poll(() => win.inth.client?.getSnapshot().explicitChoice, {
				timeout: 5000,
			})
			.toBeTruthy();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		await expect
			.poll(() => win.localStorage.getItem('inth-pending-tap'))
			.toBeNull();
		await wait(300);
		expect(await savesSoFar()).toBe(0);
		expect(win.__ran.toSorted()).toEqual(['marketing', 'measurement']);
		expect(bannerOf(win)).toBeNull();
	});

	it('hands the tap to the engine, which records it once, when the outbox cannot keep its save', async () => {
		const win = await open({ 'hosted-delay': 800, manual: true });
		const recorded: unknown[] = [];
		const init = win.inth.init as (options: unknown) => unknown;
		init({
			callbacks: {
				onChoiceRecorded: (event: unknown) => recorded.push(event),
			},
		});
		await expect.poll(() => buttonOf(win, 'accept')).not.toBeNull();
		// Blocked or full storage for the outbox's key only.
		const { setItem: storeItem } = win.Storage.prototype;
		win.Storage.prototype.setItem = function setItem(
			this: Storage,
			key: string,
			value: string
		) {
			if (key === 'inth-pending-consent-saves:v1') {
				throw new win.DOMException(
					'The quota has been exceeded.',
					'QuotaExceededError'
				);
			}
			storeItem.call(this, key, value);
		};

		buttonOf(win, 'accept')?.click();
		expect(win.inth.getSnapshot().explicitChoice).not.toBeNull();
		await expect.poll(() => win.localStorage.getItem('inth')).not.toBeNull();
		expect(
			win.localStorage.getItem('inth-pending-consent-saves:v1')
		).toBeNull();
		await expect.poll(() => bannerOf(win)).toBeNull();

		// The engine records the tap itself: one save, announced once.
		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		await expect.poll(() => recorded).toHaveLength(1);
		await wait(300);
		expect(await savesSoFar()).toBe(0);
		expect(recorded).toHaveLength(1);
		expect(win.inth.client?.getSnapshot().explicitChoice).not.toBeNull();
		expect(win.__ran.toSorted()).toEqual(['marketing', 'measurement']);
		expect(bannerOf(win)).toBeNull();
	});

	it('leaves a returning visitor to the engine when inth.records.js fails', async () => {
		const first = await open({ 'hosted-delay': 200 });
		await expect
			.poll(() => first.inth.client, { timeout: 5000 })
			.not.toBeNull();
		await expect.poll(() => buttonOf(first, 'accept')).not.toBeNull();
		buttonOf(first, 'accept')?.click();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);

		// A first visit never fetches the reader.
		expect(
			first.performance
				.getEntriesByType('resource')
				.some(({ name }) => name.includes('inth.records.js'))
		).toBe(false);

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

describe('inth.dialog.js', () => {
	const shadowOf = (win: PageWindow): ShadowRoot | null =>
		win.document.querySelector('[data-inth-ui]')?.shadowRoot ?? null;

	const dialogOf = (win: PageWindow): HTMLElement | null =>
		shadowOf(win)?.querySelector<HTMLElement>(
			'[data-testid="consent-dialog-root"]'
		) ?? null;

	const inDialog = <ElementType extends Element>(
		win: PageWindow,
		testId: string
	): ElementType | null =>
		dialogOf(win)?.querySelector<ElementType>(`[data-testid="${testId}"]`) ??
		null;

	/** Press and click Customize on the init script's banner. */
	const customize = (win: PageWindow): void => {
		const button = buttonOf(win, 'customize');
		button?.dispatchEvent(
			new win.PointerEvent('pointerdown', { bubbles: true, composed: true })
		);
		button?.click();
	};

	const added = (win: PageWindow, file: string): boolean =>
		Boolean(win.document.querySelector(`script[src*="${file}"]`));

	const measurementSwitch = (win: PageWindow): HTMLButtonElement | null =>
		inDialog<HTMLButtonElement>(win, 'consent-widget-switch-measurement');

	/** Stage measurement on and save, in the dialog. */
	const saveMeasurement = (win: PageWindow): void => {
		measurementSwitch(win)?.click();
		inDialog<HTMLButtonElement>(
			win,
			'consent-widget-footer-save-button'
		)?.click();
	};

	it('opens the dialog without the engine, and loads the engine once it is on screen', async () => {
		// The priority image would hold the engine for 10 s; once requested,
		// it takes a second.
		const win = await open(
			{ hero: 10_000, 'hosted-delay': 1000 },
			{ parsed: true }
		);
		await expect.poll(() => buttonOf(win, 'customize')).not.toBeNull();

		customize(win);

		await expect.poll(() => dialogOf(win)).not.toBeNull();
		expect(win.inth.client).toBeNull();
		expect(win.inth.getSnapshot().activeUI).toBe('dialog');
		expect(dialogOf(win)?.textContent).toContain('Analytics');
		// The banner leaves as the dialog opens, as the engine's does.
		await expect.poll(() => bannerOf(win)).toBeNull();
		// The dialog's rules sit in a second sheet after the banner's.
		expect(shadowOf(win)?.querySelectorAll('style')).toHaveLength(2);
		expect(
			win.getComputedStyle(dialogOf(win)?.parentElement as Element).position
		).toBe('fixed');

		// Then the engine, which takes the same dialog over.
		await expect.poll(() => added(win, 'inth.hosted.js')).toBe(true);
		const early = dialogOf(win);
		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		await (win.inth.ready as () => Promise<unknown>)();
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});
		expect(win.inth.client?.getSnapshot()).toMatchObject({
			activeUI: 'dialog',
		});
		expect(
			shadowOf(win)?.querySelectorAll('[data-testid="consent-dialog-root"]')
		).toHaveLength(1);
		expect(dialogOf(win)).toBe(early);
		// The full sheet holds the dialog's rules; the second sheet went.
		expect(shadowOf(win)?.querySelectorAll('style')).toHaveLength(1);
		// Escape now closes it through the engine.
		win.document.dispatchEvent(
			new win.KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await expect
			.poll(() => win.inth.client?.getSnapshot().activeUI)
			.toBe('banner');
	});

	it('keeps what the visitor staged when the engine takes over', async () => {
		const win = await open({ 'hosted-delay': 1500 });
		await expect.poll(() => buttonOf(win, 'customize')).not.toBeNull();
		customize(win);
		await expect.poll(() => dialogOf(win)).not.toBeNull();
		measurementSwitch(win)?.click();
		expect(measurementSwitch(win)?.getAttribute('aria-checked')).toBe('true');

		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		await (win.inth.ready as () => Promise<unknown>)();
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});
		expect(measurementSwitch(win)?.getAttribute('aria-checked')).toBe('true');
		inDialog<HTMLButtonElement>(
			win,
			'consent-widget-footer-save-button'
		)?.click();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		await expect.poll(() => win.__ran).toEqual(['measurement']);
	});

	it('closes back to the banner on Escape before the engine', async () => {
		const win = await open({ 'hosted-delay': 4000 });
		await expect.poll(() => buttonOf(win, 'customize')).not.toBeNull();
		customize(win);
		await expect.poll(() => dialogOf(win)).not.toBeNull();

		win.document.dispatchEvent(
			new win.KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);

		expect(win.inth.getSnapshot().activeUI).toBe('banner');
		await expect.poll(() => buttonOf(win, 'accept')).not.toBeNull();
		await expect.poll(() => dialogOf(win)).toBeNull();
		expect(win.inth.client).toBeNull();
	});

	it('records a save of categories before the engine, once', async () => {
		const win = await open({ 'hosted-delay': 2000 });
		await expect.poll(() => buttonOf(win, 'customize')).not.toBeNull();
		customize(win);
		await expect.poll(() => dialogOf(win)).not.toBeNull();
		// The commit file loads once the dialog is on screen.
		await expect.poll(() => added(win, 'inth.commit.js')).toBe(true);
		await new Promise((resolve) => {
			setTimeout(resolve, 200);
		});

		saveMeasurement(win);

		// In the tap's task: the choice, its script, and the dialog closes.
		expect(win.inth.client).toBeNull();
		expect(win.inth.getSnapshot()).toMatchObject({
			activeUI: 'none',
			effectivePermissions: { marketing: false, measurement: true },
		});
		await expect.poll(() => win.__ran).toEqual(['measurement']);
		await expect.poll(() => dialogOf(win)).toBeNull();
		await expect.poll(() => win.localStorage.getItem('inth')).not.toBeNull();

		// The engine sends the queued save: one save, the same choice.
		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		expect(win.inth.client?.getSnapshot().effectivePermissions).toMatchObject({
			marketing: false,
			measurement: true,
		});
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});
		expect(await savesSoFar()).toBe(0);
		expect(win.__ran).toEqual(['measurement']);
		expect(bannerOf(win)).toBeNull();
		// The engine still offers both categories, measurement on.
		win.inth.openDialog();
		await expect.poll(() => measurementSwitch(win)).not.toBeNull();
		expect(measurementSwitch(win)?.getAttribute('aria-checked')).toBe('true');
		expect(
			inDialog(win, 'consent-widget-switch-marketing')?.getAttribute(
				'aria-checked'
			)
		).toBe('false');
	});

	it('leaves a save it cannot store to the engine, which records it once', async () => {
		const win = await open({ commit: 'fail', 'hosted-delay': 800 });
		await expect.poll(() => buttonOf(win, 'customize')).not.toBeNull();
		customize(win);
		await expect.poll(() => dialogOf(win)).not.toBeNull();

		saveMeasurement(win);

		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		await expect
			.poll(() => win.inth.client?.getSnapshot().effectivePermissions, {
				timeout: 5000,
			})
			.toMatchObject({ marketing: false, measurement: true });
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});
		expect(await savesSoFar()).toBe(0);
		expect(win.__ran).toEqual(['measurement']);
		expect(dialogOf(win)).toBeNull();
	});

	for (const dialog of ['fail', 'stale'] as const) {
		it(`loads the engine instead when inth.dialog.js ${dialog === 'fail' ? 'fails' : 'is from another release'}`, async () => {
			const win = await open(
				{ dialog, hero: 10_000, 'hosted-delay': 800 },
				{ parsed: true }
			);
			await expect.poll(() => buttonOf(win, 'customize')).not.toBeNull();

			customize(win);

			// No dialog before the engine; the tap goes to the engine.
			await expect.poll(() => added(win, 'inth.hosted.js')).toBe(true);
			expect(win.inth.client).toBeNull();
			expect(dialogOf(win)).toBeNull();
			await expect
				.poll(() => win.inth.client, { timeout: 5000 })
				.not.toBeNull();
			await expect
				.poll(() => win.inth.client?.getSnapshot().activeUI, {
					timeout: 5000,
				})
				.toBe('dialog');
			// The engine opens its own copy of the dialog.
			await expect.poll(() => dialogOf(win), { timeout: 5000 }).not.toBeNull();
		});
	}
});

describe('scripts the Inth server lists', () => {
	const REMOTE_SRC = 'https://remote-pixel.invalid/pixel.js';
	const remoteTag = (win: PageWindow): HTMLScriptElement | null =>
		win.document.querySelector(`script[src="${REMOTE_SRC}"]`);
	const manifestsRequested = (win: PageWindow): boolean =>
		[...win.document.querySelectorAll('script')].some((tag) =>
			tag.src.includes('/inth.manifests.js')
		);

	it('loads one that may run before a choice through the engine and inth.manifests.js', async () => {
		const win = await open({ remote: 'always' });

		// Its setup ran and its tag is in the page, while the banner waits.
		await expect.poll(() => win.__ran, { timeout: 8000 }).toContain('remote');
		expect(remoteTag(win)).not.toBeNull();
		expect(manifestsRequested(win)).toBe(true);
		expect(win.inth.client).not.toBeNull();
		expect(win.inth.getSnapshot().explicitChoice).toBeNull();
	});

	it('waits for its category, and starts once an accept before the engine grants it', async () => {
		const win = await open({ 'hosted-delay': 1500, remote: 'gated' });
		await expect.poll(() => buttonOf(win, 'accept')).not.toBeNull();
		// The list arrived, so its file is on its way before the engine.
		await expect.poll(() => manifestsRequested(win)).toBe(true);
		expect(win.__ran).not.toContain('remote');

		buttonOf(win, 'accept')?.click();

		await expect.poll(() => win.__ran, { timeout: 8000 }).toContain('remote');
		expect(remoteTag(win)).not.toBeNull();
		// The page lists no categories, so the accept still covers the
		// policy's whole scope, not only the remote script's.
		expect(win.__ran).toContain('measurement');
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);
		await expect.poll(() => win.inth.client, { timeout: 5000 }).not.toBeNull();
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});
		expect(bannerOf(win)).toBeNull();
	});

	it('caches the list from an answer that arrives after the engine took over', async () => {
		// Longer than the engine waits for the init script's answer.
		await setInitDelay(3500);
		const win = await open({ remote: 'gated' });
		win.inth.openDialog();
		await expect.poll(() => win.inth.client, { timeout: 8000 }).not.toBeNull();
		expect(win.inth.getSnapshot().explicitChoice).toBeNull();

		await expect
			.poll(() => win.inth.client?.getSnapshot().policyPending, {
				timeout: 10_000,
			})
			.toBe(false);
		(win.inth.client as { acceptAll?: () => unknown } | null)?.acceptAll?.();
		await expect.poll(savesSoFar, { timeout: 5000 }).toBe(1);

		// The next page starts from this list.
		await expect
			.poll(() => win.localStorage.getItem('inth-init-policy') ?? '')
			.toContain('remote-pixel');
	});

	it('loads nothing the server lists with data-remote-scripts="false"', async () => {
		const win = await open({ 'no-remote': true, remote: 'always' });

		// The engine still loads on its own schedule.
		win.inth.openDialog();
		await expect.poll(() => win.inth.client, { timeout: 8000 }).not.toBeNull();
		await new Promise((resolve) => {
			setTimeout(resolve, 500);
		});
		expect(win.__ran).not.toContain('remote');
		expect(remoteTag(win)).toBeNull();
		expect(manifestsRequested(win)).toBe(false);
	});
});
