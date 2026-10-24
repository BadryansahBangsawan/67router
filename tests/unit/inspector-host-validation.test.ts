/**
 * The Traffic Inspector custom-host value is appended to the hosts file
 * (`addDNSEntries` → `sudo tee -a /etc/hosts`). It must be a plain hostname:
 * whitespace or control characters would let one value add extra lines.
 * Validated at the request schema AND defensively inside addDNSEntries.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { InspectorCustomHostSchema } from "../../src/shared/schemas/inspector.ts";
import { addDNSEntries } from "../../src/mitm/dns/dnsConfig.ts";

const INVALID_HOSTS = [
  "x\n6.6.6.6 github.com",
  "x\r\n127.0.0.1 example.org",
  "a b",
  "a\tb",
  "evil.com\u0000",
  "host#comment",
  "a..b",
  ".leading.dot",
  "-x.example.com",
  "a".repeat(64) + ".com",
  "http://example.com",
  "example.com:443",
];

const VALID_HOSTS = [
  "example.com",
  "api.openai.com",
  "daily-cloudcode-pa.sandbox.googleapis.com",
  "localhost",
  "__test_add_unset__.example.com",
  "API.Example.COM",
];

test("InspectorCustomHostSchema rejects non-hostname values", () => {
  for (const host of INVALID_HOSTS) {
    assert.equal(
      InspectorCustomHostSchema.safeParse({ host }).success,
      false,
      `expected rejection for ${JSON.stringify(host)}`
    );
  }
});

test("InspectorCustomHostSchema accepts ordinary hostnames", () => {
  for (const host of VALID_HOSTS) {
    assert.equal(
      InspectorCustomHostSchema.safeParse({ host }).success,
      true,
      `expected acceptance for ${JSON.stringify(host)}`
    );
  }
});

async function withDnsWritesEnabled(fn: () => Promise<void>) {
  const prev = process.env.OMNIROUTE_SKIP_DNS_WRITE;
  delete process.env.OMNIROUTE_SKIP_DNS_WRITE;
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env.OMNIROUTE_SKIP_DNS_WRITE;
    else process.env.OMNIROUTE_SKIP_DNS_WRITE = prev;
  }
}

test("addDNSEntries refuses an invalid hostname and writes nothing", async () => {
  await withDnsWritesEnabled(async () => {
    const writes: string[] = [];
    const deps = {
      execFileWithPassword: async (_cmd: string, _args: string[], _pw: string, input?: string) => {
        writes.push(String(input ?? ""));
        return "";
      },
      runElevatedPowerShell: async (script: string) => {
        writes.push(script);
        return "";
      },
    } as unknown as Parameters<typeof addDNSEntries>[2];

    await assert.rejects(
      addDNSEntries(["ok-host.example.com", "x\n6.6.6.6 github.com"], "pw", deps),
      /invalid hostname/i
    );
    assert.equal(writes.length, 0, "no hosts-file write may happen when any host is invalid");
  });
});

test("addDNSEntries still writes entries for a valid hostname", async () => {
  await withDnsWritesEnabled(async () => {
    const writes: string[] = [];
    const deps = {
      execFileWithPassword: async (_cmd: string, _args: string[], _pw: string, input?: string) => {
        writes.push(String(input ?? ""));
        return "";
      },
      runElevatedPowerShell: async (script: string) => {
        writes.push(script);
        return "";
      },
    } as unknown as Parameters<typeof addDNSEntries>[2];

    await addDNSEntries(["__inspector_valid_host__.example.com"], "pw", deps);
    assert.equal(writes.length, 1);
    assert.match(writes[0], /__inspector_valid_host__\.example\.com/);
  });
});
