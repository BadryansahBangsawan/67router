import test from "node:test";
import assert from "node:assert/strict";

const sidebarVisibility = await import("../../src/shared/constants/sidebarVisibility.ts");

const {
  SIDEBAR_SECTIONS,
  HIDEABLE_SIDEBAR_SECTION_IDS,
  isSidebarSectionHideable,
  normalizeHiddenSidebarSections,
  isSidebarSectionHidden,
  toggleSidebarSectionVisibility,
} = sidebarVisibility as {
  SIDEBAR_SECTIONS: { id: string; children: readonly unknown[] }[];
  HIDEABLE_SIDEBAR_SECTION_IDS: readonly string[];
  isSidebarSectionHideable: (section: { id: string; children: readonly unknown[] }) => boolean;
  normalizeHiddenSidebarSections: (value: unknown) => string[];
  isSidebarSectionHidden: (sectionId: string, hiddenSections: readonly string[]) => boolean;
  toggleSidebarSectionVisibility: (
    hiddenSections: readonly string[],
    sectionId: string,
    show: boolean
  ) => string[];
};

// ─── HIDEABLE_SIDEBAR_SECTION_IDS ────────────────────────────────────────────

// Sidebar v2 (67router): System holds both protected items ("proxy", "settings-sidebar").
test("sections containing protected items are not hideable", () => {
  assert.equal(HIDEABLE_SIDEBAR_SECTION_IDS.includes("system"), false);
});

test("sections without protected items are hideable", () => {
  for (const id of ["routing", "optimize", "agents", "access", "observe"]) {
    assert.ok(HIDEABLE_SIDEBAR_SECTION_IDS.includes(id), `section ${id} must be hideable`);
  }
});

test("isSidebarSectionHideable agrees with HIDEABLE_SIDEBAR_SECTION_IDS", () => {
  for (const section of SIDEBAR_SECTIONS) {
    assert.equal(
      isSidebarSectionHideable(section),
      HIDEABLE_SIDEBAR_SECTION_IDS.includes(section.id)
    );
  }
});

// ─── normalizeHiddenSidebarSections ──────────────────────────────────────────

test("normalizeHiddenSidebarSections accepts valid hideable section ids", () => {
  const result = normalizeHiddenSidebarSections(["observe", "agents"]);
  assert.deepEqual(result.sort(), ["agents", "observe"]);
});

test("normalizeHiddenSidebarSections drops unknown and non-hideable ids", () => {
  const result = normalizeHiddenSidebarSections(["observe", "system", "bogus-section"]);
  assert.deepEqual(result, ["observe"]);
});

test("normalizeHiddenSidebarSections rejects non-arrays and non-strings", () => {
  assert.deepEqual(normalizeHiddenSidebarSections(null), []);
  assert.deepEqual(normalizeHiddenSidebarSections("observe"), []);
  assert.deepEqual(normalizeHiddenSidebarSections([42, "observe"]), ["observe"]);
});

test("normalizeHiddenSidebarSections deduplicates", () => {
  const result = normalizeHiddenSidebarSections(["observe", "observe", "agents"]);
  assert.deepEqual(result.sort(), ["agents", "observe"]);
});

// ─── isSidebarSectionHidden / toggleSidebarSectionVisibility ─────────────────

test("isSidebarSectionHidden reflects the hidden list", () => {
  assert.equal(isSidebarSectionHidden("observe", []), false);
  assert.equal(isSidebarSectionHidden("observe", ["observe"]), true);
});

test("toggleSidebarSectionVisibility hides a section without touching others", () => {
  const next = toggleSidebarSectionVisibility(["agents"], "observe", false);
  assert.deepEqual(next.sort(), ["agents", "observe"]);
});

test("toggleSidebarSectionVisibility shows a section without touching others", () => {
  const next = toggleSidebarSectionVisibility(["observe", "agents"], "observe", true);
  assert.deepEqual(next, ["agents"]);
});

test("toggleSidebarSectionVisibility refuses to hide a protected section", () => {
  const before = ["observe"];
  assert.deepEqual(toggleSidebarSectionVisibility(before, "system", false), before);
});

test("toggleSidebarSectionVisibility is idempotent", () => {
  const once = toggleSidebarSectionVisibility([], "observe", false);
  const twice = toggleSidebarSectionVisibility(once, "observe", false);
  assert.deepEqual([...twice].sort(), [...once].sort());
  const shownOnce = toggleSidebarSectionVisibility(once, "observe", true);
  const shownTwice = toggleSidebarSectionVisibility(shownOnce, "observe", true);
  assert.deepEqual([...shownTwice].sort(), [...shownOnce].sort());
});
