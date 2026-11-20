"use client"

import type { ReactNode } from "react"
import type { InthProviderOptions, WithProjectUrl } from "@inth/react"
import { InthProvider } from "@inth/react"

import { ConsentBanner } from "@/components/inth/consent-banner"
import { ConsentDialog } from "@/components/inth/consent-dialog"
import { ConsentDialogTrigger } from "@/components/inth/consent-dialog-trigger"

const options: WithProjectUrl<InthProviderOptions> = {
  // Your Inth project URL. The provider asks it for each visitor's policy.
  projectUrl: import.meta.env.VITE_INTH_PROJECT_URL as string,
}

export function ConsentManager({ children }: { children: ReactNode }) {
  return (
    <InthProvider options={options}>
      {children}
      <ConsentBanner />
      <ConsentDialog />
      <ConsentDialogTrigger showWhen="after-consent" />
    </InthProvider>
  )
}
