import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CookiePopup } from "./cookie-popup";

describe("CookiePopup", () => {
  it("should render the popup with the correct content and buttons", () => {
    const buttons = {
      customizeConsent: <button type="button">Customise Consent</button>,
      optIn: <button type="button">Accept</button>,
      optOut: <button type="button">Opt-Out</button>,
    };

    render(<CookiePopup buttons={buttons} />);

    expect(screen.getByText("Attention Needed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This site uses cookies to measure and improve your experience.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Customise Consent" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opt-Out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("should lock the body scroll when the popup is rendered", () => {
    const originalOverflow = document.body.style.overflow;
    render(<CookiePopup />);
    expect(document.body.style.overflow).toBe("hidden");
    // Cleanup
    document.body.style.overflow = originalOverflow;
  });
});
