// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, unknown>) =>
    v ? `${k}:${JSON.stringify(v)}` : k,
}));

import {
  OrchestrationDrawer,
  buildTraceJson,
} from "@/app/(dashboard)/dashboard/orchestration/drawer/OrchestrationDrawer";

function render(el: React.ReactElement) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  const root = createRoot(c);
  act(() => root.render(el));
  // The drawer is the kit Sheet (KEA-7886), portalled to document.body: queries run against the
  // whole body (which also holds the render host), the host is still what gets removed.
  return {
    c: document.body,
    cleanup: () => {
      act(() => root.unmount());
      c.remove();
    },
  };
}
afterEach(() => {
  document.body.innerHTML = "";
});

describe("OrchestrationDrawer", () => {
  it("renders nothing for a null node", () => {
    const { c, cleanup } = render(
      <OrchestrationDrawer node={null} onClose={() => {}} onActionDone={() => {}} />
    );
    expect(c.textContent).toBe("");
    cleanup();
  });

  it("unwraps a2a detail from {task} (the real route shape, not {data}) so objective/timeline render", async () => {
    const a2aTask = {
      id: "1",
      skill: "smart-routing",
      state: "working",
      input: { skill: "smart-routing", messages: [{ role: "user", content: "route this please" }] },
      artifacts: [],
      events: [{ timestamp: "2026-08-30T10:00:00Z", state: "working", message: "processing now" }],
      metadata: {},
      createdAt: "x",
      updatedAt: "y",
      expiresAt: "z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ task: a2aTask }) }))
    );
    const node = { id: "a2a:1", kind: "work", source: "a2a", state: "running", label: "x" };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={() => {}} />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(c.textContent).toContain("route this please");
    expect(c.textContent).toContain("processing now");
    cleanup();
  });

  it("close button aria-label comes from i18n (drawerClose, not the literal 'close')", () => {
    const node = { id: "overflow:1", kind: "overflow", state: "running", label: "x", raw: {} };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={() => {}} />
    );
    expect(c.querySelector('[aria-label="drawerClose"]')).toBeTruthy();
    expect(c.querySelector('[aria-label="close"]')).toBeNull();
    cleanup();
  });

  it("copy trace button copies buildTraceJson output to the clipboard and shows the actionDone toast", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const node = {
      id: "overflow:1",
      kind: "overflow",
      state: "running",
      label: "x",
      raw: { a: 1 },
    };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={() => {}} />
    );
    const btn = c.querySelector('[aria-label="copyTrace"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    await act(async () => {
      btn.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe(buildTraceJson(node as never, node.raw));
    expect(c.textContent).toContain("actionDone");
    cleanup();
  });

  it("copy trace shows actionFailed:clipboard toast when the clipboard write rejects", async () => {
    const writeText = vi.fn(() => Promise.reject(new Error("denied")));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const node = { id: "overflow:1", kind: "overflow", state: "running", label: "x", raw: {} };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={() => {}} />
    );
    const btn = c.querySelector('[aria-label="copyTrace"]') as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(c.textContent).toContain("actionFailed");
    expect(c.textContent).toContain("clipboard");
    cleanup();
  });

  it("shows detailFailed for a fetch error and actionFailed for a subsequent action error", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      }
      return Promise.reject(new Error("network down"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const node = {
      id: "a2a:t1",
      kind: "work",
      source: "a2a",
      state: "running",
      label: "x",
    };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={() => {}} />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(c.textContent).toContain("detailFailed");
    expect(c.textContent).not.toContain("actionFailed");

    const btn = Array.from(c.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("actionCancel")
    ) as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await Promise.resolve();
    });
    expect(c.textContent).toContain("actionFailed");
    cleanup();
  });

  // Task B3.7 — a stale error banner must not survive an action that then worked.
  it("clears the error banner when a retried action succeeds", async () => {
    let failNext = true;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const ok = !failNext;
        failNext = false;
        return Promise.resolve({
          ok,
          status: ok ? 200 : 500,
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: {} }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const node = {
      id: "a2a:t1",
      kind: "work",
      source: "a2a",
      state: "running",
      label: "x",
    };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={() => {}} />
    );
    await act(async () => {
      await Promise.resolve();
    });
    const cancel = () =>
      Array.from(c.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("actionCancel")
      ) as HTMLButtonElement;

    await act(async () => {
      cancel().click();
      await Promise.resolve();
    });
    expect(c.textContent).toContain("actionFailed");

    await act(async () => {
      cancel().click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(c.textContent).not.toContain("actionFailed");
    cleanup();
  });

  it("disables cancel while an action promise is pending, and re-enables once it settles", async () => {
    let resolvePost: ((v: unknown) => void) | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise((resolve) => {
          resolvePost = resolve;
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            task: {
              id: "t1",
              skill: "smart-routing",
              state: "working",
              input: { skill: "smart-routing", messages: [] },
              artifacts: [],
              events: [],
              createdAt: "x",
              updatedAt: "y",
            },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const node = {
      id: "a2a:t1",
      kind: "work",
      source: "a2a",
      state: "running",
      label: "x",
    };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={() => {}} />
    );
    await act(async () => {
      await Promise.resolve();
    });
    const cancelBtn = Array.from(c.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("actionCancel")
    ) as HTMLButtonElement;
    expect(cancelBtn.disabled).toBe(false);

    await act(async () => {
      cancelBtn.click();
      await Promise.resolve();
    });
    expect(cancelBtn.disabled).toBe(true);

    await act(async () => {
      resolvePost?.({ ok: true, json: () => Promise.resolve({ data: {} }) });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(cancelBtn.disabled).toBe(false);
    cleanup();
  });
});

describe("buildTraceJson", () => {
  it("normalizes a2a timeline from detail.events", () => {
    const node = { id: "a2a:1", kind: "work", source: "a2a", state: "running", label: "x" };
    const detail = { events: [{ state: "working", timestamp: "t" }] };
    const parsed = JSON.parse(buildTraceJson(node as never, detail));
    expect(parsed.timeline).toEqual(detail.events);
  });

  it("uses a null timeline and falls back to node.raw for conductor/overflow sources", () => {
    const node = {
      id: "conductor:task:1",
      kind: "work",
      source: "conductor",
      state: "running",
      label: "x",
      raw: { foo: "bar" },
    };
    const parsed = JSON.parse(buildTraceJson(node as never, null));
    expect(parsed.timeline).toBeNull();
    expect(parsed.raw).toEqual({ foo: "bar" });
  });
});
