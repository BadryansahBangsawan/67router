import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SettingsRow,
  SettingsSection,
} from "@/app/(dashboard)/dashboard/settings/components/SettingsSection";

afterEach(() => cleanup());

describe("SettingsSection", () => {
  it("renders an h2 title + description above one bordered card that holds the children", () => {
    render(
      <SettingsSection
        title="Security"
        description="Who can reach the dashboard"
        action={<button type="button">Reset</button>}
        className="flex flex-col gap-4"
      >
        <p>body</p>
      </SettingsSection>
    );

    const heading = screen.getByRole("heading", { level: 2, name: "Security" });
    const region = screen.getByRole("region", { name: "Security" });
    expect(region.contains(heading)).toBe(true);
    expect(screen.getByText("Who can reach the dashboard")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();

    const card = region.querySelector('[data-slot="settings-section-card"]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.contains(screen.getByText("body"))).toBe(true);
    // The caller's className lands on the card body (legacy <Card className> semantics).
    expect(card.className).toContain("flex-col");
    expect(card.className).toContain("border");
    // The heading sits outside the card.
    expect(card.contains(heading)).toBe(false);
  });

  it("without a title it is just the card (no heading, no labelled region)", () => {
    const { container } = render(
      <SettingsSection>
        <p>only body</p>
      </SettingsSection>
    );
    expect(screen.queryByRole("heading")).toBeNull();
    const section = container.querySelector('[data-slot="settings-section"]') as HTMLElement;
    expect(section.getAttribute("aria-labelledby")).toBeNull();
    expect(section.querySelector('[data-slot="settings-section-card"]')).toBeTruthy();
  });

  it("omits the card when there are no children (header-only section)", () => {
    const { container } = render(<SettingsSection title="Semantic cache" />);
    expect(container.querySelector('[data-slot="settings-section-card"]')).toBeNull();
  });
});

describe("SettingsRow", () => {
  it("renders label, description and a working control", () => {
    const onClick = vi.fn();
    render(
      <SettingsSection>
        <SettingsRow
          label="Debug mode"
          description="Verbose request logging"
          control={
            <button type="button" onClick={onClick}>
              Toggle
            </button>
          }
        >
          <p>extra</p>
        </SettingsRow>
      </SettingsSection>
    );
    expect(screen.getByText("Debug mode")).toBeTruthy();
    expect(screen.getByText("Verbose request logging")).toBeTruthy();
    expect(screen.getByText("extra")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
