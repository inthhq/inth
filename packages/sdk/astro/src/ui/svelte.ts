/**
 * The Svelte dialog surface.
 *
 * Svelte 5 compiles to close to hand-written DOM code, so a Svelte island is
 * the smallest way to get a real preference centre onto an Astro page
 * without shipping a framework runtime to visitors who never open one.
 * Mounting happens on the first open through `mount()`, so the import cost
 * is paid only by people who click "Customize".
 *
 * The island itself is registered by `<ConsentDialog />` rather than
 * imported here: a `.svelte` file can only be compiled by the consuming
 * app's build, and keeping the specifier in the `.astro` component is what
 * lets that build see it.
 *
 * The provider inside the island renders against the page runtime through
 * its `runtime` prop, so there is one kernel per page no matter how many
 * islands, scripts or frameworks read it.
 */

import { buildProviderProps } from './build-provider-props';
import { closeDialogSurface } from './close-dialog-surface';
import type {
	ConsentDialogAdapter,
	ConsentDialogContext,
	ConsentDialogHandle,
} from './register-dialog-adapter';
import { requireDialogSurface } from './register-dialog-adapter';

/** Svelte's runtime, loaded on demand like the island. */
const loadSvelte = () => import('svelte');

/** The island module: the component, and Svelte's mount functions. */
interface SvelteSurface {
	default: unknown;
	mount?: Awaited<ReturnType<typeof loadSvelte>>['mount'];
	unmount?: Awaited<ReturnType<typeof loadSvelte>>['unmount'];
}

/** The Svelte 5 dialog surface implementation. */
export const svelteDialogAdapter: ConsentDialogAdapter = {
	async mount(context: ConsentDialogContext): Promise<ConsentDialogHandle> {
		const surface = (await requireDialogSurface('svelte')()) as SvelteSurface;
		// The built-in island exports Svelte's `mount`; a surface registered
		// by hand may not.
		const { mount, unmount } =
			surface.mount && surface.unmount
				? { mount: surface.mount, unmount: surface.unmount }
				: await loadSvelte();

		const component = mount(surface.default as never, {
			props: {
				...buildProviderProps(context.runtime, context.options),
				kind: context.kind,
				legalLinks: context.legalLinks,
				tab: context.tab,
			},
			target: context.target,
		});

		return {
			close() {
				closeDialogSurface(context.runtime);
			},
			async destroy() {
				await unmount(component, { outro: true });
			},
		};
	},

	name: 'svelte',

	async preload() {
		const surface = (await requireDialogSurface('svelte')()) as SvelteSurface;
		if (!(surface.mount && surface.unmount)) {
			await loadSvelte();
		}
	},
};
