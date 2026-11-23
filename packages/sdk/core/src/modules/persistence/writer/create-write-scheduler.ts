/**
 * Macrotask-debounced write scheduler.
 *
 * Multiple writes requested within a single tick coalesce into one
 * storage write. The write runs in a later macrotask so synchronous
 * cookie/localStorage work does not sit on the user interaction path
 * that just updated the kernel and UI.
 *
 * The write runs in the very next macrotask (`setTimeout(0)`), and the
 * kernel's save outbox counts on it: a save is sent no earlier than the
 * macrotask after the commit whose listener scheduled the write, and timers
 * with the same delay run in the order they were set, so the recorded
 * choice is stored before its request leaves. A longer delay would break
 * that ordering.
 */
export interface WriteScheduler {
	/** Request a write in a later macrotask. Idempotent within a tick. */
	schedule: () => void;
	/**
	 * Run the write synchronously now. No-op when nothing is scheduled.
	 * Useful for tests and for flushing on dispose.
	 */
	flush: () => void;
	/** Drop a queued write without running it. */
	cancel: () => void;
}

export const createWriteScheduler = function createWriteScheduler(
	write: () => 'retry' | undefined
): WriteScheduler {
	let pending = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const cancel = function cancel(): void {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
		pending = false;
	};

	const run = function run(): void {
		timer = null;
		pending = false;
		if (write() === 'retry') {
			pending = true;
		}
	};

	return {
		cancel,
		flush() {
			if (!pending) {
				return;
			}
			cancel();
			run();
		},
		schedule() {
			pending = true;
			if (timer !== null) {
				return;
			}
			timer = setTimeout(run, 0);
		},
	};
};
