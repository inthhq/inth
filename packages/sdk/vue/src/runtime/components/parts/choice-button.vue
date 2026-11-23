<script setup lang="ts">
import type { ButtonMode, ButtonVariant } from '@inth/sdk/schema/config';
import { EARLY_TAP_OPT_OUT } from '@inth/sdk/surface-actions';
import buttonStyles from '@inth/sdk/ui/styles/components/button';

import '@inth/sdk/ui/styles/components/button.css';
import { resolveActionAppearance } from '@inth/sdk/ui/theme';
import type { ConsentActionKey } from '@inth/sdk/ui/theme';
import { computed, ref } from 'vue';

import { useConsentConfig } from '../../composables/config';
import { slotAttrs } from '../../utils/slot-attrs';

/**
 * A prompt or dialog button, rendered as React's `ConsentButton` renders
 * it: the theme's `consentActions` pick its variant and mode, unless the
 * button sets them, and a `components` part styles it. It records nothing
 * itself; the surface's click handler does.
 */
const props = withDefaults(
	defineProps<{
		/** The theme `consentActions` key, also rendered as `data-action`. */
		consentAction?: ConsentActionKey;
		isPrimary?: boolean;
		variant?: ButtonVariant;
		mode?: ButtonMode;
		/**
		 * The button's own `components` part, such as `banner.saveButton`.
		 * Defaults to `button.primary` or `button.secondary`.
		 */
		part?: object;
		/** A class the surface adds beside the stock button class. */
		baseClass?: string;
		disabled?: boolean;
		/**
		 * The click is the banner's own handler for `consentAction`, which
		 * replays a tap the pre-hydration script held. Off, the script leaves
		 * the button alone.
		 */
		earlyTap?: boolean;
	}>(),
	{
		baseClass: undefined,
		consentAction: undefined,
		disabled: false,
		earlyTap: false,
		isPrimary: false,
		mode: undefined,
		part: undefined,
		variant: undefined,
	}
);

/** The `data-action` values the banner's pre-hydration script replays. */
const EARLY_TAP_ACTIONS = new Set(['accept', 'customize', 'dismiss', 'reject']);

const config = useConsentConfig();
const appearance = computed(() => {
	if (props.variant || props.mode) {
		return {
			mode: props.mode ?? 'stroke',
			variant: props.variant ?? 'neutral',
		};
	}
	// A button without an action has no key of its own, as `save` has none.
	return resolveActionAppearance(
		config.value.theme,
		props.consentAction ?? 'save',
		props.isPrimary
	);
});
const attributes = computed(() => {
	const part =
		props.part ??
		(appearance.value.variant === 'primary'
			? config.value.components?.button?.primary
			: config.value.components?.button?.secondary);
	return slotAttrs(part, [buttonStyles.button, props.baseClass]);
});
/**
 * The pre-hydration script replays a tap from `data-action` alone, so a
 * button whose click the banner does not replay opts out.
 */
const earlyTapOptOut = computed(() =>
	!props.earlyTap &&
	props.consentAction &&
	EARLY_TAP_ACTIONS.has(props.consentAction)
		? { [EARLY_TAP_OPT_OUT]: 'off' }
		: undefined
);

const element = ref<HTMLButtonElement | null>(null);
defineExpose({ element });
</script>

<template>
	<button
		ref="element"
		:data-variant="appearance.variant"
		:data-mode="appearance.mode"
		data-size="small"
		:data-action="consentAction"
		type="button"
		:disabled="disabled || undefined"
		v-bind="{ ...attributes, ...earlyTapOptOut }"
	>
		<slot />
	</button>
</template>
