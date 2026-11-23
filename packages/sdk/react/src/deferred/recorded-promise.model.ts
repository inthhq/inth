/**
 * The promise helpers deferred surfaces render with: a promise that keeps
 * its outcome where a render can read it. Small: on first load.
 *
 * @packageDocumentation
 * @internal
 */

/** A promise that keeps its result where a render can read it. @internal */
export type Recorded<Value> = Promise<Value> & {
	status?: 'pending' | 'fulfilled' | 'rejected';
	value?: Value;
	reason?: unknown;
};

/**
 * `promise`, recording its outcome on itself, so `read` returns at once
 * once it settled, also under React 18.
 *
 * @internal
 */
export const record = function record<Value>(
	promise: Promise<Value>
): Recorded<Value> {
	const recorded = promise as Recorded<Value>;
	if (!recorded.status) {
		recorded.status = 'pending';
		const track = async (): Promise<void> => {
			try {
				recorded.value = await promise;
				recorded.status = 'fulfilled';
			} catch (error) {
				recorded.reason = error;
				recorded.status = 'rejected';
			}
		};
		void track();
	}
	return recorded;
};

/**
 * `load()`, recorded and shared by every call. After a failed load the next
 * call loads again, a second later, up to three loads in all; after that
 * the failure stays, so `read` throws it to the error boundary.
 *
 * @remarks
 * Three loads a second apart ride out a dropped connection, while a chunk
 * a deploy removed fails within seconds instead of being requested in a
 * loop by every render that reads it.
 *
 * @internal
 */
export const recordOnce = function recordOnce<Value>(
	load: () => Promise<Value>
): () => Recorded<Value> {
	let loading: Recorded<Value> | undefined;
	let loads = 0;
	return () => {
		if (!loading || (loading.status === 'rejected' && loads < 3)) {
			loads += 1;
			loading = record(
				loads > 1
					? (async () => {
							await new Promise((resolve) => {
								setTimeout(resolve, 1000);
							});
							return load();
						})()
					: load()
			);
		}
		return loading;
	};
};
