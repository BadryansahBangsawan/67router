/**
 * tests/unit/omniroute-verify-script.test.ts
 *
 * `npm run omniroute:verify` (scripts/check/omniroute-verify.mjs) must pass against a
 * healthy gateway. Quota Share was removed, so the script must not probe the deleted
 * /api/quota/pools route (it now 404s) and count that as a failure.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";

const SCRIPT = path.join(process.cwd(), "scripts/check/omniroute-verify.mjs");

function startHealthyGateway(): Promise<{ server: http.Server; url: string; paths: string[] }> {
  const paths: string[] = [];
  const server = http.createServer((req, res) => {
    const url = req.url || "";
    paths.push(url);
    res.setHeader("Content-Type", "application/json");
    if (url === "/v1/models") {
      res.end(JSON.stringify({ object: "list", data: [{ id: "openai/gpt-4o" }] }));
    } else if (url === "/api/omniroute/status") {
      res.end(JSON.stringify({ liveRequestExecuted: false }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}`, paths });
    });
  });
}

function runScript(
  baseUrl: string,
  dataDir: string
): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, OMNIROUTE_BASE_URL: baseUrl, DATA_DIR: dataDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", (code) => resolve({ code, out }));
  });
}

test("omniroute:verify passes against a healthy gateway without Quota Share", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-verify-script-"));
  const { server, url, paths } = await startHealthyGateway();
  try {
    const { code, out } = await runScript(url, dataDir);
    assert.doesNotMatch(out, /FAIL/, out);
    assert.equal(code, 0, out);
    assert.ok(
      !paths.some((p) => p.startsWith("/api/quota/pools")),
      "must not probe the removed /api/quota/pools route"
    );
  } finally {
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
