<script setup lang="ts">
/**
 * The stock consent banner: a Card, Banner or Drawer. It loads the prompt
 * for the resolved container once a choice is owed, and keeps it mounted
 * after, so its exit, the page announcement and the focus return outlive
 * the prompt.
 *
 * One chunk per container, each with its own stylesheet, so a page
 * downloads only the container it shows. A page that never owes a choice
 * downloads none of them.
 */
import type { ConsentContainer, ConsentEdgeStyle } from '@inth/sdk/engine';
import {
	EARLY_TAP_NOTIFY_KEY,
	EARLY_TAP_ROOT,
	EARLY_TAP_STYLE_ID,
	earlyTapQueue,
} from '@inth/sdk/runtime/page-globals';
import { attachLiveRegion } from '@inth/sdk/ui/primitives/surface';
import type { LiveRegion } from '@inth/sdk/ui/primitives/surface';
import {
	computed,
	defineAsyncComponent,
	inject,
	onScopeDispose,
	provide,
	ref,
	shallowRef,
	Teleport,
	watch,
} from 'vue';

import {
	useConsentSnapshot,
	useOptInConfirmationHost,
} from '../../composables/kernel';
import { useConsentPolicyActions } from '../../composables/use-consent-policy-actions';
import { useMounted } from '../../composables/use-mounted';
import { useHydrationHold } from '../parts/hydration-hold';
import { useRetryableComponent } from '../parts/retryable-component';
import type { RetryableComponent } from '../parts/retryable-component';
import { promptContainers, promptContainersKey } from './containers';
import type { PromptContainers } from './containers';
import { bannerPageRegionKey } from './page-region';

/**
 * Local overrides for the prompt. Each one beats `presentation.prompt` and
 * the policy's `surface` block; leave them unset to follow those.
 * `blockUntilChoice` defaults to `undefined` on purpose: Vue would
 * otherwise cast an absent boolean prop to `false` and override the host
 * value.
 */
const props = withDefaults(
	defineProps<{
		/**
		 * A Card, Banner or Drawer, and where it sits. Positions are logical:
		 * `start` and `end` follow the writing direction.
		 */
		container?: ConsentContainer;
		/**
		 * `inset` floats a Banner or Drawer off the viewport edges; `flush`
		 * pins it to them. A Card is always inset.
		 */
		edgeStyle?: ConsentEdgeStyle;
		/**
		 * Block the page until the visitor makes a choice: backdrop, scroll
		 * lock, focus trap and no outside dismissal. A centred Card always
		 * blocks; a notice, an opt-out prompt or a policy that forbids
		 * blocking never does.
		 */
		blockUntilChoice?: boolean;
		/** Skip the enter and exit animations. Defaults to the config's. */
		disableAnimation?: boolean;
	}>(),
	{
		blockUntilChoice: undefined,
		container: undefined,
		disableAnimation: undefined,
		edgeStyle: undefined,
	}
);

const LazyOptInConfirmation = defineAsyncComponent(
	() => import('../opt-in-confirmation.vue')
);
const optInConfirmationActive = useOptInConfirmationHost();

const { actionGroups, presentation } = useConsentPolicyActions(
	'prompt',
	() => ({
		blockUntilChoice: props.blockUntilChoice,
		container: props.container,
		edgeStyle: props.edgeStyle,
	})
);
const resolvedContainer = computed(() => presentation.value.container);

const snapshot = useConsentSnapshot();
const owed = ref(snapshot.value.activeUI === 'banner');

// Under the Nuxt plugin's deferred context, a container the server
// rendered hydrates once its chunk arrives: until then the banner keeps
// the server's snapshot, so the container hydrates against the HTML.
const releaseHydration = owed.value ? useHydrationHold() : () => undefined;

const loaders = inject(promptContainersKey, promptContainers);
const type = computed<keyof PromptContainers>(
	() => resolvedContainer.value?.desktop.type ?? 'card'
);
// The server's prompt, while no container has mounted over it. A chunk
// that fails while hydrating leaves that markup on the page, outside
// Vue: a container that loads later mounts a new prompt of its own.
let serverPrompt: Element[] = [];
let containerMounted = false;
let stopTapRetry: (() => void) | undefined;

const onContainerMounted = () => {
	releaseHydration();
	containerMounted = true;
	stopTapRetry?.();
	for (const element of serverPrompt.splice(0)) {
		element.remove();
	}
};

// A container that failed: Vue loads it again on a trigger below.
const onFailed = () => {
	releaseHydration();
	if (typeof document === 'undefined') {
		return;
	}
	if (!containerMounted) {
		serverPrompt = [...document.querySelectorAll(EARLY_TAP_ROOT)];
	}
	// A tap the early-tap script held hid the server's prompt for the
	// container to replay. Show it again, and let the next tap on it load
	// the container, which replays the newest tap once it mounts.
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
	const queue = earlyTapQueue();
	if (!queue?.taps || stopTapRetry) {
		return;
	}
	const previous = queue[EARLY_TAP_NOTIFY_KEY];
	const notify = () => {
		previous?.();
		current.value.retry();
	};
	queue[EARLY_TAP_NOTIFY_KEY] = notify;
	stopTapRetry = () => {
		stopTapRetry = undefined;
		if (queue[EARLY_TAP_NOTIFY_KEY] === notify) {
			queue[EARLY_TAP_NOTIFY_KEY] = previous;
		}
	};
};
onScopeDispose(() => stopTapRetry?.());

// One loader per container shown, made when first shown. A failed one
// stays failed until the next trigger below.
const loads: Partial<Record<keyof PromptContainers, RetryableComponent>> = {};
const load = (name: keyof PromptContainers): RetryableComponent => {
	loads[name] ??= useRetryableComponent(loaders[name], onFailed);
	return loads[name];
};
const current = shallowRef(load(type.value));
watch(type, (name) => {
	current.value = load(name);
});

// A failed chunk leaves no consent UI of Vue's. Load again the next time
// the banner is owed, on the next snapshot while it is, or on a tap on
// the server's prompt (above).
const retry = () => {
	if (snapshot.value.activeUI === 'banner') {
		current.value.retry();
	}
};
watch(
	() => snapshot.value.activeUI,
	(activeUI) => {
		if (activeUI === 'banner') {
			owed.value = true;
		}
	},
	{ flush: 'sync' }
);
watch(snapshot, retry);

// The page's status region renders once a choice is owed, before the
// container's chunk arrives, as React's renders with its prompt. It
// outlives the prompt, so the outcome of a choice is read after the
// prompt leaves (BNR-06), and it keeps its node.
const mounted = useMounted();
const regionRef = ref<HTMLElement | null>(null);
const regionClass = ref<string | undefined>(undefined);
let region: LiveRegion | null = null;
watch(
	regionRef,
	(element, _previous, onCleanup) => {
		if (!element) {
			return;
		}
		const live = attachLiveRegion(element);
		region = live;
		onCleanup(() => {
			live();
			if (region === live) {
				region = null;
			}
		});
	},
	{ flush: 'post' }
);
provide(bannerPageRegionKey, {
	announce: (message) => region?.announce(message),
	hide: (className) => {
		regionClass.value = className;
	},
});
</script>

<template>
	<!-- The banner hosts the opt-in confirmation: it claimed the host, so no
	     other surface renders it. -->
	<LazyOptInConfirmation
		v-if="optInConfirmationActive"
		:disable-animation="props.disableAnimation"
	/>
	<Teleport
		v-if="owed"
		to="body"
		:disabled="!mounted"
	>
		<div
			ref="regionRef"
			:class="regionClass"
			data-testid="consent-banner-announcement"
		/>
	</Teleport>
	<component
		:is="current.component.value"
		v-if="resolvedContainer && owed && !current.failed.value"
		:container="resolvedContainer"
		:action-groups="actionGroups"
		:disable-animation="props.disableAnimation"
		@vue:mounted="onContainerMounted"
	/>
</template>
