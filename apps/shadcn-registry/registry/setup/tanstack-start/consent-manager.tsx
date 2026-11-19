import type { ReactNode } from "react"
import { createServerFn } from "@tanstack/react-start"
import { ConsentRoot } from "@inth/tanstack-start"
import {
  createConsentStateHandler,
  type ConsentState,
} from "@inth/tanstack-start/server"

import { ConsentBanner } from "@/components/inth/consent-banner"
import { ConsentDialog } from "@/components/inth/consent-dialog"
import { ConsentDialogTrigger } from "@/components/inth/consent-dialog-trigger"

// Call from the root route's loader. Start's compiler finds server code by
// this call site, which is why it lives in your project and not in Inth.
export const getConsentState = createServerFn({ method: "GET" }).handler(
  createConsentStateHandler()
)

export function ConsentManager({
  state,
  children,
}: {
  state: ConsentState | Promise<ConsentState>
  children: ReactNode
}) {
  return (
    <ConsentRoot state={state}>
      {children}
      <ConsentBanner />
      <ConsentDialog />
      <ConsentDialogTrigger showWhen="after-consent" />
    </ConsentRoot>
  )
}
