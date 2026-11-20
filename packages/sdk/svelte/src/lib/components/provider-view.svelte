<!--
	@component
	The provider's state, context and markup, around a runtime it is
	handed. `InthProvider` from `@inth/svelte` hands it the engine it creates
	(or the one it was given); the one from `@inth/svelte/kit` hands it the
	server's engine, and in the browser the deferred runtime that stands in
	for the engine until it loads (`../deferred/runtime.ts`). Both render through this component, so
	the browser hydrates the server's markup whichever one it got.

	@internal
-->
<script lang="ts">
	import type { ConsentKernel, ConsentSnapshot } from '@inth/sdk/engine';
	import {
		applyExperimentAssignment,
		applyExperimentTheme,
		IABUnavailableError,
		policyNeedsIAB,
	} from '@inth/sdk/engine';
	import type { IABHandle } from '@inth/sdk/iab';
	import type {
		createPreferenceDraft,
		PreferenceDraft,
		PreferenceDraftState,
	} from '@inth/sdk/preference-draft';
	import type {
		ConsentProviderRuntime,
		ConsentRuntime,
	} from '@inth/sdk/runtime/provider';
	import { iabSurfaceActions } from '@inth/sdk/surface-state';
	import { warnOnUnappliedThemeTokens } from '@inth/sdk/ui/theme';
	import {
		prefersReducedMotion,
		setupColorScheme,
		subscribeReducedMotion,
	} from '@inth/sdk/ui/utils';
	import { BROWSER, DEV } from 'esm-env';
	import type { Snippet } from 'svelte';
	import { onDestroy, onMount, untrack } from 'svelte';

	import { setConsentContext, setThemeContext } from '../context.svelte';
	import type { ConsentDraftState, SvelteIABState } from '../context.svelte';
	import { isIABConfigured } from '../iab-loader';
	import { runtimeOptionsFor } from '../provider-options';
	import type { ProviderOptionsInput } from '../provider-options';
	import { startOnServer } from '../server-script-start';

	interface ProviderViewProps {
		children?: Snippet;
		/** The provider's resolved options. */
		options: ProviderOptionsInput;
		runtime: ConsentRuntime;
		/**
		 * The same runtime when the provider owns it: this component starts,
		 * updates and disposes it. Absent for a borrowed runtime.
		 */
		owned?: ConsentProviderRuntime;
		/** `<meta name="inth-modulepreload">` content, or `''`. */
		preloadMarker: string;
		/**
		 * HTML rendered after the children: the boot data the SvelteKit
		 * `InthProvider` leaves for the browser, else `''`.
		 */
		boot?: string;
	}

	let props: ProviderViewProps = $props();

	const children = $derived(props.children);
	const options = $derived(props.options);
	const runtimeOptions = () => runtimeOptionsFor(options);

	// The runtime owns the kernel and every side-effecting module. When it
	// is borrowed, its owner is also responsible for `start()`/`dispose()`.
	const runtime = untrack(() => props.runtime);
	const ownedRuntime = untrack(() => props.owned);
	const ownsRuntime = ownedRuntime !== undefined;
	const preloadMarker = untrack(() => props.preloadMarker);
	const boot = untrack(() => props.boot ?? '');
	// When the visitor's consent already lets some `scripts` run, the
	// server render starts them from the HTML, before hydration:
	// `inthHandle` adds a `<script>` for them at the end of `<body>`, and the
	// loader adopts the tags.
	if (
		ownsRuntime &&
		!BROWSER &&
		untrack(() => Boolean(options.scripts?.length))
	) {
		untrack(() =>
			startOnServer(options as Parameters<typeof startOnServer>[0])
		);
	}
	// The runtime validated and assigned from the experiment it was created
	// with (the server's, else `options.experiment`), so presentation, theme
	// and draft defaults resolve against that same definition; a later
	// `options.experiment` is ignored.
	const { experiment } = runtime;

	// The rendered kernel. An owned runtime swaps it when `enabled` toggles.
	const initialKernel = runtime.kernel;
	let kernel = $state.raw<ConsentKernel>(initialKernel);
	let snapshot = $state<ConsentSnapshot>(initialKernel.getSnapshot());

	/** Presentation defaults of the arm this visitor runs. */
	const draftDefaults = () =>
		applyExperimentAssignment(
			options.presentation,
			experiment,
			snapshot.experiment
		)?.preferences?.defaults;
	// One draft per provider, so the headless state API and the dialog stage
	// into the same one. It follows the rendered kernel.
	//
	// `@inth/sdk/preference-draft` is not on first load. `ConsentWidget`
	// (and so the dialog chunk) imports it and hands it over while it
	// renders, on the server too. Without one, the first read or write of
	// the draft loads it; until it lands, `values` and `vendors` are empty,
	// `isStale` is `false`, and writes wait in order for it.
	type CreatePreferenceDraft = typeof createPreferenceDraft;
	const EMPTY: Readonly<Record<string, boolean>> = Object.freeze({});
	let createDraft: CreatePreferenceDraft | null = null;
	let preferenceDraft: PreferenceDraft | null = null;
	let draftState = $state.raw<PreferenceDraftState | null>(null);
	let stopDraft = () => {
		/* no draft yet */
	};
	let waiting: ((draft: PreferenceDraft) => void)[] = [];
	let draftLoad: Promise<PreferenceDraft> | undefined;

	const startDraft = function startDraft(next: ConsentKernel): PreferenceDraft {
		stopDraft();
		const started = (createDraft as CreatePreferenceDraft)(next, {
			defaults: untrack(draftDefaults),
		});
		preferenceDraft = started;
		draftState = started.getState();
		stopDraft = started.subscribe(() => {
			draftState = started.getState();
		});
		return started;
	};
	const provideDraft = function provideDraft(
		create: CreatePreferenceDraft
	): PreferenceDraft {
		if (preferenceDraft) {
			return preferenceDraft;
		}
		createDraft = create;
		const started = startDraft(kernel);
		for (const apply of waiting.splice(0)) {
			apply(started);
		}
		return started;
	};
	const importDraft = async function importDraft(): Promise<PreferenceDraft> {
		try {
			const module = await import('@inth/sdk/preference-draft');
			return provideDraft(module.createPreferenceDraft);
		} catch (error) {
			// The next read or write retries.
			draftLoad = undefined;
			throw error;
		}
	};
	const loadDraft = function loadDraft(): Promise<PreferenceDraft> {
		if (preferenceDraft) {
			return Promise.resolve(preferenceDraft);
		}
		draftLoad ??= importDraft();
		return draftLoad;
	};
	/** Load the draft for a read; the read is reactive and fills in. */
	const requestDraft = async function requestDraft(): Promise<void> {
		if (preferenceDraft || typeof window === 'undefined') {
			return;
		}
		try {
			await loadDraft();
		} catch {
			/* retried on the next read or write */
		}
	};
	const withDraft = function withDraft(
		apply: (draft: PreferenceDraft) => void
	): void {
		if (preferenceDraft) {
			apply(preferenceDraft);
			return;
		}
		waiting.push(apply);
		void requestDraft();
	};
	const followDraft = (next: ConsentKernel) => {
		if (createDraft) {
			startDraft(next);
		}
	};
	$effect(() => {
		const defaults = draftDefaults();
		preferenceDraft?.setDefaults(defaults);
	});
	let iabHandle = $state<IABHandle | null>(
		untrack(() => runtime.iab as IABHandle | null)
	);
	let iabTab = $state<'purposes' | 'vendors'>('purposes');

	const draft: ConsentDraftState = {
		get isStale() {
			void requestDraft();
			return draftState?.isStale ?? false;
		},
		reset() {
			// Nothing is staged before the draft exists but the waiting writes.
			waiting = [];
			preferenceDraft?.reset();
		},
		async save(categories) {
			// A loaded draft records in this task, so the surface closes in the
			// click task.
			const current = preferenceDraft ?? (await loadDraft());
			if (current.getState().isStale) {
				throw new Error(
					'The policy changed. Review your preferences before saving.'
				);
			}
			const result = await current.save({ categories });
			if (!result.ok) {
				throw new Error('Unable to save preferences.');
			}
		},
		saveBulk(input) {
			if (preferenceDraft) {
				return preferenceDraft.save({ input });
			}
			waiting = [];
			return kernel.commands.save(input);
		},
		set(name, value) {
			withDraft((current) => current.set(name, value));
		},
		setVendor(vendorId, granted) {
			withDraft((current) => current.setVendor(vendorId, granted));
		},
		get values() {
			void requestDraft();
			return draftState?.values ?? EMPTY;
		},
		get vendors() {
			void requestDraft();
			return draftState?.vendors ?? EMPTY;
		},
	};

	const getIABState = function getIABState(): SvelteIABState | null {
		const { iab } = snapshot;
		if (!iab) {
			return null;
		}
		// Rendering keys on the kernel state so a server-resolved GVL puts the
		// IAB surfaces in the first HTML. Until `@inth/sdk/iab` lands the lazy
		// handle queues calls and replays them, so an early Accept still
		// records consent; without any handle the actions are no-ops.
		return {
			...iab,
			...iabSurfaceActions(iabHandle),
			config: {
				cmpId: iab.cmpId,
				enabled: iab.enabled,
			},
			isLoadingGVL: iab.enabled && !iab.gvl,
			nonIABVendors: iab.customVendors,
			preferenceCenterTab: iabTab,
			setPreferenceCenterTab(tab) {
				iabTab = tab;
			},
		};
	};

	setConsentContext(() => kernel, {
		clearRecords: () => runtime.clearRecords(),
		// The draft's displayed categories, without loading the draft: the
		// runtime applies the same display-order rule. Reading `snapshot`
		// re-runs a reactive reader when the policy changes.
		getConsentCategories: () => {
			void snapshot;
			return runtime.consentCategories;
		},
		getDraft: () => draft,
		getExperiment: () => experiment,
		getIAB: getIABState,
		getLegalLinks: () => options.legalLinks,
		getPresentation: () => options.presentation,
		getSnapshot: () => snapshot,
		getTheme: () => options.theme,
		provideDraft,
		runtime,
		setLanguage: (code) => runtime.setLanguage(code),
	});

	let unsubscribe = initialKernel.subscribe((next) => {
		snapshot = next;
	});

	// IAB is opt-in. Without `iab` no CMP answers for an `iab` policy, and
	// the standard banner does not handle it, so the visitor would get no
	// consent UI. Throw from the render instead, on the server and in the
	// browser. A borrowed runtime's owner configures IAB, not this provider.
	const iabUnavailable = $derived(
		ownsRuntime && !isIABConfigured(options.iab) && policyNeedsIAB(snapshot)
	);
	const throwIABUnavailable = function throwIABUnavailable(): never {
		throw new IABUnavailableError(
			'`iab` is not set',
			'Set `iab` on <InthProvider> and render <IABConsentBanner>'
		);
	};

	// The lazy handle queues calls until `@inth/sdk/iab` lands and replays them,
	// so the surfaces render against it as soon as it exists.
	const unsubscribeIAB = runtime.subscribe(() => {
		iabHandle = runtime.iab as IABHandle | null;
	});
	// Turning `enabled` off renders a permissive kernel; follow it.
	const unsubscribeRuntime = ownedRuntime?.subscribe(() => {
		if (ownedRuntime.kernel === kernel) {
			return;
		}
		unsubscribe();
		({ kernel } = ownedRuntime);
		snapshot = kernel.getSnapshot();
		followDraft(kernel);
		unsubscribe = kernel.subscribe((next) => {
			snapshot = next;
		});
	});

	onMount(() => {
		if (!ownsRuntime) {
			return;
		}
		runtime.start();
		snapshot = kernel.getSnapshot();
		return () => {
			// Drop the IAB listener first: disposing the runtime emits a
			// final `null` and this component is already tearing down.
			unsubscribeIAB();
			runtime.dispose();
		};
	});

	// The runtime compares the new options with the last ones and applies
	// only what changed, so a theme-only change identifies nobody and asks
	// the backend nothing.
	$effect(() => {
		// It rejects when its chunk fails to load. Requests held for new rules
		// have failed closed by then, and the next update loads it again.
		// oxlint-disable-next-line promise/prefer-await-to-then -- An effect cannot await, and it must read the options synchronously to track them.
		ownedRuntime?.update(runtimeOptions()).catch(() => undefined);
	});

	// A borrowed runtime belongs to its owner, who configures it; categories
	// the provider names are still offered.
	const consentCategoriesOption = $derived(options.consentCategories);
	$effect(() => {
		if (!ownsRuntime && consentCategoriesOption) {
			runtime.setConsentCategories(consentCategoriesOption);
		}
	});

	let reducedMotion = $state(false);

	onMount(() => {
		reducedMotion = prefersReducedMotion();
		return subscribeReducedMotion((reduced) => {
			reducedMotion = reduced;
		});
	});

	// The arm's theme overrides ride on the host theme, so the injected
	// tokens and the theme context both follow the assignment.
	const userTheme = $derived(
		applyExperimentTheme(options.theme, experiment, snapshot.experiment)
	);

	// Development only. Tokens need `generateThemeCSS` output in the page.
	$effect(() => {
		if (DEV) {
			warnOnUnappliedThemeTokens(
				userTheme,
				document,
				'Put the --inth-* variables, or the CSS from generateThemeCSS(theme), in your stylesheet and drop the tokens from `theme`. See https://c15t.com/docs/frameworks/sveltekit/quickstart'
			);
		}
	});

	setThemeContext({
		get colorScheme() {
			return options.colorScheme;
		},
		get disableAnimation() {
			return options.disableAnimation ?? reducedMotion;
		},
		get legalLinks() {
			return options.legalLinks;
		},
		get noStyle() {
			return options.noStyle;
		},
		get nonce() {
			return options.nonce;
		},
		get preloadDialog() {
			return options.preloadDialog;
		},
		get scrollLock() {
			return options.scrollLock;
		},
		get styles() {
			return options.styles;
		},
		get theme() {
			return userTheme;
		},
		get trapFocus() {
			return options.trapFocus;
		},
	});

	// Unset mirrors a `dark` class on `<html>`, as in React and Vue. `null`
	// leaves `inth-dark` to the site, or to a host that owns the class, such
	// as the Astro page runtime behind a dialog island.
	$effect(() => setupColorScheme(options.colorScheme));

	onDestroy(() => {
		unsubscribe();
		unsubscribeIAB();
		unsubscribeRuntime?.();
		stopDraft();
	});
</script>

<svelte:head>
	{#if preloadMarker}
		<meta
			name="inth-modulepreload"
			content={preloadMarker}
		/>
	{/if}
</svelte:head>

{#if iabUnavailable}
	{throwIABUnavailable()}
{:else if children}
	{@render children()}
{/if}
{@html boot}
