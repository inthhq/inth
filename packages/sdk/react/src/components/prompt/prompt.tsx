'use client';

import type {
	ConsentContainer,
	ConsentEdgeStyle,
	PresentationAction,
} from '@inth/sdk/engine';
import type * as CoreTypes from '@inth/sdk/engine';
import { Suspense, createContext, useContext, useState } from 'react';
import type { ComponentType, FC, ReactNode } from 'react';

import { useHeadlessConsentUI } from '~/component-hooks/use-headless-consent-ui';
import type { InlineLegalLinksProps } from '~/components/shared/primitives/legal-links';
import { useActiveUI } from '~/hooks';
import { useComponentConfig } from '~/hooks/use-component-config';
import { useIABPolicyGuard } from '~/hooks/use-iab-policy-guard';
import { useOptInConfirmationHost } from '~/hooks/use-opt-out';
import { createDeferredModule } from '~/utils/deferred-module';

import { StreamedConsentSurface } from '../shared/streamed-surface';
import { ErrorBoundary } from './error-boundary';
import type { PromptSurfaceOptions } from './surface';

const LazyOptInConfirmation = createDeferredModule(
	() => import('~/components/opt-in-confirmation')
).component((module) => module.OptInConfirmation);

/*
 * One chunk per container, each with its own stylesheet, so a page
 * downloads only the container it shows. A page that never owes a choice
 * downloads none of them.
 */
const deferredContainer = function deferredContainer<Module>(
	importModule: () => Promise<Module>,
	pick: (module: Module) => ComponentType<PromptSurfaceOptions>
) {
	let loaded: ComponentType<PromptSurfaceOptions> | undefined;
	const deferred = createDeferredModule(async () => {
		const module = await importModule();
		loaded = pick(module);
		return module;
	});
	const Lazy = deferred.component(pick);
	/**
	 * Renders the container at once when its chunk is already in, such as
	 * a server-rendered banner whose chunk was preloaded before hydration,
	 * so hydration never suspends on it. The choice is made once per mount:
	 * switching later would remount the prompt.
	 */
	const Container = (props: PromptSurfaceOptions) => {
		// oxlint-disable-next-line react/hook-use-state -- Read once at mount; never set.
		const [Loaded] = useState(() => loaded);
		if (Loaded) {
			return (
				<Suspense fallback={null}>
					<Loaded {...props} />
				</Suspense>
			);
		}
		return <Lazy {...props} />;
	};
	return { Container, preload: deferred.preload };
};

// Keep lazy module filenames neutral: bundlers name chunks after them, and
// content blockers drop files named like a consent banner.
const cardContainer = deferredContainer(
	() => import('./card'),
	(module) => module.CardSurface
);
const bannerContainer = deferredContainer(
	() => import('./strip'),
	(module) => module.BannerSurface
);
const drawerContainer = deferredContainer(
	() => import('./drawer'),
	(module) => module.DrawerSurface
);
/**
 * Loads every container. The server runs it at module evaluation, so a
 * render finds its container in and never streams the prompt in a later
 * chunk.
 *
 * @internal
 */
export const preloadContainers =
	async function preloadContainers(): Promise<void> {
		await Promise.all([
			cardContainer.preload(),
			bannerContainer.preload(),
			drawerContainer.preload(),
		]);
	};

if (typeof window === 'undefined') {
	void preloadContainers();
}
const LazyCard = cardContainer.Container;
const LazyBanner = bannerContainer.Container;
const LazyDrawer = drawerContainer.Container;

/**
 * Starts loading the container the server rendered, read from the
 * banner's `data-placement`, so the prompt hydrates without waiting for
 * its chunk.
 *
 * @internal
 */
export const preloadServerContainer =
	function preloadServerContainer(): Promise<void> {
		if (typeof document === 'undefined') {
			return Promise.resolve();
		}
		const placement = document
			.querySelector<HTMLElement>('[data-testid="consent-banner-root"]')
			?.getAttribute('data-placement');
		if (!placement) {
			return Promise.resolve();
		}
		const [type] = placement.split('-');
		if (type === 'banner') {
			return bannerContainer.preload();
		}
		return type === 'drawer'
			? drawerContainer.preload()
			: cardContainer.preload();
	};

/** The component that renders each container type. @internal */
export interface PromptContainers {
	card: ComponentType<PromptSurfaceOptions>;
	banner: ComponentType<PromptSurfaceOptions>;
	drawer: ComponentType<PromptSurfaceOptions>;
}

/**
 * The containers the banner renders. Lazy by default; a render that cannot
 * wait for a chunk, such as the static banner rendered at build time,
 * provides them already loaded.
 *
 * @internal
 */
export const PromptContainersContext = createContext<PromptContainers>({
	banner: LazyBanner,
	card: LazyCard,
	drawer: LazyDrawer,
});

/**
 * Identifiers for the available buttons in the consent banner.
 * @public
 */
export type ConsentBannerButton =
	| 'reject'
	| 'accept'
	| 'customize'
	| 'dismiss'
	| 'save';

/**
 * Structure for defining the layout of buttons in the consent banner.
 * Supports nesting for grouping buttons.
 * @public
 */
export type ConsentBannerLayout = (
	| ConsentBannerButton
	| ConsentBannerButton[]
)[];

/**
 * Props for configuring and customizing the ConsentBanner component.
 *
 * @public
 */
export interface ConsentBannerProps {
	/**
	 * When true, removes all default styling from the component
	 * @default false
	 */
	noStyle?: boolean;

	/**
	 * Content to display as the banner's title
	 * @default undefined
	 */
	title?: ReactNode;

	/**
	 * Content to display as the banner's description
	 * @default undefined
	 */
	description?: ReactNode;

	/**
	 * Content to display on the reject button
	 * @remarks Required by GDPR for explicit consent rejection
	 * @default undefined
	 */
	rejectButtonText?: ReactNode;

	/**
	 * Content to display on the customize button
	 * @remarks Opens the options in place
	 * @default undefined
	 */
	customizeButtonText?: ReactNode;

	/**
	 * Content to display on the accept button
	 * @default undefined
	 */
	acceptButtonText?: ReactNode;

	/**
	 * Content to display on the dismiss button
	 * @remarks Only rendered when the active policy requires a notice prompt
	 * @default undefined
	 */
	dismissButtonText?: ReactNode;

	/**
	 * When true, disables the entrance/exit animations
	 * @default false
	 */
	disableAnimation?: boolean;

	/**
	 * Controls which legal links to display.
	 *
	 * - `undefined` (default): Shows all available legal links
	 * - `null`: Explicitly hides all legal links
	 * - Array of keys: Shows only the specified legal links
	 *
	 * @defaultValue undefined
	 *
	 * @remarks
	 * You must set the legal links in the InthProvider options.
	 */
	legalLinks?: InlineLegalLinksProps['links'];

	/**
	 * When true, hides the attribution tag on the banner.
	 * @default false
	 */
	hideBranding?: boolean;

	/**
	 * Defines the order and grouping of the buttons. Actions the policy
	 * does not allow are dropped, and required ones restored.
	 *
	 * @defaultValue [['reject', 'accept'], 'customize']
	 */
	layout?: ConsentBannerLayout;

	/**
	 * Which consent models this banner responds to.
	 * @default ['opt-in', 'opt-out']
	 */
	models?: CoreTypes.Model[];

	/**
	 * Override the UI source identifier sent with consent API calls.
	 * @default 'banner'
	 */
	uiSource?: string;

	/**
	 * A Card, Banner or Drawer, and where it sits. Overrides
	 * `presentation.prompt.container` and the policy's `surface.container`.
	 * Positions are logical: `start` and `end` follow the writing direction.
	 * @default { type: 'card', position: 'start' }
	 */
	container?: ConsentContainer;

	/**
	 * `inset` floats a Banner or Drawer off the viewport edges; `flush`
	 * pins it to them. A Card is always inset. Overrides
	 * `presentation.prompt.edgeStyle`.
	 * @default 'inset'
	 */
	edgeStyle?: ConsentEdgeStyle;

	/**
	 * Block the page until the visitor makes a choice: backdrop, scroll lock,
	 * focus trap and no outside dismissal. Overrides
	 * `presentation.prompt.blockUntilChoice`.
	 * @remarks A centred Card always blocks. A notice never does, nor a
	 * prompt under an opt-out model or a policy that forbids blocking.
	 */
	blockUntilChoice?: boolean;
}

type ContainerOptions = PromptSurfaceOptions & {
	actionGroups: readonly (readonly PresentationAction[])[];
};

/**
 * Loads the prompt for the resolved container once a choice is owed, and
 * keeps it mounted after, so its exit, the page announcement and the focus
 * return outlive the prompt.
 */
const PromptContainer = (props: ContainerOptions) => {
	const containers = useContext(PromptContainersContext);
	const activeUI = useActiveUI();
	const [owed, setOwed] = useState(activeUI === 'banner');
	if (activeUI === 'banner' && !owed) {
		setOwed(true);
	}
	if (!owed) {
		return null;
	}
	const Container = containers[props.container.desktop.type];
	return <Container {...props} />;
};

const ConsentBannerContent: FC<ConsentBannerProps> = ({
	noStyle: localNoStyle,
	disableAnimation: localDisableAnimation,
	title,
	description,
	rejectButtonText,
	customizeButtonText,
	acceptButtonText,
	dismissButtonText,
	legalLinks,
	hideBranding = false,
	layout,
	models,
	uiSource,
	container,
	edgeStyle,
	blockUntilChoice,
}) => {
	// Outside the banner's own error boundary, which would swallow it.
	useIABPolicyGuard();
	const optInConfirmationActive = useOptInConfirmationHost();
	const { banner } = useHeadlessConsentUI({
		prompt: { blockUntilChoice, container, edgeStyle, layout },
	});
	const config = useComponentConfig({
		disableAnimation: localDisableAnimation,
		noStyle: localNoStyle,
	});
	// The banner hosts the opt-in confirmation: it claimed the host above, so
	// no other surface renders it.
	const optInConfirmation = optInConfirmationActive ? (
		<LazyOptInConfirmation
			disableAnimation={config.disableAnimation}
			noStyle={config.noStyle}
		/>
	) : null;
	return (
		<>
			{optInConfirmation}
			{banner.container ? (
				<ErrorBoundary
					fallback={<div>Something went wrong with the Consent Banner.</div>}
				>
					<PromptContainer
						container={banner.container}
						actionGroups={banner.actionGroups}
						noStyle={config.noStyle}
						disableAnimation={config.disableAnimation}
						legalLinks={legalLinks}
						hideBranding={hideBranding}
						models={models}
						uiSource={uiSource}
						title={title}
						description={description}
						rejectButtonText={rejectButtonText}
						acceptButtonText={acceptButtonText}
						customizeButtonText={customizeButtonText}
						dismissButtonText={dismissButtonText}
					/>
				</ErrorBoundary>
			) : null}
		</>
	);
};

/**
 * The stock consent banner: a Card, Banner or Drawer. It reads the policy
 * to choose its buttons, so all of it renders where the server can stream
 * it: see `StreamedConsentSurface`.
 *
 * @public
 */
export const ConsentBanner: FC<ConsentBannerProps> = (props) => (
	<StreamedConsentSurface>
		<ConsentBannerContent {...props} />
	</StreamedConsentSurface>
);
