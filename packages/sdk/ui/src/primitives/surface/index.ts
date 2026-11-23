/**
 * DOM controllers every consent renderer shares: the top-layer focus trap,
 * the page block, per-layer status regions, scroll fades and reveals, the
 * backdrop click guard, the theme switch guard and the reduced-motion
 * timer. Each is a plain `attachX(element, options)` that returns its own
 * dispose function, imports no framework, and works inside a shadow root.
 *
 * Shared by Inth's framework packages; not part of the documented API.
 *
 * @packageDocumentation
 * @internal
 */

// oxlint-disable-next-line oxc/no-barrel-file -- The subpath's public interface; each module stays tree-shakeable.
export * from '../shared/attach-backdrop-guard';
export * from '../shared/attach-live-region';
export * from '../shared/after-motion';
export * from '../shared/attach-page-block';
export * from '../shared/attach-scroll-fades';
export * from '../shared/reveal-disclosure';
export * from '../shared/attach-theme-switch-guard';
export * from '../shared/attach-top-layer-trap';
