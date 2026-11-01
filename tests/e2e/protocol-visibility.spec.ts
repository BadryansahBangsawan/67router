import { test, expect } from "@playwright/test";
import { gotoDashboardRoute } from "./helpers/dashboardAuth";

test.describe("Protocol visibility", () => {
  test("shows the MCP tab inside the endpoint page and no A2A tab", async ({ page }) => {
    await gotoDashboardRoute(page, "/dashboard/endpoint");
    // No networkidle wait: the endpoint page keeps polling its tunnel/MCP status, so the network
    // never goes idle. toBeVisible() below waits for the tab instead.
    // MCP is a tab directly in the SegmentedControl. 67router removed the A2A dashboard (PR-2),
    // so its tab must stay gone.
    const mcpTab = page.getByRole("tab", { name: "MCP" });
    await expect(mcpTab).toBeVisible();
    await expect(page.getByRole("tab", { name: "A2A" })).toHaveCount(0);

    // Verify MCP dashboard mounts
    await mcpTab.click();
    // In dev/test it might just show "loading..." or the processStatus card
    await expect(page.locator("body")).not.toContainText(/application error|500/i);
  });
});
