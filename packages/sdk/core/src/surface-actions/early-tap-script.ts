/**
 * The inline script a server-rendered banner runs before hydration, and
 * the names it shares with the runtime. Apart from the replay, so the
 * banner's bundle carries the script text and the runtime's does not.
 */

/** One recorded tap. @internal */
export interface EarlyConsentTap {
	action: 'accept' | 'reject' | 'dismiss' | 'customize';
	/** Epoch milliseconds of the click. */
	at: number;
	/** The banner root's `data-model` when it was tapped. */
	model: string | null;
	/** The banner root's `data-prompt` when it was tapped. */
	prompt: string | null;
}

/** What the inline script leaves on `window`. @internal */
export interface EarlyConsentTapQueue {
	taps?: EarlyConsentTap[];
	stop?: () => void;
	/**
	 * Set by a deferred root ({@link EARLY_TAP_NOTIFY_KEY}): called after
	 * each recorded tap, so the root records it without waiting for the
	 * banner to hydrate.
	 */
	n?: () => void;
	/**
	 * Set by a deferred root ({@link EARLY_TAP_HOLD_PRESSES_KEY}) while its
	 * banner cannot hydrate: presses on the banner's buttons stop at the
	 * script.
	 */
	b?: number;
}

/**
 * Property of {@link EarlyConsentTapQueue} the script calls after it
 * records a tap. @internal
 */
export const EARLY_TAP_NOTIFY_KEY = 'n';

/**
 * Property of {@link EarlyConsentTapQueue} that, while truthy, makes the
 * script stop presses on the banner's buttons. @internal
 */
export const EARLY_TAP_HOLD_PRESSES_KEY = 'b';

/** Window property the inline script and the runtime share. @internal */
export const EARLY_TAPS_WINDOW_KEY = '__inthEarlyTaps';

/** Id of the `<style>` that hides the banner after a tap. @internal */
export const EARLY_TAP_STYLE_ID = 'inth-early-tap';

/** The stock banner's root. @internal */
export const EARLY_TAP_ROOT = '[data-testid="consent-banner-root"]';

/**
 * Attribute on a banner button whose click the stock action does not
 * decide, such as one with its own `onClick`. Set to `off`, the script
 * leaves that button's taps alone instead of replaying a choice its
 * handler might refuse. @internal
 */
export const EARLY_TAP_OPT_OUT = 'data-early-tap';

/**
 * Source of the inline script a server-rendered banner puts before its
 * markup. Render it in a `<script>` element (with the page's CSP nonce, if
 * any) only in server HTML: a script inserted by client code never runs.
 *
 * Plain ES5 with no dependencies, because it runs before any bundle. It
 * captures clicks on `[data-action]` inside the stock banner root, skips
 * buttons marked with {@link EARLY_TAP_OPT_OUT} and the IAB banner (its choice needs the CMP's TC string), and copies its own
 * nonce to the hiding `<style>` so a nonce-based style policy allows it.
 * With more than one banner on the page it holds nothing: the queue is
 * shared, so the first banner to hydrate would claim a tap on another.
 * After each recorded tap it calls the queue's
 * {@link EARLY_TAP_NOTIFY_KEY} function, when a deferred root set one.
 *
 * While a deferred root sets {@link EARLY_TAP_HOLD_PRESSES_KEY}, presses on
 * those buttons (pointer, mouse and touch down and up) stop there too. Its
 * banner cannot hydrate before the engine loads, and React would try to
 * hydrate it synchronously at each press, inside the tap's task. Once the
 * banner's code has loaded that hydration is wanted, so the root clears it.
 *
 * @internal
 */
export const EARLY_CONSENT_TAP_SCRIPT = `(function(w,d,k){if(w[k])return;var q=[],s,c=d.currentScript,n=c&&c.nonce,R='${EARLY_TAP_ROOT}',E=['click','pointerdown','pointerup','mousedown','mouseup','touchstart','touchend'];function g(e){var t=e.target,b=t&&t.closest&&t.closest(R+' [data-action]'),a=b&&b.getAttribute('data-action'),r;if(!/^(accept|reject|dismiss|customize)$/.test(a)||b.getAttribute('${EARLY_TAP_OPT_OUT}')==='off')return;r=b.closest(R);if(r.getAttribute('data-model')==='iab'||d.querySelectorAll(R).length>1)return;return[a,r]}function h(e){var x=g(e);if(!x)return;if(e.type!=='click'){if(w[k].${EARLY_TAP_HOLD_PRESSES_KEY})e.stopImmediatePropagation();return}e.stopImmediatePropagation();q.push({action:x[0],at:Date.now(),model:x[1].getAttribute('data-model'),prompt:x[1].getAttribute('data-prompt')});if(x[0]!=='customize'&&!s){s=d.createElement('style');s.id='${EARLY_TAP_STYLE_ID}';if(n)s.nonce=n;s.textContent=R+',[data-testid="consent-banner-overlay"]{display:none!important}';(d.head||d.documentElement).appendChild(s)}if(w[k].${EARLY_TAP_NOTIFY_KEY})w[k].${EARLY_TAP_NOTIFY_KEY}()}function L(f){for(var i=0;i<E.length;i++)d[f](E[i],h,true)}L('addEventListener');w[k]={taps:q,stop:function(){L('removeEventListener')}}})(window,document,'${EARLY_TAPS_WINDOW_KEY}')`;
