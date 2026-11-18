/**
 * The side of `@inth/react`'s `ConsentProvider` that loads on demand: the
 * real provider, which builds and starts the runtime, and the host that
 * hands its kernel to a client root's stand-in. One `import()`, so the
 * bundler makes one chunk group.
 *
 * @packageDocumentation
 * @internal
 */

// oxlint-disable-next-line oxc/no-barrel-file -- The engine chunk's interface.
export { ConsentProvider } from '../provider';
export { DeferredEngineHost } from './engine-host';
