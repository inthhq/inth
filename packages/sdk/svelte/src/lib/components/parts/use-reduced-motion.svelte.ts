import {
	prefersReducedMotion,
	subscribeReducedMotion,
} from '@inth/sdk/ui/utils';

/**
 * Whether the visitor's system asks for reduced motion. Off on the server
 * and until mounted, so hydration adopts the server's markup.
 *
 * Call while a component initializes.
 *
 * @internal
 */
export const useReducedMotion = function useReducedMotion(): {
	readonly reduced: boolean;
} {
	let reduced = $state(false);
	$effect(() => {
		reduced = prefersReducedMotion();
		return subscribeReducedMotion((next) => {
			reduced = next;
		});
	});
	return {
		get reduced() {
			return reduced;
		},
	};
};
