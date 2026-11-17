/**
 * Demo only: the banner-shape experiment for `?experiment=1`, and the log
 * of impressions and choices made under its arm.
 */
import { PlatformLocation } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import type { Provider } from '@angular/core';
import { C15T_OPTIONS } from '@c15t/angular';
import type { C15tCallbacks, C15tProviderOptions } from '@c15t/angular';

type ConsentExperiment = NonNullable<C15tProviderOptions['experiment']>;

/** One experiment event the page lists. */
export interface ExperimentLogEntry {
	name: 'c15t_surface_shown' | 'c15t_choice_recorded';
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
	readonly callbacks: C15tCallbacks = {
		onChoiceRecorded: ({ consentAction, experiment }) => {
			if (!experiment) {
				return;
			}
			pushToDataLayer({
				arm: experiment.arm,
				consent_action: consentAction,
				event: 'c15t_choice_recorded',
				experiment_id: experiment.id,
			});
			this.#add({
				arm: experiment.arm,
				detail: consentAction,
				name: 'c15t_choice_recorded',
			});
		},
		onSurfaceShown: ({ experiment, surface }) => {
			if (!experiment) {
				return;
			}
			pushToDataLayer({
				arm: experiment.arm,
				event: 'c15t_surface_shown',
				experiment_id: experiment.id,
				surface,
			});
			this.#add({
				arm: experiment.arm,
				detail: surface,
				name: 'c15t_surface_shown',
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
 * visitor chooses. `?experiment=1` lets c15t pick the arm; `&arm=wall` sets
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
		arms: { wall: { prompt: { variant: 'wall' } } },
		id: 'banner-shape',
	};
	const arm = params.get('arm');
	if (arm === null) {
		return experiment;
	}
	// From your flag provider. Omit it to let c15t pick.
	return { ...experiment, arm: arm === 'wall' ? 'wall' : 'control' };
};

/**
 * Adds the experiment and its callbacks to the options given to
 * `provideC15t()` when the URL asks for it. Put it after `provideC15t()`.
 * An app with one experiment passes `experiment` and `callbacks` to
 * `provideC15t()` directly.
 */
export const provideExperimentFromURL = function provideExperimentFromURL(
	base: C15tProviderOptions
): Provider {
	return {
		provide: C15T_OPTIONS,
		useFactory: (): C15tProviderOptions => {
			const experiment = experimentFromSearch(inject(PlatformLocation).search);
			return experiment
				? { ...base, callbacks: inject(ExperimentLog).callbacks, experiment }
				: base;
		},
	};
};
