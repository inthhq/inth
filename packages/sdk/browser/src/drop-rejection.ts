/**
 * For a promise the SDK's own handlers start and nobody awaits, such as a
 * banner button's save: its failure is already reported (the console error
 * when the engine gives up, or the call's own `onError`), so it must not
 * surface again as an `unhandledrejection` on the host page.
 *
 * @internal
 */
export const dropRejection = function dropRejection(value: unknown): void {
	if (value instanceof Promise) {
		void (async () => {
			try {
				await value;
			} catch {
				// Reported where it failed.
			}
		})();
	}
};
