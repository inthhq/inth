import { Registry } from "@/registry/schema";

export const examples: Registry = [
  {
    name: "cookie-consent-modal-demo",
    type: "registry:example",
    registryDependencies: ["cookie-consent-modal", "cookie-popup"],
    files: ["example/cookie-consent-modal-demo.tsx"],
  },
];
