import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';

import {
	BENCH_BACKEND_LATENCY_ENV,
	resolveBenchBackendLatencyMs,
} from './browser';
import { consentGateBudgets } from './budgets';
import type { ConsentGateTarget } from './budgets';
import { gateObserverScript } from './consent-gate-observer';
import type { GateObservations } from './consent-gate-observer';
import {
	GATE_SCRIPT_PATH,
	GATE_STATE_GLOBAL,
	gateAcceptCategories,
	gateSelectors,
} from './consent-gate-page';
import { startGateProxy } from './consent-gate-proxy';
import type { GateProxyOptions } from './consent-gate-proxy';
import { BENCHMARK_SCHEMA_VERSION } from './schema';
import type { BenchmarkResult, MetricSampleSet } from './schema';
import { benchSelectionFromEnv, isBenchSelected } from './selection';
import {
	getEnvironment,
	safeBaseSha,
	safeCommitSha,
	safeGitDirty,
	summarizeMetric,
	writeJson,
} from './utils';

/** Suite and scenario of every consent gate result. */
export const GATE_SUITE = 'consent-gate';

/**
 * Scenario key of a gate result. The gate always runs CookieBench's mobile
 * profile, so only the backend latency varies.
 *
 * @param backendLatencyMs - Simulated consent-backend round trip.
 */
export const gateScenarioKey = function gateScenarioKey(
	backendLatencyMs: number
): string {
	return `${GATE_SUITE}:latency-${backendLatencyMs}ms`;
};

/**
 * CookieBench's `mobile-article-v1` profile (`benchmarks/profiles/mobile.json`):
 * a 390x844 phone at DPR 3 with 4x CPU slowdown, 200 KB/s down, 93.75 KB/s
 * up and 150 ms latency, applied through CDP.
 */
export const cookieBenchMobileProfile = {
	cpuSlowdown: 4,
	deviceScaleFactor: 3,
	id: 'mobile-article-v1',
	locale: 'en-GB',
	network: {
		downloadBytesPerSecond: 200_000,
		latencyMs: 150,
		uploadBytesPerSecond: 93_750,
	},
	userAgent:
		'Mozilla/5.0 (Linux; Android 13; CookieBench Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
	viewport: { height: 844, width: 390 },
} as const;

/**
 * Event Timing reports only interactions of 16 ms or more. A shorter one
 * is censored, not zero, so the gate records it at that floor: a change
 * that pushes it over 16 ms still shows up, and a missing entry never
 * leaves the metric without a sample.
 */
export const INP_CENSOR_FLOOR_MS = 16;

/** CookieBench's presentation grace before reading paint-dependent entries. */
const PAINT_GRACE_MS = 250;

/** One iteration's five visits, reduced to the gate's metrics. */
export interface GateIterationSample {
	controlLcpMs: number;
	controlFcpMs: number;
	lcpMs: number;
	fcpMs: number;
	returningLcpMs: number;
	returningScriptsMs: number;
	bannerVisibleMs: number;
	consentEffectiveMs: number;
	dismissedMs: number;
	inputToNextPaintMs: number;
	scriptsCompleteMs: number;
	preferencesVisibleMs: number;
}

/**
 * The interaction's duration as CookieBench's `interactionDuration` computes
 * it: the Event Timing entries whose start matches a trusted input event on
 * the armed control, then the longest entry of that interaction.
 *
 * @returns Milliseconds, or {@link INP_CENSOR_FLOOR_MS} when no entry was
 * long enough to be reported.
 */
export const interactionDuration = function interactionDuration(
	observations: Pick<GateObservations, 'input' | 'inputEvents' | 'events'>
): number {
	const { input } = observations;
	if (!input) {
		throw new Error('No trusted input reached the armed control');
	}
	const related = observations.inputEvents.filter(
		(item) => item.at >= input.at
	);
	const matching = observations.events.filter(
		(event) =>
			event.interactionId > 0 &&
			['pointerdown', 'pointerup', 'click'].includes(event.name) &&
			related.some(
				(item) =>
					item.type === event.name && Math.abs(event.startTime - item.at) <= 2
			)
	);
	const [nearest] = [...matching].sort(
		(left, right) =>
			Math.abs(left.startTime - input.at) - Math.abs(right.startTime - input.at)
	);
	if (!nearest) {
		return INP_CENSOR_FLOOR_MS;
	}
	return Math.max(
		INP_CENSOR_FLOOR_MS,
		...observations.events
			.filter((event) => event.interactionId === nearest.interactionId)
			.map((event) => event.duration)
	);
};

/**
 * Accept-visit metrics, each measured from the tap's `pointerdown`.
 *
 * @throws {Error} When the visit did not reach a milestone, so a broken
 * page fails the run instead of dropping a sample.
 */
export const acceptMetrics = function acceptMetrics(
	observations: GateObservations
): Pick<
	GateIterationSample,
	| 'consentEffectiveMs'
	| 'dismissedMs'
	| 'inputToNextPaintMs'
	| 'scriptsCompleteMs'
> {
	const { input, effectiveAt, dismissedAt } = observations;
	if (!input || effectiveAt === undefined || dismissedAt === undefined) {
		throw new Error(
			`Accept did not complete: input ${input?.at}, effective ${effectiveAt}, dismissed ${dismissedAt}`
		);
	}
	const allowed = observations.scripts.filter((script) =>
		(gateAcceptCategories as readonly string[]).includes(script.category)
	);
	if (allowed.length !== gateAcceptCategories.length) {
		throw new Error(
			`Expected ${gateAcceptCategories.length} gated scripts to run after Accept, saw ${allowed.length}`
		);
	}
	return {
		consentEffectiveMs: effectiveAt - input.at,
		dismissedMs: dismissedAt - input.at,
		inputToNextPaintMs: interactionDuration(observations),
		scriptsCompleteMs:
			Math.max(...allowed.map((script) => script.at)) - input.at,
	};
};

/**
 * When a returning visitor's last gated script ran: each accepted category
 * once, as `acceptMetrics` requires after a tap.
 *
 * @throws {Error} When a category ran twice or not at all, so a broken page
 * fails the run instead of skewing the metric.
 */
export const returningScripts = function returningScripts(
	observations: Pick<GateObservations, 'scripts'>
): number {
	const ran = observations.scripts.filter((script) =>
		(gateAcceptCategories as readonly string[]).includes(script.category)
	);
	const categories = new Set(ran.map((script) => script.category));
	if (
		ran.length !== gateAcceptCategories.length ||
		categories.size !== gateAcceptCategories.length
	) {
		throw new Error(
			`Expected each of ${gateAcceptCategories.join(', ')} to run once on a returning visit, saw ${ran.map((script) => script.category).join(', ') || 'none'}`
		);
	}
	return Math.max(...ran.map((script) => script.at));
};

/** Metric names, units and descriptions every gate result reports. */
export const gateMetricGlossary = {
	bannerVisibleMs:
		'banner.visible: navigation to the first frame the banner has a rendered footprint',
	consentEffectiveMs:
		'action.consent-effective: Accept pointerdown to the first frame the public snapshot grants both optional categories',
	controlFcpMs: 'page.fcp of the no-CMP control page',
	controlLcpMs: 'page.lcp of the no-CMP control page',
	dismissedMs:
		'action.dismissed: Accept pointerdown to the first frame the banner has no footprint and no blocking overlay',
	fcpMs: 'page.fcp of the gate page',
	inputToNextPaintMs:
		'action.input-to-next-paint: longest Event Timing entry of the Accept interaction, 16 ms floor',
	lcpDeltaMs:
		'page.lcp of the gate page minus page.lcp of the control page measured in the same iteration',
	lcpMs: 'page.lcp of the gate page (hero image)',
	preferencesVisibleMs:
		'action.preferences-visible: Customize pointerdown to the first frame the preferences dialog has a footprint',
	rejectedScriptRequests:
		'requests for a gated script on the return visit of a visitor who accepted, came back, then rejected, summed over three replays; any request reaches the vendor after a no',
	returningLcpDeltaMs:
		'page.lcp of a returning visitor who accepted, minus page.lcp of the control page measured in the same iteration',
	returningScriptsMs:
		'navigation to the last gated script executing, for a returning visitor who accepted',
	scriptsCompleteMs:
		'action.scripts-complete: Accept pointerdown to the last gated script executing',
	slowestTapMs:
		'largest of consent-effective, dismissed, input-to-next-paint, scripts-complete and preferences-visible in one iteration',
} as const;

/**
 * Reduce iterations to the result's metrics. `lcpDeltaMs` pairs each
 * iteration's gate and control visits, so drift on the runner moves both.
 */
export const summarizeGateSamples = function summarizeGateSamples(
	samples: readonly GateIterationSample[]
): MetricSampleSet[] {
	const pick = (read: (sample: GateIterationSample) => number) =>
		samples.map((sample) => Number(read(sample).toFixed(3)));
	return [
		summarizeMetric(
			'lcpDeltaMs',
			'ms',
			pick((sample) => sample.lcpMs - sample.controlLcpMs)
		),
		summarizeMetric(
			'lcpMs',
			'ms',
			pick((sample) => sample.lcpMs)
		),
		summarizeMetric(
			'controlLcpMs',
			'ms',
			pick((sample) => sample.controlLcpMs)
		),
		summarizeMetric(
			'fcpMs',
			'ms',
			pick((sample) => sample.fcpMs)
		),
		summarizeMetric(
			'controlFcpMs',
			'ms',
			pick((sample) => sample.controlFcpMs)
		),
		summarizeMetric(
			'bannerVisibleMs',
			'ms',
			pick((sample) => sample.bannerVisibleMs)
		),
		summarizeMetric(
			'consentEffectiveMs',
			'ms',
			pick((sample) => sample.consentEffectiveMs)
		),
		summarizeMetric(
			'dismissedMs',
			'ms',
			pick((sample) => sample.dismissedMs)
		),
		summarizeMetric(
			'inputToNextPaintMs',
			'ms',
			pick((sample) => sample.inputToNextPaintMs)
		),
		summarizeMetric(
			'scriptsCompleteMs',
			'ms',
			pick((sample) => sample.scriptsCompleteMs)
		),
		summarizeMetric(
			'preferencesVisibleMs',
			'ms',
			pick((sample) => sample.preferencesVisibleMs)
		),
		summarizeMetric(
			'returningLcpDeltaMs',
			'ms',
			pick((sample) => sample.returningLcpMs - sample.controlLcpMs)
		),
		summarizeMetric(
			'returningScriptsMs',
			'ms',
			pick((sample) => sample.returningScriptsMs)
		),
		summarizeMetric(
			'slowestTapMs',
			'ms',
			pick((sample) =>
				Math.max(
					sample.consentEffectiveMs,
					sample.dismissedMs,
					sample.inputToNextPaintMs,
					sample.scriptsCompleteMs,
					sample.preferencesVisibleMs
				)
			)
		),
	];
};

type VisitKind = 'control' | 'load' | 'accept' | 'preferences' | 'returning';

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const readObservations = (page: Page) =>
	page.evaluate(
		() =>
			(
				window as unknown as {
					__c15tGate: { observations: GateObservations };
				}
			).__c15tGate.observations
	);

/** A fresh browser context at CookieBench's mobile profile. */
const mobileContext = function mobileContext(
	browser: Browser,
	storageState?: StorageState
): Promise<BrowserContext> {
	const profile = cookieBenchMobileProfile;
	return browser.newContext({
		deviceScaleFactor: profile.deviceScaleFactor,
		hasTouch: true,
		isMobile: true,
		locale: profile.locale,
		storageState,
		userAgent: profile.userAgent,
		viewport: profile.viewport,
	});
};

/** A page throttled to CookieBench's mobile CPU and network through CDP. */
const mobilePage = async function mobilePage(
	context: BrowserContext
): Promise<Page> {
	const profile = cookieBenchMobileProfile;
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send('Network.enable');
	await cdp.send('Emulation.setCPUThrottlingRate', {
		rate: profile.cpuSlowdown,
	});
	await cdp.send('Network.emulateNetworkConditions', {
		downloadThroughput: profile.network.downloadBytesPerSecond,
		latency: profile.network.latencyMs,
		offline: false,
		uploadThroughput: profile.network.uploadBytesPerSecond,
	});
	return page;
};

const visit = async function visit(
	browser: Browser,
	url: string,
	kind: VisitKind,
	storageState?: StorageState
): Promise<GateObservations> {
	const context = await mobileContext(browser, storageState);
	try {
		await context.addInitScript(
			gateObserverScript({
				acceptCategories: gateAcceptCategories,
				banner: gateSelectors.banner,
				overlay: gateSelectors.overlay,
				preferencesPanel: gateSelectors.preferencesPanel,
				primaryContent: gateSelectors.primaryContent,
				stateGlobal: GATE_STATE_GLOBAL,
			})
		);
		const page = await mobilePage(context);
		await page.goto(url, { timeout: 60_000, waitUntil: 'commit' });
		if (kind === 'returning') {
			// No banner: the hero's LCP and both gated scripts, which the
			// stored Accept lets run without a tap.
			await page.waitForFunction(
				(categories) => {
					const observations = (
						window as unknown as {
							__c15tGate?: { observations: GateObservations };
						}
					).__c15tGate?.observations;
					return Boolean(
						observations?.heroComplete &&
						observations.lcpElementId === 'primary-content' &&
						categories.every((category) =>
							observations.scripts.some(
								(script) => script.category === category
							)
						)
					);
				},
				[...gateAcceptCategories],
				{ polling: 50, timeout: 45_000 }
			);
			await page.waitForTimeout(PAINT_GRACE_MS);
			return await readObservations(page);
		}
		if (kind === 'control' || kind === 'load') {
			// The hero is the page's largest element, so its LCP entry is final.
			await page.waitForFunction(
				(needsBanner) => {
					const observations = (
						window as unknown as {
							__c15tGate?: { observations: GateObservations };
						}
					).__c15tGate?.observations;
					return Boolean(
						observations?.heroComplete &&
						observations.lcpElementId === 'primary-content' &&
						(!needsBanner || observations.visibleAt !== undefined)
					);
				},
				kind === 'load',
				{ polling: 50, timeout: 45_000 }
			);
			await page.waitForTimeout(PAINT_GRACE_MS);
			return await readObservations(page);
		}
		// CookieBench taps once the declared readiness selector matches.
		await page.waitForSelector(gateSelectors.ready, {
			state: 'attached',
			timeout: 45_000,
		});
		await page.waitForFunction(
			() =>
				(
					window as unknown as {
						__c15tGate?: { observations: GateObservations };
					}
				).__c15tGate?.observations.visibleAt !== undefined,
			undefined,
			{ polling: 50, timeout: 45_000 }
		);
		const selector =
			kind === 'accept' ? gateSelectors.accept : gateSelectors.customize;
		await page.evaluate(
			({ target, action }) =>
				(
					window as unknown as {
						__c15tGate: { arm: (selector: string, action: string) => void };
					}
				).__c15tGate.arm(target, action),
			{ action: kind, target: selector }
		);
		await page
			.locator(selector)
			.first()
			.click({ force: true, noWaitAfter: true, timeout: 15_000 });
		await page.waitForFunction(
			({ action, scripts }) => {
				const observations = (
					window as unknown as {
						__c15tGate?: { observations: GateObservations };
					}
				).__c15tGate?.observations;
				if (!observations) {
					return false;
				}
				return action === 'accept'
					? observations.effectiveAt !== undefined &&
							observations.dismissedAt !== undefined &&
							observations.scripts.length >= scripts
					: observations.preferencesVisibleAt !== undefined;
			},
			{ action: kind, scripts: gateAcceptCategories.length },
			{ polling: 50, timeout: 20_000 }
		);
		await page.waitForTimeout(PAINT_GRACE_MS);
		return await readObservations(page);
	} finally {
		await context.close();
	}
};

/**
 * Warm the server's first-request work (route compilation, module loading,
 * caches) and the proxy with one unthrottled visit of each page before the
 * measured, throttled ones. Every measured visit still starts from a fresh
 * browser context with an empty cache.
 */
const prime = async function prime(
	browser: Browser,
	origin: string,
	paths: { gate: string; control: string }
): Promise<void> {
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		await page.goto(`${origin}${paths.control}`, { waitUntil: 'load' });
		await page.goto(`${origin}${paths.gate}`, { waitUntil: 'load' });
		await page.waitForSelector(gateSelectors.ready, {
			state: 'attached',
			timeout: 30_000,
		});
	} finally {
		await context.close();
	}
};

/** How many times a run replays a change of mind before counting requests. */
const CHANGED_MIND_REPLAYS = 3;

/** How long a visit lets c15t finish writing storage after it settles. */
const STORAGE_SETTLE_MS = 1000;

/** Waits until the gate bridge reports `consent` and at least `scripts` ran. */
const consented = (
	page: Page,
	consent: 'accepted' | 'rejected',
	scripts: number
) =>
	page.waitForFunction(
		({ global, target, count }) => {
			const bridge = (
				window as unknown as Record<
					string,
					{ consent?: string; scripts?: unknown[] } | undefined
				>
			)[global];
			return (
				bridge?.consent === target && (bridge.scripts?.length ?? 0) >= count
			);
		},
		{ count: scripts, global: GATE_STATE_GLOBAL, target: consent },
		{ polling: 50, timeout: 45_000 }
	);

/**
 * The storage of a visitor who accepted on the banner and came back once,
 * at the mobile profile. The return visit matters: c15t may record what it
 * learns there, and a measured visit then starts as a third visit would.
 * Throttled because what a page records can depend on how long its chunks
 * take: unthrottled, a dynamic import can finish before the scripts it
 * would have overlapped start.
 */
const acceptedStorage = async function acceptedStorage(
	browser: Browser,
	url: string
): Promise<StorageState> {
	const context = await mobileContext(browser);
	try {
		const page = await mobilePage(context);
		await page.goto(url, { timeout: 60_000, waitUntil: 'load' });
		await page.waitForSelector(gateSelectors.ready, {
			state: 'attached',
			timeout: 45_000,
		});
		await page.locator(gateSelectors.accept).first().click({ timeout: 15_000 });
		await consented(page, 'accepted', gateAcceptCategories.length);
		await page.waitForTimeout(STORAGE_SETTLE_MS);
		await page.goto(url, { timeout: 60_000, waitUntil: 'load' });
		await consented(page, 'accepted', gateAcceptCategories.length);
		await page.waitForTimeout(STORAGE_SETTLE_MS);
		return await context.storageState();
	} finally {
		await context.close();
	}
};

/**
 * The storage of a visitor who changes their mind: from `accepted`, one
 * more visit, where they open Privacy settings and tap Reject in the
 * dialog, as a real visitor would. Whatever c15t recorded while the
 * accepting visitor's scripts ran stays as that visit left it.
 */
const changedMindStorage = async function changedMindStorage(
	browser: Browser,
	url: string,
	accepted: StorageState
): Promise<StorageState> {
	const context = await mobileContext(browser, accepted);
	try {
		const page = await mobilePage(context);
		await page.goto(url, { timeout: 60_000, waitUntil: 'load' });
		await consented(page, 'accepted', gateAcceptCategories.length);
		await page
			.locator(gateSelectors.preferencesLink)
			.first()
			.click({ timeout: 15_000 });
		await page
			.locator(gateSelectors.preferencesReject)
			.first()
			.click({ timeout: 15_000 });
		// A page may reload after a revocation; wait for the choice on
		// whichever document is current.
		for (let attempt = 0; ; attempt += 1) {
			try {
				// oxlint-disable-next-line no-await-in-loop -- Retries across a reload.
				await page.waitForLoadState('load');
				// oxlint-disable-next-line no-await-in-loop -- Retries across a reload.
				await consented(page, 'rejected', 0);
				break;
			} catch (error) {
				if (attempt >= 2) {
					throw error;
				}
			}
		}
		await page.waitForTimeout(STORAGE_SETTLE_MS);
		return await context.storageState();
	} finally {
		await context.close();
	}
};

/**
 * Reports each request for a gated script on one visit with
 * `storageState` to `onRequest` as it starts, until the page has loaded and
 * c15t has had time to load its engine (`STORAGE_SETTLE_MS * 3` after the
 * page is ready). A request that starts later, such as one behind a later
 * import, is not counted. Reporting as it happens keeps a request seen on
 * an attempt that then fails.
 */
const gatedScriptRequests = async function gatedScriptRequests(
	browser: Browser,
	url: string,
	storageState: StorageState,
	onRequest: () => void
): Promise<void> {
	const context = await mobileContext(browser, storageState);
	try {
		const page = await mobilePage(context);
		page.on('request', (request) => {
			if (new URL(request.url()).pathname === GATE_SCRIPT_PATH) {
				onRequest();
			}
		});
		await page.goto(url, { timeout: 60_000, waitUntil: 'load' });
		await page.waitForSelector(gateSelectors.ready, {
			state: 'attached',
			timeout: 45_000,
		});
		await page.waitForTimeout(STORAGE_SETTLE_MS * 3);
	} finally {
		await context.close();
	}
};

const withRetry = async function withRetry<Value>(
	label: string,
	run: () => Promise<Value>
): Promise<Value> {
	try {
		return await run();
	} catch (error) {
		process.stderr.write(
			`consent gate: ${label} failed once, retrying: ${String(error)}\n`
		);
		return await run();
	}
};

const visitWithRetry = function visitWithRetry(
	browser: Browser,
	url: string,
	kind: VisitKind,
	storageState?: StorageState
): Promise<GateObservations> {
	return withRetry(`${kind} visit to ${url}`, () =>
		visit(browser, url, kind, storageState)
	);
};

const measureIteration = async function measureIteration(
	browser: Browser,
	origin: string,
	paths: { gate: string; control: string },
	index: number,
	accepted: StorageState
): Promise<GateIterationSample> {
	const kinds: VisitKind[] = [
		'control',
		'load',
		'accept',
		'preferences',
		'returning',
	];
	// Alternate the order so a runner that drifts within an iteration does
	// not always penalise the same visit.
	const order = index % 2 === 0 ? kinds : [...kinds].reverse();
	const observed: Partial<Record<VisitKind, GateObservations>> = {};
	for (const kind of order) {
		// oxlint-disable-next-line no-await-in-loop -- Visits must not overlap on one runner.
		observed[kind] = await visitWithRetry(
			browser,
			`${origin}${kind === 'control' ? paths.control : paths.gate}`,
			kind,
			kind === 'returning' ? accepted : undefined
		);
	}
	const { control, load, accept, preferences, returning } = observed as Record<
		VisitKind,
		GateObservations
	>;
	if (
		control.lcp === undefined ||
		load.lcp === undefined ||
		load.visibleAt === undefined ||
		control.fcp === undefined ||
		load.fcp === undefined
	) {
		throw new Error('A load visit finished without LCP, FCP or banner timing');
	}
	if (!preferences.input || preferences.preferencesVisibleAt === undefined) {
		throw new Error('Customize did not open the preferences dialog');
	}
	if (returning.lcp === undefined) {
		throw new Error('A returning visit finished without LCP');
	}
	return {
		bannerVisibleMs: load.visibleAt,
		controlFcpMs: control.fcp,
		controlLcpMs: control.lcp,
		fcpMs: load.fcp,
		lcpMs: load.lcp,
		preferencesVisibleMs:
			preferences.preferencesVisibleAt - preferences.input.at,
		returningLcpMs: returning.lcp,
		returningScriptsMs: returningScripts(returning),
		...acceptMetrics(accept),
	};
};

/** Framework server started for one gate run. */
export interface GateServer {
	origin: string;
	stop: () => Promise<void>;
}

/** How a bench starts its production server for the gate. */
export interface GateServerCommand {
	cwd: string;
	/** Command and arguments, for example `['bun', 'run', 'start']`. */
	command: [string, ...string[]];
	/** Origin the server listens on. */
	origin: string;
	/** Path that answers 2xx once the server is ready. */
	readyPath?: string;
	env?: Record<string, string>;
}

/**
 * Start a bench's production server and wait until it answers.
 *
 * @throws {Error} With the server's output when it exits or never answers.
 */
export const spawnGateServer = async function spawnGateServer(
	options: GateServerCommand
): Promise<GateServer> {
	const [command, ...args] = options.command;
	const child = spawn(command, args, {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let logs = '';
	child.stdout.on('data', (chunk) => {
		logs += String(chunk);
	});
	child.stderr.on('data', (chunk) => {
		logs += String(chunk);
	});
	const stop = async () => {
		if (child.exitCode !== null) {
			return;
		}
		child.kill('SIGTERM');
		for (
			let attempt = 0;
			attempt < 20 && child.exitCode === null;
			attempt += 1
		) {
			// oxlint-disable-next-line no-await-in-loop -- Poll until the server exits.
			await sleep(100);
		}
		if (child.exitCode === null) {
			child.kill('SIGKILL');
		}
	};
	for (let attempt = 0; attempt < 240; attempt += 1) {
		if (child.exitCode !== null) {
			throw new Error(`Gate server exited with ${child.exitCode}:\n${logs}`);
		}
		try {
			// oxlint-disable-next-line no-await-in-loop -- Poll until the server answers.
			const response = await fetch(
				`${options.origin}${options.readyPath ?? '/'}`
			);
			if (response.ok) {
				return { origin: options.origin, stop };
			}
		} catch {
			// Not listening yet.
		}
		// oxlint-disable-next-line no-await-in-loop -- Poll until the server answers.
		await sleep(250);
	}
	await stop();
	throw new Error(`Gate server at ${options.origin} never answered:\n${logs}`);
};

/** What a bench supplies to run the consent gate against its app. */
export interface ConsentGateOptions extends Pick<
	GateProxyOptions,
	'pages' | 'directories' | 'backendPrefix'
> {
	target: ConsentGateTarget;
	/** Result `package`; Nuxt reports as `@inth/vue` like its other results. */
	packageName: string;
	framework: BenchmarkResult['framework'];
	/** Gate page and control page paths on the framework server. */
	paths: { gate: string; control: string };
	/** Port the proxy listens on; each bench uses its own. */
	proxyPort: number;
	/** Start the framework server. Omit when the proxy serves the pages. */
	startServer?: (backendLatencyMs: number) => Promise<GateServer>;
	notes?: string[];
}

const readNumber = (names: string[], fallback: number) => {
	for (const name of names) {
		const value = process.env[name];
		if (value !== undefined && value.trim() !== '') {
			const parsed = Number(value);
			if (!Number.isInteger(parsed) || parsed < 0) {
				throw new Error(`${name} must be a non-negative integer`);
			}
			return parsed;
		}
	}
	return fallback;
};

/**
 * Measure the consent gate for one framework and write its result to
 * `BENCH_OUTPUT_DIR`. Each iteration visits the control page, the gate page
 * to its LCP, the gate page through an Accept tap, the gate page through a
 * Customize tap, and the gate page as a returning visitor who accepted, each
 * in a fresh browser context at CookieBench's mobile profile. Once per run
 * it also counts gated script requests for a visitor who accepted, came
 * back, then rejected.
 *
 * @throws {Error} When a visit fails twice; the gate never drops a sample.
 */
export const runConsentGate = async function runConsentGate(
	options: ConsentGateOptions
): Promise<void> {
	const backendLatencyMs = resolveBenchBackendLatencyMs(
		() => undefined,
		process.env
	);
	const scenario = gateScenarioKey(backendLatencyMs);
	if (
		!isBenchSelected(benchSelectionFromEnv(process.env), GATE_SUITE, scenario)
	) {
		process.stdout.write(`consent gate: ${scenario} not selected, skipping\n`);
		return;
	}
	const iterations = readNumber(
		['C15T_BENCH_ITERATIONS', 'BENCH_ITERATIONS'],
		12
	);
	// Every round primes the server and browser with one unthrottled visit
	// (see `prime`), so throttled warm-up iterations are opt-in.
	const warmups = readNumber(['C15T_BENCH_GATE_WARMUP_ITERATIONS'], 0);
	const outputDir = process.env.BENCH_OUTPUT_DIR ?? `.benchmarks/${GATE_SUITE}`;
	process.env[BENCH_BACKEND_LATENCY_ENV] = `${backendLatencyMs}`;
	const samples: GateIterationSample[] = [];
	let rejectedRequests = Number.NaN;
	const started = Date.now();
	const cleanup: (() => Promise<void>)[] = [];
	let browserVersion = '';
	try {
		const server = await options.startServer?.(backendLatencyMs);
		if (server) {
			cleanup.unshift(server.stop);
		}
		cleanup.unshift(
			await startGateProxy({
				backendLatencyMs,
				backendPrefix: options.backendPrefix,
				directories: options.directories,
				pages: options.pages,
				port: options.proxyPort,
				upstream: server?.origin,
			})
		);
		const browser = await chromium.launch({ headless: true });
		cleanup.unshift(() => browser.close());
		browserVersion = browser.version();
		const origin = `http://127.0.0.1:${options.proxyPort}`;
		await prime(browser, origin, options.paths);
		const gateURL = `${origin}${options.paths.gate}`;
		const accepted = await withRetry('accepting visitor', () =>
			acceptedStorage(browser, gateURL)
		);
		// A leak can depend on timing: replay the change of mind a few times
		// and count every request, so one leaking replay fails the budget.
		rejectedRequests = 0;
		// Every request counts, including one seen on an attempt that then
		// failed and was retried.
		const countRequest = () => {
			rejectedRequests += 1;
		};
		for (let replay = 0; replay < CHANGED_MIND_REPLAYS; replay += 1) {
			// oxlint-disable-next-line no-await-in-loop -- Replays must not overlap on one runner.
			const changedMind = await withRetry('changed-mind visitor', () =>
				changedMindStorage(browser, gateURL, accepted)
			);
			// oxlint-disable-next-line no-await-in-loop -- Replays must not overlap on one runner.
			await withRetry('changed-mind visit', () =>
				gatedScriptRequests(browser, gateURL, changedMind, countRequest)
			);
		}
		process.stdout.write(
			`consent gate ${options.target}: ${rejectedRequests} gated script requests after a reject\n`
		);
		for (let index = 0; index < warmups + iterations; index += 1) {
			// oxlint-disable-next-line no-await-in-loop -- Iterations must not overlap on one runner.
			const sample = await measureIteration(
				browser,
				origin,
				options.paths,
				index,
				accepted
			);
			if (index >= warmups) {
				samples.push(sample);
			}
			process.stdout.write(
				`consent gate ${options.target}: ${index < warmups ? 'warmup' : 'iteration'} ${index < warmups ? index + 1 : index - warmups + 1}: lcp Δ ${(sample.lcpMs - sample.controlLcpMs).toFixed(0)} ms, banner ${sample.bannerVisibleMs.toFixed(0)} ms, effective ${sample.consentEffectiveMs.toFixed(0)} ms, scripts ${sample.scriptsCompleteMs.toFixed(0)} ms, preferences ${sample.preferencesVisibleMs.toFixed(0)} ms, returning lcp Δ ${(sample.returningLcpMs - sample.controlLcpMs).toFixed(0)} ms, returning scripts ${sample.returningScriptsMs.toFixed(0)} ms\n`
			);
		}
	} finally {
		// Browser, then proxy, then server, even when one of them failed to start.
		for (const stop of cleanup) {
			// oxlint-disable-next-line no-await-in-loop -- Shut down in order.
			await stop().catch((error: unknown) => {
				process.stderr.write(
					`consent gate: cleanup failed: ${String(error)}\n`
				);
			});
		}
	}
	const result: BenchmarkResult = {
		baseSha: safeBaseSha(),
		budgetDefinitions: consentGateBudgets(options.target),
		budgets: [],
		commitSha: safeCommitSha(),
		environment: getEnvironment(browserVersion),
		fixture: {
			consentCount: gateAcceptCategories.length + 1,
			localeCount: 1,
			name: 'consent-gate-article',
			notes: Object.entries(gateMetricGlossary).map(
				([name, description]) => `${name}: ${description}`
			),
			scriptCount: gateAcceptCategories.length,
			themeComplexity: 'minimal',
		},
		framework: options.framework,
		metadata: {
			backendLatencyMs,
			gitDirty: safeGitDirty(),
			iterations,
			profile: cookieBenchMobileProfile.id,
			target: options.target,
			wallMs: Date.now() - started,
			warmups,
		},
		metrics: [
			...summarizeGateSamples(samples),
			summarizeMetric('rejectedScriptRequests', 'count', [rejectedRequests]),
		],
		notes: options.notes ?? [],
		package: options.packageName,
		runtime: 'chromium',
		scenario,
		schemaVersion: BENCHMARK_SCHEMA_VERSION,
		suite: GATE_SUITE,
		timestamp: new Date().toISOString(),
	};
	writeJson(join(outputDir, `${options.target}.json`), result);
	process.stdout.write(
		`consent gate ${options.target}: ${iterations} iterations in ${((Date.now() - started) / 1000).toFixed(0)} s\n`
	);
};
