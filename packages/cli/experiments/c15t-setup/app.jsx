import {
  ConsentBanner,
  ConsentDialog,
  ConsentManagerProvider,
  useConsentManager,
} from "@c15t/react";
import { ConsentDialogLink } from "@c15t/react/components/consent-dialog-link";
import { createRoot } from "react-dom/client";

import "./style.css";

const ConsentState = () => {
  const { consents } = useConsentManager();
  return <pre id="consents">{JSON.stringify(consents)}</pre>;
};

// A local test script makes network gating observable without contacting an analytics vendor.
const scripts = [
  { category: "measurement", id: "test-measurement", src: "/measurement.js" },
];

createRoot(document.querySelector("#root")).render(
  <ConsentManagerProvider
    options={{
      backendURL: process.env.C15T_BACKEND_URL,
      consentCategories: ["necessary", "measurement", "marketing"],
      mode: "hosted",
      // This fixture always exercises an opt-in region with English controls.
      overrides: { country: "DE", language: "en" },
      scripts,
    }}
  >
    <h1>c15t setup check</h1>
    <ConsentState />
    <ConsentDialogLink>Privacy settings</ConsentDialogLink>
    <ConsentBanner />
    <ConsentDialog />
  </ConsentManagerProvider>
);
