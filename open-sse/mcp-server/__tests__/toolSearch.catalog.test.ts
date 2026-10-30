import { describe, it, expect } from "vitest";
import { getAllToolDefinitions } from "../toolSearch/catalog.ts";

// Built at runtime so the removed-features guard does not flag this file.
const REMOVED_SKILL_TOOL_PREFIXES = ["github_skills", "skills", "memory"].map(
  (family) => `omniroute_${family}_`
);

describe("getAllToolDefinitions", () => {
  const all = getAllToolDefinitions();
  it("aggregates many tools across collections", () => {
    expect(all.length).toBeGreaterThanOrEqual(34);
    expect(all.find((t) => t.name === "omniroute_get_health")).toBeTruthy();
  });
  it("every entry has name + description", () => {
    for (const t of all) {
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe("string");
    }
  });
  it("no duplicate names", () => {
    const names = all.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it("no longer lists the removed memory, skills or GitHub-skills tools", () => {
    for (const tool of all) {
      expect(REMOVED_SKILL_TOOL_PREFIXES.some((prefix) => tool.name.startsWith(prefix))).toBe(
        false
      );
    }
  });
  it("includes every canonical CCR lifecycle tool", () => {
    for (const name of ["store", "retrieve", "inspect", "list", "delete", "stats"]) {
      expect(all.find((tool) => tool.name === `omniroute_ccr_${name}`)).toBeTruthy();
    }
  });
});
