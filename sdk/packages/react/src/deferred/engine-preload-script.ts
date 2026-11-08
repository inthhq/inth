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
 * belong to this build.
 *
 * @internal
 */
export const ENGINE_PRELOAD_SCRIPT = `(function(){try{var d=JSON.parse(localStorage.getItem(${JSON.stringify(
	ENGINE_CHUNKS_KEY
)})||"null");if(!d||!d.u)return;var k=[].map.call(document.head.querySelectorAll("script[src][async]"),function(s){return s.src}).sort().join(" ");if(d.k!==k)return;d.u.forEach(function(u){var l=document.createElement("link");l.rel="preload";l.as="script";l.href=u;l.setAttribute("fetchpriority","low");document.head.appendChild(l)})}catch(e){}})();`;
