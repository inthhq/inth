---
packages:
  'swift:c15t-swift': minor
  'maven:c15t-android': minor
---

### Meet IAB TCF policy checks in the native consent UI

The native IAB first layer now uses the same copy as the web prompt, from
`@c15t/translations`. It says that partners store and/or access information
on the device and process personal data, gives examples of that data, states
that consent applies to this app only, and says where to withdraw consent. It
lists the purposes, stacks and special features that in-scope vendors
actually declare, using the same summary as the web, capped at five items.
The partner count includes Google Additional Consent providers.

The preferences screen lists only declared purposes and special features, and
shows the vendor count per purpose without opening Details. It explains
legitimate interest and shows illustrations for every purpose and feature type,
special-purpose retention, and how long choices are stored on the device.
Device storage durations round up, so short durations no longer show as 0 days.

A partner's page lists each Feature with its description and illustrations,
marked "No choice", followed by the standard Features explanation. When the
vendor list has no standard Features text, both screens show the translated
standard text instead of a blank line.

Every label on the native IAB preference, partner list and partner pages now
comes from `@c15t/translations`, so a translated vendor list shows one language
throughout.

Legitimate interest now starts as not objected to for a first-time user, as on
the web. Consent switches still start off. Saving without changes records no
objection; the user objects with each legitimate interest switch.

Decision buttons keep at least 5:1 text contrast. A host theme below that falls
back to the stock decision colours and logs a warning. On Android, Back no
longer dismisses the IAB first layer without a decision.

The TC String now writes the same day to Created and LastUpdated on every
save. A stored string from an earlier build with different days is discarded
on launch, and the user is asked again.
