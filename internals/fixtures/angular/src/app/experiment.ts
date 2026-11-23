/**
 * Demo only: the banner-shape experiment for `?experiment=1`, and the log
 * of impressions and choices made under its arm.
 */
import { PlatformLocation } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import type { Provider } from '@angular/core';
import { INTH_OPTIONS } from '@inth/angular';
import type { InthCallbacks, InthProviderOptions } from '@inth/angular';

type ConsentExperiment = NonNullable<InthProviderOptions['experiment']>;

/** One experiment event the page lists. */
export interface ExperimentLogEntry {
	name: 'inth_surface_shown' | 'inth_choice_recorded';
	arm: string;
	/** The surface shown, or the consent action recorded. */
	detail: string;
}

const pushToDataLayer = function pushToDataLayer(
	event: Record<string, unknown>
): void {
	if (typeof window === 'undefined') {
		return;
	}
	const page = window as Window & { dataLayer?: unknown[] };
	page.dataLayer ??= [];
	page.dataLayer.push(event);
};

/**
 * Impressions and choices made under the arm. One per app, so a server
 * render never shows another visitor's events.
 */
@Injectable({ providedIn: 'root' })
export class ExperimentLog {
	readonly #events = signal<ExperimentLogEntry[]>([]);
	/** The events so far, oldest first. */
	readonly events = this.#events.asReadonly();

	/**
	 * Provider callbacks that log each impression and choice made under an
	 * arm, and push them to `window.dataLayer` for GTM.
	 */
	readonly callbacks: InthCallbacks = {
		onChoiceRecorded: ({ consentAction, experiment }) => {
			if (!experiment) {
				return;
			}
			pushToDataLayer({
				arm: experiment.arm,
				consent_action: consentAction,
				event: 'inth_choice_recorded',
				experiment_id: experiment.id,
			});
			this.#add({
				arm: experiment.arm,
				detail: consentAction,
				name: 'inth_choice_recorded',
			});
		},
		onSurfaceShown: ({ experiment, surface }) => {
			if (!experiment) {
				return;
			}
			pushToDataLayer({
				arm: experiment.arm,
				event: 'inth_surface_shown',
				experiment_id: experiment.id,
				surface,
			});
			this.#add({
				arm: experiment.arm,
				detail: surface,
				name: 'inth_surface_shown',
			});
		},
	};

	#add(entry: ExperimentLogEntry): void {
		this.#events.update((events) => [...events, entry]);
	}
}

/**
 * The banner-shape experiment, or `undefined` when the URL did not ask for
 * one. `control` is the default banner; `wall` blocks the page until the
 * visitor chooses. `?experiment=1` lets Inth pick the arm; `&arm=wall` sets
 * it the way a flag provider would.
 */
export const experimentFromSearch = function experimentFromSearch(
	search: string
): ConsentExperiment | undefined {
	const params = new URLSearchParams(search);
	if (params.get('experiment') !== '1') {
		return undefined;
	}
	const experiment: ConsentExperiment = {
		arms: {
			wall: { prompt: { container: { position: 'center', type: 'card' } } },
		},
		id: 'banner-shape',
	};
	const arm = params.get('arm');
	if (arm === null) {
		return experiment;
	}
	// From your flag provider. Omit it to let Inth pick.
	return { ...experiment, arm: arm === 'wall' ? 'wall' : 'control' };
};

/**
 * Adds the experiment and its callbacks to the options given to
 * `provideInth()` when the URL asks for it. Put it after `provideInth()`.
 * An app with one experiment passes `experiment` and `callbacks` to
 * `provideInth()` directly.
 */
export const provideExperimentFromURL = function provideExperimentFromURL(
	base: InthProviderOptions
): Provider {
	return {
		provide: INTH_OPTIONS,
		useFactory: (): InthProviderOptions => {
			const experiment = experimentFromSearch(inject(PlatformLocation).search);
			return experiment
				? { ...base, callbacks: inject(ExperimentLog).callbacks, experiment }
				: base;
		},
	};
};
