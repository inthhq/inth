/**
 * Boots the conformance fixture as a real Angular application: in the
 * browser (jsdom) with `createApplication`, hydrating server HTML when
 * asked, and on the server with `renderApplication` from
 * `@angular/platform-server`, in the same process.
 */
import { NgComponentOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	inject,
	InjectionToken,
	provideZonelessChangeDetection,
} from '@angular/core';
import type { ApplicationRef } from '@angular/core';
import {
	bootstrapApplication,
	createApplication,
	provideClientHydration,
} from '@angular/platform-browser';
import {
	provideServerRendering,
	renderApplication,
} from '@angular/platform-server';
import type { ConsentSnapshot } from '@inth/sdk/engine';

import { ConsentManager } from '../lib/core/consent-manager';
import type { InthProviderOptions } from '../lib/core/inth-options';
import { provideInth } from '../lib/core/provide-inth';
import { ConsentDialogLink } from '../lib/dialog/consent-dialog-link';
import type { ConformanceEntry } from './conformance-registry';

/** What the fixture renders inside the provider. */
export interface FixtureContent {
	readonly entries: readonly ConformanceEntry[];
	/** Render a `[inthConsentDialogLink]` button after the entries. */
	readonly link?: boolean;
}

const CONTENT = new InjectionToken<FixtureContent>('inth conformance content');
const ON_CONSENT = new InjectionToken<(consent: ConsentManager) => void>(
	'inth conformance consent capture'
);

const ROOT_SELECTOR = 'inth-conformance-root';

/** The fixture: the registered surfaces under `provideInth()`. */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgComponentOutlet, ConsentDialogLink],
	selector: ROOT_SELECTOR,
	template: `
		@for (entry of content.entries; track $index) {
			<ng-container
				*ngComponentOutlet="entry.component; inputs: entry.inputs ?? {}"
			/>
		}
		@if (content.link) {
			<button
				type="button"
				inthConsentDialogLink
			>
				Privacy settings
			</button>
		}
	`,
})
class ConformanceRoot {
	protected readonly content = inject(CONTENT);

	constructor() {
		inject(ON_CONSENT, { optional: true })?.(inject(ConsentManager));
	}
}

/** A fixture application running in the jsdom document. */
export interface ClientApp {
	readonly appRef: ApplicationRef;
	readonly consent: ConsentManager;
	readonly destroy: () => void;
}

/**
 * Boot the fixture in `container`.
 *
 * @param container - Holds the root element, or the server HTML to hydrate.
 * @param hydrate - Hydrate the server HTML already in `container`.
 */
export const bootClient = async function bootClient(
	container: HTMLElement,
	options: InthProviderOptions,
	content: FixtureContent,
	hydrate = false
): Promise<ClientApp> {
	if (hydrate) {
		// The server puts its integrity marker at the top of `<body>`, where
		// Angular looks for it. The server HTML here sits in a container, so
		// the marker has to be lifted to the body as a real page has it.
		const marker = Array.from(container.childNodes).find(
			(node) =>
				node.nodeType === Node.COMMENT_NODE && node.textContent === 'nghm'
		);
		if (marker) {
			document.body.prepend(marker);
		}
	}
	let host = container.querySelector<HTMLElement>(ROOT_SELECTOR);
	if (!host) {
		host = document.createElement(ROOT_SELECTOR);
		container.append(host);
	}
	const appRef = await createApplication({
		providers: [
			provideZonelessChangeDetection(),
			provideInth(options as Parameters<typeof provideInth>[0]),
			{ provide: CONTENT, useValue: content },
			...(hydrate ? [provideClientHydration()] : []),
		],
	});
	appRef.bootstrap(ConformanceRoot, host);
	await appRef.whenStable();
	return {
		appRef,
		consent: appRef.injector.get(ConsentManager),
		destroy: () => appRef.destroy(),
	};
};

/**
 * Undo the DOM globals the server platform installs. Starting it assigns
 * domino's `Element`, `Event`, `KeyboardEvent` and the rest over jsdom's
 * on `globalThis`, so later client tests would build events and check
 * nodes against the wrong classes.
 *
 * @returns Restores the globals as they were.
 */
const keepDomGlobals = function keepDomGlobals(): () => void {
	const scope = globalThis as unknown as Record<string, unknown>;
	const before = new Map(
		Object.getOwnPropertyNames(scope).map((key) => [key, scope[key]])
	);
	return () => {
		for (const key of Object.getOwnPropertyNames(scope)) {
			if (!before.has(key)) {
				Reflect.deleteProperty(scope, key);
			} else if (!Object.is(scope[key], before.get(key))) {
				scope[key] = before.get(key);
			}
		}
	};
};

/** What a server render produced. */
export interface ServerRender {
	/** The full document. */
	readonly html: string;
	/** The body's content: the root element and the hydration state. */
	readonly body: string;
	/** The snapshot the server rendered. */
	readonly snapshot: ConsentSnapshot;
}

/**
 * Server-render the fixture with `@angular/platform-server`.
 */
export const renderServer = async function renderServer(
	options: InthProviderOptions,
	content: FixtureContent
): Promise<ServerRender> {
	let consent: ConsentManager | undefined;
	const restoreGlobals = keepDomGlobals();
	const html = await renderApplication(
		(context) =>
			bootstrapApplication(
				ConformanceRoot,
				{
					providers: [
						provideZonelessChangeDetection(),
						provideServerRendering(),
						provideClientHydration(),
						provideInth(options as Parameters<typeof provideInth>[0]),
						{ provide: CONTENT, useValue: content },
						{
							provide: ON_CONSENT,
							useValue: (captured: ConsentManager) => {
								consent = captured;
							},
						},
					],
				},
				context
			),
		{
			document: `<html><head></head><body><${ROOT_SELECTOR}></${ROOT_SELECTOR}></body></html>`,
			url: '/',
		}
	).finally(restoreGlobals);
	if (!consent) {
		throw new Error('Angular driver: server render captured no ConsentManager');
	}
	const parsed = new DOMParser().parseFromString(html, 'text/html');
	return {
		body: parsed.body.innerHTML,
		html,
		snapshot: consent.snapshot(),
	};
};
