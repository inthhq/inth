"use client"

import { useId, useRef } from "react"
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

import { cn } from "@/lib/utils"
import { ConsentBranding } from "@/components/inth/consent-branding"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

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
  const id = useId()
  const ref = useRef<HTMLElement>(null)
  const { banner, openDialog, performAction } = useHeadlessConsentUI()
  const { title, description } = useBannerCopy()
  const labels = useConsentLabels()
  const dir = useConsentTextDirection()
  const visible =
    banner.isVisible && (model === "opt-in" || model === "opt-out")

  // A blocking banner, such as a consent wall, holds focus and stops the
  // page scrolling until the visitor chooses.
  useFocusTrap(visible && banner.blocking, ref)
  useScrollLock(visible && banner.blocking)

  if (!visible) {
    return null
  }

  // A column direction, or the strict and balanced profiles, stack the
  // actions at full width.
  const stacked = banner.direction === "column" || banner.shouldFillActions
  const placement = banner.container?.desktop.placement ?? "card-start"
  const bar = !placement.startsWith("card")
  const topBar = placement.endsWith("-top")

  return (
    <>
      {banner.blocking && <div className="fixed inset-0 z-50 bg-black/10" />}
      <section
        ref={ref}
        dir={dir}
        tabIndex={-1}
        role={banner.blocking ? "dialog" : "region"}
        aria-modal={banner.blocking || undefined}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
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
            <CardTitle id={`${id}-title`}>{title}</CardTitle>
            <CardDescription id={`${id}-description`}>
              {description}
            </CardDescription>
          </CardHeader>
          <CardFooter
            className={cn(
              "gap-2",
              bar && "rounded-none",
              stacked ? "flex-col items-stretch" : "flex-wrap justify-between"
            )}
          >
            {banner.preferenceControls.map((right) => (
              <Button
                key={right}
                type="button"
                variant="link"
                onClick={openDialog}
              >
                {labels.preferenceControls[right]}
              </Button>
            ))}
            {banner.actionGroups.map((group) => (
              <div
                key={group.join("-")}
                className={cn("flex gap-2", stacked ? "flex-col" : "flex-wrap")}
              >
                {group.map((action) => (
                  <Button
                    key={action}
                    type="button"
                    variant={
                      banner.primaryActions.includes(action)
                        ? "default"
                        : "outline"
                    }
                    onClick={() => performAction(action)}
                  >
                    {labels.actions[action]}
                  </Button>
                ))}
              </div>
            ))}
          </CardFooter>
        </Card>
      </section>
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
