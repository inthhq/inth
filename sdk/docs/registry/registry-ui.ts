import { Registry } from "@/registry/schema";

export const ui: Registry = [
  {
    name: "cookie-consent-modal",
    type: "registry:ui",
    files: ["better-events/cookie-consent-modal.tsx"],
  },
  {
    name: "cookie-popup",
    type: "registry:ui",
    files: ["better-events/cookie-popup.tsx"],
  },
];
