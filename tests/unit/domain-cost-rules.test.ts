import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-domain-cost-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const costRules = await import("../../src/domain/costRules.ts");
const domainState = await import("../../src/lib/db/domainState.ts");

async function resetStorage() {
  costRules.resetCostData();
  core.resetDbInstance();

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      if (fs.existsSync(TEST_DATA_DIR)) {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
      break;
    } catch (error: any) {
      if ((error?.code === "EBUSY" || error?.code === "EPERM") && attempt < 9) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      } else {
        throw error;
      }
    }
  }

  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(async () => {
  await resetStorage();
});

test.after(async () => {
  costRules.resetCostData();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const EMPTY_SUMMARY = {
  dailyTotal: 0,
  monthlyTotal: 0,
  totalEntries: 0,
  totalCostToday: 0,
  totalCostMonth: 0,
};

test("getDailyTotal and getCostSummary split daily and monthly totals correctly", () => {
  const OriginalDate = global.Date;
  const mockNow = Date.UTC(2026, 4, 15, 12, 0, 0); // May 15, 2026

  try {
    global.Date = class extends OriginalDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(mockNow);
        } else {
          super(...(args as []));
        }
      }
      static now() {
        return mockNow;
      }
    } as any;

    const now = Date.now();
    const today = now - 1_000;
    const yesterday = now - 24 * 60 * 60 * 1000;
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    domainState.saveCostEntry("key-summary", 2.5, today);
    domainState.saveCostEntry("key-summary", 1.5, yesterday);
    domainState.saveCostEntry("key-summary", 9.9, lastMonth.getTime());

    assert.equal(costRules.getDailyTotal("key-summary"), 2.5);
    assert.deepEqual(costRules.getCostSummary("key-summary"), {
      dailyTotal: 2.5,
      monthlyTotal: 4,
      totalEntries: 2,
      totalCostToday: 2.5,
      totalCostMonth: 4,
    });
  } finally {
    global.Date = OriginalDate;
  }
});

test("costRules skips malformed cost entries and falls back when storage fails", () => {
  const db = core.getDbInstance();
  const now = Date.now();
  db.prepare("INSERT INTO domain_cost_history (api_key_id, cost, timestamp) VALUES (?, ?, ?)").run(
    "malformed-costs",
    "2.25",
    String(now)
  );
  db.prepare("INSERT INTO domain_cost_history (api_key_id, cost, timestamp) VALUES (?, ?, ?)").run(
    "malformed-costs",
    "not-a-number",
    now
  );
  db.prepare("INSERT INTO domain_cost_history (api_key_id, cost, timestamp) VALUES (?, ?, ?)").run(
    "malformed-costs",
    4,
    "not-a-timestamp"
  );

  assert.equal(costRules.getDailyTotal("malformed-costs"), 2.25);
  assert.deepEqual(costRules.getCostSummary("malformed-costs"), {
    dailyTotal: 2.25,
    monthlyTotal: 2.25,
    totalEntries: 1,
    totalCostToday: 2.25,
    totalCostMonth: 2.25,
  });

  db.exec("DROP TABLE domain_cost_history");
  assert.equal(costRules.getDailyTotal("malformed-costs"), 0);
  assert.deepEqual(costRules.getCostSummary("malformed-costs"), EMPTY_SUMMARY);
});

test("getBudgetWindow computes daily, weekly and monthly reset windows in UTC", () => {
  const now = Date.UTC(2026, 3, 17, 12, 0, 0); // Friday 17 April 2026

  assert.deepEqual(costRules.getBudgetWindow("daily", "00:00", now), {
    periodStartAt: Date.UTC(2026, 3, 17, 0, 0, 0),
    nextResetAt: Date.UTC(2026, 3, 18, 0, 0, 0),
  });
  assert.deepEqual(costRules.getBudgetWindow("daily", "18:30", now), {
    periodStartAt: Date.UTC(2026, 3, 16, 18, 30, 0),
    nextResetAt: Date.UTC(2026, 3, 17, 18, 30, 0),
  });
  assert.deepEqual(costRules.getBudgetWindow("weekly", "06:30", now), {
    periodStartAt: Date.UTC(2026, 3, 13, 6, 30, 0),
    nextResetAt: Date.UTC(2026, 3, 20, 6, 30, 0),
  });
  assert.deepEqual(costRules.getBudgetWindow("monthly", "00:00", now), {
    periodStartAt: Date.UTC(2026, 3, 1, 0, 0, 0),
    nextResetAt: Date.UTC(2026, 4, 1, 0, 0, 0),
  });
});
