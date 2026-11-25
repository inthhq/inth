<script setup lang="ts">
import type { ConsentDialogTriggerSize } from '@inth/sdk/schema/config';
import { activateOptOutLink, isOptOutTrigger } from '@inth/sdk/surface-actions';
import {
	resolveOptOutLink,
	resolveTriggerLabels,
} from '@inth/sdk/surface-state';
import triggerStyles from '@inth/sdk/ui/styles/components/consent-dialog-trigger';
import { followDevToolsDock } from '@inth/sdk/ui/utils/devtools-launcher';
import {
	createInitialDragState,
	createTriggerDrag,
	getPersistedPosition,
	isTriggerVisible,
	nextToolbarItem,
	onSnapEnd,
	toolbarOrder,
} from '@inth/sdk/ui/utils/trigger-utils';
import type {
	CornerPosition,
	DragState,
	TriggerToolbarItem,
} from '@inth/sdk/ui/utils/trigger-utils';

import '@inth/sdk/ui/styles/components/consent-dialog-trigger.css';
import { computed, onMounted, ref, watch } from 'vue';

import {
	useConsentActiveUI,
	useConsentConfig,
	useConsentInit,
} from '#inth/composables';

import {
	useConsentKernel,
	useConsentSnapshot,
	useHasConsentPreferences,
	useOptOutConfirmationOpen,
	usePolicyRule,
	usePromptRequirement,
} from '../composables/use-consent-kernel';
import { useDevToolsLauncher } from '../composables/use-devtools-launcher';
import { useResolvedPresentation } from '../composables/use-experiment';
import { useMounted } from '../composables/use-mounted';
import { useSurfaceTranslations } from '../composables/use-surface-translations';
import { slotAttrs } from '../utils/slot-attrs';
import TriggerIcon from './trigger-icon.vue';

const kernel = useConsentKernel();
const activeUI = useConsentActiveUI();
const config = useConsentConfig();
const policy = usePolicyRule();
const snapshot = useConsentSnapshot();
const presentation = useResolvedPresentation();
const init = useConsentInit();
const translations = useSurfaceTranslations();
const confirmationOpen = useOptOutConfirmationOpen();

const mounted = useMounted();
const triggerRef = ref<HTMLElement | null>(null);

const isOptOut = computed(() => isOptOutTrigger(snapshot.value));
const labels = computed(() => resolveTriggerLabels(translations.value));
const optOutLink = computed(() =>
	resolveOptOutLink(translations.value, presentation.value?.optOutLink)
);
const triggerLabel = computed(
	() =>
		config.value.triggerAriaLabel ??
		(isOptOut.value ? optOutLink.value.label : labels.value.label)
);

const hasConsentPreferences = useHasConsentPreferences();
const promptRequirement = usePromptRequirement();
const isVisible = computed(
	() =>
		mounted.value &&
		isTriggerVisible({
			dialogOpen: activeUI.value === 'dialog' || confirmationOpen.value,
			hasConsentPreferences: hasConsentPreferences.value,
			promptOwed: promptRequirement.value.kind !== 'none',
			showWhen: config.value.triggerShowWhen ?? 'after-consent',
		})
);

// With <ConsentDevTools> mounted, the trigger becomes a two-item toolbar
// that carries the DevTools launcher, so one control occupies the corner.
const devTools = useDevToolsLauncher(kernel, isVisible);
const showToolbar = devTools.available;
const devToolsOpen = devTools.isOpen;

const corner = ref<CornerPosition>(
	config.value.triggerDefaultPosition ?? 'bottom-right'
);
onMounted(() => {
	if (config.value.triggerPersistPosition === false) {
		return;
	}
	const persisted = getPersistedPosition();
	if (persisted) {
		corner.value = persisted;
	}
});

const dragState = ref<DragState>(createInitialDragState());
const isDragging = computed(() => dragState.value.isDragging);
const isSnapping = ref(false);
const drag = createTriggerDrag({
	corner: () => corner.value,
	onCorner: (next) => {
		isSnapping.value = true;
		corner.value = next;
	},
	onDrag: (next) => {
		dragState.value = next;
	},
	persist: () => config.value.triggerPersistPosition !== false,
});

const onPointerDown = function onPointerDown(event: PointerEvent) {
	if (event.button === 0) {
		isSnapping.value = false;
	}
	drag.pointerDown(event);
};

// The snapping class stays on until the move to the new corner ends.
watch(
	[isSnapping, triggerRef],
	([snapping, element], _previous, onCleanup) => {
		if (snapping && element) {
			onCleanup(
				onSnapEnd(element, () => {
					isSnapping.value = false;
				})
			);
		}
	},
	{ flush: 'post' }
);

const dragStyle = computed(() => {
	const state = dragState.value;
	return state.isDragging
		? {
				transform: `translate(${state.currentX - state.startX}px, ${state.currentY - state.startY}px)`,
				transition: 'none',
			}
		: undefined;
});

const cornerClassMap = {
	'bottom-left': triggerStyles.bottomLeft,
	'bottom-right': triggerStyles.bottomRight,
	'top-left': triggerStyles.topLeft,
	'top-right': triggerStyles.topRight,
} as const satisfies Record<CornerPosition, string>;

const motionClasses = computed(() => [
	cornerClassMap[corner.value],
	isDragging.value && triggerStyles.dragging,
	isSnapping.value && triggerStyles.snapping,
]);

const openDialog = function openDialog(event: MouseEvent) {
	if (!drag.endsDrag(event)) {
		if (isOptOut.value) {
			void activateOptOutLink(kernel, optOutLink.value.variant);
		} else {
			activeUI.value = 'dialog';
		}
	}
};

// Keep a docked DevTools panel beside the toolbar as it moves corners or
// changes size. Skip mid-drag; the drop re-runs this.
watch(
	[devTools.instance, triggerRef, corner, isDragging],
	([instance, element, nextCorner, dragging], _previous, onCleanup) => {
		if (!instance || !element || dragging) {
			return;
		}
		onCleanup(
			followDevToolsDock(element, nextCorner, (placement) =>
				instance.dock(placement)
			)
		);
	},
	{ flush: 'post', immediate: true }
);

const toolbarItems = computed<readonly TriggerToolbarItem[]>(() =>
	devTools.instance.value ? toolbarOrder(corner.value) : ['preferences']
);

const preferencesRight = computed(() =>
	policy.value.rights.includes('opt-out') ? 'opt-out' : 'preferences'
);

const sizeClassMap = {
	lg: triggerStyles.lg,
	md: triggerStyles.md,
	sm: triggerStyles.sm,
} as const satisfies Record<ConsentDialogTriggerSize, string>;

const sizeClass = computed(
	() =>
		sizeClassMap[(config.value.triggerSize ?? 'md') as ConsentDialogTriggerSize]
);

const activeItem = ref<TriggerToolbarItem>('preferences');
const focusedItem = computed<TriggerToolbarItem>(() =>
	toolbarItems.value.includes(activeItem.value)
		? activeItem.value
		: 'preferences'
);
const itemElements = new Map<TriggerToolbarItem, HTMLButtonElement>();
const setItemElement = function setItemElement(
	kind: TriggerToolbarItem,
	element: unknown
) {
	if (element instanceof HTMLButtonElement) {
		itemElements.set(kind, element);
	} else {
		itemElements.delete(kind);
	}
};

const handleToolbarKeyDown = function handleToolbarKeyDown(
	event: KeyboardEvent
) {
	const next = nextToolbarItem(
		toolbarItems.value,
		focusedItem.value,
		event.key
	);
	if (!next) {
		return;
	}
	event.preventDefault();
	activeItem.value = next;
	itemElements.get(next)?.focus();
};

const selectItem = function selectItem(
	kind: TriggerToolbarItem,
	event: MouseEvent
) {
	if (kind === 'preferences') {
		openDialog(event);
	} else if (!drag.endsDrag(event)) {
		devTools.instance.value?.toggle();
	}
};
</script>

<template>
	<Teleport
		v-if="mounted"
		to="body"
	>
		<div
			v-if="isVisible && showToolbar"
			ref="triggerRef"
			v-bind="
				slotAttrs(config.components?.trigger?.toolbar, [
					triggerStyles.toolbar,
					...motionClasses,
				])
			"
			role="toolbar"
			:aria-label="labels.toolbarLabel"
			aria-orientation="horizontal"
			dir="ltr"
			tabindex="-1"
			:data-corner="corner"
			data-inth-trigger-toolbar="true"
			data-inth-trigger="true"
			:data-dragging="isDragging ? true : undefined"
			:data-snapping="isSnapping ? true : undefined"
			:data-disable-animation="config.disableAnimation ? true : undefined"
			:style="[config.components?.trigger?.toolbar?.style, dragStyle]"
			@keydown="handleToolbarKeyDown"
			@pointerdown="onPointerDown"
			@pointermove="drag.pointerMove"
			@pointerup="drag.pointerUp"
			@pointercancel="drag.pointerCancel"
		>
			<button
				v-for="kind in toolbarItems"
				:key="kind"
				:ref="(element) => setItemElement(kind, element)"
				v-bind="
					slotAttrs(config.components?.trigger?.toolbarItem, [
						triggerStyles.toolbarItem,
						sizeClass,
					])
				"
				type="button"
				:aria-label="kind === 'devtools' ? labels.devToolsLabel : triggerLabel"
				:aria-expanded="kind === 'devtools' ? devToolsOpen : undefined"
				:data-inth-rights="
					kind === 'preferences' ? policy.rights.join(' ') : undefined
				"
				:data-inth-trigger-action="kind"
				:data-inth-trigger-item="kind"
				:data-right="kind === 'preferences' ? preferencesRight : undefined"
				:tabindex="kind === focusedItem ? 0 : -1"
				@click="selectItem(kind, $event)"
				@focus="activeItem = kind"
			>
				<span
					v-bind="
						slotAttrs(
							config.components?.trigger?.toolbarIcon,
							triggerStyles.toolbarIcon
						)
					"
					aria-hidden="true"
				>
					<svg
						v-if="kind === 'devtools'"
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="m18 16 4-4-4-4" />
						<path d="m6 8-4 4 4 4" />
						<path d="m14.5 4-5 16" />
					</svg>
					<TriggerIcon
						v-else
						:icon="config.triggerIcon"
						:branding="init?.branding"
					/>
				</span>
			</button>
		</div>
		<button
			v-else-if="isVisible"
			ref="triggerRef"
			v-bind="
				slotAttrs(config.components?.trigger?.root, [
					triggerStyles.trigger,
					...motionClasses,
				])
			"
			type="button"
			data-testid="consent-dialog-trigger"
			data-inth-trigger="true"
			:data-inth-rights="policy.rights.join(' ')"
			:data-size="config.triggerSize"
			:data-dragging="isDragging ? true : undefined"
			:data-snapping="isSnapping ? true : undefined"
			:data-disable-animation="config.disableAnimation ? true : undefined"
			:style="[config.components?.trigger?.root?.style, dragStyle]"
			:aria-label="triggerLabel"
			@click="openDialog"
			@pointerdown="onPointerDown"
			@pointermove="drag.pointerMove"
			@pointerup="drag.pointerUp"
			@pointercancel="drag.pointerCancel"
		>
			<span
				v-bind="slotAttrs(config.components?.trigger?.icon, triggerStyles.icon)"
				aria-hidden="true"
			>
				<TriggerIcon
					:icon="config.triggerIcon"
					:branding="init?.branding"
				/>
			</span>
			<span
				v-if="config.components?.trigger?.text"
				v-bind="config.components?.trigger?.text"
				:class="triggerStyles.text"
			>
				{{ triggerLabel }}
			</span>
		</button>
	</Teleport>
</template>
