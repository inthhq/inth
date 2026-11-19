/** Native disclosure and touch-target adjustments for the IAB DOM adapter. */
export const adapterStyles = `
[data-testid="iab-consent-banner-root"], [data-testid="iab-consent-dialog-root"] { pointer-events: none; }
[data-testid="iab-consent-banner-card"], [data-testid="iab-consent-dialog-card"] { pointer-events: auto; }
[data-testid="iab-consent-banner-root"][data-variant="floating"][data-position^="top"] { align-items: flex-start; }
[data-testid="iab-consent-banner-root"][data-variant="floating"][data-position^="bottom"] { align-items: flex-end; }
[data-testid="iab-consent-banner-root"][data-variant="floating"][data-position$="left"] { justify-content: left; }
[data-testid="iab-consent-banner-root"][data-variant="floating"][data-position$="right"] { justify-content: right; }
[data-testid="iab-consent-banner-root"][data-variant="bar"] { --iab-consent-banner-max-width: 100%; align-items: flex-end; }
[data-testid="iab-consent-banner-root"][data-variant="bar"][data-position="top"] { align-items: flex-start; }
[data-testid="iab-consent-banner-card"] { max-height: calc(100dvh - 4rem); overflow-y: auto; }
[data-inth-iab-disclosure] > summary { box-sizing: border-box; min-height: 44px; cursor: pointer; list-style: none; justify-content: flex-start; align-items: center; }
[data-inth-iab-disclosure] > summary > :last-child { flex: 1; }
[data-inth-iab-disclosure] > summary::-webkit-details-marker { display: none; }
[data-inth-iab-chevron] { display: inline-block; color: var(--inth-text-muted); }
[data-inth-iab-disclosure][open] > summary [data-inth-iab-chevron] { transform: rotate(90deg); }
[data-testid^="iab-consent-"] button { min-height: 44px; touch-action: manipulation; }
[data-inth-iab-toggle] { width: 44px; height: 44px; padding: 12px 6px; }
[data-inth-iab-vendor-details] { display: block; padding: 0 0.75rem 0.75rem; font-size: 0.875rem; line-height: 1.5; }
[data-inth-iab-vendor-details] h3 { margin: 1rem 0 0.375rem; font-size: 0.875rem; font-weight: 600; }
[data-inth-iab-vendor-details] p { margin: 0.5rem 0; }
[data-inth-iab-vendor-details] ul { margin: 0.375rem 0; padding-inline-start: 1.25rem; }
[data-testid^="iab-consent-"] summary:focus-visible { outline: 2px solid var(--inth-primary); outline-offset: 2px; }
[data-testid="iab-consent-dialog-root"] input[type="search"] { font-size: 16px; }
`;
