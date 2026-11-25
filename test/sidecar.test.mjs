import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createSidecarHandlers,
  parseWorkspacePaths,
  uriToLocalPath,
} from "../sidecars/open-in-app/main.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_SCRIPT = path.resolve(__dirname, "../scripts/open-in.mjs");

function makeTempWorktree(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "agy-sidecar-test-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));

  const mainRepo = path.join(base, "main-repo");
  const wtRepo = path.join(base, "wt-branch");
  fs.mkdirSync(mainRepo, { recursive: true });

  const git = (args, cwd = mainRepo) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(mainRepo, "index.txt"), "hello\n");
  git(["add", "."]);
  git(["commit", "-m", "init"]);
  git(["worktree", "add", "-b", "feat/sidecar", wtRepo]);

  return {
    mainRepo: fs.realpathSync.native(mainRepo),
    wtRepo: fs.realpathSync.native(wtRepo),
  };
}

test("parseWorkspacePaths parses file:// URIs in JSON array and pipe formats", (t) => {
  const { mainRepo, wtRepo } = makeTempWorktree(t);
  const wtUri = pathToFileURL(wtRepo).href;
  const mainUri = pathToFileURL(mainRepo).href;

  assert.equal(uriToLocalPath(wtUri), wtRepo);
  assert.deepEqual(parseWorkspacePaths(JSON.stringify([wtUri, mainUri, wtUri])), [wtRepo, mainRepo]);
  assert.deepEqual(parseWorkspacePaths(`${wtUri}|${mainUri}`), [wtRepo, mainRepo]);
  assert.deepEqual(parseWorkspacePaths("[]"), []);
});

test("sidecar handlers inspect active worktree immediately and open selected app", async (t) => {
  const { mainRepo, wtRepo } = makeTempWorktree(t);
  const launchedCalls = [];

  const { inspectHandler, openHandler } = createSidecarHandlers({
    launchApp: async (app, targetPath, opts) => {
      launchedCalls.push({ app, targetPath, opts });
      return { appId: app, appName: app, targetPath, method: "mock" };
    },
  });

  const empty = await inspectHandler({});
  assert.equal(empty.hasProject, false);
  assert.equal(empty.worktreeInfo, null);
  assert.equal(empty.apps.length, 5);

  const inspected = await inspectHandler({
    workspaces: JSON.stringify([pathToFileURL(wtRepo).href]),
  });
  assert.equal(inspected.hasProject, true);
  assert.equal(inspected.worktreeInfo.isLinkedWorktree, true);
  assert.equal(inspected.worktreeInfo.currentRoot, wtRepo);
  assert.equal(inspected.worktreeInfo.mainRepoPath, mainRepo);
  assert.equal(inspected.worktreeInfo.activeWorktree?.branch, "feat/sidecar");

  await openHandler({
    app: "winc",
    projectPath: wtRepo,
    scope: "exact",
    newWindow: true,
  });
  await openHandler({
    app: "goland",
    projectPath: wtRepo,
    scope: "main_repo",
  });

  assert.deepEqual(launchedCalls, [
    { app: "winc", targetPath: wtRepo, opts: { newWindow: true } },
    { app: "goland", targetPath: mainRepo, opts: { newWindow: false } },
  ]);
});

test("scripts/open-in.mjs --inspect reports worktree and supported apps without MCP", (t) => {
  const { mainRepo, wtRepo } = makeTempWorktree(t);
  const raw = execFileSync("node", [CLI_SCRIPT, "--inspect", "--path", wtRepo], {
    encoding: "utf8",
  });
  const parsed = JSON.parse(raw);
  assert.equal(parsed.worktreeInfo.isLinkedWorktree, true);
  assert.equal(parsed.worktreeInfo.currentRoot, wtRepo);
  assert.equal(parsed.worktreeInfo.mainRepoPath, mainRepo);
  assert.deepEqual(
    parsed.apps.map((a) => a.id),
    ["vscode", "trae-cn", "goland", "pycharm", "winc"]
  );
});

test("sidecar index.html includes split dropdown, last-used memory, and favorites persistence", () => {
  const html = fs.readFileSync(
    path.resolve(__dirname, "../sidecars/open-in-app/index.html"),
    "utf8"
  );
  assert.ok(html.includes('src="/preload.js"'));
  assert.ok(html.includes("agy_open_in_last_app"));
  assert.ok(html.includes("agy_open_in_favorites"));
  assert.ok(html.includes('id="dropdownMenu"'));
  assert.ok(html.includes('id="favBar"'));
  assert.ok(html.includes("selectApp(pickBtn.dataset.pickApp)"));
  assert.ok(html.includes("selectApp(chip.dataset.quickApp)"));
});
