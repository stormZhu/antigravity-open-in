import { launchApp, listSupportedApps } from "../src/apps.mjs";
import { inspectWorktrees, resolveScopedPath } from "../src/worktree.mjs";

function parseArgs(argv) {
  const opts = {
    app: null,
    path: process.cwd(),
    scope: "current_worktree",
    newWindow: false,
    inspect: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--inspect") {
      opts.inspect = true;
    } else if (arg === "--new-window") {
      opts.newWindow = true;
    } else if (arg === "--app" && argv[i + 1]) {
      opts.app = argv[++i];
    } else if (arg === "--path" && argv[i + 1]) {
      opts.path = argv[++i];
    } else if (arg === "--scope" && argv[i + 1]) {
      opts.scope = argv[++i];
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const worktreeInfo = inspectWorktrees(opts.path);

  if (opts.inspect || !opts.app) {
    console.log(
      JSON.stringify(
        {
          worktreeInfo,
          apps: listSupportedApps(),
        },
        null,
        2
      )
    );
    return;
  }

  const targetPath = resolveScopedPath(worktreeInfo, opts.scope);
  const launched = await launchApp(opts.app, targetPath, { newWindow: opts.newWindow });
  console.log(JSON.stringify({ launched, worktreeInfo }, null, 2));
}

main().catch((err) => {
  console.error(err?.message ?? String(err));
  process.exit(1);
});
