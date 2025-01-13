import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CookieConsentModal } from "./cookie-consent-modal";
import type { allConsentNames } from "@/types/consent";

describe("CookieConsentModal", () => {
  const mockConsent = vi.fn();
  const mockUseAnalytics = () => ({
    consent: mockConsent,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // opens modal and closes it without setting consent
  it("popup -> open modal and close modal.", async () => {
    const requiredGdprPurposes: allConsentNames[] = [
      "necessary",
      "marketing",
      "experience",
    ];
    render(
      <CookieConsentModal
        requiredGdprPurposes={requiredGdprPurposes}
        useAnalytics={mockUseAnalytics}
      />,
    );

    // Open the Cookies Modal
    await userEvent.click(screen.getByRole("button", { name: "Details" }));

    // Expect the modal to be open
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Expect the consent function not to have been called yet
    expect(mockConsent).not.toHaveBeenCalled();

    // Close the modal
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    // Expect the modal to be closed
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    expect(mockConsent).not.toHaveBeenCalled();
  });

  it("popup -> events fire correctly on opt-out", async () => {
    const requiredGdprPurposes: allConsentNames[] = ["necessary", "marketing"];
    render(
      <CookieConsentModal
        requiredGdprPurposes={requiredGdprPurposes}
        useAnalytics={mockUseAnalytics}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Opt-out" }));

    expect(mockConsent).toHaveBeenCalledWith({
      type: "minimum",
    });
  });

  it("popup -> opens modal and customizes consent ", async () => {
    const requiredGdprPurposes: allConsentNames[] = [
      "necessary",
      "marketing",
      "experience",
    ];
    render(
      <CookieConsentModal
        requiredGdprPurposes={requiredGdprPurposes}
        useAnalytics={mockUseAnalytics}
      />,
    );

    // Open the Cookies Modal
    await userEvent.click(screen.getByRole("button", { name: "Details" }));

    // Expect the modal to be open
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Expect the consent function not to have been called yet
    expect(mockConsent).not.toHaveBeenCalled();

    // Save Current Settings
    await userEvent.click(
      screen.getByRole("button", { name: "Save Current Settings" }),
    );

    // Expect the modal to be closed
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Expect the consent function to have been called with the default values
    expect(mockConsent).toHaveBeenCalledWith({
      gdprPurposes: {
        experience: false,
        marketing: false,
        necessary: true,
      },
      type: "custom",
    });
  });

  it("popup -> events fire correctly on Accept", async () => {
    const requiredGdprPurposes: allConsentNames[] = ["necessary", "marketing"];
    render(
      <CookieConsentModal
        requiredGdprPurposes={requiredGdprPurposes}
        useAnalytics={mockUseAnalytics}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(mockConsent).toHaveBeenCalledWith({
      type: "all",
    });
  });
});
