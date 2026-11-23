<script setup lang="ts">
/**
 * The consent prompt: a Card, Banner or Drawer that shows the same
 * content, copy and decisions in every container. The entry components
 * beside this file (`card.vue`, `strip.vue` for the Banner, and
 * `drawer.vue`) import the stylesheet of one container each and pass its
 * class names, so a page downloads only the container it renders.
 *
 * The in-place options load with `panel.vue`, which brings the `expand`
 * stylesheet; this file reads only its class names.
 */
import { commitBannerChoice, resolveOptOutState } from '@inth/sdk/engine';
import type {
	BannerCommitAction,
	PresentationAction,
	ResolvedConsentLayout,
} from '@inth/sdk/engine';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
import type { EarlyConsentTap } from '@inth/sdk/runtime/page-globals';
import type { ConsentLegalLinkKey } from '@inth/sdk/schema/config';
import { replayEarlyConsentTaps } from '@inth/sdk/surface-actions';
import {
	announcementText,
	resolveBannerAllowedAnnouncement,
	resolvePrivacyChoicesBannerCopy,
	resolvePrivacyChoicesVariant,
} from '@inth/sdk/surface-state';
import {
	afterMotion,
	attachPageBlock,
	attachScrollFades,
	attachTopLayerTrap,
} from '@inth/sdk/ui/primitives/surface';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import surfaceStyles from '@inth/sdk/ui/styles/components/consent-surface';

import '@inth/sdk/ui/styles/components/consent-surface.css';
import {
	getTextDirection,
	resolveBrandingTag,
	tabbableElements,
} from '@inth/sdk/ui/utils';
import { prefersReducedMotion } from '@inth/sdk/ui/utils/reduced-motion';
import {
	computed,
	h,
	inject,
	onBeforeUnmount,
	onMounted,
	ref,
	Teleport,
	useId,
	watch,
} from 'vue';

import { useConsentConfig } from '../../composables/config';
import { useConsentInit } from '../../composables/use-consent-init';
import {
	useConsentKernel,
	useConsentKernelContext,
	useConsentSnapshot,
	useHasConsentUi,
} from '../../composables/use-consent-kernel';
import { useMounted } from '../../composables/use-mounted';
import { useSurfaceTranslations } from '../../composables/use-surface-translations';
import { slotAttrs } from '../../utils/slot-attrs';
import type { RuntimeConsentConfig } from '../../vue-consent-kernel-context.model';
import { loadConsentDialog } from '../dialog/load-panel';
import ChoiceButton from '../parts/choice-button.vue';
import InlineLegalLinks from '../parts/inline-legal-links.vue';
import { provideChoiceDraft } from '../parts/use-choice-draft';
import { useHydrationHold } from '../parts/use-hydration-hold';
import { usePhoneLayout } from '../parts/use-phone-layout';
import { useRetryableComponent } from '../parts/use-retryable-component';
import {
	rightsBundleOf,
	useOptOutReceiptData,
	useSurfaceSession,
} from '../parts/use-surface-session';
import { bannerPageRegionKey } from './banner-page-region-key';
import EarlyTapScript from './early-tap-script';
import type {
	ActionGroups,
	ContainerStyles,
	PromptContainer,
} from './prompt.model';
import BannerTag from './tag.vue';

/** The options, loaded when Customize first opens them, or at once in a side Drawer. */
const loadPanel = () => import('./panel.vue');

/** Exits are 160ms; the controllers add their own slack. */
const EXIT_MS = 160;
const DEFAULT_MODELS = ['opt-in', 'opt-out'];
const DEFAULT_ACTION_GROUPS: ActionGroups = [
	['reject', 'accept'],
	['customize'],
];
/** The customize control: Customize, or a notice's rights link. */
const EXPAND_CONTROL =
	'[data-testid="consent-banner-customize-button"], [data-testid="consent-banner-right-link-opt-out"]';
const CARD_LINKS: ConsentLegalLinkKey[] = ['privacyPolicy', 'cookiePolicy'];
/**
 * Where focus goes after a choice (BNR-06, ARCH-03): React's targets, then
 * Vue's `ConsentDialogLink`, which stands in for its "Your Privacy
 * Choices" link.
 */
const RETURN_TARGETS = [
	'[data-testid="privacy-choices-link"]',
	'[data-testid="consent-dialog-trigger"]',
	'[data-testid="consent-dialog-link"]',
];

const props = defineProps<{
	container: PromptContainer;
	/**
	 * The first-layer actions the policy allows, in the host's order and
	 * groups. Absent, every action shows in the default order.
	 */
	actionGroups?: ActionGroups;
	/** Class names of this container's sheet. */
	presentation: ContainerStyles;
	/** Skip the exit. Defaults to the config's. */
	disableAnimation?: boolean;
}>();

type Phase = 'hidden' | 'shown' | 'leaving';

const kernel = useConsentKernel();
const snapshot = useConsentSnapshot();
const config = useConsentConfig();
const init = useConsentInit();
const hasConsentUi = useHasConsentUi();
const translations = useSurfaceTranslations();
const textDirection = computed(() =>
	getTextDirection(init.value?.translations?.language)
);
const { session, state } = useSurfaceSession();
const receiptData = useOptOutReceiptData();
const { draft } = provideChoiceDraft();
const phone = usePhoneLayout();
const mounted = useMounted();
const id = useId().replace(/:/gu, '');
const ids = {
	panel: `inth-pc-${id}-panel`,
	prefix: `inth-pc-${id}`,
	title: `inth-pc-${id}-title`,
};

const layout = computed<ResolvedConsentLayout>(() =>
	phone.value ? props.container.phone : props.container.desktop
);
// The effective model: an `iab` rule whose vendor list is unavailable
// falls back to the standard opt-in prompt.
const model = computed(() =>
	snapshot.value.resolution.status === 'matched'
		? snapshot.value.model
		: 'opt-in'
);
const variant = computed(() =>
	resolvePrivacyChoicesVariant({
		...snapshot.value.policyRule,
		model: model.value,
	})
);
const activeUI = computed(() => snapshot.value.activeUI ?? 'none');
const disableAnimation = computed(() =>
	Boolean(props.disableAnimation ?? config.value.disableAnimation)
);
const wantsShow = computed(() => {
	const configured = config.value.bannerModels ?? config.value.models;
	const models = configured?.length ? configured : DEFAULT_MODELS;
	return (
		hasConsentUi.value &&
		activeUI.value === 'banner' &&
		models.includes(model.value) &&
		variant.value !== 'none'
	);
});

const phase = ref<Phase>(wantsShow.value ? 'shown' : 'hidden');
// Follow the kernel. Opening the dialog removes the prompt at once, even
// mid-exit (PERM-05); any other end plays the exit, unless there is no
// motion to play.
watch(
	[wantsShow, activeUI],
	() => {
		if (wantsShow.value) {
			phase.value = 'shown';
		} else if (phase.value === 'shown') {
			phase.value =
				activeUI.value === 'dialog' ||
				disableAnimation.value ||
				prefersReducedMotion()
					? 'hidden'
					: 'leaving';
		} else if (phase.value === 'leaving' && activeUI.value === 'dialog') {
			phase.value = 'hidden';
		}
	},
	{ flush: 'sync' }
);

const rootRef = ref<HTMLElement | null>(null);
const shellRef = ref<HTMLElement | null>(null);
const cardRef = ref<HTMLElement | null>(null);
const scrollRef = ref<HTMLElement | null>(null);
// The page's status region is the banner's (`prompt.vue`), so it is on the
// page before this chunk arrives; its class comes with this stylesheet.
const pageRegion = inject(bannerPageRegionKey, null);
pageRegion?.hide(surfaceStyles.visuallyHidden);

/** A choice was made here: release, announce and return focus as the prompt leaves. */
let committed: string | null = null;
let pendingPanelFocus = false;
/** Folding the options returns focus to Customize once it renders again. */
let pendingExpandFocus = false;
const panelReady = ref(false);

const allInOne = computed(() => layout.value.flow === 'all-in-one');
const bar = computed(() => layout.value.type === 'banner');
const expanded = computed(() => !allInOne.value && state.value.expanded);
const barCollapsed = computed(() => bar.value && !expanded.value);
const showing = computed(() => phase.value !== 'hidden');
const blocking = computed(
	() => layout.value.blocking && phase.value === 'shown'
);
const optionsOpen = computed(() => allInOne.value || expanded.value);
const panelWanted = ref(allInOne.value);
const wantPanel = computed(() => panelWanted.value || optionsOpen.value);
// Options the server rendered (all-in-one) hydrate once their chunk
// arrives; the deferred banner keeps the server's snapshot until then.
const releasePanelHydration =
	showing.value && wantPanel.value ? useHydrationHold() : () => undefined;
// A failed chunk loads again on the next Customize or snapshot.
const panel = useRetryableComponent(loadPanel, releasePanelHydration);
watch(snapshot, () => panel.retry());

// All-in-one has nothing to fold. An expansion left from the phone Drawer
// would reopen when the viewport narrows again, and Escape would spend a
// press folding it with no Customize to focus (PERM-13).
watch(
	[allInOne, () => state.value.expanded],
	([isAllInOne, isExpanded]) => {
		if (!isAllInOne) {
			return;
		}
		pendingExpandFocus = false;
		if (isExpanded) {
			session.collapse();
		}
	},
	{ immediate: true }
);

watch(
	phase,
	(value, _previous, onCleanup) => {
		const root = rootRef.value;
		if (value !== 'leaving' || !root) {
			return;
		}
		onCleanup(
			afterMotion(
				root.querySelector('*') ?? root,
				() => {
					phase.value = 'hidden';
				},
				{ duration: EXIT_MS, reducedMotion: prefersReducedMotion() }
			)
		);
	},
	{ flush: 'post' }
);

/** Move focus to "Your Privacy Choices", or leave it where it is. */
const focusReturnTarget = () => {
	for (const selector of RETURN_TARGETS) {
		const target = document.querySelector<HTMLElement>(selector);
		if (target) {
			target.focus({ preventScroll: true });
			return;
		}
	}
};

// After a choice: the page is released, the outcome is announced in the
// page's status region, and focus moves to "Your Privacy Choices"
// (BNR-06). Not when the dialog took over.
watch(
	[phase, activeUI],
	() => {
		if (phase.value === 'shown' || committed === null) {
			return;
		}
		const message = committed;
		committed = null;
		if (activeUI.value === 'dialog') {
			return;
		}
		if (message) {
			pageRegion?.announce(message);
		}
		const active = document.activeElement;
		if (
			!active ||
			active === document.body ||
			rootRef.value?.contains(active)
		) {
			focusReturnTarget();
		}
	},
	{ flush: 'post' }
);

// Blocking (BNR-13): the shell, card and tag together, is the modal
// boundary (PERM-08). Focus moves to the card and stays in the shell.
watch(
	[blocking, rootRef, shellRef],
	(_value, _previous, onCleanup) => {
		const root = rootRef.value;
		const shell = shellRef.value;
		if (!(blocking.value && root && shell)) {
			return;
		}
		const release = attachPageBlock(root);
		const untrap = attachTopLayerTrap(shell, {
			initialFocus: cardRef.value ?? 'first-tabbable',
		});
		onCleanup(() => {
			untrap();
			release();
		});
	},
	{ flush: 'post', immediate: true }
);

// Escape folds the options or closes a confirmation, never the prompt
// (PERM-03, PERM-15).
const onKeyDown = (event: KeyboardEvent) => {
	if (event.key !== 'Escape' || event.defaultPrevented) {
		return;
	}
	const outcome = session.escape({
		blocking: layout.value.blocking,
		focusInside: Boolean(shellRef.value?.contains(document.activeElement)),
	});
	if (outcome === 'ignore') {
		return;
	}
	event.preventDefault();
	if (outcome === 'collapse') {
		pendingExpandFocus = true;
	}
};
watch(
	phase,
	(value, _previous, onCleanup) => {
		if (value !== 'shown' || typeof document === 'undefined') {
			return;
		}
		document.addEventListener('keydown', onKeyDown);
		onCleanup(() => document.removeEventListener('keydown', onKeyDown));
	},
	{ immediate: true }
);

// The options load with Customize, and warm on intent (`warm`). Unlike
// React's warming, importing the chunk applies its stylesheet, so it
// never loads in idle time: the folded panel keeps its unstyled box until
// the visitor reaches for the options, as React's does.

// The first control of the options takes focus once they render.
watch(
	[expanded, panelReady],
	(_value, _previous, onCleanup) => {
		if (!(expanded.value && panelReady.value && pendingPanelFocus)) {
			return;
		}
		pendingPanelFocus = false;
		// The panel's own rules arrive with it, and its content becomes
		// visible as they apply; try again for a few frames until it can
		// take focus.
		let frames = 0;
		let handle = 0;
		const focusFirst = () => {
			const first = scrollRef.value
				? tabbableElements(scrollRef.value)[0]
				: undefined;
			first?.focus({ preventScroll: true });
			if (!first || document.activeElement !== first) {
				frames += 1;
				if (frames < 20) {
					handle = requestAnimationFrame(focusFirst);
				}
			}
		};
		focusFirst();
		onCleanup(() => cancelAnimationFrame(handle));
	},
	{ flush: 'post' }
);

watch(
	expanded,
	(value) => {
		if (!value && pendingExpandFocus) {
			pendingExpandFocus = false;
			rootRef.value
				?.querySelector<HTMLElement>(EXPAND_CONTROL)
				?.focus({ preventScroll: true });
		}
	},
	{ flush: 'post' }
);

// Scroll-edge fades (LAY-08) on whichever scroll area shows.
watch(
	[optionsOpen, panelReady, scrollRef],
	(_value, _previous, onCleanup) => {
		const area = scrollRef.value;
		if (!(area && optionsOpen.value && panelReady.value)) {
			return;
		}
		onCleanup(attachScrollFades(area));
	},
	{ flush: 'post' }
);

const bundle = computed(() =>
	rightsBundleOf(snapshot.value, receiptData.value)
);
const gpc = computed(
	() => resolveOptOutState(snapshot.value).lock === 'gpc-active'
);
const copy = computed(() =>
	resolvePrivacyChoicesBannerCopy(translations.value, {
		bundle: bundle.value,
		gpc: gpc.value,
		variant: variant.value,
	})
);

const commit = (action: BannerCommitAction, actionAt?: number) => {
	const { plan } = commitBannerChoice(kernel, action, {
		actionAt,
		draft: action === 'save' ? draft : undefined,
		uiSource: 'banner',
	});
	let message = copy.value.saved;
	if (action === 'refuse') {
		message = copy.value.rejected;
	} else if (plan.keptOff !== null) {
		message = resolveBannerAllowedAnnouncement(translations.value, {
			bundle: bundle.value,
			gpc: plan.keptOff === 'gpc',
		});
	}
	committed = message;
};
const acknowledge = (actionAt?: number) => {
	committed = '';
	session.commit();
	void kernel.commands.dismissNotice(
		actionAt === undefined ? undefined : { actionAt }
	);
};
/** Start a chunk early. A failed load shows when the part renders. */
const preload = async (load: () => Promise<unknown>) => {
	try {
		await load();
	} catch {
		// The part's own load retries and reports it.
	}
};
const expand = () => {
	panel.retry();
	void preload(loadPanel);
	panelWanted.value = true;
	pendingPanelFocus = true;
	session.expand();
	session.announce(copy.value.expanded);
};
const warm = () => {
	void preload(loadPanel);
	void preload(loadConsentDialog);
};

// A tap on the server-rendered prompt before it hydrated is held by the
// inline script (`EarlyTapScript`). From here the prompt's own handlers
// work: stop the script and replay the tap through them once the runtime
// has started, so it commits through this prompt's plan and Customize
// opens the options in place. A choice records the time of the tap. The
// runtime is read when asked: under the deferred context it attaches later.
const kernelContext = useConsentKernelContext();
const nonce = computed(() => (config.value as RuntimeConsentConfig).nonce);
const replayTap = (tap: EarlyConsentTap) => {
	if (tap.action === 'accept') {
		commit('allow', tap.at);
	} else if (tap.action === 'reject') {
		commit('refuse', tap.at);
	} else if (tap.action === 'dismiss') {
		acknowledge(tap.at);
	} else if (tap.action === 'customize' && !allInOne.value) {
		expand();
	}
};
let stopEarlyTaps: (() => void) | undefined;
onMounted(() => {
	stopEarlyTaps = replayEarlyConsentTaps(kernel, {
		act: replayTap,
		started: () => kernelContext.runtime?.started ?? false,
	});
});
onBeforeUnmount(() => stopEarlyTaps?.());

// The "Consent by [INTH]" tag (BNR-11, §5). The hostname is read after
// mount, so server-rendered and hydrated HTML match.
const hostname = ref<string | undefined>(undefined);
onMounted(() => {
	hostname.value = window.location.hostname;
});
const hideBranding = computed(() =>
	Boolean(config.value.bannerHideBranding ?? config.value.hideBranding)
);
const tag = computed(() =>
	hideBranding.value
		? null
		: resolveBrandingTag({
				branding: init.value?.branding,
				hostname: hostname.value,
				noStyle: true,
				styles: {},
				surface: 'banner',
			})
);

const notice = computed(() => variant.value === 'notice');
// The policy's first-layer actions, in the host's order (BNR-15). A
// notice's "Your Privacy Choices" is the opt-out right, not an action, so
// it stays.
const summaryGroups = computed(() =>
	(props.actionGroups ?? DEFAULT_ACTION_GROUPS)
		.map((group) =>
			group.filter(
				(action) =>
					action === 'reject' || action === 'accept' || action === 'customize'
			)
		)
		.filter((group) => group.length > 0)
);

/** One summary button, so every container renders the same three. */
const SummaryButton = (buttonProps: {
	action: PresentationAction;
	label: string;
	expanded: boolean;
	inBar: boolean;
}) => {
	if (buttonProps.action === 'reject') {
		return h(
			ChoiceButton,
			{
				consentAction: 'reject',
				'data-testid': 'consent-banner-reject-button',
				earlyTap: true,
				onClick: () => commit('refuse'),
			},
			() => buttonProps.label
		);
	}
	if (buttonProps.action === 'accept') {
		return h(
			ChoiceButton,
			{
				consentAction: 'accept',
				'data-testid': 'consent-banner-accept-button',
				earlyTap: true,
				onClick: () => commit('allow'),
			},
			() => buttonProps.label
		);
	}
	return h(
		ChoiceButton,
		{
			'aria-controls': buttonProps.inBar ? undefined : ids.panel,
			'aria-expanded': buttonProps.expanded,
			consentAction: 'customize',
			'data-testid': 'consent-banner-customize-button',
			earlyTap: true,
			isPrimary: true,
			onClick: expand,
			onFocus: warm,
			onPointerenter: warm,
		},
		() => buttonProps.label
	);
};
SummaryButton.props = ['action', 'label', 'expanded', 'inBar'];
const summaryLabel = (action: PresentationAction, inBar: boolean): string => {
	if (action === 'reject') {
		return copy.value.reject;
	}
	if (action === 'accept') {
		return copy.value.accept;
	}
	return inBar ? copy.value.expandBar : copy.value.expand;
};
/** The host's group wrapper and its `banner.actionGroup` part. */
const groupAttrs = () => ({
	...slotAttrs(config.value.components?.banner?.actionGroup, [
		surfaceStyles.actionGroup,
		props.presentation.actionGroup,
	]),
	'data-testid': 'consent-banner-footer-sub-group',
});
/**
 * The summary in the host's groups. Every container, the collapsed
 * Banner included, keeps the groups and their `banner.actionGroup` part.
 */
const SummaryRow = (rowProps: { inBar: boolean }) =>
	summaryGroups.value.map((group) => {
		const buttons = group.map((action) =>
			h(SummaryButton, {
				action,
				expanded: expanded.value,
				inBar: rowProps.inBar,
				key: action,
				label: summaryLabel(action, rowProps.inBar),
			})
		);
		return group.length > 1
			? h('div', { ...groupAttrs(), key: group.join('-') }, buttons)
			: buttons[0];
	});
SummaryRow.props = ['inBar'];
const links = CARD_LINKS;
const barLinks: ConsentLegalLinkKey[] = ['privacyPolicy'];
const onPanelReady = () => {
	panelReady.value = true;
	releasePanelHydration();
};
</script>

<template>
	<Teleport
		to="body"
		:disabled="!mounted"
	>
		<EarlyTapScript
			v-if="showing"
			:nonce="nonce"
		/>
		<div
			v-if="showing"
			ref="rootRef"
			v-bind="
				slotAttrs(config.components?.banner?.root, [
					surfaceStyles.root,
					presentation.root,
				])
			"
			:data-model="model"
			:data-prompt="snapshot.policyRule.prompt"
			:data-placement="layout.placement"
			:data-flow="layout.flow"
			:data-edge-style="layout.edgeStyle"
			:data-blocking="layout.blocking ? 'true' : undefined"
			:data-expanded="expanded ? 'true' : undefined"
			:data-state="phase === 'leaving' ? 'closed' : 'open'"
			:data-variant="variant"
			:data-animation="disableAnimation ? 'off' : undefined"
			data-testid="consent-banner-root"
			:[SURFACE_ROOT_ATTRIBUTE]="'banner'"
			:dir="textDirection"
			:inert="phase === 'leaving' || undefined"
		>
			<div
				v-if="layout.blocking"
				v-bind="
					slotAttrs(config.components?.banner?.overlay, surfaceStyles.scrim)
				"
				aria-hidden="true"
				data-testid="consent-banner-overlay"
			/>
			<div
				ref="shellRef"
				v-bind="
					slotAttrs(config.components?.banner?.cardShell, [
						surfaceStyles.shell,
						presentation.shell,
					])
				"
				:role="layout.blocking ? 'dialog' : undefined"
				:aria-modal="layout.blocking ? true : undefined"
				:aria-labelledby="layout.blocking ? ids.title : undefined"
				data-testid="consent-banner-shell"
			>
				<BannerTag
					v-if="tag && !allInOne"
					:tag="tag"
					:class-name="presentation.tag"
				/>
				<section
					ref="cardRef"
					v-bind="
						slotAttrs(config.components?.banner?.card, [
							surfaceStyles.card,
							presentation.card,
						])
					"
					:role="layout.blocking ? undefined : 'region'"
					:aria-labelledby="layout.blocking ? undefined : ids.title"
					tabindex="-1"
					data-testid="consent-banner-card"
				>
					<template v-if="barCollapsed">
						<h2
							v-bind="
								slotAttrs(
									config.components?.banner?.title,
									surfaceStyles.visuallyHidden
								)
							"
							:id="ids.title"
							data-testid="consent-banner-title"
						>
							{{ copy.title }}
						</h2>
						<div :class="presentation.row">
							<p
								v-bind="
									slotAttrs(
										config.components?.description?.banner,
										presentation.text
									)
								"
								data-testid="consent-banner-description"
							>
								{{ copy.barDescription }}<InlineLegalLinks :links="barLinks" />
							</p>
							<div
								v-bind="
									slotAttrs(
										config.components?.banner?.footer,
										presentation.actions
									)
								"
								data-testid="consent-banner-footer"
							>
								<template v-if="notice">
									<!-- The collapsed bar has no panel to point at (PERM-09). -->
									<button
										type="button"
										v-bind="
											slotAttrs(
												config.components?.banner?.rightLink,
												surfaceStyles.rightLink
											)
										"
										:aria-expanded="expanded"
										data-action="customize"
										data-testid="consent-banner-right-link-opt-out"
										@click="expand"
										@focus="warm"
										@pointerenter="warm"
									>
										{{ copy.expandBar }}
									</button>
									<ChoiceButton
										consent-action="dismiss"
										is-primary
										early-tap
										data-testid="consent-banner-dismiss-button"
										@click="acknowledge()"
									>
										{{ copy.ok }}
									</ChoiceButton>
								</template>
								<SummaryRow
									v-else
									:in-bar="true"
								/>
							</div>
						</div>
						<output
							:class="surfaceStyles.visuallyHidden"
							aria-live="polite"
							aria-atomic="true"
							data-testid="consent-banner-status"
							>{{ announcementText(state.announcement) }}</output
						>
					</template>
					<template v-else>
						<div
							v-bind="
								slotAttrs(config.components?.banner?.header, [
									surfaceStyles.head,
									presentation.head,
								])
							"
							data-testid="consent-banner-header"
						>
							<h2
								v-bind="
									slotAttrs(
										config.components?.banner?.title,
										surfaceStyles.title
									)
								"
								:id="ids.title"
								data-testid="consent-banner-title"
							>
								{{ copy.title }}
							</h2>
							<p
								v-bind="
									slotAttrs(
										config.components?.description?.banner,
										surfaceStyles.description
									)
								"
								data-testid="consent-banner-description"
							>
								{{ copy.description }}<InlineLegalLinks :links="links" />
							</p>
						</div>
						<div
							v-if="allInOne"
							v-bind="
								slotAttrs(config.components?.banner?.expand, presentation.body)
							"
							data-testid="consent-banner-expand-panel"
						>
							<div
								ref="scrollRef"
								:class="expandStyles.scroll"
								data-testid="consent-banner-body"
							>
								<component
									:is="panel.component.value"
									v-if="wantPanel && !panel.failed.value"
									:variant="variant"
									:id-prefix="ids.prefix"
									ui-source="banner"
									@ready="onPanelReady"
								/>
							</div>
							<div
								v-if="tag"
								:class="presentation.tagSlot"
							>
								<BannerTag
									:tag="tag"
									:class-name="presentation.tag"
								/>
							</div>
						</div>
						<div
							v-else
							v-bind="
								slotAttrs(config.components?.banner?.expand, expandStyles.panel)
							"
							:id="ids.panel"
							:data-open="expanded"
							:inert="!expanded || undefined"
							data-testid="consent-banner-expand-panel"
						>
							<div :class="expandStyles.inner">
								<div
									ref="scrollRef"
									:class="expandStyles.scroll"
									data-testid="consent-banner-body"
								>
									<component
										:is="panel.component.value"
										v-if="wantPanel && !panel.failed.value"
										:variant="variant"
										:id-prefix="ids.prefix"
										ui-source="banner"
										@ready="onPanelReady"
									/>
								</div>
							</div>
						</div>
						<output
							:class="surfaceStyles.visuallyHidden"
							aria-live="polite"
							aria-atomic="true"
							data-testid="consent-banner-status"
							>{{ announcementText(state.announcement) }}</output
						>
						<div
							v-bind="
								slotAttrs(config.components?.banner?.footer, [
									surfaceStyles.footer,
									presentation.footer,
								])
							"
							data-testid="consent-banner-footer"
						>
							<template v-if="optionsOpen">
								<ChoiceButton
									v-if="notice"
									consent-action="dismiss"
									is-primary
									early-tap
									data-testid="consent-banner-dismiss-button"
									@click="acknowledge()"
								>
									{{ copy.ok }}
								</ChoiceButton>
								<template v-else>
									<div v-bind="groupAttrs()">
										<ChoiceButton
											consent-action="reject"
											early-tap
											data-testid="consent-banner-reject-button"
											@click="commit('refuse')"
										>
											{{ copy.rejectExpanded }}
										</ChoiceButton>
										<ChoiceButton
											consent-action="accept"
											early-tap
											data-testid="consent-banner-accept-button"
											@click="commit('allow')"
										>
											{{ copy.acceptExpanded }}
										</ChoiceButton>
									</div>
									<ChoiceButton
										consent-action="save"
										is-primary
										:part="config.components?.banner?.saveButton"
										data-testid="consent-banner-save-button"
										@click="commit('save')"
									>
										{{ copy.save }}
									</ChoiceButton>
								</template>
							</template>
							<template v-else-if="notice">
								<!-- The notice's rights action reads as a link, in the
								     text-on-surface blue in both palettes (VIS-02). -->
								<button
									type="button"
									v-bind="
										slotAttrs(
											config.components?.banner?.rightLink,
											surfaceStyles.rightLink
										)
									"
									:aria-expanded="expanded"
									:aria-controls="ids.panel"
									data-action="customize"
									data-testid="consent-banner-right-link-opt-out"
									@click="expand"
									@focus="warm"
									@pointerenter="warm"
								>
									{{ copy.expand }}
								</button>
								<ChoiceButton
									consent-action="dismiss"
									is-primary
									early-tap
									data-testid="consent-banner-dismiss-button"
									@click="acknowledge()"
								>
									{{ copy.ok }}
								</ChoiceButton>
							</template>
							<SummaryRow
								v-else
								:in-bar="false"
							/>
						</div>
					</template>
				</section>
			</div>
		</div>
	</Teleport>
</template>
