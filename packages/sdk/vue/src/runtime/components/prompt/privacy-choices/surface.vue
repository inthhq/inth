<script setup lang="ts">
/**
 * The Privacy Choices consent prompt (v6): a Card, Banner or Drawer that
 * shows the same content, copy and decisions in every presentation. The
 * entry components beside this file (`card.vue`, `bar.vue`, `drawer.vue`)
 * import the stylesheet of one presentation each and pass its class names,
 * so a page downloads only the presentation it renders.
 *
 * The in-place options load with `panel.vue`, which brings the `expand`
 * stylesheet; this file reads only its class names.
 */
import { commitBannerChoice, resolveOptOutState } from '@inth/sdk/engine';
import type {
	BannerCommitAction,
	ResolvedConsentLayout,
} from '@inth/sdk/engine';
import type { ConsentLegalLinkKey } from '@inth/sdk/schema/config';
import {
	announcementText,
	resolveBannerAllowedAnnouncement,
	resolvePrivacyChoicesBannerCopy,
	resolvePrivacyChoicesVariant,
} from '@inth/sdk/surface-state';
import {
	afterMotion,
	attachLiveRegion,
	attachPageBlock,
	attachScrollFades,
	attachTopLayerTrap,
} from '@inth/sdk/ui/primitives/surface';
import type { LiveRegion } from '@inth/sdk/ui/primitives/surface';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import surfaceStyles from '@inth/sdk/ui/styles/components/consent-surface';

import '@inth/sdk/ui/styles/components/consent-surface.css';
import { resolveBrandingTag, tabbableElements } from '@inth/sdk/ui/utils';
import { prefersReducedMotion } from '@inth/sdk/ui/utils/reduced-motion';
import {
	computed,
	defineAsyncComponent,
	onBeforeUnmount,
	onMounted,
	ref,
	Teleport,
	useId,
	watch,
} from 'vue';

import { useConsentConfig } from '../../../composables/config';
import { useConsentInit } from '../../../composables/init';
import {
	useConsentKernel,
	useConsentSnapshot,
	useHasConsentUi,
} from '../../../composables/kernel';
import { useMounted } from '../../../composables/use-mounted';
import { useSurfaceTranslations } from '../../../composables/use-surface-translations';
import { slotAttrs } from '../../../utils/slot-attrs';
import { loadPrivacyChoicesDialog } from '../../privacy-choices-dialog/load';
import ChoiceButton from '../../privacy-choices/choice-button.vue';
import { provideChoiceDraft } from '../../privacy-choices/draft';
import InlineLegalLinks from '../../privacy-choices/inline-legal-links.vue';
import { usePhoneLayout } from '../../privacy-choices/use-phone-layout';
import {
	rightsBundleOf,
	useSurfaceSession,
} from '../../privacy-choices/use-surface-session';
import BannerTag from './tag.vue';
import type { PresentationStyles, PrivacyChoicesContainer } from './types';

/** The options, loaded when Customize first opens them, or at once in a side Drawer. */
const loadPanel = () => import('./panel.vue');
const LazyPanel = defineAsyncComponent(loadPanel);

/** Exits are 160ms; the controllers add their own slack. */
const EXIT_MS = 160;
const DEFAULT_MODELS = ['opt-in', 'opt-out'];
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
	container: PrivacyChoicesContainer;
	/** Class names of this presentation's sheet. */
	presentation: PresentationStyles;
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
const { session, state } = useSurfaceSession();
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
const variant = computed(() =>
	resolvePrivacyChoicesVariant(snapshot.value.policyRule)
);
const activeUI = computed(() => snapshot.value.activeUI ?? 'none');
const disableAnimation = computed(() =>
	Boolean(props.disableAnimation ?? config.value.disableAnimation)
);
const wantsShow = computed(() => {
	const model =
		snapshot.value.resolution.status === 'matched'
			? snapshot.value.model
			: 'opt-in';
	const configured = config.value.bannerModels ?? config.value.models;
	const models = configured?.length ? configured : DEFAULT_MODELS;
	return (
		hasConsentUi.value &&
		activeUI.value === 'banner' &&
		models.includes(model) &&
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
const expandButtonRef = ref<
	HTMLElement | { element: HTMLElement | null } | null
>(null);
const pageRegionRef = ref<HTMLElement | null>(null);
let pageRegion: LiveRegion | null = null;
onMounted(() => {
	if (pageRegionRef.value) {
		pageRegion = attachLiveRegion(pageRegionRef.value);
	}
});
onBeforeUnmount(() => {
	pageRegion?.();
	pageRegion = null;
});

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

const elementOf = (
	value: HTMLElement | { element: HTMLElement | null } | null
): HTMLElement | null =>
	value instanceof HTMLElement ? value : (value?.element ?? null);

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
			elementOf(expandButtonRef.value)?.focus({ preventScroll: true });
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

const bundle = computed(() => rightsBundleOf(snapshot.value));
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

const commit = (action: BannerCommitAction) => {
	const { plan } = commitBannerChoice(kernel, action, {
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
const acknowledge = () => {
	committed = '';
	session.commit();
	void kernel.commands.dismissNotice();
};
const expand = () => {
	void loadPanel();
	panelWanted.value = true;
	pendingPanelFocus = true;
	session.expand();
	session.announce(copy.value.expanded);
};
const warm = () => {
	void loadPanel();
	void loadPrivacyChoicesDialog();
};

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
const links = CARD_LINKS;
const barLinks: ConsentLegalLinkKey[] = ['privacyPolicy'];
const onPanelReady = () => {
	panelReady.value = true;
};
</script>

<template>
	<Teleport
		to="body"
		:disabled="!mounted"
	>
		<!-- The page's status region outlives the prompt, so the outcome of a
		     choice is read after the prompt leaves (BNR-06). It keeps its node. -->
		<div
			ref="pageRegionRef"
			:class="surfaceStyles.visuallyHidden"
			data-testid="consent-banner-announcement"
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
			:data-placement="layout.placement"
			:data-flow="layout.flow"
			:data-edge-style="layout.edgeStyle"
			:data-blocking="layout.blocking ? 'true' : undefined"
			:data-expanded="expanded ? 'true' : undefined"
			:data-state="phase === 'leaving' ? 'closed' : 'open'"
			:data-variant="variant"
			data-design="privacy-choices"
			data-testid="consent-banner-root"
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
							:class="surfaceStyles.visuallyHidden"
							:id="ids.title"
							data-testid="consent-banner-title"
						>
							{{ copy.title }}
						</h2>
						<div :class="presentation.row">
							<p
								:class="presentation.text"
								data-testid="consent-banner-description"
							>
								{{ copy.barDescription }}<InlineLegalLinks :links="barLinks" />
							</p>
							<div
								:class="presentation.actions"
								data-testid="consent-banner-footer"
							>
								<template v-if="!notice">
									<ChoiceButton
										consent-action="reject"
										data-testid="consent-banner-reject-button"
										@click="commit('refuse')"
									>
										{{ copy.reject }}
									</ChoiceButton>
									<ChoiceButton
										consent-action="accept"
										data-testid="consent-banner-accept-button"
										@click="commit('allow')"
									>
										{{ copy.accept }}
									</ChoiceButton>
								</template>
								<!-- The collapsed bar has no panel to point at (PERM-09). -->
								<button
									v-if="notice"
									ref="expandButtonRef"
									type="button"
									:class="surfaceStyles.rightLink"
									:aria-expanded="expanded"
									data-testid="consent-banner-right-link-opt-out"
									@click="expand"
									@focus="warm"
									@pointerenter="warm"
								>
									{{ copy.expandBar }}
								</button>
								<ChoiceButton
									v-else
									ref="expandButtonRef"
									consent-action="customize"
									is-primary
									:aria-expanded="expanded"
									data-testid="consent-banner-customize-button"
									@click="expand"
									@focus="warm"
									@pointerenter="warm"
								>
									{{ copy.expandBar }}
								</ChoiceButton>
								<ChoiceButton
									v-if="notice"
									consent-action="dismiss"
									is-primary
									data-testid="consent-banner-dismiss-button"
									@click="acknowledge"
								>
									{{ copy.ok }}
								</ChoiceButton>
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
								<LazyPanel
									v-if="wantPanel"
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
									<LazyPanel
										v-if="wantPanel"
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
									data-testid="consent-banner-dismiss-button"
									@click="acknowledge"
								>
									{{ copy.ok }}
								</ChoiceButton>
								<template v-else>
									<div
										v-bind="
											slotAttrs(
												config.components?.banner?.actionGroup,
												surfaceStyles.actionGroup
											)
										"
										data-testid="consent-banner-footer-sub-group"
									>
										<ChoiceButton
											consent-action="reject"
											data-testid="consent-banner-reject-button"
											@click="commit('refuse')"
										>
											{{ copy.rejectExpanded }}
										</ChoiceButton>
										<ChoiceButton
											consent-action="accept"
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
									ref="expandButtonRef"
									type="button"
									:class="surfaceStyles.rightLink"
									:aria-expanded="expanded"
									:aria-controls="ids.panel"
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
									data-testid="consent-banner-dismiss-button"
									@click="acknowledge"
								>
									{{ copy.ok }}
								</ChoiceButton>
							</template>
							<template v-else>
								<div
									v-bind="
										slotAttrs(
											config.components?.banner?.actionGroup,
											surfaceStyles.actionGroup
										)
									"
									data-testid="consent-banner-footer-sub-group"
								>
									<ChoiceButton
										consent-action="reject"
										data-testid="consent-banner-reject-button"
										@click="commit('refuse')"
									>
										{{ copy.reject }}
									</ChoiceButton>
									<ChoiceButton
										consent-action="accept"
										data-testid="consent-banner-accept-button"
										@click="commit('allow')"
									>
										{{ copy.accept }}
									</ChoiceButton>
								</div>
								<ChoiceButton
									ref="expandButtonRef"
									consent-action="customize"
									is-primary
									:aria-expanded="expanded"
									:aria-controls="ids.panel"
									data-testid="consent-banner-customize-button"
									@click="expand"
									@focus="warm"
									@pointerenter="warm"
								>
									{{ copy.expand }}
								</ChoiceButton>
							</template>
						</div>
					</template>
				</section>
			</div>
		</div>
	</Teleport>
</template>
