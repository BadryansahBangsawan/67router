// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, unknown>) =>
    v ? `${k}:${JSON.stringify(v)}` : k,
}));

import { OrchestrationDrawer } from "@/app/(dashboard)/dashboard/orchestration/drawer/OrchestrationDrawer";
import {
  newNodeIdFrom,
  repeatReqFor,
} from "@/app/(dashboard)/dashboard/orchestration/drawer/useDrawerDetail";

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

describe("OrchestrationDrawer memory section", () => {
  it("renders the memory-used section (type/key/snippet) when an a2a task carries metadata.memoryHits", async () => {
    const a2aTask = {
      id: "1",
      skill: "smart-routing",
      state: "working",
      input: { skill: "smart-routing", messages: [{ role: "user", content: "route this please" }] },
      artifacts: [],
      events: [],
      metadata: {
        memoryHits: [
          { id: "m1", key: "user-pref-model", type: "preference", snippet: "prefers claude" },
        ],
      },
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
    expect(c.textContent).toContain("drawerMemory");
    expect(c.textContent).toContain("preference");
    expect(c.textContent).toContain("user-pref-model");
    expect(c.textContent).toContain("prefers claude");
    cleanup();
  });

  it("omits the memory-used section when an a2a task has no memoryHits", async () => {
    const a2aTask = {
      id: "1",
      skill: "smart-routing",
      state: "working",
      input: { skill: "smart-routing", messages: [{ role: "user", content: "route this please" }] },
      artifacts: [],
      events: [],
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
    expect(c.textContent).not.toContain("drawerMemory");
    cleanup();
  });

  it("renders nothing and does not throw when metadata.memoryHits is a malformed, non-array shape (a string, not an array of hits)", async () => {
    const a2aTask = {
      id: "1",
      skill: "smart-routing",
      state: "working",
      input: { skill: "smart-routing", messages: [{ role: "user", content: "route this please" }] },
      artifacts: [],
      events: [],
      metadata: { memoryHits: "boom" },
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
    await expect(
      act(async () => {
        await Promise.resolve();
      })
    ).resolves.not.toThrow();
    expect(c.textContent).not.toContain("drawerMemory");
    cleanup();
  });

  it("filters out malformed entries in metadata.memoryHits (an array of junk) without throwing", async () => {
    const a2aTask = {
      id: "1",
      skill: "smart-routing",
      state: "working",
      input: { skill: "smart-routing", messages: [{ role: "user", content: "route this please" }] },
      artifacts: [],
      events: [],
      // `{ id: "x", key: {...} }` is the dangerous shape: a VALID string id next to an
      // object field that the section renders as a React child — a guard that only checks
      // `id` lets it through and React throws "Objects are not valid as a React child",
      // taking the whole drawer down. Every one of the four rendered fields must be a string.
      metadata: {
        memoryHits: [
          { notId: "x" },
          "nope",
          123,
          null,
          { id: "x", key: { a: 1 }, type: "factual", snippet: "s" },
          { id: "y", key: "k", type: ["nope"], snippet: "s" },
          { id: "z", key: "k", type: "factual", snippet: { toString: "boom" } },
          { id: "w", key: "k", type: "factual" },
        ],
      },
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
    await expect(
      act(async () => {
        await Promise.resolve();
      })
    ).resolves.not.toThrow();
    expect(c.textContent).not.toContain("drawerMemory");
    cleanup();
  });

  it("never shows the memory-used section for non-a2a sources, even with attacker-shaped raw data", async () => {
    const detail = {
      data: {
        id: "t1",
        providerId: "devin",
        status: "succeeded",
        prompt: "x",
        source: { repoName: "r", repoUrl: "https://x" },
        options: {},
        activities: [],
        metadata: {
          memoryHits: [{ id: "m1", key: "k", type: "t", snippet: "s" }],
        },
        createdAt: "x",
        updatedAt: "y",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(detail) }))
    );
    const node = {
      id: "conductor:task:t1",
      kind: "work",
      source: "conductor",
      state: "succeeded",
      label: "x",
    };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={() => {}} />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(c.textContent).not.toContain("drawerMemory");
    cleanup();
  });
});

describe("repeatReqFor", () => {
  it("builds the conductor repeat request against the D1 task-creation route", () => {
    const node = {
      id: "conductor:task:1",
      kind: "work",
      source: "conductor",
      state: "succeeded",
      label: "x",
    };
    const detail = {
      repo: "https://github.com/x/y",
      prompt: "fix the bug",
      base_ref: "main",
      mode: "auto",
    };
    const req = repeatReqFor(node as never, detail);
    expect(req?.url).toBe("/api/conductor/tasks");
    expect(JSON.parse(String(req?.init.body))).toEqual({
      repoUrl: "https://github.com/x/y",
      prompt: "fix the bug",
      baseRef: "main",
      mode: "auto",
    });
  });

  it("returns null for conductor when neither repo nor prompt is recoverable", () => {
    const node = {
      id: "conductor:task:1",
      kind: "work",
      source: "conductor",
      state: "succeeded",
      label: "x",
    };
    expect(repeatReqFor(node as never, { mode: "auto" })).toBeNull();
  });

  it("returns null for conductor when prompt is the only missing field (a hub task with repo but no spec.prompt must not POST prompt:null — HTTP 400)", () => {
    const node = {
      id: "conductor:task:1",
      kind: "work",
      source: "conductor",
      state: "succeeded",
      label: "x",
    };
    const detail = { repo: "https://github.com/x/y", prompt: null, base_ref: "main", mode: "auto" };
    expect(repeatReqFor(node as never, detail)).toBeNull();
  });

  it("returns null for conductor when repo is the only missing field", () => {
    const node = {
      id: "conductor:task:1",
      kind: "work",
      source: "conductor",
      state: "succeeded",
      label: "x",
    };
    const detail = { repo: null, prompt: "fix the bug", base_ref: "main", mode: "auto" };
    expect(repeatReqFor(node as never, detail)).toBeNull();
  });

  it("returns null for a2a tasks: the /a2a JSON-RPC endpoint a repeat re-posted to was removed", () => {
    const node = { id: "a2a:1", kind: "work", source: "a2a", state: "succeeded", label: "x" };
    const detail = {
      input: { skill: "smart-routing", messages: [{ role: "user", content: "hi" }] },
    };
    expect(repeatReqFor(node as never, detail)).toBeNull();
  });

  it("returns null for a source with no known repeat contract (runner/overflow)", () => {
    const node = { id: "overflow:1", kind: "overflow", state: "succeeded", label: "x" };
    expect(repeatReqFor(node as never, {})).toBeNull();
  });
});

describe("OrchestrationDrawer repeat action (two-click confirm)", () => {
  // Repeat is offered for Conductor tasks only (the A2A JSON-RPC endpoint it used to re-post
  // to was removed); the conductor detail route answers with the bare task object.
  const CONDUCTOR_TASK = {
    id: "1",
    status: "running",
    mode: "solo",
    repo: "https://github.com/x/y",
    prompt: "fix the bug",
    base_ref: "main",
    cli: null,
    model: null,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function findRepeatButton(c: HTMLElement): HTMLButtonElement {
    return Array.from(c.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("actionRepeat") || b.textContent?.includes("repeatConfirm")
    ) as HTMLButtonElement;
  }

  it("disables the repeat button with the repeatUnavailable tooltip when the input cannot be recovered", async () => {
    const unrecoverable = { ...CONDUCTOR_TASK, prompt: null };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(unrecoverable) }))
    );
    const node = {
      id: "conductor:task:1",
      kind: "work",
      source: "conductor",
      state: "running",
      label: "x",
    };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={() => {}} />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const btn = findRepeatButton(c);
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toBe("repeatUnavailable");
    cleanup();
  });

  it("first click arms the confirm label without posting; second click within the window posts and reports success", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(CONDUCTOR_TASK) });
    });
    vi.stubGlobal("fetch", fetchMock);
    let done = false;
    const node = {
      id: "conductor:task:1",
      kind: "work",
      source: "conductor",
      state: "running",
      label: "x",
    };
    const { c, cleanup } = render(
      <OrchestrationDrawer
        node={node as never}
        onClose={() => {}}
        onActionDone={() => {
          done = true;
        }}
      />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      findRepeatButton(c).click();
    });
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "POST")).toBe(
      false
    );
    expect(findRepeatButton(c).textContent).toContain("repeatConfirm");

    await act(async () => {
      findRepeatButton(c).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "POST");
    expect(post).toBeTruthy();
    expect(post![0]).toBe("/api/conductor/tasks");
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      repoUrl: "https://github.com/x/y",
      prompt: "fix the bug",
      baseRef: "main",
      mode: "solo",
    });
    expect(done).toBe(true);
    expect(c.textContent).toContain("repeatDone");
    cleanup();
  });

  it("resets the confirm label back to actionRepeat after 3s with no second click", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(CONDUCTOR_TASK) }))
    );
    const node = {
      id: "conductor:task:1",
      kind: "work",
      source: "conductor",
      state: "running",
      label: "x",
    };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={() => {}} />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      findRepeatButton(c).click();
    });
    expect(findRepeatButton(c).textContent).toContain("repeatConfirm");

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(findRepeatButton(c).textContent).toContain("actionRepeat");
    cleanup();
  });

  it("a click after the 3s window expired re-arms the confirm instead of posting (it is a fresh first click, not a stale second click)", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(CONDUCTOR_TASK) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const node = {
      id: "conductor:task:1",
      kind: "work",
      source: "conductor",
      state: "running",
      label: "x",
    };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={() => {}} />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      findRepeatButton(c).click();
    });
    expect(findRepeatButton(c).textContent).toContain("repeatConfirm");

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(findRepeatButton(c).textContent).toContain("actionRepeat");

    // The window has expired — this click must be treated as a fresh first click
    // (arm + wait), never as the stale second click that would fire the POST.
    await act(async () => {
      findRepeatButton(c).click();
    });
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "POST")).toBe(
      false
    );
    expect(findRepeatButton(c).textContent).toContain("repeatConfirm");
    cleanup();
  });

  it("clears the pending 3s confirm timer on unmount so it can never fire after teardown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(CONDUCTOR_TASK) }))
    );
    const node = {
      id: "conductor:task:1",
      kind: "work",
      source: "conductor",
      state: "running",
      label: "x",
    };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={() => {}} />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      findRepeatButton(c).click();
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    cleanup();
    // The kit Sheet (Radix FocusScope) schedules its focus-restore with a 0 ms timeout on
    // unmount; flush only those (1 ms is far below the 3 s confirm window) so the count below
    // still proves the confirm timer itself was cleared.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows actionFailed when the repeat POST fails, without touching onActionDone", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(CONDUCTOR_TASK) });
    });
    vi.stubGlobal("fetch", fetchMock);
    let done = false;
    const node = {
      id: "conductor:task:1",
      kind: "work",
      source: "conductor",
      state: "running",
      label: "x",
    };
    const { c, cleanup } = render(
      <OrchestrationDrawer
        node={node as never}
        onClose={() => {}}
        onActionDone={() => {
          done = true;
        }}
      />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      findRepeatButton(c).click();
    });
    await act(async () => {
      findRepeatButton(c).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(c.textContent).toContain("actionFailed");
    expect(done).toBe(false);
    cleanup();
  });
});

describe("repeatReqFor conductor requirements (cli/model)", () => {
  const node = {
    id: "conductor:task:1",
    kind: "work",
    source: "conductor",
    state: "succeeded",
    label: "x",
  };

  it("carries cli/model when the hub detail exposes them (a repeat must land on the same runner profile/model)", () => {
    const detail = {
      repo: "https://github.com/x/y",
      prompt: "fix the bug",
      base_ref: "main",
      mode: "auto",
      cli: "claude",
      model: "sonnet",
    };
    const req = repeatReqFor(node as never, detail);
    expect(JSON.parse(String(req?.init.body))).toEqual({
      repoUrl: "https://github.com/x/y",
      prompt: "fix the bug",
      baseRef: "main",
      mode: "auto",
      cli: "claude",
      model: "sonnet",
    });
  });

  it("omits cli/model entirely when the detail has them null (the route's Zod treats both as optional strings — `null` would 400)", () => {
    const detail = {
      repo: "https://github.com/x/y",
      prompt: "fix the bug",
      base_ref: "main",
      mode: "auto",
      cli: null,
      model: null,
    };
    const body = String(repeatReqFor(node as never, detail)?.init.body);
    expect(JSON.parse(body)).toEqual({
      repoUrl: "https://github.com/x/y",
      prompt: "fix the bug",
      baseRef: "main",
      mode: "auto",
    });
    expect(body).not.toContain("cli");
    expect(body).not.toContain("model");
  });

  it("carries only the field that is present (cli set, model null — they are independent)", () => {
    const detail = {
      repo: "https://github.com/x/y",
      prompt: "fix the bug",
      base_ref: null,
      mode: "solo",
      cli: "codex",
      model: null,
    };
    expect(JSON.parse(String(repeatReqFor(node as never, detail)?.init.body))).toEqual({
      repoUrl: "https://github.com/x/y",
      prompt: "fix the bug",
      mode: "solo",
      cli: "codex",
    });
  });
});

describe("newNodeIdFrom", () => {
  it("maps each source's creation response to the CANVAS node id (prefixed), never the raw id", () => {
    const cond = { id: "conductor:task:1", source: "conductor" };
    expect(newNodeIdFrom(cond as never, { task_id: "t2" })).toBe("conductor:task:t2");
  });

  it("returns null for a body that does not carry a usable id (never throws, never yields a bare prefix)", () => {
    const cond = { id: "conductor:task:1", source: "conductor" };
    expect(newNodeIdFrom(cond as never, null)).toBeNull();
    expect(newNodeIdFrom(cond as never, {})).toBeNull();
    expect(newNodeIdFrom(cond as never, { task_id: "" })).toBeNull();
    expect(newNodeIdFrom(cond as never, { task_id: 7 })).toBeNull();
    expect(newNodeIdFrom(cond as never, "nope")).toBeNull();
  });

  it("returns null for a node whose source has no repeat contract", () => {
    const overflow = { id: "overflow:1", kind: "overflow" };
    expect(newNodeIdFrom(overflow as never, { task_id: "t2" })).toBeNull();
  });
});

describe("OrchestrationDrawer repeat focuses the newly created task", () => {
  const CONDUCTOR_DETAIL = {
    id: "1",
    status: "succeeded",
    mode: "solo",
    repo: "https://github.com/x/y",
    runner: null,
    summary: null,
    branch: null,
    error: null,
    updated_at: null,
    prompt: "fix the bug",
    base_ref: "main",
    tests: null,
    council: null,
    created_at: null,
    cli: "claude",
    model: "sonnet",
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function findRepeatButton(c: HTMLElement): HTMLButtonElement {
    return Array.from(c.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("actionRepeat") || b.textContent?.includes("repeatConfirm")
    ) as HTMLButtonElement;
  }

  async function repeatOnce(onActionDone: (id?: string) => void) {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ task_id: "t_new" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(CONDUCTOR_DETAIL) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const node = {
      id: "conductor:task:1",
      kind: "work",
      source: "conductor",
      state: "running",
      label: "x",
    };
    const { c, cleanup } = render(
      <OrchestrationDrawer node={node as never} onClose={() => {}} onActionDone={onActionDone} />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      findRepeatButton(c).click();
    });
    await act(async () => {
      findRepeatButton(c).click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    return { c, cleanup, fetchMock };
  }

  it("hands the canvas id of the created task to onActionDone, so the page can focus it", async () => {
    const seen: Array<string | undefined> = [];
    const { c, cleanup, fetchMock } = await repeatOnce((id) => seen.push(id));
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "POST");
    expect(post![0]).toBe("/api/conductor/tasks");
    expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({
      cli: "claude",
      model: "sonnet",
    });
    expect(seen).toEqual(["conductor:task:t_new"]);
    expect(c.textContent).toContain("repeatDone");
    cleanup();
  });
});
