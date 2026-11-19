/**
 * Server side of the first-load shell (`../browser/shell`): whether the
 * browser may load the consent engine after the page for this visitor, and
 * the boot data block the shell reads. Only the server render imports it.
 *
 * @internal
 */

import type { ConsentSnapshot, KernelConfig } from '@inth/sdk/engine';
import { canDeferEngine as canDeferCoreEngine } from '@inth/sdk/server';

import { declaresVendor } from '../browser/deferred-scripts';
import type { InthLocals, InthResolvedOptions } from '../types';

type DeferOptions = Pick<
	InthResolvedOptions,
	'experiment' | 'gpp' | 'iab' | 'networkBlocker' | 'scripts' | 'vendors'
>;

/** Whether the site declares vendors, whose decisions only the kernel records. */
const declaresVendors = function declaresVendors(
	options: DeferOptions,
	config: Pick<KernelConfig, 'initialVendors'>
): boolean {
	return (
		(options.vendors?.length ?? 0) > 0 ||
		(config.initialVendors?.declared?.length ?? 0) > 0 ||
		options.scripts?.some(declaresVendor) === true
	);
};

/**
 * Whether the browser may answer this visitor from the server's snapshot
 * and load the engine after the page: the banner asks for a choice, an
 * accept and a reject are both something the first-load shell can record
 * on its own (`planInstantCommit`), nothing optional is granted yet, the
 * banner does not block the page (its focus trap is the engine's), and no
 * option needs the engine at once (IAB, an experiment, GPP, the network
 * blocker, declared vendors, or a configured script that may run now). The
 * browser adds what only it knows, such as the `clientEntrypoint` options.
 *
 * Vendors are checked on the options and the config as well as the
 * snapshot: the server's snapshot leaves out the vendors `inth()` declares,
 * which the browser runtime merges in, and a bulk choice also decides
 * every declared vendor, which only the kernel records.
 *
 * @param snapshot - The snapshot the server rendered with.
 * @param blocking - Whether the banner renders as a blocking dialog.
 * @param now - The clock. Defaults to `Date.now()`.
 * @internal
 */
export const canDeferEngine = function canDeferEngine(
	snapshot: ConsentSnapshot,
	options: DeferOptions,
	blocking: boolean,
	now: number = Date.now(),
	config: Pick<KernelConfig, 'initialVendors'> = {}
): boolean {
	return (
		!blocking &&
		!declaresVendors(options, config) &&
		// Astro's server starts no script: every script waits for the engine.
		canDeferCoreEngine(
			snapshot,
			{ ...options, scriptLoader: { serverStart: false } },
			now
		)
	);
};

/**
 * The boot data block's text: the snapshot the banner rendered from, and
 * whether the engine may wait.
 *
 * @param snapshot - The snapshot the server rendered with.
 * @param defer - From {@link canDeferEngine}.
 * @returns JSON safe to place inside a `<script>` element.
 * @internal
 */
export const buildConsentBootJSON = function buildConsentBootJSON(
	snapshot: ConsentSnapshot,
	defer: boolean
): string {
	// `<` is escaped so a translation string can never close the script tag.
	return JSON.stringify({ d: defer, s: snapshot }).replace(/</gu, '\\u003c');
};

/**
 * The boot data block for a request, rendered beside the config on every
 * page so the page script has a client to offer before the engine loads.
 * The engine may wait only where the server rendered a visible choice
 * banner (see {@link canDeferEngine}); a prerendered page's snapshot is the
 * one a first-time visitor gets, so it never waits.
 *
 * @param locals - `Astro.locals.inth`.
 * @returns JSON safe to place inside a `<script>` element.
 * @internal
 */
export const buildLocalsBootJSON = function buildLocalsBootJSON(
	locals: Pick<
		InthLocals,
		'config' | 'options' | 'prerendered' | 'shouldShowBanner' | 'snapshot'
	>
): string {
	const defer =
		!locals.prerendered &&
		locals.shouldShowBanner &&
		canDeferEngine(
			locals.snapshot,
			locals.options,
			false,
			Date.now(),
			locals.config
		);
	return buildConsentBootJSON(locals.snapshot, defer);
};
