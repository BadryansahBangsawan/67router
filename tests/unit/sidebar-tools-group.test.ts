import test from "node:test";
import assert from "node:assert/strict";

const sidebarVisibility = await import("../../src/shared/constants/sidebarVisibility.ts");

function getToolsGroup() {
  // Sidebar v2: the Tools group moved from OmniProxy to the Agents section, whose headline row
  // is CLI Agents (flat, design "Agents"); the rest of the group keeps its plan-14 order.
  const omniProxySection = sidebarVisibility.SIDEBAR_SECTIONS.find(
    (section) => section.id === "agents"
  );
  assert.ok(omniProxySection, "expected agents section to exist");

  const toolsGroup = omniProxySection.children.find(
    (
      child
    ): child is (typeof sidebarVisibility.SIDEBAR_SECTIONS)[number]["children"][number] & {
      type: "group";
    } =>
      "type" in child &&
      (child as { type: string }).type === "group" &&
      (child as { id: string }).id === "tools"
  );
  assert.ok(toolsGroup, "expected tools group to exist in agents section");
  return toolsGroup as {
    type: "group";
    id: string;
    items: readonly { id: string; href: string; i18nKey: string }[];
  };
}

test("TOOLS_GROUP items follow plan 14 order: cli-code → cli-agents → acp-agents → conductor → orchestration → agent-bridge → traffic-inspector → discovery", () => {
  const toolsGroup = getToolsGroup();
  // cli-agents is the Agents section's flat headline row in v2; splice it back in plan order.
  const groupIds = toolsGroup.items.map((item) => item.id);
  assert.ok(!groupIds.includes("cli-agents"), "cli-agents is a flat row, not in the group");
  const itemIds = [groupIds[0], "cli-agents", ...groupIds.slice(1)];
  // cli-code/cli-agents/acp-agents from plan 14 (#2839); agent-bridge/traffic-inspector from plans 11/12 (#2858); discovery from #5939; conductor from the Conductor panel (PRD RF3, #8221).
  assert.deepEqual(
    itemIds,
    [
      "cli-code",
      "cli-agents",
      "acp-agents",
      "conductor",
      "orchestration", // +1: orchestration (PR-2 of the orchestration canvas)
      "agent-bridge",
      "traffic-inspector",
      "discovery",
    ],
    "TOOLS_GROUP items order must be cli-code, cli-agents, acp-agents, conductor, orchestration, agent-bridge, traffic-inspector, discovery"
  );
});

test("TOOLS_GROUP cli-code item has correct href and i18nKey", () => {
  const toolsGroup = getToolsGroup();
  const cliCode = toolsGroup.items.find((item) => item.id === "cli-code");
  assert.ok(cliCode, "expected cli-code in TOOLS_GROUP");
  assert.equal(cliCode.href, "/dashboard/cli-code");
  assert.equal(cliCode.i18nKey, "cliCode");
});

test("TOOLS_GROUP cli-agents item has correct href and i18nKey", () => {
  const agents = sidebarVisibility.SIDEBAR_SECTIONS.find((s) => s.id === "agents")!;
  const cliAgents = sidebarVisibility.getSectionItems(agents).find((i) => i.id === "cli-agents");
  assert.ok(cliAgents, "expected cli-agents in the agents section");
  assert.equal(cliAgents.href, "/dashboard/cli-agents");
  assert.equal(cliAgents.i18nKey, "cliAgents");
});

test("TOOLS_GROUP acp-agents item has correct href and i18nKey", () => {
  const toolsGroup = getToolsGroup();
  const acpAgents = toolsGroup.items.find((item) => item.id === "acp-agents");
  assert.ok(acpAgents, "expected acp-agents in TOOLS_GROUP");
  assert.equal(acpAgents.href, "/dashboard/acp-agents");
  assert.equal(acpAgents.i18nKey, "acpAgents");
});

test("TOOLS_GROUP does NOT contain legacy cli-tools or agents entries", () => {
  const toolsGroup = getToolsGroup();
  const legacyIds = toolsGroup.items
    .map((item) => item.id)
    .filter((id) => id === "cli-tools" || id === "agents");
  assert.deepEqual(
    legacyIds,
    [],
    "TOOLS_GROUP must not contain legacy 'cli-tools' or 'agents' entries"
  );
});
