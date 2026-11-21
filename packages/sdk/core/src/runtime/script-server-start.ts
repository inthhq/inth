/**
 * Starts granted scripts from a server render, before hydration.
 *
 * The script loader inserts a script only after the page hydrates and the
 * loader's own chunk arrives. When the server has resolved a returning
 * visitor's consent, it can run a granted script's setup and insert its
 * element from the HTML instead; the loader adopts the element when it
 * mounts.
 *
 * Starting a script sends a request to the vendor, so it happens only for
 * a script the loader would run with the state the server resolved:
 * `alwaysLoad`, or consent for its category and vendor. A host must not
 * call these for HTML that is cached or prerendered: that HTML carries no
 * one visitor's consent.
 */
import { writePolicyResolutionWire } from '@inth/sdk-schema/types';

import {
	ENDED_RENDERS_KEY,
	LOADER_RAN_KEY,
	newRenderId,
	PAGE_RENDER_KEY,
	PRIORITY_IMAGE_SELECTOR,
	SERVER_START_FAILED_EVENT,
	STARTED_KEY,
} from '../libs/page-globals';
import type { Script } from '../libs/script-loader/types';
import { storageFor } from '../libs/storage-for';
import {
	OPT_OUT_CONFIRMATION_STORAGE_KEY,
	resolveStorageKeys,
	STORED_NAMES_CHECK,
	storageKeyFamilies,
} from '../libs/storage-keys';
import { vendorAxisActive } from '../libs/vendors';
import {
	deniedVendorIds,
	evaluateConsent,
	getEffectiveGateState,
} from '../modules/has';
import {
	CATEGORY_CODES,
	SUBJECT_CODES,
} from '../modules/persistence/writer/encode';
import { isCallbackOnly } from '../modules/script-loader/callback-only';
import { readScriptRegistry } from '../modules/script-loader/registry';
import { createScriptSourceResolver } from '../modules/script-loader/sources';
import {
	portableDeclaration,
	rootNeedsEngine,
	scriptsNeedEngine,
} from '../surface-actions/plain-scripts';
import type { ConsentSnapshot } from '../types';
import { createRuntimeKernel } from './runtime-kernel';
import type { ConsentRuntimeOptions, RuntimePrefetch } from './types';

type ServerScriptOptions = ConsentRuntimeOptions & {
	prefetch?: RuntimePrefetch;
};

interface ServerRunnable {
	/** Each script the loader would run, and whether it has consent. */
	scripts: { hasConsent: boolean; script: Script }[];
	snapshot?: ConsentSnapshot;
}

/**
 * The scripts in `scripts` the loader would run with the server-resolved
 * `prefetch`: `alwaysLoad`, or consent for their category and vendor, and
 * the snapshot that decided it. None without a server-resolved policy or
 * a request clock, under a `consentSource`, or when anything throws.
 */
const serverRunnableScripts = function serverRunnableScripts(
	options: ServerScriptOptions,
	scripts: Script[]
): ServerRunnable {
	const { prefetch } = options;
	// A shared render, for prerendered or cached HTML, carries no request
	// clock: its state is no one visitor's.
	if (
		scripts.length === 0 ||
		options.consentSource ||
		// The client then replaces the server's records with whatever the
		// browser stores, even an older decision, which the inline check
		// can't tell apart.
		(typeof options.persistence === 'object' &&
			options.persistence.skipHydration === false) ||
		!prefetch?.initialPolicyResolution ||
		prefetch.now === undefined
	) {
		return { scripts: [] };
	}
	let kernel: ReturnType<typeof createRuntimeKernel> | undefined;
	try {
		const resolution = prefetch.initialPolicyResolution;
		kernel = createRuntimeKernel(
			Object.assign(Object.create(options) as ConsentRuntimeOptions, {
				// Never asked: the kernel is only read, never initialized.
				mode: (() => ({
					init: () =>
						Promise.resolve({
							policyResolution: writePolicyResolutionWire(resolution),
						}),
				})) as unknown as ConsentRuntimeOptions['mode'],
				prefetch,
			})
		);
		const snapshot = kernel.getSnapshot();
		const now = Date.now();
		return {
			scripts: scripts.flatMap((script) => {
				const hasConsent = evaluateConsent(script, snapshot, now);
				return script.alwaysLoad === true || hasConsent
					? [{ hasConsent, script }]
					: [];
			}),
			snapshot,
		};
	} catch {
		return { scripts: [] };
	} finally {
		kernel?.dispose();
	}
};

/** JSON safe inside a `<script>` element. */
const inlineJSON = function inlineJSON(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</gu, '\\u003c')
		.replace(/\u2028/gu, '\\u2028')
		.replace(/\u2029/gu, '\\u2029');
};

/**
 * How long the start waits for the page's priority images before it
 * inserts the scripts anyway, in milliseconds.
 */
const PRIORITY_IMAGE_WAIT_MS = 3000;

/**
 * Calls `f` once every `<img fetchpriority="high">` still loading has
 * finished, or after {@link PRIORITY_IMAGE_WAIT_MS}: `afterPriorityImages`
 * in `./page-globals`, except that a page without a priority image
 * starts at once. Vendor downloads share the connection with the page's
 * LCP image and push it back; request priority doesn't help across
 * origins.
 */
const AFTER_PRIORITY_IMAGES = `function(f){var h=[].filter.call(document.querySelectorAll('${PRIORITY_IMAGE_SELECTOR}'),function(x){return!x.complete}),l=h.length,d=function(){if(f){var g=f;f=null;g()}};if(!l)return d();setTimeout(d,${PRIORITY_IMAGE_WAIT_MS});h.forEach(function(x){var c=function(){if(!--l)d()};x.addEventListener('load',c);x.addEventListener('error',c)})}`;

/**
 * Creates one script the way the loader does and leaves the element for
 * the loader to adopt under `__inthStarted[key]`, keyed like the loader's
 * element id by `resourceKey ?? id`, then inserts it after the page's
 * priority images; until then `__inthInsert` holds the insert, and the
 * loader cancels it by deleting it. Until a loader adopts it, the insert
 * checks the stored consent again first: when it changed during the wait,
 * it sets `__inthHeld` and leaves the insert to a loader that runs the
 * script. An adopted element skips that check, since its loader decides
 * consent and cancels a revoked insert itself. `__inthConsent`
 * records whether its setup ran with consent, and `__inthScript` for
 * which script. A render that took the page over meanwhile (`q`, a page
 * object with another id) holds the insert too. The script's own `nonce`
 * wins over the inline script's. No DOM id or marker, so the anonymized id
 * the loader gives it later is the only one it has.
 */
const INSERT_SCRIPT = `function(id,src,o){var e=document.createElement('script');e.src=src;e.__inthStartRender=R;e.__inthDeclaration=o.declaration;e.__inthConsent=o.consent;e.__inthScript=o.script;if(o.async!=null)e.async=o.async;if(o.defer)e.defer=true;if(o.fetchPriority)e.fetchPriority=o.fetchPriority;if(o.nonce||n)e.nonce=o.nonce||n;for(var k in o.attributes||{})e.setAttribute(k,o.attributes[k]);e.addEventListener('load',function(){e.__inthDone='load'});e.addEventListener('error',function(){e.__inthDone='error'});s[id]=e;a(e,o)}`;

/**
 * Schedules `e`'s insert under this render, after the page's priority
 * images: `__inthInsert` is the pending insert, and a newer one replaces
 * it. {@link INSERT_SCRIPT} calls it for each element it creates, and a
 * render that takes over an earlier render's element calls it again, so
 * the insert checks this render's page object rather than the earlier
 * one's, which this render replaced.
 */
const ARM_INSERT = `function(e,o){delete e.__inthHeld;var g=e.__inthInsert=function(){if(e.__inthInsert!==g)return;delete e.__inthInsert;if(!e.__inthAdopted&&(z()||q())){e.__inthHeld=true;return}(o.target==='body'?document.body||document.head:document.head).appendChild(e)};w(g)}`;

/**
 * Runs `r` in a task after the next frame. The start script streams in
 * with the page, often in the task that paints it first; setup and
 * inserts there push first paint back. A hidden document paints no
 * frames, so it runs `r` at once.
 */
const AFTER_FIRST_PAINT =
	'document.hidden?r():requestAnimationFrame(function(){setTimeout(r)})';

/**
 * What the client seeds from the server's records: each category's
 * decision as `[value, confirmedAt]`, the vendor choice's time and denied
 * vendors, and the earliest of those times.
 */
const seedOf = function seedOf(snapshot: ConsentSnapshot): {
	categories: Record<string, [boolean, number]>;
	earliest: number | null;
	optOutAt: number;
	vendorsAt: number;
	vendorsDenied: readonly string[];
} {
	const categories: Record<string, [boolean, number]> = {};
	const times: number[] = [];
	for (const [category, decision] of Object.entries(
		snapshot.explicitChoice?.categories ?? {}
	)) {
		if (decision) {
			categories[category] = [decision.value, decision.confirmedAt];
			times.push(decision.confirmedAt);
		}
	}
	const optOutAt = snapshot.optOut?.recordedAt ?? -1;
	if (snapshot.optOut) {
		times.push(optOutAt);
	}
	const vendorsAt = snapshot.vendorChoice?.confirmedAt ?? -1;
	if (snapshot.vendorChoice) {
		times.push(vendorsAt);
	}
	return {
		categories,
		earliest: times.length > 0 ? Math.min(...times) : null,
		optOutAt,
		vendorsAt,
		vendorsDenied: snapshot.vendorChoice?.denied ?? [],
	};
};

/**
 * Skips everything when the browser holds a record that would change what
 * the client runs with. The client seeds its state from the records the
 * server read, then applies a stored category decision only when it is a
 * denial newer than the seed's for that category, or from the same
 * millisecond as a seeded grant, and a stored vendor choice only when it
 * is newer than the seed's (`applyNewerStoredRecords`). The code applies
 * the same tests to the cookie and `localStorage` copies of the consent
 * and vendor records. It also skips for a clear at or after the earliest
 * seeded decision, under any family (the client voids a seed read from a
 * legacy family with that family's clear), and for a record it can't
 * read, such as an older format: the loader then decides from the stored
 * state, as it would without this script. A consent record under a legacy
 * family skips too,
 * unless the server read a decision from the configured consent cookie:
 * the client falls back to legacy records when the configured one doesn't
 * decode. So does a legacy vendor record while the configured vendor cookie
 * holds none: the server then read the legacy list, and the client takes a
 * configured-family localStorage copy over it whatever its time.
 *
 * Two things change the state without a stored record: the browser's
 * Global Privacy Control signal, when the server didn't see one and no
 * override decides it, and the time passing the snapshot's
 * `nextDeadline`, when a decision expires.
 */
const newerStoredDecision = function newerStoredDecision(
	snapshot: ConsentSnapshot,
	keys: ReturnType<typeof resolveStorageKeys>,
	/**
	 * Also count a newer grant as a change. The server start only needs
	 * denials (a grant it did not see starts nothing it would not); a
	 * deferred root's check fails on any newer decision, so the engine
	 * loads and applies it.
	 */
	anyNewer = false
): string {
	const seed = seedOf(snapshot);
	const { gpc } = snapshot.privacySignals;
	// The client honors a browser signal the server didn't see.
	const gpcCheck =
		gpc.override === undefined && !gpc.active
			? 'try{if(navigator.globalPrivacyControl===true)return true}catch(x){}'
			: '';
	const names = Object.fromEntries(
		CATEGORY_CODES.map(([category, code]) => [code, category])
	);
	const subject = SUBJECT_CODES.map(([, code]) => code);
	const fields = {
		c: subject,
		v: [...subject, 'd'],
	};
	// `z()` is true when the stored state differs. Without a configured
	// cookie or local copy, `A` is the first legacy family's name (c15t's),
	// which the client reads next, so a c15t record the server read can
	// still pass. `L` notes that the client reads a legacy record (or, for
	// the consent record, none at all), and only then do the legacy
	// families' clear epochs count: a c15t clear never voids an Inth record. `c(name)` reads a
	// cookie, unwrapping one URI-encoding layer as the client does; `l(key)`
	// reads localStorage, `H(names)` whether any of them holds a record.
	// `d` tests one decision against the seed, `p` the
	// fields of a compact record, `o` a parsed JSON one. `p` is also true
	// for a field the client's decoder rejects: a field without a value,
	// a repeated one, a malformed decision, or one outside `F`, the other
	// fields each record may hold. For the consent cookie it also holds
	// the decoder's other rules, since a cookie the client rejects sends it
	// to the legacy record: a basis list of `c<fingerprint>` and `l` entries
	// (`B` counts them), a decision naming one of them (`I` is the highest
	// it names) and confirmed no later than now, and a subject id that
	// decodes to text (`x` is true when one does not). IAB fields are not
	// checked, so they fail it. The vendor cookie holds the same decoder's
	// rules too: a time (`T` notes one) of digits no later than now, vendor
	// ids that decode to the slug shape once each, and subject ids that
	// decode. A local vendor copy from the server's vendor time (`V`) fails
	// it when it denies a vendor the server's list (`Y`) allows: the client
	// adds those denials to the cookie's (`readStoredVendorChoice`). `D` is
	// the time the server's decisions can next change.
	return `var D=${inlineJSON(snapshot.nextDeadline)},S=${inlineJSON(seed.categories)},O=${seed.optOutAt},V=${seed.vendorsAt},Y=${inlineJSON(seed.vendorsDenied)},M=${inlineJSON(seed.earliest)},N=${inlineJSON(names)},F=${inlineJSON(fields)},K=${inlineJSON({ consent: keys.consent, epochs: storageKeyFamilies(keys).map((family) => family.epoch), legacy: keys.legacy.map((family) => family.consent), legacyOptOut: keys.legacy.map((family) => family.optOut), legacyVendors: keys.legacy.map((family) => family.vendors), optOut: keys.optOut, vendors: keys.vendors })},H=${STORED_NAMES_CHECK},z=function(){${gpcCheck}if(D!==null&&!(Date.now()<D))return true;var c=function(n){try{for(var a=document.cookie.split(/;\\s*/),j=0;j<a.length;j++){var m=a[j].indexOf('=');if(a[j].slice(0,m)===n){var v=a[j].slice(m+1);if(v.indexOf('v=')&&v.indexOf('%')>=0)try{v=decodeURIComponent(v)}catch(x){}return v}}}catch(x){}return null},l=function(n){try{return localStorage.getItem(n)}catch(x){return null}},d=function(n,v,t){var s=S[n],o=!s||!(t<=s[1]);return v!==true?o||t===s[1]&&s[0]:${anyNewer}&&o},e=function(t){return M!==null&&!(+t<M)},o=function(v,f){try{v=JSON.parse(v)}catch(x){return true}return!v||typeof v!=='object'||f(v)},p=function(v,h,f){if(v===null||v==='')return false;v=v.split('&');if(v[0]!==h)return true;for(var u=[],j=1;j<v.length;j++){var m=v[j].indexOf('='),k=v[j].slice(0,m);if(m<1||u.indexOf(k)>=0||f(k,v[j].slice(m+1)))return true;u.push(k)}return false},r=function(v,f){return v!==null&&v!==''&&o(v,f)},x=function(v){try{return!decodeURIComponent(v)}catch(y){return true}},A=c(K.consent)===null&&l(K.consent)===null&&K.legacy.length?K.legacy[0]:K.consent,L=A!==K.consent,a=c(A),b=l(A),B=0,I=-1,T,g;if(p(a,'v=3',function(k,v){if(k==='e')return e(v);if(k==='b'){B=v.split('|').length;return!/^(c[^|]+|l[^|]*)(\\|(c[^|]+|l[^|]*))*$/.test(v)||x(v)}if(N.hasOwnProperty(k)){if(!/^[01]\\.\\d+\\.\\d+$/.test(v))return true;v=v.split('.');if(+v[2]>I)I=+v[2];return!(+v[1]<=Date.now())||d(N[k],v[0]==='1',+v[1])}return F.c.indexOf(k)<0||x(v)})||I>=B||r(b,function(v){if(v.version!==3||v.epoch&&e(v.epoch))return true;for(g in v.categories||{})if(v.categories[g]&&d(g,v.categories[g].value,+v.categories[g].confirmedAt))return true})||!(a&&M!==null)&&H(K.legacy))return true;if((A=c(K.vendors)===null&&l(K.vendors)===null&&K.legacyVendors.length?K.legacyVendors[0]:K.vendors,a=c(A),L=L||A!==K.vendors&&(a!==null||l(A)!==null),T=0,p(a,'v=1',function(k,v){if(k==='t'){T=1;return!/^\\d+$/.test(v)||!(+v<=V)||!(+v<=Date.now())}if(k==='d'){if(v==='')return false;for(var u=v.split('|'),j=0,h=[],y;j<u.length;j++){try{y=decodeURIComponent(u[j])}catch(e){return true}if(!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(y)||h.indexOf(y)>=0)return true;h.push(y)}return false}return F.v.indexOf(k)<0||x(v)})||a!==null&&a!==''&&!T)||r(l(A),function(v){if(v.version!==1||!(+v.confirmedAt<=V))return true;if(+v.confirmedAt===V){if(!Array.isArray(v.denied))return true;for(g=0;g<v.denied.length;g++)if(Y.indexOf(v.denied[g])<0)return true}})||!a&&H(K.legacyVendors))return true;var oa=c(K.optOut),ob=l(K.optOut);if(O<0?(oa!==null&&oa!==''||ob!==null&&ob!==''||H(K.legacyOptOut)):(oa===null&&ob===null?${anyNewer}:(oa!==null&&oa!==''&&p(oa,'v=1',function(k,v){if(k==='t')return!/^\\d+$/.test(v)||!(+v<=O);return k!=='r'&&k!=='m'&&k!=='h'&&F.c.indexOf(k)<0||x(v)})||r(ob,function(v){return v.version!==1||!(+v.recordedAt<=O)}))))return true;for(g=0;g<(L?K.epochs.length:1);g++)if((a=c(K.epochs[g]))&&e(a)||(a=l(K.epochs[g]))&&e(a))return true;return false};if(z())return;`;
};

/** The loader's element identity for `script`. */
const resourceOf = (script: Script): string => script.resourceKey ?? script.id;

/**
 * The resources two scripts with different ids share. On an element it
 * inserts, the loader runs the `onBeforeLoad` of every script that shares
 * it, but on one it adopts, only the first script's, so these are left to
 * the loader.
 */
const sharedResources = function sharedResources(
	scripts: ServerRunnable['scripts']
): Set<string> {
	const owners = new Map<string, string>();
	const shared = new Set<string>();
	for (const { script } of scripts) {
		const owner = owners.get(resourceOf(script));
		if (owner === undefined) {
			owners.set(resourceOf(script), script.id);
		} else if (owner !== script.id) {
			shared.add(resourceOf(script));
		}
	}
	return shared;
};

/**
 * The scripts a server start considers: every element script when one of
 * them can start from the HTML, and none when the app turns it off.
 */
const serverStartCandidates = function serverStartCandidates(
	options: ServerScriptOptions,
	failedPredicates: Set<Script>
): Script[] {
	// With the registry on, scripts start from the sources the prefetched
	// init carries, as the loader would load them. Without a resolved
	// prefetch, an integration the list may name waits for the loader.
	const { prefetch } = options;
	const { scripts } = createScriptSourceResolver(
		options.scriptLoader?.sources,
		options.experimentalScriptRegistry
			? () =>
					readScriptRegistry({
						policyPending:
							prefetch?.initialPolicyPending ??
							!prefetch?.initialPolicyResolution,
						resolution: prefetch?.initialPolicyResolution,
						scriptRegistry: prefetch?.initialScriptRegistry ?? null,
					})
			: undefined
	)(options.scripts ?? []);
	if (
		options.scriptLoader?.serverStart === false ||
		!scripts.some((script) => script.serverStart && script.src)
	) {
		return [];
	}
	return scripts.filter((script) => {
		try {
			return !isCallbackOnly(script);
		} catch {
			// Keep its resource ownership, but leave its setup to the loader.
			failedPredicates.add(script);
			return true;
		}
	});
};

/**
 * Takes this render's page object (`g`): joins it when an earlier script
 * of the same render made it, and replaces it otherwise. For a render its
 * deferred root already ended ({@link ENDED_RENDERS_KEY}) it installs
 * nothing and leaves whatever page object is there, a newer render's
 * included: `g` is then an object no one reads, and every later check
 * (`q`) fails, so the script inserts nothing.
 */
const pageRenderFor = (renderId: string): string => {
	const id = inlineJSON(renderId);
	return `var g=window.${PAGE_RENDER_KEY},e=window.${ENDED_RENDERS_KEY};if(e&&e.indexOf&&e.indexOf(${id})>=0)g={id:${inlineJSON(`${renderId}:ended`)},starts:{}};else if(!g||g.id!==${id})g=window.${PAGE_RENDER_KEY}={id:${id},starts:{}};`;
};

/**
 * A short hash of what a start sets up: `script`'s declaration
 * (`portableDeclaration` in `../surface-actions/plain-scripts`, the same in every server process), whether its
 * setup runs with consent, and that setup's code, which carries the
 * consent and vendor state `serverStart` saw. It is recorded on the
 * element the start inserts. A later render's start compares it before it
 * takes the element over ({@link replaceStale}).
 */
const startHash = (
	script: Script,
	hasConsent: boolean,
	code: string
): string => {
	const text = `${portableDeclaration(script)}\n${hasConsent}\n${code}`;
	// A rolling hash modulo a prime: stable, and short enough to inline per
	// script. A collision only lets a start take over an element it would
	// otherwise replace.
	let hash = 0;
	for (let index = 0; index < text.length; index += 1) {
		hash = (hash * 31 + text.charCodeAt(index)) % 2_147_483_647;
	}
	return hash.toString(36);
};

/**
 * Inline code that removes `element`, an earlier render's server-started
 * element for the same key, when its start set up something else (a new
 * `src`, a category, an attribute, other consent or vendor state): taking
 * it over would keep the old resource and skip this start's setup. An element a loader adopted or a root started
 * itself is theirs to replace. It names no variable, since the setup code
 * that follows shares the scope.
 */
const replaceStale = (element: string, declaration: string): string =>
	`if(${element}&&${element}.__inthStartRender&&!${element}.__inthAdopted&&!${element}.__inthEarly&&${element}.__inthDeclaration!==${declaration}){delete ${element}.__inthInsert;${element}.remove();delete ${element}}`;

/**
 * Inline code that schedules the insert of `element`, an earlier render's
 * server-started element this render takes over, when it is still waiting
 * or was held: the earlier render's insert would check the page object
 * this render replaced, and hold it. One already in the page, or that a
 * loader adopted or a root started, is left alone.
 */
const rearmTakenOver = (element: string, options: string): string =>
	`if(!${element}.isConnected&&!${element}.__inthAdopted&&!${element}.__inthEarly&&(${element}.__inthInsert||${element}.__inthHeld))a(${element},${options})`;

/**
 * Inline condition: `element` is one a deferred root or hook inserted
 * before this start (`startPlainScripts` in
 * `../surface-actions/plain-scripts`), which no loader adopted yet. It ran
 * no setup and belongs to its owners, so this start neither takes it over
 * nor replaces it: it reports a failure, which leaves the script and its
 * setup to the engine.
 */
const earlyStarted = (element: string): string =>
	`${element}.__inthEarly&&!${element}.__inthAdopted`;

/** What {@link serverScriptStartPlan} returns. @internal */
export interface ServerScriptStartPlan {
	/** The inline script's code, as {@link serverScriptStart} returns it. */
	code?: string;
	/** The render the code writes the page object for. */
	renderId: string;
	/**
	 * The resource keys (`resourceKey ?? id`) the code starts and marks in
	 * `PAGE_RENDER_KEY` (`starts`). A `serverStart` that returned nothing or threw, or
	 * a resource two scripts share, is not among them.
	 */
	started: ReadonlySet<string>;
}

const nothingStarted = (renderId: string): ServerScriptStartPlan => ({
	renderId,
	started: new Set(),
});

/**
 * The server start's inline code, from its parts. First, as the page
 * parses, it marks what it starts in this render's page object
 * (`PAGE_RENDER_KEY`, `starts`), so a deferred root counts only those as
 * started: an entry whose `serverStart` returned nothing or threw, or that
 * shares a resource, stays the loader's. It marks nothing when the browser
 * holds a newer decision than the server read, or when the loader already
 * ran in this document, since the code then skips every start. A setup or
 * shared prelude that throws later inserts nothing: `E` drops its mark,
 * sets `failed` and dispatches `SERVER_START_FAILED_EVENT`, and a deferred
 * root loads the engine so the loader runs the script. (`F` is taken by
 * `newerStoredDecision`.)
 */
const startCode = function startCode({
	check,
	preludes,
	renderId,
	startedKeys,
	starts,
}: {
	check: string;
	preludes: string[];
	renderId: string;
	startedKeys: string[];
	starts: string[];
}): string {
	const id = inlineJSON(renderId);
	const marks = `(function(){${pageRenderFor(renderId)}if(window.${LOADER_RAN_KEY})return;${check}${startedKeys.map((key) => `g.starts[${inlineJSON(key)}]=1`).join(';')}})();`;
	const fail = `E=function(k){var g=window.${PAGE_RENDER_KEY};if(g&&g.id===${id}){delete g.starts[k];g.failed=1}try{window.dispatchEvent(new Event(${inlineJSON(SERVER_START_FAILED_EVENT)}))}catch(x){}}`;
	const prelude = preludes.length
		? `try{${preludes.join(';')}}catch(x){${startedKeys.map((key) => `E(${inlineJSON(key)})`).join(';')};return}`
		: '';
	// `document.currentScript` is only set while the script first runs.
	// `R` names this render on each element it inserts, or takes over from
	// an earlier render, so only this render's root releases it.
	// `q` is true once another render's page object replaced this one's, as
	// after a client-side navigation: that render's state decides what runs.
	return `${marks}(function(){var n=document.currentScript&&document.currentScript.nonce,R=${id},${fail},q=function(){var g=window.${PAGE_RENDER_KEY};return!g||g.id!==${id}},r=function(){if(window.${LOADER_RAN_KEY}||q())return;${check}var s=window.${STARTED_KEY}=window.${STARTED_KEY}||{},w=${AFTER_PRIORITY_IMAGES},a=${ARM_INSERT},i=${INSERT_SCRIPT};${prelude}${starts.join('')}};${AFTER_FIRST_PAINT}})()`;
};

/**
 * {@link serverScriptStart} with the scripts it starts: the same marks the
 * page reads, for a server render that decides something from them, such
 * as whether the engine's preload can be left out.
 *
 * @param options - The runtime's options, with a resolved `prefetch`.
 * @returns The code and the keys it starts.
 * @internal
 */
export const serverScriptStartPlan = function serverScriptStartPlan(
	options: ServerScriptOptions,
	renderId: string = newRenderId()
): ServerScriptStartPlan {
	const failedPredicates = new Set<Script>();
	const { scripts, snapshot } = serverRunnableScripts(
		options,
		serverStartCandidates(options, failedPredicates)
	);
	// A visitor the policy asks to choose sees the banner as the page
	// hydrates, and a script's first run would hold the main thread while
	// they tap it. The loader starts those scripts once it mounts instead.
	if (
		!snapshot ||
		scripts.length === 0 ||
		snapshot.promptRequirement.kind !== 'none'
	) {
		return nothingStarted(renderId);
	}
	const consents = getEffectiveGateState(snapshot).effectivePermissions;
	const vendorsDecide = vendorAxisActive(snapshot);
	const denied = vendorsDecide ? deniedVendorIds(snapshot) : null;
	const preludes = new Set<string>();
	const starts: string[] = [];
	/** The resources the code below starts, which the page marks. */
	const startedKeys: string[] = [];
	const shared = sharedResources(scripts);
	const keys = new Set<string>();
	for (const { hasConsent, script } of scripts) {
		const key = resourceOf(script);
		if (keys.has(key) || shared.has(key)) {
			continue;
		}
		keys.add(key);
		if (failedPredicates.has(script) || !(script.serverStart && script.src)) {
			continue;
		}
		let start: ReturnType<NonNullable<Script['serverStart']>>;
		try {
			start = script.serverStart?.(
				{
					consents,
					hasConsent,
					id: script.id,
					vendor:
						script.vendor && vendorsDecide
							? { granted: !denied?.has(script.vendor), id: script.vendor }
							: undefined,
				},
				script
			);
		} catch {
			continue;
		}
		if (!start) {
			continue;
		}
		if (start.prelude) {
			preludes.add(start.prelude);
		}
		const declaration = startHash(script, hasConsent, start.code);
		const insertOptions = {
			async: script.async,
			attributes: script.attributes,
			consent: hasConsent,
			declaration,
			defer: script.defer,
			fetchPriority: script.fetchPriority,
			nonce: script.nonce,
			script: script.id,
			target: script.target,
		};
		startedKeys.push(key);
		starts.push(
			`try{${replaceStale(`s[${inlineJSON(key)}]`, inlineJSON(declaration))}if(!s[${inlineJSON(key)}]){${start.code};i(${inlineJSON(key)},${inlineJSON(script.src)},${inlineJSON(insertOptions)})}else if(${earlyStarted(`s[${inlineJSON(key)}]`)})E(${inlineJSON(key)});else{s[${inlineJSON(key)}].__inthStartRender=R;${rearmTakenOver(`s[${inlineJSON(key)}]`, inlineJSON(insertOptions))}}}catch(x){E(${inlineJSON(key)})}`
		);
	}
	if (starts.length === 0) {
		return nothingStarted(renderId);
	}
	const code = startCode({
		check: newerStoredDecision(
			snapshot,
			resolveStorageKeys(storageFor(options))
		),
		preludes: [...preludes],
		renderId,
		startedKeys,
		starts,
	});
	return { code, renderId, started: new Set(startedKeys) };
};

/**
 * One inline script that runs the setup of every script the loader would
 * run with the server-resolved `prefetch` and that has a `serverStart`,
 * then inserts its element once the page's priority images have loaded.
 * An `alwaysLoad` script without consent runs its setup without consent,
 * as the loader would. Nothing starts while the policy asks the visitor
 * to choose: the banner needs the main thread then. The loader adopts those elements instead of
 * inserting its own. Each script's setup runs in its own `try` block; one
 * that throws is skipped and left to the loader.
 *
 * The server can't see a decision stored only in the browser, so the code
 * checks `localStorage` and the consent cookies first and does nothing
 * when they hold a decision newer than the server's, and checks them
 * again before each insert. It does the same for a Global Privacy Control
 * signal the server didn't see and for a decision that expired since the
 * render. Scripts that share a `resourceKey` start from the loader, which
 * runs each one's setup. A host must not call this for cached or prerendered
 * HTML; a state from a shared render carries no `now` and starts nothing.
 *
 * The work waits until after first paint. When the loader mounts first,
 * it sets `__inthLoaderRan` and the code does nothing: the loader has
 * started those scripts itself.
 *
 * @param options - The runtime's options, with a resolved `prefetch`.
 * @returns The script's code, or `undefined` when no script starts.
 * @internal
 */
export const serverScriptStart = function serverScriptStart(
	options: ServerScriptOptions,
	renderId?: string
): string | undefined {
	return serverScriptStartPlan(options, renderId).code;
};

/** Stands in for a script so `serverRunnableScripts` resolves the snapshot. */
const SNAPSHOT_PROBE = {
	alwaysLoad: true,
	category: 'necessary',
	id: 'inth-stored-choice-probe',
	src: '',
} as Script;

/**
 * An inline script that sets `current` on the render's page object
 * (`PAGE_RENDER_KEY` in `./page-globals`) when the browser holds nothing that would change the server's consent state: the
 * same test the server start makes (`newerStoredDecision`). The value is a
 * function that runs the test again, so a root that starts a returning
 * visitor's scripts without the engine sees a decision that expired, or a
 * denial another tab stored, after the page parsed.
 *
 * Left out, too, for a root that needs the engine at once whatever the
 * stored choice says: a network blocker, an experiment, `enabled: false`,
 * or a runnable `scripts` entry the root cannot start without the engine.
 * Its absence is how the browser root learns that.
 *
 * @param options - The runtime's options, with a resolved `prefetch`.
 * @param plan - The render's {@link serverScriptStartPlan}, when it emits
 * the server start too: reused rather than run again.
 * @param renderId - The render's id, as its boot data carries it. Defaults
 * to the plan's.
 * @returns The script's code, or `undefined` when the server resolved no
 * visitor's state, the policy asks the visitor to choose, or the root
 * needs the engine at once.
 * @internal
 */
export const storedChoiceCheckScript = function storedChoiceCheckScript(
	options: ServerScriptOptions,
	plan?: ServerScriptStartPlan,
	renderId: string = plan?.renderId ?? newRenderId()
): string | undefined {
	const { snapshot } = serverRunnableScripts(options, [SNAPSHOT_PROBE]);
	if (
		!snapshot ||
		snapshot.promptRequirement.kind !== 'none' ||
		rootNeedsEngine({
			clearOnRevocation: options.clearOnRevocation,
			networkBlocker: options.networkBlocker,
			options,
		})
	) {
		return;
	}
	// The rule the browser root applies before it lets the engine wait: a
	// runnable script that neither the server start emitted nor the root
	// can start itself (a plain script, with a commit path to read it
	// from) needs the engine at once. Without the check, the browser
	// starts the engine's download as the root's chunk runs.
	const serverStart = Boolean(
		options.scripts?.length && options.scriptLoader?.serverStart !== false
	);
	// The render's own plan when it has one, so each `serverStart` runs once
	// and the check describes the script the page gets.
	const { started } =
		plan ??
		(serverStart
			? serverScriptStartPlan(options, renderId)
			: nothingStarted(renderId));
	if (
		scriptsNeedEngine(
			options.scripts,
			snapshot,
			serverStart,
			options.persistence !== false && !options.consentSource,
			(script) => started.has(resourceOf(script))
		)
	) {
		return;
	}
	// Clears an earlier render's verifier first, such as after a remount: it
	// checks another snapshot, and the test below may return before setting
	// this one's. A pending post-reload opt-out confirmation also wakes the
	// engine at once so the confirmation view opens without waiting.
	return `(function(){${pageRenderFor(renderId)}${newerStoredDecision(snapshot, resolveStorageKeys(storageFor(options)), true)}var o=function(){try{return sessionStorage.getItem(${inlineJSON(OPT_OUT_CONFIRMATION_STORAGE_KEY)})!==null}catch(e){return false}};g.current=function(){try{return!z()&&!o()}catch(x){return false}}})()`;
};
