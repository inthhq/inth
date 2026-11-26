/**
 * Names a manifest call may not pass through. Each one is a function that
 * runs a string as code, writes markup or navigates, or a property that
 * leads back to a window or a document, where those functions are. A global
 * a vendor names can itself be a window (an iframe's name puts its window
 * on this one), so a name is refused at any depth, not only as the root.
 */
const BROWSER_NAMES: ReadonlySet<unknown> = new Set([
	'window',
	'self',
	'globalThis',
	'frames',
	'parent',
	'top',
	'opener',
	'defaultView',
	'ownerDocument',
	'eval',
	'Function',
	'setTimeout',
	'setInterval',
	'location',
	'navigation',
	'open',
	'write',
	'writeln',
	'insertAdjacentHTML',
]);

/**
 * Whether calling or constructing `path` under window could run a string as
 * code, write markup to the document or navigate. Under `document` only a
 * method of the document itself may be called: its elements hold
 * `insertAdjacentHTML`, `outerHTML` and similar.
 *
 * @param path - The global, then each property down to the function.
 * @internal
 */
export const callReachesCode = function callReachesCode(
	path: readonly unknown[]
): boolean {
	return (
		path.some((name) => BROWSER_NAMES.has(name)) ||
		(path[0] === 'document' && path.length > 2)
	);
};
