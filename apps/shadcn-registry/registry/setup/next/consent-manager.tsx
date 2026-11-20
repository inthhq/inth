import type { ReactNode } from "react"
import { InthProvider } from "@inth/nextjs"
import { resolveConsent } from "@inth/nextjs/server"

import { ConsentBanner } from "@/components/inth/consent-banner"
import { ConsentDialog } from "@/components/inth/consent-dialog"
import { ConsentDialogTrigger } from "@/components/inth/consent-dialog-trigger"

export function ConsentManager({ children }: { children: ReactNode }) {
  return (
    // Not awaited: the page renders while consent resolves.
    <InthProvider state={resolveConsent()}>
      {children}
      <ConsentBanner />
      <ConsentDialog />
      <ConsentDialogTrigger showWhen="after-consent" />
    </InthProvider>
  )
}
