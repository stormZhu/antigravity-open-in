import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  APP_SPECS,
  buildLaunchInvocation,
  defaultSpawnRunner,
  launchApp,
  listSupportedApps,
  resolveAppSpec,
} from "../src/apps.mjs";

test("supports all 5 requested apps and aliases", () => {
  assert.deepEqual(
    APP_SPECS.map((s) => s.id),
    ["vscode", "trae-cn", "goland", "pycharm", "winc"]
  );
  assert.equal(resolveAppSpec("code").id, "vscode");
  assert.equal(resolveAppSpec("trae").id, "trae-cn");
  assert.equal(resolveAppSpec("GoLand").id, "goland");
  assert.equal(resolveAppSpec("pycharm").id, "pycharm");
  assert.equal(resolveAppSpec("winc").id, "winc");
  assert.throws(() => resolveAppSpec("unknown-editor"), /Unsupported app/);
});

test("buildLaunchInvocation picks PATH CLI when available and falls back to macOS open", (t) => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-bin-"));
  t.after(() => fs.rmSync(binDir, { recursive: true, force: true }));

  const fakeWinc = path.join(binDir, "winc");
  fs.writeFileSync(fakeWinc, "#!/bin/sh\nexit 0\n");
  fs.chmodSync(fakeWinc, 0o755);

  const cliCall = buildLaunchInvocation(resolveAppSpec("winc"), "/tmp/proj", {
    newWindow: true,
    platform: "darwin",
    pathEnv: binDir,
  });
  assert.equal(cliCall.method, "cli");
  assert.equal(cliCall.command, fakeWinc);
  assert.deepEqual(cliCall.args, ["-n", "/tmp/proj"]);

  const fallbackCall = buildLaunchInvocation(resolveAppSpec("goland"), "/tmp/proj", {
    newWindow: true,
    platform: "darwin",
    pathEnv: binDir,
  });
  if (fallbackCall.method === "macos_open") {
    assert.equal(fallbackCall.command, "/usr/bin/open");
    assert.equal(fallbackCall.args[0], "-na");
  }
});

test("launchApp passes exact invocation to runner without opening GUI", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-launch-"));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const calls = [];
  const res = await launchApp("vscode", tmpDir, {
    newWindow: false,
    runner: async (command, args, spawnOptions) => {
      calls.push({ command, args, spawnOptions });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].spawnOptions.cwd, path.resolve(tmpDir));
  assert.equal(calls[0].spawnOptions.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(calls[0].spawnOptions.env.VSCODE_IPC_HOOK_CLI, undefined);
  assert.equal(res.appId, "vscode");
  assert.equal(res.targetPath, fs.realpathSync.native(tmpDir).replace(/^\/private/, (m) =>
    tmpDir.startsWith("/private") ? m : ""
  ));
  assert.ok(listSupportedApps().length === 5);
});

test("defaultSpawnRunner succeeds with explicit cwd even if parent process cwd was deleted", async (t) => {
  const validDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-valid-cwd-"));
  const deadDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-dead-cwd-"));
  const origCwd = process.cwd();
  t.after(() => {
    process.chdir(origCwd);
    fs.rmSync(validDir, { recursive: true, force: true });
    fs.rmSync(deadDir, { recursive: true, force: true });
  });

  process.chdir(deadDir);
  fs.rmSync(deadDir, { recursive: true, force: true });

  await defaultSpawnRunner("/bin/sh", ["-c", "pwd >/dev/null"], { cwd: validDir });
});

test("launchApp falls back to macOS open -a when CLI invocation fails", async (t) => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-fallback-bin-"));
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-fallback-target-"));
  t.after(() => {
    fs.rmSync(binDir, { recursive: true, force: true });
    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  const fakeCli = path.join(binDir, "trae-cn");
  fs.writeFileSync(fakeCli, "#!/bin/sh\nexit 1\n");
  fs.chmodSync(fakeCli, 0o755);

  const calls = [];
  const res = await launchApp("trae-cn", targetDir, {
    platform: "darwin",
    pathEnv: binDir,
    runner: async (command, args) => {
      calls.push({ command, args });
      if (command === fakeCli) {
        throw new Error("simulated CLI failure");
      }
    },
  });

  if (fs.existsSync("/Applications/Trae CN.app")) {
    assert.equal(calls.length, 2);
    assert.equal(calls[1].command, "/usr/bin/open");
    assert.equal(res.method, "macos_open_fallback");
  } else {
    assert.equal(calls.length, 1);
  }
});
