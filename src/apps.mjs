import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
const TOOLBOX_SCRIPTS = path.join(HOME, "Library/Application Support/JetBrains/Toolbox/scripts");

/**
 * Supported third-party applications and their CLI / macOS bundle resolution rules.
 */
export const APP_SPECS = [
  {
    id: "vscode",
    name: "VS Code",
    aliases: ["vscode", "code", "vs-code", "visual studio code", "visual-studio-code"],
    cliCandidates: [
      "code",
      "/usr/local/bin/code",
      "/opt/homebrew/bin/code",
      "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    ],
    macApps: ["Visual Studio Code", "/Applications/Visual Studio Code.app"],
    newWindowFlag: "-n",
  },
  {
    id: "trae-cn",
    name: "Trae CN",
    aliases: ["trae-cn", "trae", "trae cn", "traecn"],
    cliCandidates: [
      "trae-cn",
      "/usr/local/bin/trae-cn",
      "/opt/homebrew/bin/trae-cn",
      "/Applications/Trae CN.app/Contents/Resources/app/bin/trae-cn",
    ],
    macApps: ["Trae CN", "/Applications/Trae CN.app"],
    newWindowFlag: "-n",
  },
  {
    id: "goland",
    name: "GoLand",
    aliases: ["goland", "go-land"],
    cliCandidates: [
      "goland",
      path.join(TOOLBOX_SCRIPTS, "goland"),
      "/usr/local/bin/goland",
      "/opt/homebrew/bin/goland",
    ],
    macApps: [
      "/Applications/GoLand.app",
      path.join(HOME, "Applications/GoLand.app"),
      "GoLand",
    ],
    newWindowFlag: null,
  },
  {
    id: "pycharm",
    name: "PyCharm",
    aliases: ["pycharm", "py-charm"],
    cliCandidates: [
      "pycharm",
      path.join(TOOLBOX_SCRIPTS, "pycharm"),
      "/usr/local/bin/pycharm",
      "/opt/homebrew/bin/pycharm",
    ],
    macApps: [
      path.join(HOME, "Applications/PyCharm.app"),
      "/Applications/PyCharm.app",
      "/Applications/PyCharm CE.app",
      "PyCharm",
      "PyCharm CE",
    ],
    newWindowFlag: null,
  },
  {
    id: "winc",
    name: "Winc",
    aliases: ["winc"],
    cliCandidates: [
      "winc",
      "/usr/local/bin/winc",
      "/opt/homebrew/bin/winc",
      "/Applications/winc.app/Contents/MacOS/winc",
    ],
    macApps: ["/Applications/winc.app", "winc"],
    newWindowFlag: "-n",
  },
];

const ALIAS_MAP = new Map(
  APP_SPECS.flatMap((spec) => spec.aliases.map((alias) => [alias.toLowerCase(), spec]))
);

/**
 * Look up an application spec by id or common alias.
 */
export function resolveAppSpec(appIdOrAlias) {
  if (!appIdOrAlias || typeof appIdOrAlias !== "string") {
    throw new Error("Application identifier is required.");
  }
  const spec = ALIAS_MAP.get(appIdOrAlias.trim().toLowerCase());
  if (!spec) {
    const supported = APP_SPECS.map((s) => s.id).join(", ");
    throw new Error(`Unsupported app "${appIdOrAlias}". Supported apps: ${supported}`);
  }
  return spec;
}

function isExecutableFile(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Find an executable command on PATH or at an explicit filesystem path.
 */
export function findCliBinary(candidates, pathEnv = process.env.PATH ?? "") {
  const pathDirs = pathEnv.split(path.delimiter).filter(Boolean);

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (isExecutableFile(candidate)) return candidate;
      continue;
    }

    for (const dir of pathDirs) {
      const fullPath = path.join(dir, candidate);
      if (isExecutableFile(fullPath)) return fullPath;
    }
  }
  return null;
}

/**
 * Find an installed macOS `.app` bundle for the given spec.
 */
export function findMacAppBundle(macApps) {
  for (const entry of macApps) {
    if (entry.endsWith(".app") && fs.existsSync(entry)) {
      return entry;
    }
    if (!entry.includes("/")) {
      const systemApp = path.join("/Applications", `${entry}.app`);
      const userApp = path.join(HOME, "Applications", `${entry}.app`);
      if (fs.existsSync(systemApp)) return systemApp;
      if (fs.existsSync(userApp)) return userApp;
    }
  }
  return null;
}

/**
 * Build the command and arguments used to launch an app for a target path.
 */
export function buildLaunchInvocation(spec, targetPath, options = {}) {
  const { newWindow = false, platform = process.platform, pathEnv = process.env.PATH ?? "" } = options;
  const cli = findCliBinary(spec.cliCandidates, pathEnv);

  if (cli) {
    const args = [];
    if (newWindow && spec.newWindowFlag) {
      args.push(spec.newWindowFlag);
    }
    args.push(targetPath);
    return {
      command: cli,
      args,
      method: "cli",
      available: true,
    };
  }

  if (platform === "darwin") {
    const bundle = findMacAppBundle(spec.macApps);
    const appTarget = bundle ?? spec.macApps[0];
    const openFlag = newWindow ? "-na" : "-a";
    return {
      command: "/usr/bin/open",
      args: [openFlag, appTarget, targetPath],
      method: "macos_open",
      available: Boolean(bundle),
    };
  }

  return {
    command: null,
    args: [],
    method: "unavailable",
    available: false,
  };
}

/**
 * List all supported applications along with local availability metadata.
 */
export function listSupportedApps(options = {}) {
  const { platform = process.platform, pathEnv = process.env.PATH ?? "" } = options;
  return APP_SPECS.map((spec) => {
    const cli = findCliBinary(spec.cliCandidates, pathEnv);
    const macApp = platform === "darwin" ? findMacAppBundle(spec.macApps) : null;
    return {
      id: spec.id,
      name: spec.name,
      available: Boolean(cli || macApp),
      cliPath: cli,
      appBundlePath: macApp,
    };
  });
}

function buildCleanSpawnEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  // Avoid inheriting Electron/VS Code host variables when spawning external GUIs/CLIs.
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VSCODE_IPC_HOOK_CLI;
  return env;
}

/**
 * Default detached process runner that detects immediate launch failures without hanging.
 */
export function defaultSpawnRunner(command, args, spawnOptions = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stderr = "";

    const child = spawn(command, args, {
      cwd: spawnOptions.cwd,
      env: spawnOptions.env ?? buildCleanSpawnEnv(),
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    }, 400);

    child.once("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.once("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0 || code === null) {
        resolve();
      } else {
        const detail = stderr.trim() || `exit code ${code}`;
        reject(new Error(`${path.basename(command)} failed: ${detail}`));
      }
    });
  });
}

/**
 * Launch a supported third-party app on the resolved directory/file path.
 */
export async function launchApp(appIdOrAlias, targetPath, options = {}) {
  const resolvedPath = path.resolve(targetPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Target path does not exist: ${resolvedPath}`);
  }

  const spawnCwd = fs.statSync(resolvedPath).isDirectory()
    ? resolvedPath
    : path.dirname(resolvedPath);

  const spec = resolveAppSpec(appIdOrAlias);
  const invocation = buildLaunchInvocation(spec, resolvedPath, options);
  if (!invocation.command) {
    throw new Error(`No launcher found for ${spec.name} on ${process.platform}.`);
  }

  const runner = options.runner ?? defaultSpawnRunner;
  const spawnOpts = {
    cwd: spawnCwd,
    env: buildCleanSpawnEnv(),
  };

  let activeInvocation = invocation;
  try {
    await runner(activeInvocation.command, activeInvocation.args, spawnOpts);
  } catch (cliErr) {
    const platform = options.platform ?? process.platform;
    const bundle = platform === "darwin" ? findMacAppBundle(spec.macApps) : null;
    if (activeInvocation.method === "cli" && bundle) {
      const openFlag = options.newWindow ? "-na" : "-a";
      activeInvocation = {
        command: "/usr/bin/open",
        args: [openFlag, bundle, resolvedPath],
        method: "macos_open_fallback",
      };
      await runner(activeInvocation.command, activeInvocation.args, spawnOpts);
    } else {
      throw cliErr;
    }
  }

  return {
    appId: spec.id,
    appName: spec.name,
    targetPath: resolvedPath,
    command: activeInvocation.command,
    args: activeInvocation.args,
    method: activeInvocation.method,
  };
}
