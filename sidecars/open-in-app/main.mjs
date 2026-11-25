import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { launchApp, listSupportedApps } from "../../src/apps.mjs";
import { inspectWorktrees, resolveScopedPath } from "../../src/worktree.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.join(__dirname, "index.html");
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Convert a `file://` URI or filesystem path into a local absolute path when valid.
 */
export function uriToLocalPath(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const resolved = trimmed.startsWith("file://")
      ? fileURLToPath(trimmed)
      : path.resolve(trimmed);
    return fs.existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/**
 * Parse workspace URIs passed as a JSON array, pipe-delimited string, or array.
 */
export function parseWorkspacePaths(raw) {
  if (!raw) return [];
  let items = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        items = Array.isArray(parsed) ? parsed : [];
      } catch {
        items = [];
      }
    } else {
      items = trimmed.split("|");
    }
  }

  const seen = new Set();
  const paths = [];
  for (const item of items) {
    const localPath = uriToLocalPath(item);
    if (localPath && !seen.has(localPath)) {
      seen.add(localPath);
      paths.push(localPath);
    }
  }
  return paths;
}

/**
 * Create testable HTTP API handlers for the Antigravity 2.0 Sidecar.
 */
export function createSidecarHandlers(deps = {}) {
  const inspect = deps.inspectWorktrees ?? inspectWorktrees;
  const listApps = deps.listSupportedApps ?? listSupportedApps;
  const openApp = deps.launchApp ?? launchApp;

  return {
    async inspectHandler(data = {}) {
      const workspacePaths = parseWorkspacePaths(data.workspaces);
      const explicitPath = uriToLocalPath(data.path);
      const targetPath = explicitPath ?? workspacePaths[0] ?? null;
      const apps = listApps();

      if (!targetPath) {
        return {
          hasProject: false,
          activePath: null,
          workspacePaths,
          worktreeInfo: null,
          apps,
        };
      }

      const worktreeInfo = inspect(targetPath);
      return {
        hasProject: true,
        activePath: targetPath,
        workspacePaths,
        worktreeInfo,
        apps,
      };
    },

    async openHandler(data = {}) {
      const appId = data.app;
      const rawTarget = uriToLocalPath(data.projectPath) ?? parseWorkspacePaths(data.workspaces)[0];
      if (!rawTarget) {
        throw new Error("未检测到当前窗口项目路径。");
      }

      const worktreeInfo = inspect(rawTarget);
      const scope = data.scope ?? "exact";
      const targetPath = resolveScopedPath(worktreeInfo, scope);
      const launched = await openApp(appId, targetPath, {
        newWindow: Boolean(data.newWindow),
      });

      return {
        ok: true,
        launched,
        worktreeInfo,
      };
    },
  };
}

async function startSidecar() {
  const fallbackSdkPath = path.join(
    os.homedir(),
    ".gemini/antigravity/lib/node_modules/sidecar_sdk/index.mjs"
  );
  const { SidecarApp, Response } = await import("sidecar_sdk").catch(() =>
    import(pathToFileURL(fallbackSdkPath).href)
  );

  const app = new SidecarApp();
  const { inspectHandler, openHandler } = createSidecarHandlers();

  app.page(
    "/",
    () =>
      new Response(fs.readFileSync(INDEX_HTML_PATH, "utf8"), {
        contentType: "text/html; charset=utf-8",
        headers: NO_STORE,
      })
  );

  app.api("/api/inspect", (data) => inspectHandler(data), "GET");
  app.api("/api/open", (data) => openHandler(data), "POST");

  await app.run();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startSidecar();
}
