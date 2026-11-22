<script setup lang="ts">
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
import {
	claimOptOutConfirmationHost,
	closeOptOutConfirmation,
	isOptOutConfirmationOpen,
	takeOptOutConfirmationOpener,
} from '@inth/sdk/surface-actions';
import {
	resolveOptOutCopy,
	resolveOptOutLink,
	resolveOptOutReceiptSentence,
	resolvePreferenceControlLabels,
} from '@inth/sdk/surface-state';

import '@inth/sdk/ui/styles/components/button.css';
import buttonStyles from '@inth/sdk/ui/styles/components/button';

import '@inth/sdk/ui/styles/components/opt-out-confirmation.css';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { getTextDirection } from '@inth/sdk/ui/utils';
import { findFocusRestoreEquivalent } from '@inth/sdk/ui/utils/dom';
import { computed, mergeProps, onBeforeUnmount, onMounted, watch } from 'vue';

import {
	useConsentActiveUI,
	useConsentConfig,
	useConsentInit,
	useConsentKernel,
	useConsentSnapshot,
} from '../composables';
import { useResolvedPresentation } from '../composables/experiment';
import {
	useOptOutConfirmationOpen,
	useOptOutState,
} from '../composables/kernel';
import { useConsentScrollLock } from '../composables/use-consent-scroll-lock';
import { useSurfaceTranslations } from '../composables/use-surface-translations';
import {
	DialogContent,
	DialogOverlay,
	DialogPortal,
	DialogRoot,
} from '../primitives';
import { slotAttrs } from '../utils/slot-attrs';
import OptOutReceiptDetails from './opt-out-receipt-details.vue';

const props = withDefaults(
	defineProps<{
		/** Explicitly control visibility. Defaults to the opt-out confirmation state. */
		open?: boolean;
		/** Skip enter and exit animations. Defaults to the config's. */
		disableAnimation?: boolean;
		/**
		 * Marks an embedded host inside `InthProvider` or `ConsentManager`.
		 *
		 * @internal
		 */
		embedded?: boolean;
	}>(),
	{
		disableAnimation: undefined,
		embedded: false,
		open: undefined,
	}
);

const emit = defineEmits<{
	close: [];
}>();

const kernel = useConsentKernel();
const snapshot = useConsentSnapshot();
const activeUI = useConsentActiveUI();
const config = useConsentConfig();
const init = useConsentInit();
const presentation = useResolvedPresentation();
const translations = useSurfaceTranslations();
const confirmationOpen = useOptOutConfirmationOpen();
const optOutState = useOptOutState();

let releaseHost: (() => void) | undefined;
onMounted(() => {
	if (!props.embedded) {
		releaseHost = claimOptOutConfirmationHost(
			kernel,
			Symbol('OptOutConfirmation')
		);
	}
});
onBeforeUnmount(() => {
	releaseHost?.();
});

const optOutCopy = computed(() => resolveOptOutCopy(translations.value));
const optOutLink = computed(() =>
	resolveOptOutLink(translations.value, presentation.value?.optOutLink)
);
const receiptSentence = computed(() =>
	resolveOptOutReceiptSentence(translations.value, optOutState.value)
);
const controls = computed(() =>
	resolvePreferenceControlLabels(translations.value)
);
const statusText = computed(() =>
	optOutState.value.via === 'signal'
		? optOutCopy.value.statusSignal
		: optOutCopy.value.statusRequest
);
const textDirection = computed(() =>
	getTextDirection(init.value?.translations?.language)
);
const language = computed(() => init.value?.translations?.language);
const disableAnimation = computed(() =>
	Boolean(props.disableAnimation ?? config.value.disableAnimation)
);

const isOpen = computed(() => {
	if (props.open !== undefined) {
		return props.open;
	}
	return (
		confirmationOpen.value &&
		activeUI.value !== 'manager' &&
		snapshot.value.policyRule.model !== 'iab' &&
		optOutState.value.honored
	);
});

let opener: HTMLElement | null = null;
watch(
	isOpen,
	(open) => {
		if (open) {
			const captured = takeOptOutConfirmationOpener(kernel);
			if (captured) {
				opener = captured;
			}
			return;
		}
		if (!opener) {
			return;
		}
		const previous = opener;
		opener = null;
		setTimeout(() => {
			const active = document.activeElement;
			const focusLost =
				!active ||
				active === document.body ||
				active === document.documentElement;
			if (
				focusLost &&
				!isOptOutConfirmationOpen(kernel) &&
				kernel.getSnapshot().activeUI !== 'dialog'
			) {
				findFocusRestoreEquivalent(previous)?.focus({ preventScroll: true });
			}
		}, 0);
	},
	{ immediate: true }
);

useConsentScrollLock(isOpen);

const close = function close() {
	closeOptOutConfirmation(kernel);
	emit('close');
};

const openPreferences = function openPreferences(event: MouseEvent) {
	event.preventDefault();
	activeUI.value = 'manager';
};

const doneButtonAttrs = computed(() =>
	mergeProps(
		slotAttrs(config.value.components?.button?.primary, buttonStyles.button),
		slotAttrs(
			config.value.components?.['opt-out-confirmation']?.doneButton,
			undefined
		)
	)
);
const preferencesLinkAttrs = computed(() =>
	slotAttrs(
		config.value.components?.['opt-out-confirmation']?.preferencesLink,
		styles.preferencesLink
	)
);
</script>

<template>
	<DialogRoot
		:open="isOpen"
		:modal="true"
		@update:open="(open) => !open && close()"
	>
		<DialogPortal>
			<DialogOverlay
				v-bind="
					slotAttrs(config.components?.['opt-out-confirmation']?.overlay, [
						styles.overlay,
						disableAnimation
							? undefined
							: isOpen
								? styles.overlayVisible
								: styles.overlayHidden,
					])
				"
				data-testid="opt-out-confirmation-overlay"
				:data-disable-animation="disableAnimation ? '' : undefined"
			/>
			<div
				:class="[
					styles.root,
					disableAnimation
						? undefined
						: isOpen
							? styles.dialogVisible
							: styles.dialogHidden,
				]"
				:data-disable-animation="disableAnimation ? '' : undefined"
				:data-state="isOpen ? 'open' : 'closed'"
				:dir="textDirection"
			>
				<DialogContent
					v-bind="
						slotAttrs(config.components?.['opt-out-confirmation']?.root, [
							styles.container,
							disableAnimation
								? undefined
								: isOpen
									? styles.contentVisible
									: styles.contentHidden,
						])
					"
					aria-describedby="opt-out-confirmation-description"
					aria-labelledby="opt-out-confirmation-title"
					data-testid="opt-out-confirmation-root"
					:[SURFACE_ROOT_ATTRIBUTE]="'dialog'"
					:dir="textDirection"
					:lang="language"
				>
					<div
						v-bind="
							slotAttrs(
								config.components?.['opt-out-confirmation']?.card,
								styles.card
							)
						"
						data-testid="opt-out-confirmation-card"
						tabindex="-1"
					>
						<div
							v-bind="
								slotAttrs(
									config.components?.['opt-out-confirmation']?.header,
									styles.header
								)
							"
							data-testid="opt-out-confirmation-header"
						>
							<h2
								v-bind="
									slotAttrs(
										config.components?.['opt-out-confirmation']?.title,
										styles.title
									)
								"
								id="opt-out-confirmation-title"
								data-testid="opt-out-confirmation-title"
							>
								{{ optOutLink.label }}
							</h2>
						</div>
						<p
							v-bind="
								slotAttrs(
									config.components?.['opt-out-confirmation']?.status,
									styles.status
								)
							"
							role="status"
							data-testid="opt-out-confirmation-status"
						>
							{{ statusText }}
						</p>
						<p
							v-bind="
								slotAttrs(
									config.components?.['opt-out-confirmation']?.description,
									styles.description
								)
							"
							id="opt-out-confirmation-description"
							data-testid="opt-out-confirmation-description"
						>
							{{ receiptSentence }}
						</p>
						<OptOutReceiptDetails />
						<div
							v-bind="
								slotAttrs(
									config.components?.['opt-out-confirmation']?.footer,
									styles.footer
								)
							"
							data-testid="opt-out-confirmation-footer"
						>
							<button
								v-bind="doneButtonAttrs"
								type="button"
								data-mode="filled"
								data-size="small"
								data-variant="primary"
								data-testid="opt-out-confirmation-done-button"
								@click="close"
							>
								{{ optOutCopy.done }}
							</button>
							<a
								v-bind="preferencesLinkAttrs"
								href="#inth-preferences"
								data-testid="opt-out-confirmation-preferences-link"
								@click="openPreferences"
							>
								{{ controls.preferences }}
							</a>
						</div>
					</div>
				</DialogContent>
			</div>
		</DialogPortal>
	</DialogRoot>
</template>
