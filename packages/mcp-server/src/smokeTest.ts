/**
 * Smoke test for the agent-facing lifecycle, run directly against the
 * RuntimeAdapter interface (bypassing MCP transport plumbing) so it can run
 * fast in CI/local dev. Exercises exactly the flow described as the MVP
 * success criteria in docs/mvp-features.md:
 *   create a headless container -> exec a command -> read the result -> destroy.
 */
import assert from "node:assert";
import { MockRuntimeAdapter } from "./runtimeAdapter.js";
import { BoxWizardError } from "./types.js";

function expectErrorCode(code: string) {
  return (err: unknown) => err instanceof BoxWizardError && err.code === code;
}

async function main() {
  const adapter = new MockRuntimeAdapter();

  console.log("1. create_environment (template=python-3.12)");
  const env = await adapter.create({ kind: "container", template: "python-3.12", ttlSeconds: 60 });
  assert.strictEqual(env.kind, "container");
  assert.strictEqual(env.image, "docker.io/library/python:3.12-slim");
  console.log("   ->", env);

  await new Promise((r) => setTimeout(r, 100));

  console.log("2. get_environment (expect status=running)");
  const running = await adapter.get(env.id);
  assert.strictEqual(running.status, "running");
  console.log("   ->", running);

  console.log("3. exec_command");
  const execResult = await adapter.exec(env.id, { command: "python3 --version" });
  assert.strictEqual(execResult.exitCode, 0);
  console.log("   ->", execResult);

  console.log("4. list_environments (expect length 1)");
  const list = await adapter.list();
  assert.strictEqual(list.length, 1);
  console.log("   -> count:", list.length);

  console.log("5. extend_environment");
  const extended = await adapter.extend(env.id, 30);
  console.log("   -> new ttlExpiresAt:", extended.ttlExpiresAt);

  console.log("6. destroy_environment");
  await adapter.destroy(env.id);
  await new Promise((r) => setTimeout(r, 50));
  const afterDestroy = await adapter.get(env.id);
  assert.strictEqual(afterDestroy.status, "destroyed");
  console.log("   -> status:", afterDestroy.status);

  console.log("7. ttl_exceeded_max is rejected");
  await assert.rejects(
    () => adapter.create({ kind: "container", image: "docker.io/library/alpine:3.20", ttlSeconds: 999999 }),
    expectErrorCode("ttl_exceeded_max"),
  );
  console.log("   -> correctly rejected");

  console.log("8. exec_command on a VM environment is rejected (not_supported_for_kind)");
  const vmEnv = await adapter.create({ kind: "vm", template: "ubuntu-desktop-gui", ttlSeconds: 60 });
  await new Promise((r) => setTimeout(r, 100));
  await assert.rejects(
    () => adapter.exec(vmEnv.id, { command: "echo hi" }),
    expectErrorCode("not_supported_for_kind"),
  );
  console.log("   -> correctly rejected");

  console.log("\nAll smoke test assertions passed.");
  // Exit explicitly: the mock adapter's TTL timers otherwise keep the event
  // loop alive for the remaining test environment's TTL window.
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
