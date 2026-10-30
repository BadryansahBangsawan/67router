import "../../_setup/isolateDataDir.ts";

process.env.LOG_LEVEL = "error";
// These tests may only cross the registered fake-executor boundary.
globalThis.fetch = async () => {
  throw new Error("Network forbidden in model validation tests");
};
