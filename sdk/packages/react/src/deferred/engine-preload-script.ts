/**
 * The server side of `./engine-preload`: the inline script's text. Apart
 * from the learning side, so the first-load chunk does not carry it.
 *
 * @packageDocumentation
 * @internal
 */

import { ENGINE_CHUNKS_KEY } from './engine-preload';

/**
 * The inline script the server leaves for a visitor the engine must serve
 * at once: preloads the learned engine chunks at low priority when they
 * belong to this build and sit under a chunk base of the page's own
 * server-rendered chunks (`chunkBase` in `./engine-preload`).
 *
 * @param chunks - The path every bundler chunk URL contains, as given to
 * `learnEngineChunks`.
 * @returns The script's source.
 * @internal
 */
export const enginePreloadScript = (chunks: string): string =>
	`(function(){try{var d=JSON.parse(localStorage.getItem(${JSON.stringify(
		ENGINE_CHUNKS_KEY
	)})||"null");if(!d||!d.u)return;var c=${JSON.stringify(chunks).replace(
		/</gu,
		'\\u003c'
	)};var b=function(u){try{var x=new URL(u,document.baseURI),i=x.pathname.indexOf(c);return i===-1?"":x.origin+x.pathname.slice(0,i+c.length)}catch(e){return""}};var h=[].map.call(document.head.querySelectorAll("script[src][async],script[src][defer]"),function(s){return s.src}).filter(b);if(d.k!==h.slice().sort().join(" "))return;var p=h.map(b);d.u.forEach(function(u){var x=b(u);if(!x||p.indexOf(x)===-1)return;var l=document.createElement("link");l.rel="preload";l.as="script";l.href=u;l.setAttribute("fetchpriority","low");document.head.appendChild(l)})}catch(e){}})();`;
