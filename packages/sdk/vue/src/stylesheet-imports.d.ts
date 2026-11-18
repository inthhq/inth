// Vue components import each component stylesheet next to its `@inth/sdk/ui`
// class map. Kept in a script file (no imports) so the wildcard declaration
// is global rather than a module augmentation.
declare module '@inth/sdk/ui/styles/components/*.css';
