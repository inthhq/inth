# Preference center in account settings

Northwind Coffee keeps its consent settings at `/account/privacy`, next to
Profile, Orders and Subscriptions, instead of in a modal. Each category is a
card with its description, the vendors it covers and a switch. The page shows
whether each category is on right now and when the visitor last saved. Save
and "Reject all optional" record the choice.

First-time visitors still get the stock banner in Northwind's colors. Its
Customize button opens the options in place, and the footer's "Privacy
settings" link opens the privacy page. PostHog waits for Analytics and Meta
Pixel waits for Marketing.

## Files to read

- `components/privacy-preferences.tsx` is the page. `ConsentWidget.Root`
  supplies the draft, `useConsentDraft()` drives the switches,
  `useExplicitChoice()` gives the save time, and `ConsentWidget.SaveButton`
  and `ConsentWidget.RejectButton` record the choice.
- `components/cookie-banner.tsx` is the stock banner. It steps aside on the
  privacy page, which asks the same question in full.
- `components/consent.tsx` sets up `InthProvider` with the scripts, vendors,
  category copy and theme from `lib/`.

## Run it

From the repository root:

```sh
pnpm install
pnpm sdk:build
bun run --cwd examples/showcase-preference-center dev
```

Open http://localhost:3111. Set `NEXT_PUBLIC_INTH_PROJECT_URL` in `.env.local` to your Inth project URL,
such as `https://your-project.inth.app`. Inth reads the project's consent
manifest and sends each choice there. Use your own PostHog and Meta Pixel IDs in
`lib/vendors.ts`.

## Docs

- [ConsentWidget](https://inth.com/docs/frameworks/next/components/consent-widget)
- [Vendor consent](https://inth.com/docs/frameworks/next/vendor-consent)
