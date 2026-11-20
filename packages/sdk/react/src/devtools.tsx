'use client';

import { createDevTools } from '@inth/sdk/devtools';
import type {
	DevToolsInstance,
	DevToolsOptions,
	DevToolsPosition,
	DevToolsTab,
} from '@inth/sdk/devtools';
import type { ConsentKernel } from '@inth/sdk/engine';
import {
	createElement,
	forwardRef,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from 'react';
import type {
	CSSProperties,
	ForwardedRef,
	HTMLAttributes,
	ReactElement,
	RefCallback,
} from 'react';

import { TriggerToolbar } from './components/panel-trigger/atoms/toolbar';
import { registerTriggerToolbar } from './components/panel-trigger/toolbar-loader';
import { KernelContext, ProviderServicesContext } from './context';
import { attachDevToolsLauncher } from './devtools-launcher';
import { useIsHydrated } from './hooks/use-is-hydrated';

/** Props for the kernel-bound React DevTools adapter. */
export interface ConsentDevToolsProps extends Omit<
	DevToolsOptions,
	'container' | 'kernel'
> {
	/** Prevents the DevTools engine from mounting. @default false */
	disabled?: boolean;
}

/** Backward-compatible props name for {@link ConsentDevTools}. */
export type InthDevToolsProps = ConsentDevToolsProps;

/** Compatible props name for the {@link DevTools} alias. */
export type DevToolsProps = ConsentDevToolsProps;

const requireKernel = (kernel: ConsentKernel | null): ConsentKernel => {
	if (!kernel) {
		throw new Error(
			'inth: DevTools must be rendered inside <InthProvider> from @inth/react.'
		);
	}
	return kernel;
};

const useStableConsentCategories = (
	getter: DevToolsOptions['getConsentCategories'],
	disabled: boolean
): DevToolsOptions['getConsentCategories'] => {
	const isClient = useIsHydrated();
	const latestGetter = useRef(getter);
	useLayoutEffect(() => {
		latestGetter.current = getter;
	}, [getter]);
	const categoryKey =
		isClient && !disabled && getter
			? JSON.stringify([...new Set(getter())].sort())
			: undefined;
	return useMemo(() => {
		if (categoryKey === undefined) {
			return undefined;
		}
		const categories = JSON.parse(categoryKey) as ReturnType<
			NonNullable<typeof getter>
		>;
		return () => latestGetter.current?.() ?? categories;
	}, [categoryKey]);
};

const useStableServices = (
	clearRecords: DevToolsOptions['clearRecords'],
	getPresentation: DevToolsOptions['getPresentation']
) => {
	const latest = useRef({ clearRecords, getPresentation });
	useLayoutEffect(() => {
		latest.current = { clearRecords, getPresentation };
	}, [clearRecords, getPresentation]);
	const hasClear = clearRecords !== undefined;
	const hasPresentation = getPresentation !== undefined;
	return useMemo(
		() => ({
			clearRecords: hasClear
				? () => latest.current.clearRecords?.()
				: undefined,
			getPresentation: hasPresentation
				? () => latest.current.getPresentation?.()
				: undefined,
		}),
		[hasClear, hasPresentation]
	);
};

/**
 * Mounts the Inth DevTools engine for the nearest consent provider.
 *
 * @param props - Presentation options passed to the DevTools engine.
 * @returns `null`; the engine mounts its interface into `document.body`.
 */
export const ConsentDevTools = ({
	disabled = false,
	clearRecords,
	getPresentation,
	defaultOpen,
	defaultTab,
	getConsentCategories,
	maxEvents,
	position,
	shadow,
}: ConsentDevToolsProps): null => {
	const services = useContext(ProviderServicesContext);
	const stableServices = useStableServices(
		clearRecords ?? services?.clearRecords,
		getPresentation ?? services?.getPresentation
	);
	const contextKernel = useContext(KernelContext);
	const kernel = disabled ? null : requireKernel(contextKernel);
	const getDisplayedCategories = useStableConsentCategories(
		getConsentCategories ?? services?.getConsentCategories,
		disabled
	);

	// A trigger that carries the launcher renders this toolbar. Registering it
	// before the effect below publishes the launcher keeps that swap
	// synchronous.
	useEffect(() => {
		registerTriggerToolbar(TriggerToolbar);
	}, []);

	useEffect(() => {
		if (!kernel) {
			return;
		}

		// A mounted consent trigger can render the launcher instead.
		const devTools = attachDevToolsLauncher(
			kernel,
			createDevTools({
				...stableServices,
				defaultOpen,
				defaultTab,
				getConsentCategories: getDisplayedCategories,
				kernel,
				maxEvents,
				position,
				shadow,
			})
		);
		return () => devTools.destroy();
	}, [
		defaultOpen,
		defaultTab,
		getDisplayedCategories,
		stableServices,
		kernel,
		maxEvents,
		position,
		shadow,
	]);

	return null;
};

/** Compatible short name for {@link ConsentDevTools}. */
export const DevTools = ConsentDevTools;

/** Backward-compatible name for {@link ConsentDevTools}. */
export const InthDevTools = ConsentDevTools;

/** Props for the embedded Inth panel used by TanStack Devtools. */
export interface InthTanStackDevtoolsPanelProps
	extends
		HTMLAttributes<HTMLDivElement>,
		Pick<
			DevToolsOptions,
			| 'defaultTab'
			| 'maxEvents'
			| 'getConsentCategories'
			| 'getPresentation'
			| 'clearRecords'
		> {
	/** Prevents the embedded DevTools engine from mounting. @default false */
	disabled?: boolean;
	/**
	 * Color scheme of the surrounding devtools shell. Omit to follow the
	 * operating system. {@link inthDevtools} passes TanStack's theme.
	 */
	theme?: TanStackDevtoolsTheme;
}

/** Color scheme TanStack Devtools passes to plugin panels. */
export type TanStackDevtoolsTheme = 'light' | 'dark';

/** Props React TanStack Devtools passes to a plugin's render function. */
export interface TanStackDevtoolsPluginProps {
	theme?: TanStackDevtoolsTheme;
}

/** Plugin configuration accepted by React TanStack Devtools. */
export interface TanStackDevtoolsPlugin {
	id?: string;
	name: string;
	defaultOpen?: boolean;
	render: (
		element: HTMLElement,
		props?: TanStackDevtoolsPluginProps | TanStackDevtoolsTheme
	) => ReactElement;
}

/** Options for {@link inthDevtools}. */
export interface InthDevtoolsPluginOptions extends InthTanStackDevtoolsPanelProps {
	/** Stable plugin identifier. @default 'inth' */
	id?: string;
	/** Display name shown by TanStack Devtools. @default 'inth' */
	name?: string;
	/** Whether TanStack Devtools opens this plugin initially. @default false */
	defaultOpen?: boolean;
}

const EMBEDDED_PANEL_STYLE = {
	height: '100%',
	minHeight: 0,
	width: '100%',
} as const;

const assignRef = (
	ref: ForwardedRef<HTMLDivElement>,
	value: HTMLDivElement | null
): ReturnType<RefCallback<HTMLDivElement>> => {
	if (typeof ref === 'function') {
		return ref(value);
	} else if (ref) {
		ref.current = value;
	}
};

/** Embeds Inth DevTools inside a TanStack Devtools plugin panel. */
export const InthTanStackDevtoolsPanel = forwardRef<
	HTMLDivElement,
	InthTanStackDevtoolsPanelProps
>(
	// oxlint-disable-next-line prefer-arrow-callback -- A named function gives the forwarded component a display name.
	function InthTanStackDevtoolsPanel(
		{
			disabled = false,
			clearRecords,
			getPresentation,
			defaultTab,
			getConsentCategories,
			maxEvents,
			style,
			theme,
			...containerProps
		},
		forwardedRef
	) {
		const services = useContext(ProviderServicesContext);
		const stableServices = useStableServices(
			clearRecords ?? services?.clearRecords,
			getPresentation ?? services?.getPresentation
		);
		const contextKernel = useContext(KernelContext);
		const kernel = disabled ? null : requireKernel(contextKernel);
		const getDisplayedCategories = useStableConsentCategories(
			getConsentCategories ?? services?.getConsentCategories,
			disabled
		);
		const containerRef = useRef<HTMLDivElement | null>(null);
		const setContainerRef = useCallback(
			(value: HTMLDivElement | null) => {
				containerRef.current = value;
				const cleanup = assignRef(forwardedRef, value);
				if (typeof cleanup === 'function') {
					return () => {
						containerRef.current = null;
						cleanup();
					};
				}
			},
			[forwardedRef]
		);

		useLayoutEffect(() => {
			const container = containerRef.current;
			if (!kernel || !container) {
				return;
			}

			const devTools = createDevTools({
				...stableServices,
				container,
				defaultTab,
				embedded: true,
				getConsentCategories: getDisplayedCategories,
				kernel,
				maxEvents,
			});

			return () => devTools.destroy();
		}, [defaultTab, getDisplayedCategories, stableServices, kernel, maxEvents]);

		// Inherited through the shadow root; the panel reads it as its scheme.
		const schemeStyle = theme
			? ({ '--inth-dev-tools-color-scheme': theme } as CSSProperties)
			: undefined;

		return (
			<div
				{...containerProps}
				ref={setContainerRef}
				style={{ ...EMBEDDED_PANEL_STYLE, ...schemeStyle, ...style }}
			/>
		);
	}
);

/**
 * Create an Inth plugin configuration for React TanStack Devtools.
 * @param options - Plugin identity, initial state, and embedded panel options.
 * @returns Plugin configuration whose panel binds to the nearest provider.
 */
export const inthDevtools = (
	options: InthDevtoolsPluginOptions = {}
): TanStackDevtoolsPlugin => {
	const {
		id = 'inth',
		name = 'inth',
		defaultOpen = false,
		...panelProps
	} = options;

	return {
		defaultOpen,
		id,
		name,
		// Older TanStack releases pass the theme string instead of props, and
		// some pass nothing; then the `theme` option applies.
		render: (_element, props) =>
			createElement(InthTanStackDevtoolsPanel, {
				...panelProps,
				theme:
					(typeof props === 'string' ? props : props?.theme) ??
					panelProps.theme,
			}),
	};
};

/** Backward-compatible alias for {@link inthDevtools}. */
export const inthDevtoolsPlugin = inthDevtools;

export type {
	DevToolsInstance,
	DevToolsOptions,
	DevToolsPosition,
	DevToolsTab,
};
