import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
	inputBinding,
	isDevMode,
	PendingTasks,
	signal,
	untracked,
	viewChild,
	ViewContainerRef,
} from '@angular/core';
import type { ComponentRef } from '@angular/core';
import type {
	ConsentContainer,
	ConsentEdgeStyle,
	Model,
} from '@inth/sdk/engine';
import { actionAppearanceFromTheme } from '@inth/sdk/engine';
import { resolveConsentPresentation } from '@inth/sdk/surface-state';

import { ConsentManager } from '../core/consent-manager';
import { ConsentTheme } from '../core/consent-theme';
import { NoStyleScope, resolveNoStyle } from '../core/no-style';
import { OptInConfirmation } from '../dialog/opt-in-confirmation';
import type { LegalLinkSelection } from '../shared/inline-legal-links';
import { PROMPT_LOADERS } from './containers';
import type { PromptSurfaceOptions, PromptSurfaceType } from './containers';

/** The banner's buttons, by the action each one takes. */
export type ConsentBannerButton = 'reject' | 'accept' | 'customize' | 'dismiss';

/** Action groups for the banner footer: one id, or ids grouped together. */
export type ConsentBannerLayout = (
	| ConsentBannerButton
	| ConsentBannerButton[]
)[];

// As React's banner: IAB policies belong to <inth-iab-consent-banner>, so
// the two render side by side without both showing.
const DEFAULT_MODELS: readonly Model[] = ['opt-in', 'opt-out'];

/**
 * Whether two option sets render the same, so the prompt keeps its inputs
 * while the banner's presentation recomputes.
 */
const sameOptions = function sameOptions(
	a: PromptSurfaceOptions | null,
	b: PromptSurfaceOptions | null
): boolean {
	if (a === null || b === null) {
		return a === b;
	}
	return (
		(Object.keys(a) as (keyof PromptSurfaceOptions)[]).every(
			(key) =>
				key === 'container' || key === 'actionGroups' || a[key] === b[key]
		) &&
		JSON.stringify(a.container) === JSON.stringify(b.container) &&
		JSON.stringify(a.actionGroups) === JSON.stringify(b.actionGroups)
	);
};

/**
 * The cookie banner: the first prompt a visitor sees while a choice or a
 * notice is required, as a Card, Banner or Drawer.
 *
 * Shows while `ConsentManager.activeUI()` is `'banner'`. The policy decides
 * the copy (choice or notice), which actions show and how they group; the
 * inputs override the presentation. Customize opens the options in place:
 * the cookie categories in the EU, the rights and Preferences in the US.
 * It renders into the page where it sits, adds its own stylesheets unless
 * `noStyle` or the provider's `styles: false` is set, and reads the
 * provider's theme slots (`consentBanner*`).
 *
 * The prompt and its container are chunks of their own, loaded once a
 * choice is owed. A page that never owes one loads neither. The load holds
 * the application unstable, as a `@defer` block's does, so a server render
 * waits for it and puts the prompt in the HTML, and the browser renders it
 * before the server's markup is cleaned up. The prompt stays mounted after
 * its first show, so its exit, the page announcement and the focus return
 * outlive it.
 *
 * @example
 * ```html
 * <inth-consent-banner
 *   [legalLinks]="['privacyPolicy']"
 *   [container]="{ type: 'banner', edge: 'bottom' }"
 * />
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [OptInConfirmation],
	// The confirmation and the prompt resolve `noStyle` through this surface.
	providers: [NoStyleScope],
	selector: 'inth-consent-banner',
	// The banner hosts the opt-in confirmation: the confirmation claims the
	// host here, so no other surface renders it.
	template: `<inth-opt-in-confirmation
			[noStyle]="resolvedNoStyle()"
			[disableAnimation]="resolvedDisableAnimation()"
		/>
		<ng-container #outlet />`,
})
export class ConsentBanner {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);
	readonly #loaders = inject(PROMPT_LOADERS);
	readonly #pendingTasks = inject(PendingTasks);

	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/**
	 * Skip the enter and exit motion. Defaults to the provider's setting,
	 * which follows `prefers-reduced-motion`.
	 */
	readonly disableAnimation = input<boolean | undefined>(undefined);
	/** The heading text. Defaults to the translation. */
	readonly heading = input<string | undefined>(undefined);
	/** The description. Defaults to the translation. */
	readonly description = input<string | undefined>(undefined);
	/** The Reject button's text. */
	readonly rejectButtonText = input<string | undefined>(undefined);
	/** The Customize button's text. It opens the options in place. */
	readonly customizeButtonText = input<string | undefined>(undefined);
	/** The Accept button's text. */
	readonly acceptButtonText = input<string | undefined>(undefined);
	/** The notice's acknowledge button text. */
	readonly dismissButtonText = input<string | undefined>(undefined);
	/** Hide the attribution tag. */
	readonly hideBranding = input(false);
	/**
	 * Which of the provider's legal links follow the description. Unset
	 * shows the privacy and cookie policies; `null` shows none.
	 */
	readonly legalLinks = input<LegalLinkSelection | undefined>(undefined);
	/**
	 * Order and groups of the buttons. Actions the policy does not allow are
	 * dropped, and required ones restored. Overrides the presentation.
	 */
	readonly layout = input<ConsentBannerLayout | undefined>(undefined);
	/**
	 * A Card, Banner or Drawer, and where it sits. Overrides
	 * `presentation.prompt.container` and the policy's `surface.container`.
	 * Positions are logical: `start` and `end` follow the writing direction.
	 * Defaults to a Card in the `start` corner.
	 */
	readonly container = input<ConsentContainer | undefined>(undefined);
	/**
	 * `inset` floats a Banner or Drawer off the viewport edges; `flush`
	 * pins it to them. A Card is always inset. Overrides
	 * `presentation.prompt.edgeStyle`.
	 */
	readonly edgeStyle = input<ConsentEdgeStyle | undefined>(undefined);
	/**
	 * Block the page until the visitor makes a choice: backdrop, scroll
	 * lock, focus trap and no outside dismissal. Overrides
	 * `presentation.prompt.blockUntilChoice`. A centred Card always blocks;
	 * a notice never does, nor a prompt under an opt-out model or a policy
	 * that forbids blocking.
	 */
	readonly blockUntilChoice = input<boolean | undefined>(undefined);
	/** The consent models the banner shows for. */
	readonly models = input<readonly Model[]>(DEFAULT_MODELS);

	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** @internal */
	protected readonly resolvedDisableAnimation = computed(
		() => this.disableAnimation() ?? this.#theme.disableAnimation()
	);

	/** @internal */
	protected readonly presentation = computed(() =>
		resolveConsentPresentation({
			actionAppearance: actionAppearanceFromTheme(this.#theme.theme()),
			override: {
				blockUntilChoice: this.blockUntilChoice(),
				container: this.container(),
				edgeStyle: this.edgeStyle(),
				layout: this.layout(),
			},
			policy: this.#consent.snapshot().policyRule,
			presentation: this.#consent.presentation(),
			surface: 'prompt',
		})
	);

	/**
	 * What the prompt renders with. The custom text inputs apply to every
	 * container.
	 *
	 * @internal
	 */
	protected readonly options = computed(
		(): PromptSurfaceOptions | null => {
			const presentation = this.presentation();
			if (!presentation.container) {
				return null;
			}
			return {
				acceptButtonText: this.acceptButtonText(),
				actionGroups: presentation.actionGroups,
				container: presentation.container,
				customizeButtonText: this.customizeButtonText(),
				description: this.description(),
				disableAnimation: this.resolvedDisableAnimation(),
				dismissButtonText: this.dismissButtonText(),
				heading: this.heading(),
				hideBranding: this.hideBranding(),
				legalLinks: this.legalLinks(),
				models: this.models(),
				noStyle: this.resolvedNoStyle(),
				rejectButtonText: this.rejectButtonText(),
			};
		},
		{ equal: sameOptions }
	);

	private readonly outlet = viewChild('outlet', { read: ViewContainerRef });
	/** Whether a choice was owed while the banner was on the page. */
	readonly #owed = signal(this.#consent.activeUI() === 'banner');
	/** The container the prompt loaded with; a later one keeps it. */
	readonly #type = computed(() => this.options()?.container.desktop.type);
	/** The container loading or loaded, or `null` after a failed load. */
	#loading: string | null = null;
	/** Counts loads, so a load a newer one replaced is dropped. */
	#generation = 0;
	#surface: ComponentRef<PromptSurfaceType> | undefined;

	constructor() {
		if (isDevMode()) {
			effect(() => {
				const presentation = this.presentation();
				for (const diagnostic of presentation.diagnostics) {
					console.warn(diagnostic.message);
				}
				// The container's findings are the same on both viewports but
				// a side Drawer's phone fallback, which is not a
				// misconfiguration.
				for (const diagnostic of presentation.container?.desktop.diagnostics ??
					[]) {
					console.warn(`inth presentation: ${diagnostic.message}`);
				}
			});
		}
		// The kernel's own listener sees every state, where an effect sees
		// only the last one before it runs: a page that opens the dialog as
		// soon as the prompt is owed would otherwise skip the prompt, and
		// with it the page's announcement region, which React keeps.
		effect((onCleanup) => {
			const kernel = this.#consent.kernel();
			const follow = (activeUI: unknown) => {
				if (activeUI === 'banner') {
					this.#owed.set(true);
				}
			};
			untracked(() => follow(kernel.getSnapshot().activeUI));
			onCleanup(kernel.subscribe((snapshot) => follow(snapshot.activeUI)));
		});
		// A failed load must not be the end: the next sync (new options) or
		// the next time the prompt is owed again tries once more.
		effect(() => {
			const outlet = this.outlet();
			const type = this.#type();
			const options = this.options();
			const owedNow = this.#consent.activeUI() === 'banner';
			if (this.#owed() && outlet && type && options) {
				untracked(() => {
					void this.#load(outlet, type, owedNow);
				});
			}
		});
	}

	async #load(
		outlet: ViewContainerRef,
		type: ConsentContainer['type'],
		owedNow: boolean
	): Promise<void> {
		if (this.#loading === type) {
			return;
		}
		// A retry after a failure waits for a trigger that owes the prompt.
		if (this.#loading === null && this.#generation > 0 && !owedNow) {
			return;
		}
		this.#loading = type;
		this.#generation += 1;
		const generation = this.#generation;
		const done = this.#pendingTasks.add();
		try {
			const [surface, containerModule] = await Promise.all([
				this.#loaders.surface(),
				this.#loaders.container(type),
			]);
			if (generation !== this.#generation) {
				return;
			}
			this.#surface?.destroy();
			const chosen = signal(containerModule);
			this.#surface = outlet.createComponent(surface, {
				bindings: [
					inputBinding('options', this.options),
					inputBinding('containerModule', chosen),
				],
			});
		} catch {
			// Only the newest load decides: a replaced one that failed leaves
			// the newer one alone.
			if (generation === this.#generation) {
				this.#loading = null;
			}
		} finally {
			done();
		}
	}
}
