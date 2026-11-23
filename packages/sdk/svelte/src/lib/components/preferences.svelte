<script lang="ts">
	import type { AllConsentNames, SaveUISource } from '@inth/sdk/engine';
	import {
		actionAppearanceFromTheme,
		resolveConsentPresentation,
	} from '@inth/sdk/engine';
	import { createPreferenceDraft } from '@inth/sdk/preference-draft';
	import { optInConsentSurface } from '@inth/sdk/surface-actions';
	import {
		resolveCategoryOptOutLock,
		resolveCategoryTitle,
		resolveOptOutBlockHeading,
		resolveOptOutCopy,
		resolveOptOutReceiptSentence,
	} from '@inth/sdk/surface-state';
	import accordionStyles from '@inth/sdk/ui/styles/components/accordion';
	import buttonStyles from '@inth/sdk/ui/styles/components/button';
	import managerStyles from '@inth/sdk/ui/styles/components/consent-manager';
	import optOutConfirmationStyles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
	import switchStyles from '@inth/sdk/ui/styles/components/switch';
	import { resolveActionAppearance } from '@inth/sdk/ui/theme';
	import {
		getTextDirection,
		resolveStyles,
		toStyleAttributeValue,
	} from '@inth/sdk/ui/utils';

	import { getConsentContext, getThemeContext } from '../get-consent-context.svelte';
	import { PreferenceItem, Switch } from '../primitives';
	import { WIDGET_SHEETS } from '../widget-sheets';
	import ConsentButton from './action-button.svelte';
	import Branding from './branding.svelte';
	import DeferredOptInConfirmation from './confirmation/deferred-opt-in-confirmation.svelte';
	import OptOutReceiptDetails from './confirmation/opt-out-receipt-details.svelte';
	import PolicyActionsRenderer from './policy-actions-renderer.svelte';
	import SurfaceStyles from './surface-styles.svelte';
	import VendorList from './vendor-list.svelte';

	let {
		hideBranding = true,
		noStyle: localNoStyle,
		uiSource = 'widget' as SaveUISource,
		class: className,
	}: {
		hideBranding?: boolean;
		noStyle?: boolean;
		/** @internal */
		uiSource?: SaveUISource;
		class?: string;
	} = $props();

	const consent = getConsentContext();
	// The draft ships with this widget, not with the provider; see
	// `InthProvider`. Handing it over here seeds the switches in
	// this render, server-side too.
	consent.provideDraft(createPreferenceDraft);
	const widgetId = $props.id();
	const theme = getThemeContext();

	const noStyle = $derived(localNoStyle ?? theme.noStyle ?? false);

	const translations = $derived(consent.state.copy);
	const optOutState = $derived(consent.state.optOutState);
	const optOutCopy = $derived(resolveOptOutCopy(translations));
	const optOutBlockHeading = $derived(
		resolveOptOutBlockHeading(
			translations,
			optOutState,
			consent.state.presentation?.optOutLink
		)
	);
	const optOutReceiptSentence = $derived(
		resolveOptOutReceiptSentence(translations, optOutState)
	);
	const optOutHeadingId = `${widgetId}-opt-out-heading`;

	const handleOptOutClick = function handleOptOutClick() {
		void consent.state.requestOptOut({ uiSource });
	};

	const handleOptInClick = function handleOptInClick() {
		optInConsentSurface(consent.kernel, { uiSource });
	};

	const isGpcLocked = function isGpcLocked(name: AllConsentNames): boolean {
		return resolveCategoryOptOutLock(consent.snapshot, name) === 'gpc-active';
	};

	const restrictionReasonFor = function restrictionReasonFor(
		name: AllConsentNames
	): string | null {
		if (name === 'necessary') {
			return null;
		}
		const lock = resolveCategoryOptOutLock(consent.snapshot, name);
		if (lock === 'gpc-active') {
			return optOutCopy.lockedByGpc;
		}
		if (lock === 'held-by-account') {
			return optOutCopy.lockedByAccount;
		}
		const decision = consent.snapshot.explicitChoice?.categories[name];
		const reasons = consent.snapshot.restrictions[name];
		if (
			decision?.value === true &&
			reasons?.some((reason) => reason !== 'opt-out')
		) {
			return 'Your saved choice is restricted by the current privacy settings.';
		}
		return null;
	};

	const textDirection = $derived(
		getTextDirection(consent.state.translations?.language)
	);

	const displayedConsents = $derived(
		consent.state.consentTypes.filter((ct) =>
			consent.state.consentCategories.includes(ct.name)
		)
	);

	let openItems = $state<Record<string, boolean>>({});

	const toggleConsent = function toggleConsent(name: string, checked: boolean) {
		consent.state.setSelectedConsent(name as AllConsentNames, checked);
	};

	const toggleOpenItem = function toggleOpenItem(name: string) {
		const nextOpen = !(openItems[name] ?? false);
		openItems = Object.fromEntries(
			displayedConsents.map((consentType) => [
				consentType.name,
				nextOpen && consentType.name === name,
			])
		);
	};

	const widgetRootStyle = $derived(
		resolveStyles(
			'consentWidget',
			theme.theme,
			{ baseClassName: managerStyles.manager, className },
			noStyle
		)
	);

	const optOutBlockStyle = $derived(
		resolveStyles(
			'consentWidgetOptOut',
			theme.theme,
			{ baseClassName: managerStyles.optOut, noStyle },
			noStyle
		)
	);

	const optOutButtonStyle = $derived(
		resolveStyles(
			'buttonPrimary',
			theme.theme,
			{ baseClassName: buttonStyles.button, noStyle },
			noStyle
		)
	);

	const optOutStatusStyle = $derived(
		resolveStyles(
			'consentWidgetOptOutStatus',
			theme.theme,
			{ baseClassName: managerStyles.optOutStatus, noStyle },
			noStyle
		)
	);

	const footerStyle = $derived(
		resolveStyles(
			'consentWidgetFooter',
			theme.theme,
			{ baseClassName: managerStyles.footer, noStyle },
			noStyle
		)
	);

	const accordionStyle = $derived(
		resolveStyles(
			'consentWidgetAccordion',
			theme.theme,
			{ baseClassName: accordionStyles.list, noStyle },
			noStyle
		)
	);

	const toggleStyle = $derived(
		resolveStyles(
			'toggle',
			theme.theme,
			{ baseClassName: switchStyles.root, noStyle },
			noStyle
		)
	);

	const footerGroupStyle = $derived(
		resolveStyles(
			'consentWidgetFooterSubGroup',
			theme.theme,
			{ noStyle },
			noStyle
		)
	);

	const presentation = $derived(
		resolveConsentPresentation({
			actionAppearance: actionAppearanceFromTheme(theme.theme),
			policy: consent.snapshot.policyRule,
			presentation: consent.state.presentation,
			surface: 'preferences',
		})
	);
	const actionGroups = $derived(presentation.actionGroups);
	const primaryActions = $derived(presentation.primaryActions);
	const direction = $derived(presentation.direction);
	const shouldFillActions = $derived(presentation.shouldFillActions);
</script>

{#if consent.state.hasConsentUi}
	<SurfaceStyles sheets={WIDGET_SHEETS} />
	<DeferredOptInConfirmation
		{noStyle}
		disableAnimation={theme.disableAnimation}
	/>
	<div
		class={widgetRootStyle.className || ''}
		style={toStyleAttributeValue(widgetRootStyle.style)}
		dir={textDirection}
		data-testid="consent-widget-root"
	>
		{#if consent.state.draft.isStale}
			<div role="alert">
				The policy changed. Review your preferences before saving. <button
					type="button"
					onclick={() => consent.state.draft.reset()}>Review preferences</button
				>
			</div>
		{/if}
		{#if optOutState.available}
			<section
				aria-labelledby={optOutHeadingId}
				class={optOutBlockStyle.className || undefined}
				style={toStyleAttributeValue(optOutBlockStyle.style)}
				data-testid="consent-widget-opt-out"
			>
				<h3
					id={optOutHeadingId}
					class={noStyle ? undefined : managerStyles.optOutHeading}
					data-testid="consent-widget-opt-out-heading"
				>
					{optOutBlockHeading}
				</h3>
				{#if optOutState.honored}
					<p
						class={optOutStatusStyle.className || ''}
						style={toStyleAttributeValue(optOutStatusStyle.style)}
						role="status"
						data-testid="consent-widget-opt-out-status"
					>
						{optOutState.via === 'signal'
							? optOutCopy.statusSignal
							: optOutCopy.statusRequest}
					</p>
					<p
						class={noStyle ? undefined : optOutConfirmationStyles.description}
						data-testid="consent-widget-opt-out-description"
					>
						{optOutReceiptSentence}
					</p>
					<OptOutReceiptDetails
						{noStyle}
						testId="consent-widget-opt-out-receipt"
						recordedAtTestId="consent-widget-opt-out-recorded-at"
						referenceTestId="consent-widget-opt-out-reference"
					/>
					{#if optOutState.lock !== 'gpc-active'}
						<button
							type="button"
							class={noStyle ? undefined : managerStyles.optInLink}
							data-testid="consent-widget-opt-in-link"
							onclick={handleOptInClick}
						>
							{optOutCopy.optInLink}
						</button>
					{/if}
				{:else}
					<p
						class={noStyle ? undefined : managerStyles.optOutDescription}
						data-testid="consent-widget-opt-out-description"
					>
						{optOutCopy.notOptedOut}
					</p>
					<div class={noStyle ? undefined : managerStyles.optOutActions}>
						<button
							type="button"
							data-mode={noStyle ? undefined : 'filled'}
							data-size={noStyle ? undefined : 'small'}
							data-variant={noStyle ? undefined : 'primary'}
							class={optOutButtonStyle.className || undefined}
							style={toStyleAttributeValue(optOutButtonStyle.style)}
							data-testid="consent-widget-opt-out-button"
							onclick={handleOptOutClick}
						>
							{optOutCopy.action}
						</button>
					</div>
				{/if}
			</section>
		{:else if optOutState.honored}
			<p
				class={optOutStatusStyle.className || ''}
				style={toStyleAttributeValue(optOutStatusStyle.style)}
				role="status"
				data-testid="consent-widget-opt-out-status"
			>
				{optOutState.via === 'signal'
					? optOutCopy.statusSignal
					: optOutCopy.statusRequest}
			</p>
		{/if}
		<div
			class={accordionStyle.className || ''}
			style={toStyleAttributeValue(accordionStyle.style)}
			data-testid="consent-widget-accordion"
		>
			{#each displayedConsents as consentType (consentType.name)}
				{@const isOpen = openItems[consentType.name] ?? false}
				{@const gpcLocked = isGpcLocked(consentType.name)}
				{@const restrictionReason = restrictionReasonFor(consentType.name)}
				{@const isChecked =
					consent.state.selectedConsents?.[consentType.name] ??
					consent.snapshot.explicitChoice?.categories[
						consentType.name as Exclude<AllConsentNames, 'necessary'>
					]?.value ??
					false}
				{@const isDisabled =
					consentType.name === 'necessary' ||
					(consentType.disabled ?? false) ||
					gpcLocked}
				<PreferenceItem.Root
					class={noStyle ? '' : accordionStyles.item || ''}
					open={isOpen}
					noStyle
					data-testid={`consent-widget-accordion-item-${consentType.name}`}
				>
					<div class={noStyle ? '' : accordionStyles.triggerRow || ''}>
						<PreferenceItem.Trigger
							class={noStyle ? '' : accordionStyles.trigger || ''}
							onclick={() => toggleOpenItem(consentType.name)}
							data-testid={`consent-widget-accordion-trigger-${consentType.name}`}
						>
							<PreferenceItem.Leading
								class={noStyle ? '' : accordionStyles.arrow || ''}
								data-testid={`consent-widget-accordion-arrow-${consentType.name}`}
							>
								<!-- Decorative: the trigger's name is the category title and
								     `aria-expanded` carries the state. -->
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									{#if isOpen}
										<path d="M5 12h14" />
									{:else}
										<path d="M5 12h14M12 5v14" />
									{/if}
								</svg>
							</PreferenceItem.Leading>
							<PreferenceItem.Header>
								<PreferenceItem.Title
									class={noStyle ? '' : accordionStyles.title || ''}
								>
									{resolveCategoryTitle(translations, consentType.name)}
								</PreferenceItem.Title>
							</PreferenceItem.Header>
						</PreferenceItem.Trigger>

						<PreferenceItem.Control
							class={noStyle ? '' : accordionStyles.control || ''}
						>
							<Switch.Root
								aria-label={resolveCategoryTitle(
									translations,
									consentType.name
								)}
								checked={isChecked}
								aria-describedby={restrictionReason
									? `${widgetId}-${consentType.name}-restriction`
									: undefined}
								onclick={() => {
									if (!isDisabled) {
										toggleConsent(consentType.name, !isChecked);
									}
								}}
								disabled={isDisabled}
								class={toggleStyle.className || ''}
								style={toStyleAttributeValue(toggleStyle.style)}
								data-size={noStyle ? undefined : 'small'}
								data-testid={`consent-widget-switch-${consentType.name}`}
							>
								<Switch.Control class={noStyle ? '' : switchStyles.track}>
									<Switch.Thumb class={noStyle ? '' : switchStyles.thumb} />
								</Switch.Control>
							</Switch.Root>
						</PreferenceItem.Control>
					</div>

					{#if restrictionReason}
						<output
							id={`${widgetId}-${consentType.name}-restriction`}
							class={noStyle ? '' : accordionStyles.restriction || ''}
							data-testid={`consent-widget-restriction-${consentType.name}`}
						>
							{restrictionReason}
						</output>
					{/if}
					<PreferenceItem.Content
						viewportClassName={noStyle
							? undefined
							: accordionStyles.contentViewport}
						innerClassName={noStyle ? undefined : accordionStyles.contentInner}
						class={noStyle ? '' : accordionStyles.content || ''}
						data-testid={`consent-widget-accordion-content-${consentType.name}`}
					>
						{translations.consentTypes[consentType.name]?.description ??
							consentType.description ??
							''}
						<VendorList
							category={consentType.name}
							hideHint={gpcLocked}
							{noStyle}
						/>
					</PreferenceItem.Content>
				</PreferenceItem.Root>
			{/each}
		</div>

		<PolicyActionsRenderer
			{actionGroups}
			{primaryActions}
			{shouldFillActions}
			{direction}
			{noStyle}
			footerClassName={footerStyle.className || ''}
			footerStyle={toStyleAttributeValue(footerStyle.style)}
			footerSubGroupClassName={footerGroupStyle.className || ''}
			footerSubGroupStyle={toStyleAttributeValue(footerGroupStyle.style)}
			footerTestId="consent-widget-footer"
			footerSubGroupTestId="consent-widget-footer-sub-group"
		>
			{#snippet renderAction(action: string, isPrimary: boolean)}
				{#if action === 'reject'}
					<ConsentButton
						action="reject-consent"
						{...resolveActionAppearance(theme.theme, 'reject', isPrimary)}
						closeConsentBanner
						closeConsentDialog
						data-action="reject"
						data-testid="consent-widget-reject-button"
					>
						{translations.common.rejectAll}
					</ConsentButton>
				{:else if action === 'accept'}
					<ConsentButton
						action="accept-consent"
						{...resolveActionAppearance(theme.theme, 'accept', isPrimary)}
						closeConsentBanner
						closeConsentDialog
						data-action="accept"
						data-testid="consent-widget-footer-accept-all-button"
					>
						{translations.common.acceptAll}
					</ConsentButton>
				{:else if action === 'save'}
					<ConsentButton
						action="custom-consent"
						disabled={consent.state.draft.isStale}
						{...resolveActionAppearance(theme.theme, 'save', isPrimary)}
						closeConsentDialog
						data-action="save"
						data-testid="consent-widget-footer-save-button"
					>
						{translations.common.save}
					</ConsentButton>
				{/if}
			{/snippet}
		</PolicyActionsRenderer>

		<Branding
			{hideBranding}
			{noStyle}
			surface="widget"
		/>
	</div>
{/if}
