/**
 * Records a banner choice a visitor tapped while the consent prompt's
 * chunk was still failing to load.
 *
 * A tap on the banner after a failed download retries the load. When the
 * retry mounts the prompt, the tapped Accept or Reject is applied here.
 *
 * The retry cannot always succeed. Chromium before 156 and Firefox before
 * 155 remember a failed module fetch for the life of the document: every
 * later `import()` of that URL, and of every chunk that statically imports
 * it, fails again without a request. `importChunk` loads the failed chunk
 * again from a URL of its own (`?inth-retry=1`), which gets the prompt
 * chunk past this; nothing else imports it. It does not get the engine
 * chunk past it: the prompt chunk imports the engine by its plain URL. In
 * every browser, a chunk whose own dependency failed stays failed. The
 * page does not reload itself to recover, because a reload would throw
 * away anything the visitor typed into the host page. The banner shows
 * again, no choice is recorded, and consent gates stay closed. The next
 * page load fetches the chunk again.
 *
 * @internal
 */

/** A banner choice, as the shell's `choose` takes it. @internal */
export type RecoveredChoice = 'all' | 'none' | Partial<Record<string, boolean>>;

/**
 * Record a choice a visitor tapped while the chunk that would have
 * recorded it failed to load.
 *
 * @internal
 */
export const applyRecoveredChoice = async function applyRecoveredChoice(
	client: {
		acceptAll: () => Promise<void>;
		rejectAll: () => Promise<void>;
		save: (consents: Partial<Record<string, boolean>>) => Promise<void>;
	},
	choice: RecoveredChoice
): Promise<void> {
	try {
		if (choice === 'all') {
			await client.acceptAll();
		} else if (choice === 'none') {
			await client.rejectAll();
		} else {
			await client.save(choice);
		}
	} catch (error) {
		console.warn('@inth/astro: the consent choice was not stored.', error);
	}
};
