import type { ConsentKernel } from '../consent-kernel.model';
import { getSurfaceSession } from './session';
import type { SurfaceCopyFinish, SurfaceCopyOptions } from './session';

/**
 * Copy the receipt reference with a token per attempt (CLIP-01, CLIP-02).
 * Resolves `copied` only after the write resolved, and `failed` when it
 * rejected or no clipboard exists. A result for an older attempt, or one
 * that lands after the surface changed, changes nothing.
 *
 * @param write - Writes the text; defaults to `navigator.clipboard.writeText`.
 * @param options - Pass `panelVisible: true` from an all-in-one layout,
 * whose panel shows without the banner being expanded.
 * @returns What the renderer should do: see {@link SurfaceCopyFinish}.
 */
export const copySurfaceReference = async function copySurfaceReference(
	kernel: ConsentKernel,
	text: string,
	write?: (text: string) => Promise<void>,
	options: SurfaceCopyOptions = {}
): Promise<SurfaceCopyFinish> {
	const session = getSurfaceSession(kernel);
	const attempt = session.beginCopy();
	const writer =
		write ??
		(typeof navigator !== 'undefined' &&
		typeof navigator.clipboard?.writeText === 'function'
			? (value: string) => navigator.clipboard.writeText(value)
			: undefined);
	let ok = false;
	if (writer) {
		try {
			await writer(text);
			ok = true;
		} catch {
			ok = false;
		}
	}
	return session.finishCopy(attempt, ok, options);
};
