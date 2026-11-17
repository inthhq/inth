"use client"

import type { ReactNode } from "react"
import type { ConsentProviderOptions, WithProjectUrl } from "c15t/react"
import { ConsentProvider } from "c15t/react"

import { ConsentBanner } from "@/components/c15t/consent-banner"
import { ConsentDialog } from "@/components/c15t/consent-dialog"
import { ConsentDialogTrigger } from "@/components/c15t/consent-dialog-trigger"

const options: WithProjectUrl<ConsentProviderOptions> = {
  // Your Inth project URL. The provider asks it for each visitor's policy.
  projectUrl: import.meta.env.VITE_C15T_BACKEND_URL as string,
}

export function ConsentManager({ children }: { children: ReactNode }) {
  return (
    <ConsentProvider options={options}>
      {children}
      <ConsentBanner />
      <ConsentDialog />
      <ConsentDialogTrigger showWhen="after-prompt" />
    </ConsentProvider>
  )
}
