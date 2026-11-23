/**
 * The Banner container's stylesheet, under a neutral name. The prompt
 * loads it with `import()`, and Vite names the chunk after the module it
 * imports: named after the sheet, the chunk would be `banner-<hash>.js`,
 * which content blockers drop.
 *
 * @internal
 */
// oxlint-disable-next-line oxc/no-barrel-file -- One re-export, for the chunk's name.
export * from '@inth/sdk/ui/styles/sheets/banner';
