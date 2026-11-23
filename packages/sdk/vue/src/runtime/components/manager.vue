<script setup lang="ts">
import type { PresentationAction } from '@inth/sdk/engine';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
import { saveConsentSurface } from '@inth/sdk/surface-actions';

import '@inth/sdk/ui/styles/components/consent-dialog.css';
import dialogStyles from '@inth/sdk/ui/styles/components/consent-dialog';
import { getTextDirection } from '@inth/sdk/ui/utils';
import {
	computed,
	inject,
	nextTick,
	onUnmounted,
	provide,
	ref,
	watch,
} from 'vue';
import type { HTMLAttributes } from 'vue';

import {
	useConsentActiveUI,
	useConsentConfig,
	useConsentInit,
	useConsentKernel,
	useHasConsentUi,
} from '../composables';
import { useConsentDraft } from '../composables/draft';
import {
	useHasOptOutConfirmationHost,
	useOptInConfirmationHost,
	useOptOutConfirmationOpen,
} from '../composables/kernel';
import { useConsentPolicyActions } from '../composables/use-consent-policy-actions';
import { useConsentScrollLock } from '../composables/use-consent-scroll-lock';
import {
	DialogContent,
	DialogOverlay,
	DialogPortal,
	DialogRoot,
} from '../primitives';
import { slotAttrs } from '../utils/slot-attrs';
import { symbolConfirmationHosted } from '../utils/symbols';
import ConsentDescription from './description.vue';
import {
	LazyOptInConfirmation,
	LazyOptOutConfirmation,
	LazyPrivacyChoicesDialog,
} from './lazy-surfaces';
import { consentWidgetManagerKey } from './preferences-manager-context';
import ConsentWidget from './preferences.vue';
import { useAdoptOptOutConfirmation } from './privacy-choices/receipt-focus';
import { usePrivacyChoicesDesign } from './privacy-choices/use-design';
import ConsentTag from './tag.vue';

const props = withDefaults(
	defineProps<{
		/** Skip the enter and exit animations. Defaults to the config's. */
		disableAnimation?: boolean;
	}>(),
	{ disableAnimation: undefined }
);

const init = useConsentInit();
const textDirection = computed(() =>
	getTextDirection(init.value?.translations?.language)
);

const activeUI = useConsentActiveUI();
const config = useConsentConfig();
const kernel = useConsentKernel();
// No resolved policy means nothing to manage: render no surface at all.
const hasConsentUi = useHasConsentUi();
const confirmationHostedByProvider = inject(symbolConfirmationHosted, false);
const confirmationOpen = useOptOutConfirmationOpen();
const hasStandaloneConfirmation = useHasOptOutConfirmationHost();
const optInConfirmationActive = useOptInConfirmationHost();

const { presentation: surface } = useConsentPolicyActions('preferences');
/**
 * The Privacy Choices design (`design: 'privacy-choices'`) renders its own
 * dialog in place of this one. Its chunk loads when it opens: importing it
 * applies its stylesheets, which include the banner's in-place panel rules.
 */
const privacyChoices = usePrivacyChoicesDesign();
// Under a root, the root does this; on its own, this dialog opens on the
// receipt to confirm an opt-out.
useAdoptOptOutConfirmation(
	kernel,
	() =>
		privacyChoices.value &&
		!confirmationHostedByProvider &&
		confirmationOpen.value &&
		!hasStandaloneConfirmation.value
);
let actionSequence = 0;
const draftState = useConsentDraft();
const { isDirty, isStale, reset: resetDraft, save: saveDraft } = draftState;

const disableAnimation = computed(() =>
	Boolean(props.disableAnimation ?? config.value.disableAnimation)
);
const isOverlayVisible = computed(() => activeUI.value === 'manager');
const overlayClasses = computed(() => {
	if (disableAnimation.value) {
		return [dialogStyles.overlay];
	}
	return [
		dialogStyles.overlay,
		isOverlayVisible.value
			? dialogStyles.overlayVisible
			: dialogStyles.overlayHidden,
	];
});
const overlayFallbackStyle = ref<Record<string, string> | undefined>();

const refreshOverlayFallback = async function refreshOverlayFallback() {
	if (typeof window === 'undefined' || activeUI.value !== 'manager') {
		overlayFallbackStyle.value = undefined;
		return;
	}

	await nextTick();
	const rootStyle = getComputedStyle(document.documentElement);
	// `styles.css` declares the theme tokens on `:root`; the classic
	// `--consent-dialog-*` variables are no longer declared there.
	if (rootStyle.getPropertyValue('--inth-overlay').trim()) {
		overlayFallbackStyle.value = undefined;
		return;
	}

	overlayFallbackStyle.value = {
		backgroundColor: 'var(--inth-overlay, hsla(0, 0%, 0%, 0.5))',
		inset: '0',
		position: 'fixed',
		zIndex: '999998',
	};
};

watch(
	activeUI,
	() => {
		void refreshOverlayFallback();
	},
	{ immediate: true }
);

useConsentScrollLock(
	computed(
		() =>
			!privacyChoices.value &&
			activeUI.value === 'manager' &&
			surface.value.scrollLock
	)
);

watch(
	activeUI,
	(ui) => {
		if (ui === 'manager') {
			resetDraft();
		}
	},
	{ immediate: true }
);

// Leaving the manager, unmounting it or a newer action vetoes an older
// save's deferred close; core's per-kernel token covers navigation.
watch(
	activeUI,
	(ui) => {
		if (ui !== 'manager') {
			actionSequence += 1;
		}
	},
	{ flush: 'sync' }
);
onUnmounted(() => {
	actionSequence += 1;
});

const onAction = async function onAction(action: PresentationAction) {
	actionSequence += 1;
	if (action !== 'save' && action !== 'accept' && action !== 'reject') {
		return;
	}
	const sequence = actionSequence;
	// The manager closes in this task once the kernel has recorded the
	// choice, and the backend request finishes in the background; see
	// `saveConsentSurface`. The draft follows the record on its own, and
	// reopening the manager reseeds it.
	await saveConsentSurface(
		kernel,
		() => {
			if (action === 'save') {
				return saveDraft();
			}
			return saveDraft({ input: action === 'accept' ? 'all' : 'none' });
		},
		// A draft save that left edits staged (made while it ran, or a
		// stale draft it refused) keeps the manager open.
		() => sequence === actionSequence && !isDirty.value
	);
};
provide(consentWidgetManagerKey, { draft: draftState, onAction });
</script>

<template>
	<template v-if="privacyChoices">
		<!-- Either design hosts the opt-in confirmation while it is mounted. -->
		<LazyOptInConfirmation
			v-if="optInConfirmationActive"
			:disable-animation="props.disableAnimation"
		/>
		<!-- Loads on open, never with the banner (PERM-05: the banner leaves
		     at once when it opens). -->
		<LazyPrivacyChoicesDialog
			v-if="activeUI === 'manager'"
			:disable-animation="props.disableAnimation"
		/>
	</template>
	<template v-else>
		<LazyOptOutConfirmation
			v-if="
				!confirmationHostedByProvider &&
				confirmationOpen &&
				!hasStandaloneConfirmation
			"
			embedded
			:disable-animation="props.disableAnimation"
		/>
		<LazyOptInConfirmation
			v-if="optInConfirmationActive"
			:disable-animation="props.disableAnimation"
		/>
		<div
			v-if="hasConsentUi && isStale"
			role="status"
		>
			Privacy choices have changed.
			<button
				type="button"
				@click="resetDraft"
			>
				Review updated choices
			</button>
		</div>
		<DialogRoot
			v-if="hasConsentUi"
			:open="activeUI === 'manager'"
			:modal="surface.blocking"
			@update:open="(open) => (activeUI = open ? 'manager' : null)"
		>
			<DialogPortal>
				<DialogOverlay
					v-if="surface.blocking"
					:style="overlayFallbackStyle"
					v-bind="slotAttrs(config.components?.dialog?.overlay, overlayClasses)"
					data-testid="consent-dialog-overlay"
				/>
				<!-- The outer element only positions the panel over the
			     viewport. `DialogContent` is the panel itself: it carries the
			     dialog semantics, the focus trap and the
			     `consent-dialog-root` testid, so those name the same element
			     they do in React and Svelte. -->
				<div
					v-bind="config.components?.dialog?.root"
					data-mode="dialog"
					data-slot="dialog-positioner"
					:class="dialogStyles.root"
					:data-disable-animation="disableAnimation ? true : undefined"
					aria-labelledby="consent-dialog-title"
					aria-describedby="consent-dialog-description"
				>
					<DialogContent
						v-bind="
							slotAttrs(config.components?.dialog?.container, [
								dialogStyles.container,
								dialogStyles.contentVisible,
							])
						"
						:data-blocking="surface.blocking ? 'true' : undefined"
						data-testid="consent-dialog-root"
						:[SURFACE_ROOT_ATTRIBUTE]="'dialog'"
						:dir="textDirection"
						aria-labelledby="consent-dialog-title"
						aria-describedby="consent-dialog-description"
					>
						<div
							v-bind="
								slotAttrs(config.components?.dialog?.card, dialogStyles.card)
							"
							data-testid="consent-dialog-card"
							tabindex="-1"
						>
							<div
								v-bind="
									slotAttrs(
										config.components?.dialog?.header,
										dialogStyles.header
									)
								"
								data-testid="consent-dialog-header"
							>
								<h2
									v-bind="
										slotAttrs(
											config.components?.dialog?.title,
											dialogStyles.title
										)
									"
									data-testid="consent-dialog-title"
									id="consent-dialog-title"
								>
									{{
										init?.translations?.translations?.consentManagerDialog
											?.title
									}}
								</h2>
								<ConsentDescription context="dialog" />
							</div>
							<div
								v-bind="
									slotAttrs(
										config.components?.dialog?.content,
										dialogStyles.content
									)
								"
								data-testid="consent-dialog-content"
							>
								<ConsentWidget />
							</div>
							<ConsentTag
								v-if="!(config.dialogHideBranding ?? config.hideBranding)"
								surface="dialog"
							/>
						</div>
					</DialogContent>
				</div>
			</DialogPortal>
		</DialogRoot>
	</template>
</template>
