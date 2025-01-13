import {
  CookieConsentModal,
  CookieConsentTrigger,
  CookieConsentAccept,
  CookieConsentDecline,
} from "@/components/ui/cookie-consent-modal";
import type { allConsentNames, consentType } from "@/types/consent";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import type { Control } from "react-hook-form";

// Mock useAnalytics hook
const useAnalytics = () => ({
  consent: (params: {
    gdprPurposes?: Record<allConsentNames, boolean>;
    type: "all" | "minimum" | "custom";
  }) => {
    console.log("Consent updated:", params);
  },
});

// Custom consent item renderer
const CustomConsentItem = ({
  cookie,
  control,
}: {
  cookie: consentType;
  control: Control<Record<allConsentNames, boolean>>;
}) => (
  <FormField
    control={control}
    name={cookie.name}
    render={({ field }) => (
      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
        <div className="space-y-0.5">
          <FormLabel className="text-base">{cookie.name}</FormLabel>
          <FormDescription>{cookie.description}</FormDescription>
        </div>
        <FormControl>
          <Switch
            checked={field.value}
            onCheckedChange={field.onChange}
            disabled={cookie.disabled}
            aria-readonly={cookie.disabled}
          />
        </FormControl>
      </FormItem>
    )}
  />
);

export default function CookieConsentModalExample() {
  return (
    <CookieConsentModal
      requiredGdprPurposes={["necessary"]}
      useAnalytics={useAnalytics}
      renderConsentItem={CustomConsentItem}
      customSections={
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <h3 className="text-lg font-semibold">Privacy Policy</h3>
          <p className="mt-2">
            Please read our privacy policy for more information on how we handle
            your data.
          </p>
          <Button className="mt-2" variant="link">
            Read Privacy Policy
          </Button>
        </div>
      }
      dialogTitle={
        <span className="text-2xl font-bold text-primary">
          Customize Your Cookie Settings
        </span>
      }
      dialogDescription={
        <span className="text-muted-foreground">
          We use cookies and similar technologies to enhance your browsing
          experience, personalize content and ads, and analyze our traffic. By
          clicking "Accept All", you consent to our use of cookies. You can
          manage your preferences by clicking "Customize".
        </span>
      }
      lockScroll={false}
    >
      <h2 className="text-lg font-semibold">We value your privacy</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        We use cookies to enhance your browsing experience, serve personalized
        ads or content, and analyze our traffic.
      </p>
      <div className="mt-4 flex space-between space-x-2">
        <div>
          <CookieConsentDecline>Decline</CookieConsentDecline>
          <CookieConsentAccept>Accept All</CookieConsentAccept>
        </div>
        <CookieConsentTrigger asChild>
          <Button variant="outline">Customize</Button>
        </CookieConsentTrigger>
      </div>
    </CookieConsentModal>
  );
}
