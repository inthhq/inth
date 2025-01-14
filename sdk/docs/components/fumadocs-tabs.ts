"use client"

import * as React from "react"
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import { Button } from "@/components/ui/button"
import { RotateCcw } from 'lucide-react'

interface FumadocsTabsProps {
  items: string[]
  children: React.ReactNode
  groupId?: string
  persist?: boolean
  defaultIndex?: number
  updateAnchor?: boolean
}

export function FumadocsTabs({
  items,
  children,
  groupId,
  persist = false,
  defaultIndex,
  updateAnchor = false,
}: FumadocsTabsProps) {
  const [key, setKey] = React.useState(0)

  const tabProps = {
    items,
    ...(groupId && { groupId }),
    ...(persist && { persist }),
    ...(defaultIndex !== undefined && { defaultIndex }),
    ...(updateAnchor && { updateAnchor }),
  }

  return (
    <div className="relative my-4 flex flex-col space-y-2">
      <Tabs {...tabProps}>
        <div className="relative">
          <Button
            onClick={() => setKey((prev) => prev + 1)}
            className="absolute right-1.5 top-1.5 z-10 ml-4 flex items-center rounded-lg px-3 py-1"
            variant="ghost"
          >
            <RotateCcw aria-label="restart-btn" size={16} />
          </Button>
          <React.Suspense
            fallback={
              <div className="flex items-center text-sm text-muted-foreground">
                <span className="mr-2 size-4 animate-spin">⌛</span>
                Loading...
              </div>
            }
          >
            {React.Children.map(children, (child, index) => (
              <Tab key={`${key}-${index}`} value={items[index]}>
                {child}
              </Tab>
            ))}
          </React.Suspense>
        </div>
      </Tabs>
    </div>
  )
}
