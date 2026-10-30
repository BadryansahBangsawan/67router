// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

const { default: OmniRouteLogo, OmniRouteLockup } =
  await import("@/shared/components/OmniRouteLogo");

afterEach(() => cleanup());

describe("brand wrappers → 67router mark / lockup", () => {
  it("OmniRouteLogo keeps the size/className API and renders the inline 67router mark", () => {
    const { container } = render(<OmniRouteLogo size={22} className="x" />);
    const svg = container.querySelector("svg")!;
    expect(svg.classList.contains("r67-logo-mark")).toBe(true);
    expect(svg.classList.contains("x")).toBe(true);
    expect(svg.getAttribute("width")).toBe("22");
    expect(svg.getAttribute("viewBox")).toBe("0 0 256 256");
    // A parent utility (e.g. `[&_svg]:size-4`) must not resize the mark: size travels inline too.
    expect(svg.style.width).toBe("22px");
    expect(svg.style.height).toBe("22px");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    // Stroked in currentColor so it follows the theme ink.
    expect(svg.querySelector("g")!.getAttribute("stroke")).toBe("currentColor");
    expect(svg.querySelector("path")!.getAttribute("d")).toBe("M55.5 133.5 L138 51 H214 L154 218");
    expect(container.querySelector("image, [href^='/brand/']")).toBeNull();
  });

  it("OmniRouteLockup renders the mark + 67router wordmark with one accessible name", () => {
    const { container } = render(<OmniRouteLockup />);
    expect(screen.getByRole("img", { name: "67router" })).not.toBeNull();
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  it("OmniRouteLockup honours white-label name/logo", () => {
    render(<OmniRouteLockup name="Acme Router" logoSrc="data:image/png;base64,AAAA" />);
    expect(screen.getByRole("img", { name: "Acme Router" })).not.toBeNull();
    expect(screen.getByText("Acme Router")).not.toBeNull();
  });

  it("OmniRouteLockup never yields an empty accessible name for an empty white-label name", () => {
    render(<OmniRouteLockup name="" logoSrc="data:image/png;base64,AAAA" />);
    expect(screen.getByRole("img", { name: "67router" })).not.toBeNull();
  });
});
