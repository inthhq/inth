<script
	lang="ts"
	module
>
	/** The "Saved" cue stays this long, on a timer, not an animation (MOT-03). */
	const CUE_MS = 1700;
	/** A closing sheet animates out this long, inert (NEST-03). */
	const SHEET_EXIT_MS = 160;
	/** The opener key of the Preferences row. */
	const PREFERENCES_OPENER = 'preferences';
	const PREFERENCES_SHEET = 'preferences';
	const VENDOR_SHEET_PREFIX = 'vendors:';
	/** How many frames to wait for a returning banner, which may still be loading. */
	const BANNER_RETURN_FRAMES = 60;
	/** Where focus goes when the dialog's opener is gone (FOC-03). */
	const RETURN_TARGETS = [
		'[data-testid="privacy-choices-link"]',
		'[data-testid="consent-dialog-trigger"]',
	];

	/** Focus the banner card once it renders again. */
	const focusReturningBanner = function focusReturningBanner(): void {
		let frames = 0;
		const attempt = () => {
			const card = document.querySelector<HTMLElement>(
				'[data-testid="consent-banner-card"]'
			);
			if (card) {
				card.focus({ preventScroll: true });
				return;
			}
			frames += 1;
			if (frames < BANNER_RETURN_FRAMES) {
				requestAnimationFrame(attempt);
			}
		};
		requestAnimationFrame(attempt);
	};

	/** The sheet showing, kept while it animates out. */
	interface ShownSheet {
		id: string;
		closing: boolean;
	}
</script>

<script lang="ts">
	/**
	 * The "Your Privacy Choices" dialog: one column whose body is the
	 * only scroller, the statutory rights on its first view, the receipt,
	 * and Preferences; in the EU, the cookie categories and a staged Save.
	 * On phone, Preferences and EU vendor lists open as nested sheets, at
	 * most two layers; desktop uses accordions only.
	 *
	 * It has its own preference draft, so the EU's switches stay staged
	 * until Save (EU-02) and the US's apply one by one.
	 */
	import {
		commitDialogChoice,
		MAIN_LAYER,
		resolveConsentPresentation,
		resolveSaleRight,
	} from '@inth/sdk/engine';
	import type {
		AllConsentNames,
		BannerCommitAction,
		LegalLinks,
		Model,
	} from '@inth/sdk/engine';
	import { createPreferenceDraft } from '@inth/sdk/preference-draft';
	import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
	import { showConsentSurface } from '@inth/sdk/surface-actions';
	import {
		announcementText,
		resolveCategoryTitle,
		resolvePreferencesRowCopy,
		resolvePrivacyChoicesDialogCopy,
		resolvePrivacyChoicesRegime,
		resolveVendorTableCopy,
	} from '@inth/sdk/surface-state';
	import {
		attachBackdropGuard,
		attachPageBlock,
		attachScrollFades,
		attachTopLayerTrap,
		revealDisclosure,
		scheduleReveal,
	} from '@inth/sdk/ui/primitives/surface';
	import styles from '@inth/sdk/ui/styles/components/consent-dialog';
	import { resolveActionAppearance } from '@inth/sdk/ui/theme';
	import { resolveLegalLinkEntries } from '@inth/sdk/ui/utils';
	import { getTextDirection } from '@inth/sdk/ui/utils/text-direction';
	import { untrack } from 'svelte';

	import { getConsentContext, getThemeContext } from '../../context.svelte';
	import ConsentButton from '../action-button.svelte';
	import AdvertisingRow from '../parts/advertising-row.svelte';
	import CategoryGroup from '../parts/category-group.svelte';
	import { createSurfaceDraft } from '../parts/draft.svelte';
	import Icon from '../parts/icon.svelte';
	import { cx, part } from '../parts/parts';
	import { takeReceiptFocus } from '../parts/receipt-focus';
	import RightsReceipt from '../parts/receipt.svelte';
	import SaleRightsRow from '../parts/rights-row.svelte';
	import {
		usePhoneLayout,
		useReducedMotion,
		useSurfaceSession,
	} from '../parts/session.svelte';
	import SurfaceStyles from '../surface-styles.svelte';
	import DoneButton from './done-button.svelte';
	import Layer from './layer.svelte';
	import { DIALOG_SHEETS } from './sheets';

	let {
		noStyle: localNoStyle,
		disableAnimation: localDisableAnimation,
		open: openProp,
		models,
		legalLinks: allowedLegalLinks,
	}: {
		noStyle?: boolean;
		disableAnimation?: boolean;
		/**
		 * Control the open state. `true` (through `ConsentDialog`, which
		 * holds the request) asks the consent manager to show the dialog, so the banner leaves and sheets, Escape and the receipt work
		 * as for any open dialog; Close and Escape then close it through the
		 * consent manager, and `open` must turn `false` and back to `true` to
		 * ask again. `false` hides it whatever the consent manager shows, and
		 * turning it `false` while the dialog shows closes it through the
		 * consent manager, as Close does.
		 * Omitted, it follows `activeUI === 'dialog'`.
		 */
		open?: boolean;
		models?: Model[];
		/**
		 * Which legal link the footer may show: the Cookie Policy for the EU,
		 * the Privacy Policy for the US. `undefined` shows it, `null` hides
		 * it, and a list shows it only when its key is in the list.
		 */
		legalLinks?: (keyof LegalLinks)[] | null;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();
	const surface = useSurfaceSession();
	const phoneLayout = usePhoneLayout();
	const systemMotion = useReducedMotion();
	const surfaceDraft = createSurfaceDraft();
	surfaceDraft.provide(createPreferenceDraft);
	const uid = $props.id();
	const prefix = `inth-pcd-${uid}`;
	const saveSource = 'dialog';

	const noStyle = $derived(localNoStyle ?? theme.noStyle ?? false);
	// The component's own setting wins over the provider's.
	const animationOff = $derived(
		localDisableAnimation ?? theme.disableAnimation ?? false
	);
	// Sheets leave at once under the system setting too, as in React.
	const reducedMotion = $derived(animationOff || systemMotion.reduced);
	const snapshot = $derived(consent.snapshot);
	const translations = $derived(consent.state.copy);
	const phone = $derived(phoneLayout.phone);
	// The model and the US markers decide the body, never the prompt: an EU
	// opt-in policy that shows no banner still gets the EU dialog.
	const eu = $derived(
		resolvePrivacyChoicesRegime(snapshot.policyRule) === 'eu'
	);
	const activeUI = $derived(snapshot.activeUI ?? 'none');
	const model = $derived(consent.state.model);
	const modelAllowed = $derived(!models || models.includes(model));
	const textDirection = $derived(
		getTextDirection(consent.state.translations?.language)
	);
	// `ConsentDialog`, which outlives this component, asks the consent
	// manager to show the dialog when a controlled `open` turns true.
	const open = $derived(
		openProp !== false &&
			activeUI === 'dialog' &&
			consent.state.hasConsentUi &&
			modelAllowed
	);
	// A controlled `open` turning false closes a shown dialog through the
	// consent manager, as Close does, so an unanswered banner comes back and
	// no sheet stays pushed under a hidden dialog.
	let shown = false;
	$effect.pre(() => {
		const wasShown = shown;
		shown = open;
		if (!wasShown || openProp !== false) {
			return;
		}
		const { kernel } = consent;
		untrack(() => {
			if (kernel.getSnapshot().activeUI !== 'dialog') {
				return;
			}
			showConsentSurface(kernel, 'none');
			if (kernel.getSnapshot().activeUI === 'banner') {
				focusReturningBanner();
			}
		});
	});
	// Phone sheets take the prompt's resolved phone edge style, which the
	// policy and a Card's own rule (always inset) have already settled.
	const edgeStyle = $derived(
		resolveConsentPresentation({
			policy: snapshot.policyRule,
			presentation: consent.state.presentation,
			surface: 'prompt',
		}).container?.phone.edgeStyle ?? 'inset'
	);
	const copy = $derived(resolvePrivacyChoicesDialogCopy(translations, { eu }));
	const sale = $derived(resolveSaleRight(snapshot));
	const gpcLocked = $derived(sale.available && sale.lock === 'gpc-active');
	const hasChanges = $derived(surfaceDraft.state?.hasEffectiveChanges ?? false);

	let backdropEl = $state<HTMLDivElement | null>(null);
	let mainEl = $state<HTMLElement | null>(null);
	let mainTitleEl = $state<HTMLHeadingElement | null>(null);
	let bodyEl = $state<HTMLDivElement | null>(null);
	let sheetEl = $state<HTMLElement | null>(null);
	let sheetTitleEl = $state<HTMLHeadingElement | null>(null);
	let sheetBodyEl = $state<HTMLDivElement | null>(null);
	let preferencesTriggerEl = $state<HTMLButtonElement | null>(null);
	let preferencesPanelEl = $state<HTMLDivElement | null>(null);
	let opener: Element | null = null;
	let preferencesOpen = $state(false);

	// The "Saved" cue beside Done, replayed on every change (SR-07, MOT-03).
	let cue = $state(0);
	let cueCount = 0;
	const showCue = function showCue() {
		cueCount += 1;
		cue = cueCount;
	};
	$effect(() => {
		if (cue === 0) {
			return;
		}
		const timer = setTimeout(() => {
			cue = 0;
		}, CUE_MS);
		return () => clearTimeout(timer);
	});

	// The sheet on top, kept for its exit while it animates out (NEST-03).
	const topSheet = $derived(
		surface.state.sheets[surface.state.sheets.length - 1] ?? null
	);
	let shownSheet = $state.raw<ShownSheet | null>(null);
	// Nothing is left to animate under reduced motion, on desktop or in a
	// closed dialog, so a sheet leaves at once there (NEST-06).
	const exitsAtOnce = $derived(reducedMotion || !phone || !open);
	$effect.pre(() => {
		const top = topSheet;
		const atOnce = exitsAtOnce;
		untrack(() => {
			if (top && (shownSheet?.id !== top.id || shownSheet.closing)) {
				// A sheet reopened while it animates out shows again at once,
				// and its exit timer goes with the closing state (NEST-03).
				shownSheet = { closing: false, id: top.id };
			} else if (!top && shownSheet && (atOnce || !shownSheet.closing)) {
				shownSheet = atOnce ? null : { ...shownSheet, closing: true };
			}
		});
	});
	$effect(() => {
		const exiting = shownSheet?.closing ? shownSheet : null;
		if (!exiting) {
			return;
		}
		// Clears only the exit it was set for, never a sheet shown since.
		const timer = setTimeout(() => {
			if (shownSheet === exiting) {
				shownSheet = null;
			}
		}, SHEET_EXIT_MS);
		return () => clearTimeout(timer);
	});
	const sheetOpen = $derived(Boolean(shownSheet && !shownSheet.closing));

	// Keep the draft in step with the dialog: unsaved EU edits are dropped
	// whenever it closes (EU-02).
	$effect(() => {
		const { draft } = surfaceDraft;
		if (draft) {
			return surface.session.attachDraft(draft);
		}
	});

	// Desktop never nests, and a viewport change drops open sheets
	// (NEST-01, NEST-06).
	$effect(() => {
		if (!phone && surface.state.sheets.length > 0) {
			untrack(() => surface.session.popSheet());
		}
	});

	// Open: the page is inert, focus moves to the title and is trapped in
	// the top layer, and returns to the opener on close (FOC-01..03).
	$effect(() => {
		const backdrop = backdropEl;
		const main = mainEl;
		if (!(open && backdrop && main)) {
			return;
		}
		return untrack(() => {
			opener = document.activeElement;
			const { kernel } = consent;
			const release = attachPageBlock(backdrop);
			// Back from an opt-out (after its revocation reload, or from a
			// one-click opt-out link), the dialog opens on the receipt that
			// confirms it.
			const receipt = takeReceiptFocus(kernel)
				? main.querySelector<HTMLElement>(
						'[data-testid="consent-dialog-receipt"][data-open="true"]'
					)
				: null;
			const untrap = attachTopLayerTrap(main, {
				initialFocus: receipt ?? mainTitleEl,
				returnFocus: () => {
					const target = opener;
					opener = null;
					// Closing without a decision brings the banner back; focus
					// moves to it once it renders (BNR-05, FOC-03).
					if (kernel.getSnapshot().activeUI === 'banner') {
						focusReturningBanner();
					}
					if (target instanceof HTMLElement && target.isConnected) {
						return target;
					}
					for (const selector of RETURN_TARGETS) {
						const fallback = document.querySelector<HTMLElement>(selector);
						if (fallback) {
							return fallback;
						}
					}
					return null;
				},
			});
			return () => {
				// Release the page first: focus can't return to an inert opener.
				release();
				untrap();
			};
		});
	});

	// A sheet is the top layer while it shows: it holds focus, and closing
	// it returns focus to the row that opened it (NEST-04).
	$effect(() => {
		const sheet = sheetEl;
		if (!(open && sheetOpen && sheet)) {
			return;
		}
		return untrack(() => {
			const { sheets } = surface.session.getState();
			const openerKey = sheets[sheets.length - 1]?.opener ?? '';
			return attachTopLayerTrap(sheet, {
				initialFocus: sheetTitleEl,
				returnFocus: () =>
					mainEl?.querySelector<HTMLElement>(`[data-opener="${openerKey}"]`) ??
					mainTitleEl,
			});
		});
	});

	// Escape: the top sheet, then an open confirmation, then the dialog
	// (FOC-04).
	$effect(() => {
		if (!open) {
			return;
		}
		const { session } = surface;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || event.defaultPrevented) {
				return;
			}
			const outcome = session.escape({ blocking: true, focusInside: true });
			if (outcome !== 'ignore') {
				event.preventDefault();
			}
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	});

	// A tap on the dimmed parent closes only the sheet, and the tap's click
	// never lands on what is under it (NEST-04, NEST-05).
	$effect(() => {
		const backdrop = backdropEl;
		if (!(open && backdrop)) {
			return;
		}
		const { session } = surface;
		return attachBackdropGuard(backdrop, {
			isBackdrop: (target) =>
				session.getState().sheets.length > 0 &&
				!(sheetEl?.contains(target) ?? false),
			onBackdrop: () => {
				session.popSheet();
			},
		});
	});

	// Scroll-edge fades on each body (LAY-08).
	$effect(() => {
		const body = bodyEl;
		if (!(open && body)) {
			return;
		}
		return attachScrollFades(body);
	});
	$effect(() => {
		const body = sheetBodyEl;
		if (!(open && shownSheet && body)) {
			return;
		}
		return attachScrollFades(body);
	});

	// Opening Preferences reveals as much of it as fits without scrolling
	// its row out (LAY-05).
	$effect(() => {
		if (!(open && preferencesOpen)) {
			return;
		}
		return untrack(() => {
			const { session } = surface;
			const { token } = session.getState();
			return scheduleReveal(
				() => {
					const trigger = preferencesTriggerEl;
					const panel = preferencesPanelEl;
					if (trigger && panel) {
						revealDisclosure(trigger, panel, { body: bodyEl });
					}
				},
				{ isCurrent: () => session.isCurrent(token) }
			);
		});
	});

	// A closed dialog starts over: Preferences folded.
	$effect.pre(() => {
		if (!open) {
			untrack(() => {
				preferencesOpen = false;
			});
		}
	});

	const close = () => showConsentSurface(consent.kernel, 'none');
	const popSheet = () => {
		surface.session.popSheet();
	};
	const pushSheet = (sheet: string, openerKey: string) => {
		surface.session.pushSheet(sheet, openerKey);
	};
	const commit = (action: BannerCommitAction) => {
		commitDialogChoice(consent.kernel, action, {
			draft: surfaceDraft.draft ?? undefined,
			uiSource: saveSource,
		});
	};

	// The footer shows the regime's one link; `legalLinks` may hide it.
	const legalKey = $derived(eu ? 'cookiePolicy' : 'privacyPolicy');
	const legal = $derived(
		resolveLegalLinkEntries(
			consent.state.legalLinks,
			allowedLegalLinks === undefined
				? [legalKey]
				: (allowedLegalLinks?.filter((key) => key === legalKey) ?? []),
			translations.legalLinks
		)[0]
	);
	const saleCategory = $derived(sale.category);
	const usExclude: AllConsentNames[] = $derived(
		saleCategory ? [saleCategory] : []
	);
	const preferencesCount = $derived(
		(surfaceDraft.state?.displayedCategories ?? []).filter(
			(name) =>
				name !== 'necessary' &&
				name !== saleCategory &&
				surfaceDraft.state?.values[name]
		).length
	);
	const preferencesCopy = $derived(
		resolvePreferencesRowCopy(translations, preferencesCount)
	);
	const preferencesPanelId = `${prefix}-preferences`;
	const preferencesRowPart = $derived(
		part('consentDialogPreferencesRow', theme.theme, styles.navRow, noStyle)
	);
	// The dialog root takes the `consentDialog` slot.
	const backdropPart = $derived(
		part('consentDialog', theme.theme, styles.backdrop, noStyle)
	);

	const vendorCategory = $derived(
		shownSheet?.id.startsWith(VENDOR_SHEET_PREFIX)
			? (shownSheet.id.slice(VENDOR_SHEET_PREFIX.length) as AllConsentNames)
			: null
	);
	const vendorSheetCopy = $derived(
		vendorCategory
			? resolveVendorTableCopy(translations, {
					category: resolveCategoryTitle(translations, vendorCategory),
					count: 0,
					onCount: 0,
					open: true,
				})
			: null
	);
	const sheetStatus = $derived(
		shownSheet &&
			surface.state.announcement &&
			surface.state.announcement.layer === shownSheet.id
			? announcementText(surface.state.announcement)
			: ''
	);
	const mainStatus = $derived(
		surface.state.announcement?.layer === MAIN_LAYER &&
			surface.state.sheets.length === 0
			? announcementText(surface.state.announcement)
			: ''
	);
	// The GPC note replaces the intro, never both (LAY-04).
	const intro = $derived(!eu && gpcLocked ? null : copy.intro);
	const appearance = (key: 'reject' | 'accept' | 'save', primary: boolean) =>
		resolveActionAppearance(theme.theme, key, primary);
</script>

{#snippet advertising(idPrefix: string)}
	{#if sale.available}
		<AdvertisingRow
			on={sale.selected === 'allow'}
			{idPrefix}
			{noStyle}
			testId="consent-dialog-advertising-row"
		/>
	{/if}
{/snippet}

{#snippet mainAdvertising()}
	{@render advertising(prefix)}
{/snippet}

{#snippet usCategories(idPrefix: string)}
	<CategoryGroup
		{idPrefix}
		testIdPrefix="consent-dialog"
		exclude={usExclude}
		apply="immediate"
		uiSource={saveSource}
		vendors="accordion"
		footer={mainAdvertising}
		{noStyle}
		onApplied={showCue}
		themeKey="consentDialogCategoryGroup"
		vendorTableThemeKey="consentDialogVendorTable"
	/>
{/snippet}

{#snippet usBody()}
	<SaleRightsRow
		idPrefix={`${prefix}-main`}
		testIdPrefix="consent-dialog"
		uiSource={saveSource}
		themeKey="consentDialogRightsRow"
		{noStyle}
		onRecorded={showCue}
	/>
	<RightsReceipt
		idPrefix={`${prefix}-main`}
		themeKey="consentDialogReceipt"
		{noStyle}
	/>
	<button
		bind:this={preferencesTriggerEl}
		type="button"
		class={preferencesRowPart.class}
		style={preferencesRowPart.style}
		aria-expanded={phone ? undefined : preferencesOpen}
		aria-controls={phone ? undefined : preferencesPanelId}
		aria-haspopup={phone ? 'dialog' : undefined}
		data-opener={PREFERENCES_OPENER}
		data-testid="consent-dialog-preferences-row"
		onclick={() => {
			if (phone) {
				pushSheet(PREFERENCES_SHEET, PREFERENCES_OPENER);
			} else {
				preferencesOpen = !preferencesOpen;
			}
		}}
	>
		<span class={cx(noStyle, styles.navRowLabel)}>
			{preferencesCopy.title}
			<span class={cx(noStyle, styles.navRowMeta)}>
				{preferencesCopy.summary} · {preferencesCopy.onCount}
			</span>
		</span>
		<span
			class={cx(noStyle, styles.chevron)}
			data-direction={phone ? 'end' : 'down'}
		>
			<Icon name={phone ? 'chevron-end' : 'chevron-down'} />
		</span>
	</button>
	{#if !phone}
		<div
			bind:this={preferencesPanelEl}
			class={cx(noStyle, styles.disclosure)}
			id={preferencesPanelId}
			data-open={preferencesOpen}
			inert={!preferencesOpen}
			data-testid="consent-dialog-preferences-panel"
		>
			<div class={cx(noStyle, styles.disclosureInner)}>
				<div class={cx(noStyle, styles.preferencesPanel)}>
					{@render usCategories(`${prefix}-main`)}
				</div>
			</div>
		</div>
	{/if}
{/snippet}

{#snippet euBody()}
	<CategoryGroup
		idPrefix={`${prefix}-main`}
		testIdPrefix="consent-dialog"
		vendors={phone ? 'sheet' : 'accordion'}
		onOpenVendors={(category, openerKey) =>
			pushSheet(`${VENDOR_SHEET_PREFIX}${category}`, openerKey)}
		{noStyle}
		themeKey="consentDialogCategoryGroup"
		vendorTableThemeKey="consentDialogVendorTable"
	/>
{/snippet}

{#snippet mainFooter()}
	{#if legal}
		<a
			class={cx(noStyle, styles.quietLink)}
			href={legal.href}
			target={legal.target}
			rel={legal.rel}
			data-testid={eu
				? 'consent-dialog-legal-link-cookiePolicy'
				: 'consent-dialog-legal-link-privacyPolicy'}
		>
			{legal.label}
		</a>
	{:else}
		<span></span>
	{/if}
	<div class={cx(noStyle, styles.footerActions)}>
		{#if eu}
			<ConsentButton
				action="custom-consent"
				performDefaultAction={false}
				variant="neutral"
				mode="stroke"
				{noStyle}
				data-action="reject"
				data-early-tap="off"
				data-testid="consent-dialog-reject-all"
				onclick={() => commit('refuse')}
			>
				{copy.rejectAll}
			</ConsentButton>
			<ConsentButton
				action="custom-consent"
				performDefaultAction={false}
				variant="neutral"
				mode="stroke"
				{noStyle}
				data-action="accept"
				data-early-tap="off"
				data-testid="consent-dialog-accept-all"
				onclick={() => commit('allow')}
			>
				{copy.acceptAll}
			</ConsentButton>
			<!-- Enabled only once what would run differs from the record (EU-03). -->
			<ConsentButton
				action="custom-consent"
				performDefaultAction={false}
				{...appearance('save', true)}
				themeKey="consentDialogSaveButton"
				{noStyle}
				disabled={!hasChanges}
				data-action="save"
				data-testid="consent-dialog-save-button"
				onclick={() => commit('save')}
			>
				{copy.save}
			</ConsentButton>
		{:else}
			<DoneButton
				cue={shownSheet ? 0 : cue}
				label={copy.done}
				cueLabel={copy.savedCue}
				{noStyle}
				testId="consent-dialog-done"
				onclick={close}
			/>
		{/if}
	</div>
{/snippet}

{#snippet sheetFooter()}
	<span class={cx(noStyle, styles.footerNote)}>{copy.sheetNote}</span>
	<div class={cx(noStyle, styles.footerActions)}>
		<DoneButton
			cue={eu ? 0 : cue}
			label={copy.done}
			cueLabel={copy.savedCue}
			{noStyle}
			testId="consent-dialog-sheet-done"
			onclick={popSheet}
		/>
	</div>
{/snippet}

{#if open}
	<SurfaceStyles
		sheets={DIALOG_SHEETS}
		{noStyle}
	/>
	<div
		bind:this={backdropEl}
		class={backdropPart.class}
		style={backdropPart.style}
		data-animation={animationOff ? 'off' : undefined}
		data-edge-style={edgeStyle}
		data-regime={eu ? 'eu' : 'us'}
		data-layout={phone ? 'phone' : 'desktop'}
		data-testid="consent-dialog-root"
		{...{ [SURFACE_ROOT_ATTRIBUTE]: 'dialog' }}
		dir={textDirection}
	>
		<Layer
			bind:layerEl={mainEl}
			bind:titleEl={mainTitleEl}
			bind:bodyEl
			idPrefix={`${prefix}-main`}
			title={copy.title}
			{intro}
			closeLabel={copy.close}
			onClose={close}
			footer={mainFooter}
			status={mainStatus}
			nested={false}
			top={!sheetOpen}
			depth={sheetOpen ? 1 : 0}
			{eu}
			{noStyle}
		>
			{#if eu}
				{@render euBody()}
			{:else}
				{@render usBody()}
			{/if}
		</Layer>
		{#if shownSheet}
			<!-- The phone sheet on top: Preferences in the US, a category's
			     vendors in the EU. Its ids carry their own prefix (SR-05). -->
			{#if vendorCategory && vendorSheetCopy}
				<Layer
					bind:layerEl={sheetEl}
					bind:titleEl={sheetTitleEl}
					bind:bodyEl={sheetBodyEl}
					idPrefix={`${prefix}-sheet`}
					title={vendorSheetCopy.table}
					intro={copy.vendorSheetIntro}
					closeLabel={vendorSheetCopy.close}
					onClose={popSheet}
					footer={sheetFooter}
					status={sheetStatus}
					nested
					top
					closing={shownSheet.closing}
					depth={0}
					{eu}
					sheetId={shownSheet.id}
					{noStyle}
				>
					<CategoryGroup
						idPrefix={`${prefix}-sheet`}
						testIdPrefix="consent-dialog"
						only={vendorCategory}
						vendors="inline"
						{noStyle}
						themeKey="consentDialogCategoryGroup"
						vendorTableThemeKey="consentDialogVendorTable"
					/>
				</Layer>
			{:else}
				<Layer
					bind:layerEl={sheetEl}
					bind:titleEl={sheetTitleEl}
					bind:bodyEl={sheetBodyEl}
					idPrefix={`${prefix}-sheet`}
					title={copy.preferencesTitle}
					intro={copy.preferencesIntro}
					closeLabel={copy.preferencesClose}
					onClose={popSheet}
					footer={sheetFooter}
					status={sheetStatus}
					nested
					top
					closing={shownSheet.closing}
					depth={0}
					{eu}
					sheetId={shownSheet.id}
					{noStyle}
				>
					{@render usCategories(`${prefix}-sheet`)}
				</Layer>
			{/if}
		{/if}
	</div>
{/if}
