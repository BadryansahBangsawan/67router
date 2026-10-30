// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsShell, {
  getSettingsNavItems,
  isSettingsNavItemActive,
} from "@/app/(dashboard)/dashboard/settings/components/SettingsShell";
import SettingsTemplate from "@/app/(dashboard)/dashboard/settings/template";
import { KpiCell, KpiStrip } from "@/shared/components/analytics/KpiStrip";
import { SIDEBAR_SECTIONS } from "@/shared/constants/sidebarVisibility";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard/settings/routing" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => `t:${key}`, { has: () => true }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const roots: Array<{ root: Root; el: HTMLDivElement }> = [];

function render(node: React.ReactNode): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(node));
  roots.push({ root, el });
  return el;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  navigation.pathname = "/dashboard/settings/routing";
});

afterEach(() => {
  for (const { root, el } of roots.splice(0)) {
    act(() => root.unmount());
    el.remove();
  }
});

describe("67router settings layout", () => {
  it("lists exactly the sidebar's settings pages, in sidebar order", () => {
    const system = SIDEBAR_SECTIONS.find((section) => section.id === "system");
    const group = system?.children.find(
      (child) => "type" in child && child.type === "group" && child.id === "configuration"
    );
    const expected = group && "items" in group ? group.items.map((item) => item.href) : [];

    expect(expected.length).toBeGreaterThan(5);
    expect(getSettingsNavItems().map((item) => item.href)).toEqual(expected);
  });

  it("matches the active page by path prefix only", () => {
    expect(isSettingsNavItemActive("/dashboard/settings/ai", "/dashboard/settings/ai")).toBe(true);
    expect(isSettingsNavItemActive("/dashboard/settings/ai/x", "/dashboard/settings/ai")).toBe(
      true
    );
    // "/dashboard/settings/ai" must not light up on a sibling that shares the prefix.
    expect(isSettingsNavItemActive("/dashboard/settings/aim", "/dashboard/settings/ai")).toBe(
      false
    );
    expect(isSettingsNavItemActive(null, "/dashboard/settings/ai")).toBe(false);
  });

  it("renders a sub-nav with one current link and a capped content column", () => {
    const el = render(
      <SettingsShell>
        <p data-testid="page">page body</p>
      </SettingsShell>
    );

    const nav = el.querySelector('[data-testid="settings-subnav"]');
    expect(nav).not.toBeNull();
    const links = Array.from(nav!.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      getSettingsNavItems().map((item) => item.href)
    );
    const current = links.filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.getAttribute("href"))).toEqual(["/dashboard/settings/routing"]);

    const page = el.querySelector('[data-testid="page"]');
    expect(page?.parentElement?.className).toContain("max-w-[760px]");
  });

  it("the settings template wraps every settings page in the shell", () => {
    const el = render(
      <SettingsTemplate>
        <p data-testid="page">page body</p>
      </SettingsTemplate>
    );
    expect(el.querySelector('[data-testid="settings-subnav"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="page"]')?.textContent).toBe("page body");
  });
});

describe("67router KPI row", () => {
  it("renders one bordered card with a cell per KPI", () => {
    const el = render(
      <KpiStrip columns={3} data-testid="kpis">
        <KpiCell label="Spend" value="$412.86" footnote="this month" />
        <KpiCell label="Tokens" value="214.6M" />
        <KpiCell label="Saved" value="$61.20" valueClassName="text-success" />
      </KpiStrip>
    );

    const strip = el.querySelector('[data-testid="kpis"]');
    expect(strip?.className).toContain("border");
    const grid = strip?.firstElementChild;
    expect(grid?.children.length).toBe(3);
    expect(grid?.textContent).toContain("$412.86");
    expect(grid?.textContent).toContain("this month");
    expect(grid?.children[2].innerHTML).toContain("text-success");
  });
});
