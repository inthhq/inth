import {
	defineAsyncComponent,
	defineComponent,
	h,
	inject,
	provide,
	ref,
	watch,
} from 'vue';
import type { Component, InjectionKey } from 'vue';

import { useConsentSnapshot } from '../../composables/use-consent-kernel';

/** Tells the component around a chunk that its load failed. */
const chunkFailedKey: InjectionKey<() => void> = Symbol('inth:chunk-failed');

/** Rendered in place of a chunk that failed to load. */
const FailedChunk = defineComponent({
	inheritAttrs: false,
	name: 'InthFailedChunk',
	props: { error: { default: undefined, type: null } },
	render: () => null,
	setup() {
		inject(chunkFailedKey, undefined)?.();
	},
});

/** How the chunk's component waits for its load. */
export interface ChunkComponentOptions {
	/** Whether an enclosing `<Suspense>` waits for the chunk. Vue's default. */
	suspensible?: boolean;
}

/**
 * A component that loads in a chunk of its own, and loads it again after a
 * failure on the next consent snapshot, such as the next time a surface
 * opens.
 *
 * Vue forgets a failed load, but a component that stays mounted keeps
 * rendering it: a dialog kept mounted between opens would never ask for
 * its chunk again. A failed load renders nothing until the next snapshot,
 * which mounts the component again, and that mount imports the chunk
 * again. A load that succeeded serves every later mount.
 *
 * @param name - The component's name, for devtools and warnings.
 * @param loader - Imports the chunk.
 * @param options - How the component waits for its chunk.
 * @internal
 */
export const defineChunkComponent = function defineChunkComponent<
	Loaded extends Component,
>(
	name: string,
	loader: () => Promise<{ default: Loaded }>,
	options: ChunkComponentOptions = {}
): Loaded {
	const Chunk = defineAsyncComponent({
		errorComponent: FailedChunk,
		loader,
		...options,
	});
	return defineComponent({
		inheritAttrs: false,
		name,
		setup(_props, { attrs, slots }) {
			const attempt = ref(0);
			let failed = false;
			provide(chunkFailedKey, () => {
				failed = true;
			});
			watch(useConsentSnapshot(), () => {
				if (failed) {
					failed = false;
					attempt.value += 1;
				}
			});
			return () => h(Chunk, { ...attrs, key: attempt.value }, slots);
		},
	}) as unknown as Loaded;
};
