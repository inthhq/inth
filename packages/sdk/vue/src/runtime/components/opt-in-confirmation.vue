<script setup lang="ts">
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
import {
	closeOptInConfirmation,
	confirmOptInConfirmation,
	isOptInConfirmationOpen,
	takeOptInConfirmationOpener,
} from '@inth/sdk/surface-actions';
import {
	resolveOptInConfirmationSentence,
	resolveOptOutCopy,
} from '@inth/sdk/surface-state';

import '@inth/sdk/ui/styles/components/button.css';
import buttonStyles from '@inth/sdk/ui/styles/components/button';

import '@inth/sdk/ui/styles/components/opt-out-confirmation.css';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { getTextDirection } from '@inth/sdk/ui/utils';
import { findFocusRestoreEquivalent } from '@inth/sdk/ui/utils/dom';
import { computed, onBeforeUnmount, watch } from 'vue';

import { useConsentConfig, useConsentInit, useConsentKernel } from '../composables';
import {
	useOptInConfirmationOpen,
	useOptOutReceipt,
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

const props = withDefaults(
	defineProps<{
		/** Skip enter and exit animations. Defaults to the config's. */
		disableAnimation?: boolean;
		/** Remove built-in styling when true. */
		noStyle?: boolean;
	}>(),
	{
		disableAnimation: undefined,
		noStyle: false,
	}
);

const kernel = useConsentKernel();
const config = useConsentConfig();
const init = useConsentInit();
const translations = useSurfaceTranslations();
const receipt = useOptOutReceipt();
const confirmationOpen = useOptInConfirmationOpen();

const optOutCopy = computed(() => resolveOptOutCopy(translations.value));
const sentence = computed(() =>
	resolveOptInConfirmationSentence(translations.value, receipt.value)
);
const textDirection = computed(() =>
	getTextDirection(init.value?.translations?.language)
);
const language = computed(() => init.value?.translations?.language);
const disableAnimation = computed(() =>
	Boolean(props.disableAnimation ?? config.value.disableAnimation)
);
const isOpen = computed(() => confirmationOpen.value);

const overlayClass = computed(() => {
	if (props.noStyle) {
		return undefined;
	}
	if (disableAnimation.value) {
		return styles.overlay;
	}
	return [
		styles.overlay,
		isOpen.value ? styles.overlayVisible : styles.overlayHidden,
	];
});

const positionerClass = computed(() => {
	if (props.noStyle) {
		return undefined;
	}
	if (disableAnimation.value) {
		return styles.root;
	}
	return [
		styles.root,
		isOpen.value ? styles.dialogVisible : styles.dialogHidden,
	];
});

const contentClass = computed(() => {
	if (props.noStyle) {
		return undefined;
	}
	if (disableAnimation.value) {
		return styles.container;
	}
	return [
		styles.container,
		isOpen.value ? styles.contentVisible : styles.contentHidden,
	];
});

const buttonAttrs = computed(() =>
	slotAttrs(
		config.value.components?.button?.secondary,
		props.noStyle ? undefined : buttonStyles.button
	)
);

let opener: HTMLElement | null = null;
const restoreFocus = function restoreFocus() {
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
		if (focusLost && !isOptInConfirmationOpen(kernel)) {
			findFocusRestoreEquivalent(previous)?.focus({ preventScroll: true });
		}
	}, 0);
};

watch(
	isOpen,
	(open) => {
		if (open) {
			const captured = takeOptInConfirmationOpener(kernel);
			if (captured) {
				opener = captured;
			}
			return;
		}
		restoreFocus();
	},
	{ immediate: true }
);
onBeforeUnmount(restoreFocus);

useConsentScrollLock(isOpen);

const cancel = function cancel() {
	closeOptInConfirmation(kernel);
};

const confirm = function confirm() {
	void confirmOptInConfirmation(kernel);
};
</script>

<template>
	<DialogRoot
		:open="isOpen"
		:modal="true"
		@update:open="(open) => !open && cancel()"
	>
		<DialogPortal>
			<DialogOverlay
				:class="overlayClass"
				:data-disable-animation="disableAnimation ? '' : undefined"
				data-stacked=""
				data-testid="opt-in-confirmation-overlay"
			/>
			<div
				:class="positionerClass"
				:data-disable-animation="disableAnimation ? '' : undefined"
				data-stacked=""
				:data-state="isOpen ? 'open' : 'closed'"
				:dir="textDirection"
			>
				<DialogContent
					:class="contentClass"
					aria-describedby="opt-in-confirmation-description"
					aria-labelledby="opt-in-confirmation-title"
					data-testid="opt-in-confirmation-root"
					:[SURFACE_ROOT_ATTRIBUTE]="'dialog'"
					:dir="textDirection"
					:lang="language"
				>
					<div
						:class="noStyle ? undefined : styles.card"
						data-testid="opt-in-confirmation-card"
						tabindex="-1"
					>
						<div
							:class="noStyle ? undefined : styles.header"
							data-testid="opt-in-confirmation-header"
						>
							<h2
								:class="noStyle ? undefined : styles.title"
								id="opt-in-confirmation-title"
								data-testid="opt-in-confirmation-title"
							>
								{{ optOutCopy.optInTitle }}
							</h2>
						</div>
						<p
							:class="noStyle ? undefined : styles.description"
							id="opt-in-confirmation-description"
							data-testid="opt-in-confirmation-description"
						>
							{{ sentence }}
						</p>
						<div
							:class="noStyle ? undefined : styles.footer"
							data-testid="opt-in-confirmation-footer"
						>
							<button
								v-bind="buttonAttrs"
								type="button"
								:data-mode="noStyle ? undefined : 'stroke'"
								:data-size="noStyle ? undefined : 'small'"
								:data-variant="noStyle ? undefined : 'neutral'"
								data-testid="opt-in-confirmation-cancel-button"
								@click="cancel"
							>
								{{ optOutCopy.optInCancel }}
							</button>
							<button
								v-bind="buttonAttrs"
								type="button"
								:data-mode="noStyle ? undefined : 'stroke'"
								:data-size="noStyle ? undefined : 'small'"
								:data-variant="noStyle ? undefined : 'neutral'"
								data-testid="opt-in-confirmation-confirm-button"
								@click="confirm"
							>
								{{ optOutCopy.optInConfirm }}
							</button>
						</div>
					</div>
				</DialogContent>
			</div>
		</DialogPortal>
	</DialogRoot>
</template>
