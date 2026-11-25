---
name: open-in
description: >-
  Open the current project, active Git worktree, or main repository in a
  third-party IDE or editor (VS Code, Trae CN, GoLand, PyCharm, or Winc).
  Use when the user asks to open the project, folder, or worktree in an
  external app, or wants to inspect available Git worktrees.
---

# Open Project in Third-Party App

Run the bundled CLI script [open-in.mjs](../../scripts/open-in.mjs) against the current working directory (`$PWD`) — no MCP server required.

## Commands

- Inspect current worktree, main repository, all branch worktrees, and installed apps:
  `node ../../scripts/open-in.mjs --inspect --path "$PWD"`
- Open the active worktree (default):
  `node ../../scripts/open-in.mjs --app <vscode|trae-cn|goland|pycharm|winc> --scope current_worktree --path "$PWD"`
- Open the main repository instead of a linked worktree:
  `node ../../scripts/open-in.mjs --app <vscode|trae-cn|goland|pycharm|winc> --scope main_repo --path "$PWD"`
- Open a specific worktree path chosen from `--inspect`:
  `node ../../scripts/open-in.mjs --app <id> --scope exact --path "<worktree-path>"`
- Pass `--new-window` when the user asks to open in a separate window.

## Reporting

Report the opened target path, whether it is a linked worktree or main repository, and the launched application name.
