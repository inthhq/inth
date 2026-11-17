import { isPlatformBrowser } from '@angular/common';
import {
	afterNextRender,
	DestroyRef,
	Directive,
	DOCUMENT,
	effect,
	ElementRef,
	inject,
	input,
	isDevMode,
	PLATFORM_ID,
	Renderer2,
	signal,
} from '@angular/core';

/**
 * Moves the host element to another container, `<body>` by default, so an
 * overlay escapes its ancestors' stacking and overflow.
 *
 * On the server, and until the first browser render, the element stays in
 * place, so hydration finds the server's markup where it rendered it. It
 * moves after the first render and is removed with its view.
 *
 * @example
 * ```html
 * <div c15tPortal class="banner">…</div>
 * <div c15tPortal="#overlays">…</div>
 * ```
 */
@Directive({ selector: '[c15tPortal]' })
export class Portal {
	/** The target element or a selector for it. A bare attribute means `<body>`. */
	readonly c15tPortal = input<HTMLElement | string>('');

	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		const document = inject(DOCUMENT);
		const renderer = inject(Renderer2);
		const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
		const rendered = signal(false);

		afterNextRender(() => rendered.set(true));

		effect(() => {
			if (!rendered()) {
				return;
			}
			const target = this.c15tPortal();
			let element: HTMLElement | null = null;
			if (typeof target !== 'string') {
				element = target;
			} else if (target === '') {
				element = document.body;
			} else {
				element = document.querySelector<HTMLElement>(target);
			}
			if (!element) {
				if (isDevMode()) {
					console.warn(
						`[c15t/portal] Target element not found: ${String(target)}`
					);
				}
				return;
			}
			if (host.parentNode !== element) {
				renderer.appendChild(element, host);
			}
		});

		inject(DestroyRef).onDestroy(() => {
			// The view removes the host from where Angular put it; a moved host
			// is elsewhere, so remove it here.
			host.remove();
		});
	}
}
