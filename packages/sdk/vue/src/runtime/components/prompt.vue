<script setup lang="ts">
import type {
	PresentationAction,
	PromptPosition,
	PromptVariant,
} from '@inth/sdk/engine';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
import {
	activateOptOutLink,
	replayEarlyConsentTaps,
	saveConsentSurfaceWithOptInCheck,
} from '@inth/sdk/surface-actions';
import {
	resolveActionLabels,
	resolveOptOutLink,
	resolvePreferenceControlLabels,
	resolvePromptCopy,
} from '@inth/sdk/surface-state';

import '@inth/sdk/ui/styles/components/consent-banner.css';
import bannerStyles from '@inth/sdk/ui/styles/components/consent-banner';
import { getTextDirection } from '@inth/sdk/ui/utils';
import {
	computed,
	defineAsyncComponent,
	mergeProps,
	onBeforeUnmount,
	onMounted,
	ref,
	Teleport,
	Transition,
} from 'vue';

import {
	useConsentActiveUI,
	useConsentConfig,
	useConsentInit,
	useConsentSave,
	useConsentKernel,
	useConsentKernelContext,
	useConsentSnapshot,
	useHasConsentUi,
} from '../composables';
import { useOptInConfirmationHost } from '../composables/kernel';
import { useConsentPolicyActions } from '../composables/use-consent-policy-actions';
import { useConsentScrollLock } from '../composables/use-consent-scroll-lock';
import { useLateEntry } from '../composables/use-late-entry';
import { useMounted } from '../composables/use-mounted';
import { useSurfaceTranslations } from '../composables/use-surface-translations';
import type { RuntimeConsentConfig } from '../kernel';
import { useFocusTrap } from '../primitives/use-focus-trap';
import { slotAttrs } from '../utils/slot-attrs';
import ConsentActions from './actions.vue';
import DescriptionContent from './description-content.vue';
import EarlyTapScript from './early-tap-script';
import OptOutIcon from './opt-out-icon.vue';
import PrivacyChoicesBanner from './prompt/privacy-choices-banner.vue';
import ConsentTag from './tag.vue';

/**
 * Local overrides for the surface shape. Each one beats the host
 * `presentation.prompt` value; leave them unset to follow the policy
 * defaults (every prompt renders as a floating card unless the host
 * chooses otherwise).
 * `blocking` defaults to `undefined` on purpose: Vue would otherwise cast
 * an absent boolean prop to `false` and override the host value.
 */
const props = withDefaults(
	defineProps<{
		/** Surface shape: `floating`, `bar`, `widget` or `wall`. */
		variant?: PromptVariant;
		/** Position, validated against the resolved variant. */
		position?: PromptPosition;
		/** Backdrop, scroll lock, focus trap and no outside dismissal. */
		blocking?: boolean;
		/** Skip the enter and exit animations. Defaults to the config's. */
		disableAnimation?: boolean;
	}>(),
	{
		blocking: undefined,
		disableAnimation: undefined,
		position: undefined,
		variant: undefined,
	}
);

const mounted = useMounted();
const activeUI = useConsentActiveUI();
const config = useConsentConfig();
const init = useConsentInit();
const textDirection = computed(() =>
	getTextDirection(init.value?.translations?.language)
);
const save = useConsentSave();
const kernel = useConsentKernel();
const snapshot = useConsentSnapshot();
const optInConfirmationActive = useOptInConfirmationHost();
const LazyOptInConfirmation = defineAsyncComponent(
	() => import('./opt-in-confirmation.vue')
);

const transitionStyles = bannerStyles as Record<string, string>;

// A tap on the server-rendered banner before this component hydrated is
// held by the inline script. From here the banner's own handlers work: stop
// the script and record the tap once the runtime has started. The runtime
// is read when asked: under the deferred context it attaches later.
const context = useConsentKernelContext();
// The plugin provides the runtime config, which carries the CSP nonce.
const nonce = computed(() => (config.value as RuntimeConsentConfig).nonce);
let stopEarlyTaps: (() => void) | undefined;
onMounted(() => {
	stopEarlyTaps = replayEarlyConsentTaps(kernel, {
		started: () => context.runtime?.started ?? false,
	});
});
onBeforeUnmount(() => stopEarlyTaps?.());

const {
	presentation: surface,
	actionGroups,
	blocking,
	direction,
	position,
	primaryActions,
	shouldFillActions,
	preferenceControls,
	variant,
} = useConsentPolicyActions('prompt', () => ({
	blocking: props.blocking,
	position: props.position,
	variant: props.variant,
}));

const translations = useSurfaceTranslations();
const promptKind = computed(() => snapshot.value.policyRule.prompt);

/**
 * The Privacy Choices design (`design: 'privacy-choices'`) renders its own
 * prompt, which loads with the resolved container's stylesheet. The
 * classic banner below then stays closed, so its scroll lock and focus
 * trap never apply.
 */
const privacyChoicesContainer = computed(() =>
	surface.value.design === 'privacy-choices'
		? (surface.value.container ?? null)
		: null
);

const hasConsentUi = useHasConsentUi();
const isOpen = computed(() => {
	if (!hasConsentUi.value || privacyChoicesContainer.value) {
		return false;
	}
	const { model } = snapshot.value.policyRule;
	const models = config.value.bannerModels ?? config.value.models;
	const matchesModel =
		!models?.length ||
		(model !== undefined && model !== 'none' && models.includes(model));
	return (
		activeUI.value === 'banner' && matchesModel && !snapshot.value.policyPending
	);
});

const disableAnimation = computed(() =>
	Boolean(props.disableAnimation ?? config.value.disableAnimation)
);

const scrollLock = computed(() => surface.value.scrollLock);
// A banner that opens after the page painted fades in.
const lateEntry = useLateEntry(isOpen);
const entryAttribute = computed(() =>
	lateEntry.value && !disableAnimation.value ? 'late' : undefined
);
useConsentScrollLock(computed(() => isOpen.value && scrollLock.value));

const shouldTrapFocus = computed(() =>
	Boolean(isOpen.value && surface.value.trapFocus)
);
const card = ref<HTMLElement | null>(null);
useFocusTrap(card, () => shouldTrapFocus.value);

const bannerTitle = computed(
	() => resolvePromptCopy(translations.value, promptKind.value).title
);

const labels = computed(() => resolveActionLabels(translations.value));

const rightLabels = computed(() =>
	resolvePreferenceControlLabels(translations.value)
);

const optOutLink = computed(() =>
	resolveOptOutLink(translations.value, surface.value.optOutLink)
);

const onRight = function onRight(right: string) {
	if (right === 'opt-out') {
		void activateOptOutLink(kernel, optOutLink.value.variant, {
			uiSource: 'banner',
		});
		return;
	}
	activeUI.value = 'manager';
};

const actionTestIds = {
	accept: 'consent-banner-accept-button',
	customize: 'consent-banner-customize-button',
	dismiss: 'consent-banner-dismiss-button',
	reject: 'consent-banner-reject-button',
} as const;

const onAction = function onAction(action: PresentationAction) {
	if (action === 'dismiss') {
		void kernel.commands.dismissNotice();
		return;
	}
	if (action === 'customize') {
		activeUI.value = 'manager';
		return;
	}
	if (action === 'accept') {
		const current = kernel.getSnapshot();
		const available = [
			'necessary' as const,
			...(current.evaluationPolicy.choiceScope ?? current.policyRule.scope),
		];
		void saveConsentSurfaceWithOptInCheck(
			kernel,
			'all',
			() =>
				kernel.commands.save('all', {
					categories: available,
					uiSource: 'banner',
				}),
			{ categories: available }
		);
		return;
	}
	if (action === 'reject') {
		save('none');
	}
};
</script>

<template>
	<PrivacyChoicesBanner
		v-if="privacyChoicesContainer"
		:container="privacyChoicesContainer"
		:action-groups="actionGroups"
		:disable-animation="props.disableAnimation"
	/>
	<!-- Either design hosts the opt-in confirmation: this banner claimed the
	     host, so no other surface renders it. -->
	<LazyOptInConfirmation
		v-if="optInConfirmationActive"
		:disable-animation="props.disableAnimation"
	/>
	<Teleport
		v-if="!privacyChoicesContainer"
		to="body"
		:disabled="!mounted"
	>
		<EarlyTapScript
			v-if="isOpen"
			:nonce="nonce"
		/>
		<Transition
			:css="!disableAnimation"
			:enter-from-class="''"
			:enter-active-class="transitionStyles.overlayVisible"
			:enter-to-class="transitionStyles.overlayVisible"
			:leave-from-class="transitionStyles.overlayVisible"
			:leave-active-class="transitionStyles.overlayHidden"
			:leave-to-class="transitionStyles.overlayHidden"
		>
			<div
				v-if="isOpen && scrollLock"
				v-bind="
					slotAttrs(config.components?.banner?.overlay, [
						bannerStyles.overlay,
						disableAnimation ? undefined : bannerStyles.overlayVisible,
						disableAnimation ? undefined : bannerStyles.overlayEntering,
					])
				"
				aria-hidden="true"
				:data-entry="entryAttribute"
				data-testid="consent-banner-overlay"
			/>
		</Transition>
		<Transition
			:css="!disableAnimation"
			:enter-from-class="''"
			:enter-active-class="transitionStyles.bannerVisible"
			:enter-to-class="transitionStyles.bannerVisible"
			:leave-from-class="transitionStyles.bannerVisible"
			:leave-active-class="transitionStyles.bannerHidden"
			:leave-to-class="transitionStyles.bannerHidden"
		>
			<div
				v-if="isOpen"
				v-bind="
					slotAttrs(config.components?.banner?.root, [
						bannerStyles.root,
						bannerStyles.bannerVisible,
						disableAnimation ? undefined : bannerStyles.bannerEntering,
					])
				"
				data-testid="consent-banner-root"
				:[SURFACE_ROOT_ATTRIBUTE]="'banner'"
				:data-entry="entryAttribute"
				:data-variant="variant"
				:data-position="position"
				:data-blocking="blocking ? 'true' : undefined"
				:data-prompt="promptKind"
				:data-model="snapshot.policyRule.model"
				:dir="textDirection"
			>
				<div
					v-bind="config.components?.banner?.cardShell"
					:class="bannerStyles.cardShell"
				>
					<ConsentTag
						v-if="!(config.bannerHideBranding ?? config.hideBranding)"
						surface="banner"
					/>
					<div
						ref="card"
						v-bind="
							slotAttrs(config.components?.banner?.card, bannerStyles.card)
						"
						data-testid="consent-banner-card"
						:role="blocking ? 'dialog' : 'region'"
						:aria-modal="blocking ? 'true' : undefined"
						:aria-label="bannerTitle"
						tabindex="-1"
					>
						<div
							v-bind="
								slotAttrs(
									config.components?.banner?.header,
									bannerStyles.header
								)
							"
							data-testid="consent-banner-header"
						>
							<h2
								v-bind="
									slotAttrs(
										config.components?.banner?.title,
										bannerStyles.title
									)
								"
								data-testid="consent-banner-title"
							>
								{{ bannerTitle }}
							</h2>
							<DescriptionContent
								context="banner"
								:description-class="bannerStyles.description"
							/>
						</div>
						<ConsentActions
							data-testid="consent-banner-footer"
							:root-class="bannerStyles.footer"
							button-size="small"
							group-test-id="consent-banner-footer-sub-group"
							:action-groups="actionGroups"
							:direction="direction"
							:ui-profile="surface?.uiProfile"
							:primary-actions="primaryActions"
							:fill="shouldFillActions"
							:labels="labels"
							:test-ids="actionTestIds"
							:root-attrs="
								mergeProps(
									{ ...config.components?.banner?.footer },
									{ ...config.components?.banner?.actions }
								)
							"
							:group-attrs="{
								...config.components?.banner?.actionGroup,
							}"
							@action="onAction"
						>
							<template #leading>
								<div
									v-if="preferenceControls.length > 0"
									v-bind="
										slotAttrs(
											config.components?.banner?.rights,
											bannerStyles.rights
										)
									"
									data-testid="consent-banner-rights"
								>
									<button
										v-for="right in preferenceControls"
										:key="right"
										v-bind="
											slotAttrs(
												config.components?.banner?.rightLink,
												bannerStyles.rightLink
											)
										"
										type="button"
										data-action="right"
										:data-inth-rights="snapshot.policyRule.rights.join(' ')"
										:data-opt-out-variant="
											right === 'opt-out' ? optOutLink.variant : undefined
										"
										:data-right="right"
										:data-testid="`consent-banner-right-link-${right}`"
										@click="onRight(right)"
									>
										<OptOutIcon
											v-if="
												right === 'opt-out' &&
												optOutLink.variant === 'privacy-choices'
											"
											:class="bannerStyles.optOutIcon"
										/>
										{{
											right === 'opt-out'
												? optOutLink.label
												: rightLabels[right]
										}}
									</button>
								</div>
							</template>
						</ConsentActions>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>
