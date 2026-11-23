import { defineAsyncComponent, defineComponent, ref, shallowRef } from 'vue';
import type { Component, Ref, ShallowRef } from 'vue';

/** What a chunk's dynamic import resolves to. */
export type ComponentLoader = () => Promise<Component | { default: Component }>;

/** An async component that can load again after its chunk failed. */
export interface RetryableComponent {
	/** The component to render: the newest load's wrapper. */
	readonly component: ShallowRef<Component>;
	/** Whether the newest load failed. Render nothing until a retry. */
	readonly failed: Readonly<Ref<boolean>>;
	/** Load again after a failure. Does nothing while a load stands. */
	retry: () => void;
}

/**
 * Shown in place of a component whose chunk failed. Having one keeps Vue
 * from rethrowing the load error in development, where it would surface as
 * an unhandled rejection; the failure is still reported to the app.
 */
const Nothing = defineComponent({
	name: 'InthFailedChunk',
	render: () => null,
});

/**
 * An async component whose failed load is retried on the next trigger.
 *
 * The banner and its options each load in a chunk of their own, so a
 * chunk that fails once (a flaky network, a deploy that removed the old chunk)
 * would otherwise leave the visitor with no consent UI. The caller decides
 * when to try again, such as the next time the banner is owed, and calls
 * {@link RetryableComponent.retry}. Each retry renders a new wrapper, so a
 * load that a newer one replaced changes nothing.
 *
 * @param loader - The chunk's import.
 * @param onFailed - Called once for each failed load that is still the newest.
 * @internal
 */
export const useRetryableComponent = function useRetryableComponent(
	loader: ComponentLoader,
	onFailed?: () => void
): RetryableComponent {
	const failed = ref(false);
	const component = shallowRef<Component>(Nothing);
	const create = (): Component => {
		const wrapper: Component = defineAsyncComponent({
			errorComponent: Nothing,
			loader,
			onError: (_error, _retry, fail) => {
				if (component.value === wrapper) {
					failed.value = true;
					onFailed?.();
				}
				fail();
			},
			suspensible: false,
		});
		return wrapper;
	};
	component.value = create();
	return {
		component,
		failed,
		retry: () => {
			if (!failed.value) {
				return;
			}
			failed.value = false;
			component.value = create();
		},
	};
};
