/**
 * `part.ts` for a build without level 3, such as `inth.manifests.js`. With
 * no part, the parser refuses level 3 steps, and the code that would hand
 * them to the part drops out of the bundle. `inth.manifests3.js` is the
 * same runtime with the part in.
 */
import type { LevelThreePart } from './part';

/** No level 3 part, ever. */
export const levelThree = (): LevelThreePart | undefined => undefined;

/**
 * @throws {Error} Always: this build cannot take the level 3 part.
 */
export const installLevelThree = function installLevelThree(
	_part: LevelThreePart
): never {
	throw new Error('This manifest runtime is built without level 3.');
};
