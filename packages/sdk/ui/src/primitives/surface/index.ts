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
export * from '../shared/backdrop-guard';
export * from '../shared/live-region';
export * from '../shared/motion';
export * from '../shared/page-block';
export * from '../shared/scroll-fades';
export * from '../shared/scroll-reveal';
export * from '../shared/theme-switch-guard';
export * from '../shared/top-layer-trap';
