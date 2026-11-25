import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Resolve a filesystem path via realpath when possible so symlinked temp dirs match Git output.
 */
function safeRealpath(targetPath) {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

/**
 * Parse `git worktree list --porcelain` output into structured worktree entries.
 */
export function parsePorcelainWorktrees(porcelainText) {
  const worktrees = [];
  let current = null;

  for (const rawLine of porcelainText.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      if (current) worktrees.push(current);
      current = null;
      continue;
    }

    if (line.startsWith("worktree ")) {
      current = {
        path: line.slice("worktree ".length).trim(),
        head: null,
        branch: null,
        detached: false,
        bare: false,
        locked: false,
        prunable: false,
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      current.detached = true;
    } else if (line === "bare") {
      current.bare = true;
    } else if (line === "locked" || line.startsWith("locked ")) {
      current.locked = true;
    } else if (line === "prunable" || line.startsWith("prunable ")) {
      current.prunable = true;
    }
  }

  if (current) worktrees.push(current);
  return worktrees;
}

/**
 * Inspect Git worktree topology for a file or directory path.
 */
export function inspectWorktrees(targetPath) {
  const resolvedInput = path.resolve(targetPath);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`Target path does not exist: ${resolvedInput}`);
  }

  const stats = fs.statSync(resolvedInput);
  const workingDir = stats.isDirectory() ? resolvedInput : path.dirname(resolvedInput);
  const realWorkingDir = safeRealpath(workingDir);

  let currentRoot;
  try {
    currentRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: realWorkingDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return {
      isGitRepo: false,
      inputPath: realWorkingDir,
      currentRoot: realWorkingDir,
      mainRepoPath: realWorkingDir,
      isLinkedWorktree: false,
      hasGitFile: false,
      activeWorktree: null,
      allWorktrees: [],
    };
  }

  const realCurrentRoot = safeRealpath(currentRoot);
  const porcelain = execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd: realCurrentRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const allWorktrees = parsePorcelainWorktrees(porcelain).map((wt) => ({
    ...wt,
    path: safeRealpath(wt.path),
  }));

  const mainEntry = allWorktrees.find((wt) => !wt.bare) ?? allWorktrees[0] ?? null;
  const mainRepoPath = mainEntry ? mainEntry.path : realCurrentRoot;

  let hasGitFile = false;
  try {
    hasGitFile = fs.lstatSync(path.join(realCurrentRoot, ".git")).isFile();
  } catch {
    hasGitFile = false;
  }

  const decoratedWorktrees = allWorktrees.map((wt) => ({
    ...wt,
    isMain: wt.path === mainRepoPath,
    isActive: wt.path === realCurrentRoot,
  }));

  const activeWorktree = decoratedWorktrees.find((wt) => wt.isActive) ?? null;

  return {
    isGitRepo: true,
    inputPath: realWorkingDir,
    currentRoot: realCurrentRoot,
    mainRepoPath,
    isLinkedWorktree: hasGitFile || realCurrentRoot !== mainRepoPath,
    hasGitFile,
    activeWorktree,
    allWorktrees: decoratedWorktrees,
  };
}

/**
 * Resolve which directory should be opened for a requested scope.
 */
export function resolveScopedPath(worktreeInfo, scope = "current_worktree") {
  if (scope === "main_repo") {
    return worktreeInfo.mainRepoPath;
  }
  if (scope === "exact") {
    return worktreeInfo.inputPath;
  }
  return worktreeInfo.currentRoot;
}
