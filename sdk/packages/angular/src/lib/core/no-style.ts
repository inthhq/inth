import { computed, inject, Injectable, signal } from '@angular/core';
import type { Signal } from '@angular/core';

import { ConsentTheme } from './consent-theme';

/**
 * A surface's resolved `noStyle`, for every part it renders.
 *
 * A surface lists it in its `providers` and resolves its own `noStyle`
 * through {@link resolveNoStyle}; the overlay, buttons, links and items
 * inside it resolve theirs the same way, so they follow the surface's
 * `[noStyle]` and cannot read the provider's past it.
 *
 * @internal
 */
@Injectable()
export class NoStyleScope {
	readonly #theme = inject(ConsentTheme, { optional: true });
	readonly #outer = inject(NoStyleScope, { optional: true, skipSelf: true });
	readonly #own = signal<Signal<boolean | undefined>>(signal(undefined));

	/** The surface's own `noStyle`, else the enclosing surface's, else the provider's. */
	readonly value: Signal<boolean> = computed(
		() =>
			this.#own()() ?? this.#outer?.value() ?? this.#theme?.noStyle() ?? false
	);

	/** @param own - The surface's `noStyle` input. */
	bind(own: Signal<boolean | undefined>): void {
		this.#own.set(own);
	}
}

/**
 * The `noStyle` a component renders with: its own input, else the surface
 * it renders in, else the provider's. A component that provides
 * {@link NoStyleScope} is a surface, and its parts follow the result.
 *
 * Call it in an injection context, such as a field initializer.
 *
 * @param own - The component's `noStyle` input.
 * @returns The resolved value.
 * @internal
 */
export const resolveNoStyle = function resolveNoStyle(
	own: Signal<boolean | undefined>
): Signal<boolean> {
	const scope = inject(NoStyleScope, { optional: true, self: true });
	if (scope) {
		scope.bind(own);
		return scope.value;
	}
	const outer = inject(NoStyleScope, { optional: true });
	const theme = inject(ConsentTheme, { optional: true });
	return computed(() => own() ?? outer?.value() ?? theme?.noStyle() ?? false);
};
