"use client"

import * as React from "react"
import { useModel } from "@inth/react"
import {
  StreamedConsentSurface,
  useBannerCopy,
  useConsentLabels,
  useConsentTextDirection,
  useFocusTrap,
  useHeadlessConsentUI,
  useIABPolicyGuard,
  useScrollLock,
} from "@inth/react/headless"
import type { HeadlessConsentBannerState } from "@inth/react/headless"

import { ConsentBranding } from "@/components/inth/consent-branding"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Where the banner sits, from the resolved container's desktop placement.
 * `start` and `end` follow the text direction, as in the stock banner.
 */
function placementClassName({ container }: HeadlessConsentBannerState) {
  const placement = container?.desktop.placement ?? "card-start"
  switch (placement) {
    case "card-center":
      return "top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2"
    case "banner-top":
    case "drawer-top":
      return "inset-x-0 top-0"
    case "banner-bottom":
    case "drawer-bottom":
      return "inset-x-0 bottom-0"
    case "drawer-start":
      return "inset-y-0 start-0 w-full sm:max-w-md"
    case "drawer-end":
      return "inset-y-0 end-0 w-full sm:max-w-md"
    case "card-end":
      return "bottom-4 start-4 end-4 sm:w-full sm:max-w-md sm:start-auto"
    default:
      return "bottom-4 start-4 end-4 sm:w-full sm:max-w-md sm:end-auto"
  }
}

function ConsentBannerContent({ className }: { className?: string }) {
  // Under an IAB policy the TCF banner from <IABProvider> takes over. This
  // throws if the app never loaded it.
  useIABPolicyGuard()
  const model = useModel() ?? "opt-in"
  const { banner, openDialog, performAction } = useHeadlessConsentUI()
  const { title, description } = useBannerCopy()
  const labels = useConsentLabels()
  const dir = useConsentTextDirection()
  const ref = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()
  const descriptionId = React.useId()
  const visible =
    banner.isVisible && (model === "opt-in" || model === "opt-out")

  // A blocking banner, such as a consent wall, holds focus and stops the
  // page scrolling until the visitor chooses.
  useFocusTrap(visible && banner.blocking, ref)
  useScrollLock(visible && banner.blocking)

  if (!visible) return null

  // A column direction, or the strict and balanced profiles, stack the
  // actions at full width.
  const stacked = banner.direction === "column" || banner.shouldFillActions
  const placement = banner.container?.desktop.placement ?? "card-start"
  const bar = !placement.startsWith("card")
  const topBar = placement.endsWith("-top")

  return (
    <>
      {banner.blocking && <div className="fixed inset-0 z-50 bg-black/10" />}
      <div
        ref={ref}
        dir={dir}
        tabIndex={-1}
        role={banner.blocking ? "dialog" : "region"}
        aria-modal={banner.blocking || undefined}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(
          "fixed z-50 flex flex-col outline-none",
          placementClassName(banner),
          className
        )}
      >
        {/* The tag sits on the card's edge that faces the page. */}
        <ConsentBranding
          className={cn(
            "relative z-10 self-end",
            bar ? "me-6" : "me-3",
            topBar
              ? "order-last -mt-px rounded-t-none border-t-0"
              : "-mb-px rounded-b-none border-b-0"
          )}
        />
        <Card
          size="default"
          className={cn("shadow-lg", bar && "rounded-none")}
        >
          <CardHeader>
            <CardTitle id={titleId}>{title}</CardTitle>
            <CardDescription id={descriptionId}>{description}</CardDescription>
          </CardHeader>
          <CardFooter
            className={cn(
              "flex-col items-stretch gap-2",
              bar && "rounded-none",
              !stacked && "sm:flex-row sm:flex-wrap sm:justify-between"
            )}
          >
            {banner.preferenceControls.map((control) => (
              <Button key={control} variant="link" onPress={openDialog}>
                {labels.preferenceControls[control]}
              </Button>
            ))}
            {banner.actionGroups.map((group) => (
              <div
                key={group.join("-")}
                className={cn(
                  "flex flex-col gap-2",
                  !stacked && "sm:flex-row sm:flex-wrap"
                )}
              >
                {group.map((action) => (
                  <Button
                    key={action}
                    variant={
                      banner.primaryActions.includes(action)
                        ? "default"
                        : "outline"
                    }
                    onPress={() => performAction(action)}
                  >
                    {labels.actions[action]}
                  </Button>
                ))}
              </div>
            ))}
          </CardFooter>
        </Card>
      </div>
    </>
  )
}

export function ConsentBanner({ className }: { className?: string }) {
  // On a streamed server render, the banner is sent with the consent state
  // instead of waiting for hydration.
  return (
    <StreamedConsentSurface>
      <ConsentBannerContent className={className} />
    </StreamedConsentSurface>
  )
}
