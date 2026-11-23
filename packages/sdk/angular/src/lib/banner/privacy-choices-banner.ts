import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
	inputBinding,
	PendingTasks,
	signal,
	untracked,
	viewChild,
	ViewContainerRef,
} from '@angular/core';
import type { ComponentRef } from '@angular/core';

import { ConsentManager } from '../core/consent-manager';
import { PRIVACY_CHOICES_LOADERS } from './privacy-choices/presentation';
import type {
	PrivacyChoicesBannerOptions,
	PrivacyChoicesSurfaceType,
} from './privacy-choices/presentation';

/**
 * The stock banner's Privacy Choices design (`design: 'privacy-choices'`).
 * It loads the prompt for the resolved container once a choice is owed,
 * and keeps it mounted after, so its exit, the page announcement and the
 * focus return outlive the prompt. A page that never owes a choice loads
 * nothing.
 *
 * The prompt and its presentation are chunks of their own. The load holds
 * the application unstable, as a `@defer` block's does, so a server render
 * waits for it and puts the prompt in the HTML, and the browser renders
 * it before the server's markup is cleaned up.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { style: 'display: contents' },
	selector: 'inth-pc-banner',
	template: '<ng-container #outlet />',
})
export class PrivacyChoicesBanner {
	readonly #consent = inject(ConsentManager);
	readonly #loaders = inject(PRIVACY_CHOICES_LOADERS);
	readonly #pendingTasks = inject(PendingTasks);

	/** What the stock banner passes on. */
	readonly options = input.required<PrivacyChoicesBannerOptions>();

	private readonly outlet = viewChild('outlet', { read: ViewContainerRef });
	readonly #owed = signal(false);
	/** The presentation the prompt loaded with; a later container keeps it. */
	readonly #type = computed(() => this.options().container.desktop.type);
	/** The presentation loading or loaded, or `null` after a failed load. */
	#loading: string | null = null;
	/** Counts loads, so a load a newer one replaced is dropped. */
	#generation = 0;
	#surface: ComponentRef<PrivacyChoicesSurfaceType> | undefined;

	constructor() {
		effect(() => {
			if (this.#consent.activeUI() === 'banner') {
				this.#owed.set(true);
			}
		});
		// The classic banner stays off the page under this design, so a
		// failed load must not be the end: the next sync (new options) or
		// the next time the prompt is owed again tries once more.
		effect(() => {
			const outlet = this.outlet();
			const type = this.#type();
			this.options();
			const owedNow = this.#consent.activeUI() === 'banner';
			if (this.#owed() && outlet) {
				untracked(() => {
					void this.#load(outlet, type, owedNow);
				});
			}
		});
	}

	async #load(
		outlet: ViewContainerRef,
		type: PrivacyChoicesBannerOptions['container']['desktop']['type'],
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
			const [surface, presentation] = await Promise.all([
				this.#loaders.surface(),
				this.#loaders.presentation(type),
			]);
			if (generation !== this.#generation) {
				return;
			}
			this.#surface?.destroy();
			const chosen = signal(presentation);
			this.#surface = outlet.createComponent(surface, {
				bindings: [
					inputBinding('options', this.options),
					inputBinding('presentation', chosen),
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
