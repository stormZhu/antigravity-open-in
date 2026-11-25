import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectWorktrees, parsePorcelainWorktrees, resolveScopedPath } from "../src/worktree.mjs";

function makeTempGitWithWorktree(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "agy-wt-test-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));

  const mainRepo = path.join(base, "main-repo");
  const worktreeDir = path.join(base, "feature-wt");
  fs.mkdirSync(mainRepo, { recursive: true });

  const git = (args, cwd = mainRepo) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test User"]);
  fs.writeFileSync(path.join(mainRepo, "README.md"), "hello\n");
  git(["add", "."]);
  git(["commit", "-m", "init"]);

  git(["worktree", "add", "-b", "feat/demo", worktreeDir]);
  const nestedDir = path.join(worktreeDir, "packages", "app");
  fs.mkdirSync(nestedDir, { recursive: true });

  return {
    base,
    mainRepo: fs.realpathSync.native(mainRepo),
    worktreeDir: fs.realpathSync.native(worktreeDir),
    nestedDir: fs.realpathSync.native(nestedDir),
  };
}

test("parsePorcelainWorktrees parses main, linked, bare, and detached entries", () => {
  const sample = [
    "worktree /repo/main",
    "HEAD 111111",
    "branch refs/heads/main",
    "",
    "worktree /repo/wt-1",
    "HEAD 222222",
    "detached",
    "locked",
    "",
  ].join("\n");

  const parsed = parsePorcelainWorktrees(sample);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].branch, "main");
  assert.equal(parsed[1].detached, true);
  assert.equal(parsed[1].locked, true);
});

test("inspectWorktrees distinguishes main repo and linked worktree from nested subdirs", (t) => {
  const { mainRepo, worktreeDir, nestedDir } = makeTempGitWithWorktree(t);

  const mainInfo = inspectWorktrees(mainRepo);
  assert.equal(mainInfo.isGitRepo, true);
  assert.equal(mainInfo.isLinkedWorktree, false);
  assert.equal(mainInfo.currentRoot, mainRepo);
  assert.equal(mainInfo.mainRepoPath, mainRepo);
  assert.equal(mainInfo.allWorktrees.length, 2);

  const wtInfo = inspectWorktrees(nestedDir);
  assert.equal(wtInfo.isGitRepo, true);
  assert.equal(wtInfo.isLinkedWorktree, true);
  assert.equal(wtInfo.hasGitFile, true);
  assert.equal(wtInfo.currentRoot, worktreeDir);
  assert.equal(wtInfo.mainRepoPath, mainRepo);
  assert.equal(wtInfo.activeWorktree?.branch, "feat/demo");

  assert.equal(resolveScopedPath(wtInfo, "current_worktree"), worktreeDir);
  assert.equal(resolveScopedPath(wtInfo, "main_repo"), mainRepo);
  assert.equal(resolveScopedPath(wtInfo, "exact"), nestedDir);
});

test("inspectWorktrees handles non-git directories and throws on missing path", (t) => {
  const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), "agy-nongit-"));
  t.after(() => fs.rmSync(nonGit, { recursive: true, force: true }));

  const info = inspectWorktrees(nonGit);
  assert.equal(info.isGitRepo, false);
  assert.equal(info.currentRoot, fs.realpathSync.native(nonGit));

  assert.throws(() => inspectWorktrees(path.join(nonGit, "missing-dir")), /does not exist/);
});
