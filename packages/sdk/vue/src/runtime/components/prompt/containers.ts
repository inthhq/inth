// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
import type { Component, InjectionKey } from 'vue';

/** Loads one container's component, with its stylesheet. */
export type PromptContainerLoader = () => Promise<
	Component | { default: Component }
>;

/** The prompt loader for each container type. */
export interface PromptContainers {
	banner: PromptContainerLoader;
	card: PromptContainerLoader;
	drawer: PromptContainerLoader;
}

/**
 * The consent prompt, one chunk per container. Each chunk brings its
 * container's stylesheet, so a Drawer page never downloads the Card or
 * Banner rules, and the reverse.
 *
 * @internal
 */
export const promptContainers: PromptContainers = {
	banner: () => import('./strip.vue'),
	card: () => import('./card.vue'),
	drawer: () => import('./drawer.vue'),
};

/**
 * Replaces {@link promptContainers} below the provider, so a test can see
 * which container the banner asks for, or fail its load.
 *
 * @internal
 */
export const promptContainersKey: InjectionKey<PromptContainers> = Symbol(
	'inth:prompt-containers'
);
