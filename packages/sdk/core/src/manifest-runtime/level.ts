/**
 * The highest manifest runtime level this SDK runs.
 *
 * Level 1 is the manifest shape the first remote scripts used. A manifest
 * that needs a later level's steps or fields says so in `requires`; one
 * without `requires` needs level 1. The SDK sends this level as
 * `manifestLevel` when it asks for a script registry, and drops any entry
 * above it from a list no server filtered for it.
 */
export const MANIFEST_RUNTIME_LEVEL = 1;
