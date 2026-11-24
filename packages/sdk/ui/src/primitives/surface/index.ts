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
export * from './attach-backdrop-guard';
export * from './attach-live-region';
export * from './after-motion';
export * from './attach-page-block';
export * from './attach-scroll-fades';
export * from './reveal-disclosure';
export * from './scroll-reveal.model';
export * from './attach-theme-switch-guard';
export * from './attach-top-layer-trap';
export * from './restore-focus';
