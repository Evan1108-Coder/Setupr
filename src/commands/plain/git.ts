import chalk from "chalk";
import { runCommand } from "../../executor/index.js";
import { createPSetupError, printPlainError } from "../../errors/index.js";
import { scanProject } from "../../scanner/index.js";
import { loadConfig } from "../../state/config.js";

interface GitFlags {
  force?: boolean;
  args?: string[];
  message?: string;
  branch?: string;
  [key: string]: unknown;
}

export async function cmdGit(sub: string | undefined, cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitAvailable(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_INSTALLED", command: "git", cwd }));
    return;
  }

  switch (sub) {
    case "init": return gitInit(cwd, flags);
    case "hooks": return gitHooks(cwd, flags);
    case "flow": return gitFlow(cwd, flags);
    case "commit": return gitCommit(cwd, flags);
    case "branch": return gitBranch(cwd, flags);
    case "pr": return gitPR(cwd, flags);
    case "stash": return gitStash(cwd, flags);
    case "rebase": return gitRebase(cwd, flags);
    case "tag": return gitTag(cwd, flags);
    case "release": return gitRelease(cwd, flags);
    case "status": return gitStatus(cwd);
    case "log": return gitLog(cwd);
    case "sync": return gitSync(cwd);
    case "clean": return gitClean(cwd, flags);
    case "ignore": return gitIgnore(cwd, flags);
    case "changelog": return gitChangelog(cwd, flags);
    case "blame": return gitBlame(cwd, flags);
    case "cherry-pick": return gitCherryPick(cwd, flags);
    case "worktree": return gitWorktree(cwd, flags);
    case "bisect": return gitBisect(cwd, flags);
    case "contributors": return gitContributors(cwd);
    case "undo": return gitUndo(cwd, flags);
    default:
      printPlainError(createPSetupError({
        code: "UNKNOWN_SUBCOMMAND",
        command: "git",
        subcommand: sub,
        cwd,
        details: ["Valid: init, hooks, flow, commit, branch, pr, stash, rebase, tag, release, status, log, sync, clean, ignore, changelog, blame, cherry-pick, worktree, bisect, contributors, undo"],
      }));
  }
}

async function isGitAvailable(cwd: string): Promise<boolean> {
  const result = await runCommand("git --version", cwd);
  return result.exitCode === 0;
}

async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await runCommand("git rev-parse --is-inside-work-tree", cwd);
  return result.exitCode === 0 && result.stdout.trim() === "true";
}

async function gitInit(cwd: string, flags: GitFlags): Promise<void> {
  if (await isGitRepo(cwd) && !flags.force) {
    console.log(chalk.yellow("Already a git repository. Use --force to reinitialize."));
    return;
  }

  const config = await loadConfig();
  const branch = config.preferences.defaultBranch;

  await runCommand(`git init -b ${branch}`, cwd);
  console.log(chalk.green(`✓ Initialized git repository (branch: ${branch})`));

  const scan = await scanProject(cwd);
  const gitignoreContent = generateGitignore(scan.language, scan.framework, scan.packageManager);
  const { writeFile } = await import("fs/promises");
  const { join } = await import("path");
  const { existsSync } = await import("fs");

  const gitignorePath = join(cwd, ".gitignore");
  if (!existsSync(gitignorePath) || flags.force) {
    await writeFile(gitignorePath, gitignoreContent);
    console.log(chalk.green("✓ Generated .gitignore based on detected stack"));
  }

  if (scan.packageManager) {
    console.log(chalk.dim(`  Detected: ${scan.language || "unknown"} / ${scan.framework || "none"} / ${scan.packageManager}`));
  }
}

async function gitHooks(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "hooks", cwd }));
    return;
  }

  const action = flags.args?.[0] || "setup";
  const { writeFile, mkdir } = await import("fs/promises");
  const { join } = await import("path");

  const hooksDir = join(cwd, ".git", "hooks");
  await mkdir(hooksDir, { recursive: true });

  if (action === "setup" || action === "install") {
    const scan = await scanProject(cwd);
    const hooks = generateHooks(scan.packageManager, scan.language);

    for (const [name, content] of Object.entries(hooks)) {
      const hookPath = join(hooksDir, name);
      await writeFile(hookPath, content, { mode: 0o755 });
      console.log(chalk.green(`  ✓ ${name}`));
    }
    console.log(chalk.green(`\n✓ Installed ${Object.keys(hooks).length} git hooks`));
  } else if (action === "list") {
    const { readdir } = await import("fs/promises");
    const files = await readdir(hooksDir).catch(() => []);
    const hooks = files.filter(f => !f.endsWith(".sample"));
    if (hooks.length === 0) {
      console.log(chalk.dim("No custom hooks installed."));
    } else {
      console.log(chalk.blue.bold("\n  Git Hooks\n"));
      for (const hook of hooks) {
        console.log(`  ${chalk.green("●")} ${hook}`);
      }
    }
  } else if (action === "remove") {
    const { rm } = await import("fs/promises");
    const { readdir } = await import("fs/promises");
    const files = await readdir(hooksDir).catch(() => []);
    for (const f of files.filter(f => !f.endsWith(".sample"))) {
      await rm(join(hooksDir, f)).catch(() => {});
    }
    console.log(chalk.green("✓ Removed all custom git hooks"));
  }
}

async function gitFlow(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "flow", cwd }));
    return;
  }

  const action = flags.args?.[0] || "status";
  const config = await loadConfig();
  const main = config.preferences.defaultBranch;

  if (action === "feature") {
    const name = flags.args?.[1];
    if (!name) {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "flow", cwd, details: ["Usage: setup git flow feature <name>"] }));
      return;
    }
    await runCommand(`git checkout -b feature/${name}`, cwd);
    console.log(chalk.green(`✓ Created and switched to feature/${name}`));
  } else if (action === "hotfix") {
    const name = flags.args?.[1];
    if (!name) {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "flow", cwd, details: ["Usage: setup git flow hotfix <name>"] }));
      return;
    }
    await runCommand(`git checkout ${main} && git pull && git checkout -b hotfix/${name}`, cwd);
    console.log(chalk.green(`✓ Created hotfix/${name} from ${main}`));
  } else if (action === "release") {
    const version = flags.args?.[1];
    if (!version) {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "flow", cwd, details: ["Usage: setup git flow release <version>"] }));
      return;
    }
    await runCommand(`git checkout -b release/${version}`, cwd);
    console.log(chalk.green(`✓ Created release/${version}`));
  } else if (action === "finish") {
    const result = await runCommand("git branch --show-current", cwd);
    const branch = result.stdout.trim();
    if (branch.startsWith("feature/") || branch.startsWith("hotfix/") || branch.startsWith("release/")) {
      await runCommand(`git checkout ${main} && git merge --no-ff ${branch}`, cwd);
      console.log(chalk.green(`✓ Merged ${branch} into ${main}`));
    } else {
      console.log(chalk.yellow("Not on a flow branch (feature/, hotfix/, release/)."));
    }
  } else {
    const result = await runCommand("git branch --show-current", cwd);
    const branch = result.stdout.trim();
    console.log(chalk.blue.bold("\n  Git Flow Status\n"));
    console.log(`  Current branch: ${chalk.white(branch)}`);
    console.log(`  Main branch:    ${chalk.white(main)}`);
    console.log("");
    console.log(chalk.dim("  Commands: feature <name>, hotfix <name>, release <version>, finish"));
  }
}

async function gitCommit(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "commit", cwd }));
    return;
  }

  const config = await loadConfig();
  const convention = config.preferences.commitConvention;

  const statusResult = await runCommand("git status --porcelain", cwd);
  if (!statusResult.stdout.trim()) {
    console.log(chalk.yellow("Nothing to commit — working tree clean."));
    return;
  }

  const stagedResult = await runCommand("git diff --cached --name-only", cwd);
  if (!stagedResult.stdout.trim()) {
    await runCommand("git add -A", cwd);
    console.log(chalk.dim("  Staged all changes."));
  }

  let message = flags.message || flags.args?.[0];
  if (!message) {
    const diffResult = await runCommand("git diff --cached --stat", cwd);
    console.log(chalk.blue.bold("\n  Changes to commit:\n"));
    console.log(diffResult.stdout);

    if (convention === "conventional" || convention === "angular") {
      console.log(chalk.dim("\n  Format: <type>(<scope>): <description>"));
      console.log(chalk.dim("  Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build"));
    }

    if (process.stdin.isTTY) {
      const { createInterface } = await import("readline");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      message = await new Promise<string>((r) => rl.question("  Commit message: ", r));
      rl.close();
    }
  }

  if (!message || !message.trim()) {
    console.log(chalk.yellow("Commit cancelled — no message provided."));
    return;
  }

  if (convention === "conventional" && !/^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?!?:/.test(message)) {
    console.log(chalk.yellow(`  ⚠ Message doesn't follow conventional commit format.`));
    if (!flags.force) {
      console.log(chalk.dim("  Use --force to commit anyway."));
      return;
    }
  }

  const result = await runCommand(`git commit -m "${message.replace(/"/g, '\\"')}"`, cwd);
  if (result.exitCode === 0) {
    console.log(chalk.green(`✓ Committed: ${message}`));
  } else {
    printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "commit", cwd, details: [result.stderr] }));
  }
}

async function gitBranch(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "branch", cwd }));
    return;
  }

  const action = flags.args?.[0];

  if (!action || action === "list") {
    const result = await runCommand("git branch -a --format='%(refname:short) %(upstream:short) %(committerdate:relative)'", cwd);
    console.log(chalk.blue.bold("\n  Branches\n"));
    const current = (await runCommand("git branch --show-current", cwd)).stdout.trim();
    for (const line of result.stdout.split("\n").filter(Boolean)) {
      const parts = line.split(" ");
      const name = parts[0];
      const marker = name === current ? chalk.green("● ") : "  ";
      console.log(`${marker}${name === current ? chalk.green(name) : chalk.white(name)} ${chalk.dim(parts.slice(1).join(" "))}`);
    }
    console.log("");
  } else if (action === "create") {
    const name = flags.args?.[1];
    if (!name) {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "branch", cwd, details: ["Usage: setup git branch create <name>"] }));
      return;
    }
    const result = await runCommand(`git checkout -b ${name}`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Created and switched to ${name}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_BRANCH_EXISTS", command: "git", subcommand: "branch", cwd, details: [result.stderr] }));
    }
  } else if (action === "delete") {
    const name = flags.args?.[1];
    if (!name) return;
    const flag = flags.force ? "-D" : "-d";
    const result = await runCommand(`git branch ${flag} ${name}`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Deleted branch ${name}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "branch", cwd, details: [result.stderr] }));
    }
  } else if (action === "switch") {
    const name = flags.args?.[1];
    if (!name) return;
    const result = await runCommand(`git checkout ${name}`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Switched to ${name}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "branch", cwd, details: [result.stderr] }));
    }
  } else {
    const result = await runCommand(`git checkout ${action}`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Switched to ${action}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "branch", cwd, details: [result.stderr] }));
    }
  }
}

async function gitPR(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "pr", cwd }));
    return;
  }

  const ghCheck = await runCommand("gh --version", cwd);
  if (ghCheck.exitCode !== 0) {
    console.log(chalk.yellow("GitHub CLI (gh) not installed. Install from https://cli.github.com"));
    console.log(chalk.dim("  Falling back to push + URL..."));
    const branch = (await runCommand("git branch --show-current", cwd)).stdout.trim();
    const pushResult = await runCommand(`git push -u origin ${branch}`, cwd);
    if (pushResult.exitCode === 0) {
      const remote = (await runCommand("git remote get-url origin", cwd)).stdout.trim()
        .replace(/\.git$/, "").replace("git@github.com:", "https://github.com/");
      console.log(chalk.green(`✓ Pushed. Create PR at: ${remote}/compare/${branch}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_PUSH_FAILED", command: "git", subcommand: "pr", cwd, details: [pushResult.stderr] }));
    }
    return;
  }

  const action = flags.args?.[0] || "create";
  if (action === "create") {
    const title = flags.args?.[1] || flags.message;
    const cmd = title ? `gh pr create --title "${title.replace(/"/g, '\\"')}" --fill` : "gh pr create --fill";
    const result = await runCommand(cmd, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ PR created: ${result.stdout.trim()}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "pr", cwd, details: [result.stderr] }));
    }
  } else if (action === "list") {
    const result = await runCommand("gh pr list", cwd);
    console.log(result.stdout || chalk.dim("No open PRs."));
  } else if (action === "status") {
    const result = await runCommand("gh pr status", cwd);
    console.log(result.stdout);
  }
}

async function gitStash(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "stash", cwd }));
    return;
  }

  const action = flags.args?.[0] || "push";

  if (action === "push" || action === "save") {
    const message = flags.args?.slice(1).join(" ") || flags.message || "";
    const cmd = message ? `git stash push -m "${message.replace(/"/g, '\\"')}"` : "git stash push";
    const result = await runCommand(cmd, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Stashed changes${message ? `: ${message}` : ""}`));
    } else {
      console.log(chalk.yellow("Nothing to stash."));
    }
  } else if (action === "pop") {
    const result = await runCommand("git stash pop", cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green("✓ Applied and dropped latest stash"));
    } else {
      printPlainError(createPSetupError({ code: "GIT_MERGE_CONFLICT", command: "git", subcommand: "stash", cwd, details: [result.stderr] }));
    }
  } else if (action === "list") {
    const result = await runCommand("git stash list", cwd);
    if (!result.stdout.trim()) {
      console.log(chalk.dim("No stashes."));
    } else {
      console.log(chalk.blue.bold("\n  Stash List\n"));
      console.log(result.stdout);
    }
  } else if (action === "apply") {
    const index = flags.args?.[1] || "0";
    const result = await runCommand(`git stash apply stash@{${index}}`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Applied stash@{${index}}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "stash", cwd, details: [result.stderr] }));
    }
  } else if (action === "drop") {
    const index = flags.args?.[1] || "0";
    const result = await runCommand(`git stash drop stash@{${index}}`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Dropped stash@{${index}}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "stash", cwd, details: [result.stderr] }));
    }
  } else if (action === "clear") {
    if (!flags.force) {
      console.log(chalk.yellow("This will delete all stashes. Use --force to confirm."));
      return;
    }
    await runCommand("git stash clear", cwd);
    console.log(chalk.green("✓ Cleared all stashes"));
  }
}

async function gitRebase(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "rebase", cwd }));
    return;
  }

  const target = flags.args?.[0];
  if (!target) {
    const config = await loadConfig();
    const main = config.preferences.defaultBranch;
    console.log(chalk.blue(`Rebasing onto ${main}...`));
    const result = await runCommand(`git rebase ${main}`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Rebased onto ${main}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_MERGE_CONFLICT", command: "git", subcommand: "rebase", cwd, details: ["Run 'git rebase --abort' to cancel or resolve conflicts manually."] }));
    }
    return;
  }

  if (target === "abort") {
    await runCommand("git rebase --abort", cwd);
    console.log(chalk.green("✓ Rebase aborted"));
  } else if (target === "continue") {
    const result = await runCommand("git rebase --continue", cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green("✓ Rebase continued"));
    } else {
      printPlainError(createPSetupError({ code: "GIT_MERGE_CONFLICT", command: "git", subcommand: "rebase", cwd, details: [result.stderr] }));
    }
  } else {
    const result = await runCommand(`git rebase ${target}`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Rebased onto ${target}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_MERGE_CONFLICT", command: "git", subcommand: "rebase", cwd, details: [result.stderr] }));
    }
  }
}

async function gitTag(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "tag", cwd }));
    return;
  }

  const action = flags.args?.[0];

  if (!action || action === "list") {
    const result = await runCommand("git tag -l --sort=-creatordate", cwd);
    if (!result.stdout.trim()) {
      console.log(chalk.dim("No tags."));
    } else {
      console.log(chalk.blue.bold("\n  Tags\n"));
      for (const tag of result.stdout.trim().split("\n").slice(0, 20)) {
        console.log(`  ${chalk.green(tag)}`);
      }
    }
  } else if (action === "create") {
    const version = flags.args?.[1];
    if (!version) {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "tag", cwd, details: ["Usage: setup git tag create <version>"] }));
      return;
    }
    const message = flags.message || `Release ${version}`;
    const result = await runCommand(`git tag -a "${version}" -m "${message.replace(/"/g, '\\"')}"`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Created tag ${version}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "tag", cwd, details: [result.stderr] }));
    }
  } else if (action === "push") {
    const result = await runCommand("git push --tags", cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green("✓ Pushed all tags to remote"));
    } else {
      printPlainError(createPSetupError({ code: "GIT_PUSH_FAILED", command: "git", subcommand: "tag", cwd, details: [result.stderr] }));
    }
  } else if (action === "delete") {
    const tag = flags.args?.[1];
    if (!tag) return;
    await runCommand(`git tag -d ${tag}`, cwd);
    console.log(chalk.green(`✓ Deleted local tag ${tag}`));
  } else {
    const version = action;
    const message = flags.message || `Release ${version}`;
    const result = await runCommand(`git tag -a "${version}" -m "${message.replace(/"/g, '\\"')}"`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Created tag ${version}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "tag", cwd, details: [result.stderr] }));
    }
  }
}

async function gitRelease(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "release", cwd }));
    return;
  }

  const version = flags.args?.[0];
  if (!version) {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    try {
      const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8"));
      console.log(chalk.blue.bold("\n  Release Info\n"));
      console.log(`  Current version: ${chalk.white(pkg.version || "unknown")}`);
      console.log(chalk.dim("\n  Usage: setup git release <version>"));
      console.log(chalk.dim("  Example: setup git release 1.2.0"));
    } catch {
      console.log(chalk.dim("Usage: setup git release <version>"));
    }
    return;
  }

  console.log(chalk.blue(`Creating release ${version}...`));

  const { readFile, writeFile } = await import("fs/promises");
  const { join } = await import("path");

  try {
    const pkgPath = join(cwd, "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    pkg.version = version;
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log(chalk.green(`  ✓ Updated package.json version to ${version}`));
  } catch {}

  await runCommand("git add -A", cwd);
  await runCommand(`git commit -m "chore: release ${version}"`, cwd);
  console.log(chalk.green(`  ✓ Committed release`));

  await runCommand(`git tag -a "v${version}" -m "Release ${version}"`, cwd);
  console.log(chalk.green(`  ✓ Tagged v${version}`));

  const ghCheck = await runCommand("gh --version", cwd);
  if (ghCheck.exitCode === 0) {
    const result = await runCommand(`gh release create "v${version}" --title "v${version}" --generate-notes`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`  ✓ GitHub release created`));
    }
  }

  console.log(chalk.green(`\n✓ Release ${version} complete`));
  console.log(chalk.dim("  Push with: git push && git push --tags"));
}

async function gitStatus(cwd: string): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "status", cwd }));
    return;
  }

  const [branchResult, statusResult, aheadBehind] = await Promise.all([
    runCommand("git branch --show-current", cwd),
    runCommand("git status --porcelain", cwd),
    runCommand("git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null", cwd),
  ]);

  const branch = branchResult.stdout.trim();
  const lines = statusResult.stdout.trim().split("\n").filter(Boolean);

  console.log(chalk.blue.bold("\n  Git Status\n"));
  console.log(`  Branch: ${chalk.green(branch)}`);

  if (aheadBehind.exitCode === 0) {
    const [ahead, behind] = aheadBehind.stdout.trim().split(/\s+/).map(Number);
    if (ahead > 0) console.log(chalk.yellow(`  ↑ ${ahead} commit${ahead > 1 ? "s" : ""} ahead`));
    if (behind > 0) console.log(chalk.yellow(`  ↓ ${behind} commit${behind > 1 ? "s" : ""} behind`));
    if (ahead === 0 && behind === 0) console.log(chalk.green("  ✓ Up to date with remote"));
  }

  if (lines.length === 0) {
    console.log(chalk.green("  ✓ Working tree clean"));
  } else {
    const staged = lines.filter(l => l[0] !== " " && l[0] !== "?");
    const modified = lines.filter(l => l[1] !== " " && l[0] !== "?");
    const untracked = lines.filter(l => l.startsWith("??"));

    if (staged.length > 0) console.log(chalk.green(`  ${staged.length} staged`));
    if (modified.length > 0) console.log(chalk.yellow(`  ${modified.length} modified`));
    if (untracked.length > 0) console.log(chalk.dim(`  ${untracked.length} untracked`));
  }
  console.log("");
}

async function gitLog(cwd: string): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "log", cwd }));
    return;
  }

  const result = await runCommand('git log --oneline --graph --decorate -20', cwd);
  console.log(chalk.blue.bold("\n  Recent Commits\n"));
  console.log(result.stdout);
}

async function gitSync(cwd: string): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "sync", cwd }));
    return;
  }

  console.log(chalk.blue("Syncing with remote..."));

  const pullResult = await runCommand("git pull --rebase", cwd);
  if (pullResult.exitCode === 0) {
    console.log(chalk.green("  ✓ Pulled latest changes"));
  } else if (pullResult.stderr.includes("conflict")) {
    printPlainError(createPSetupError({ code: "GIT_MERGE_CONFLICT", command: "git", subcommand: "sync", cwd, details: [pullResult.stderr] }));
    return;
  }

  const pushResult = await runCommand("git push", cwd);
  if (pushResult.exitCode === 0) {
    console.log(chalk.green("  ✓ Pushed local commits"));
  } else if (pushResult.exitCode !== 0 && pushResult.stderr.includes("no upstream")) {
    const branch = (await runCommand("git branch --show-current", cwd)).stdout.trim();
    await runCommand(`git push -u origin ${branch}`, cwd);
    console.log(chalk.green(`  ✓ Set upstream and pushed ${branch}`));
  }

  console.log(chalk.green("\n✓ Synced"));
}

async function gitClean(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "clean", cwd }));
    return;
  }

  const action = flags.args?.[0] || "merged";

  if (action === "merged") {
    const config = await loadConfig();
    const main = config.preferences.defaultBranch;
    const result = await runCommand(`git branch --merged ${main}`, cwd);
    const branches = result.stdout.trim().split("\n")
      .map(b => b.trim())
      .filter(b => b && !b.startsWith("*") && b !== main && b !== "master" && b !== "develop");

    if (branches.length === 0) {
      console.log(chalk.green("✓ No merged branches to clean."));
      return;
    }

    console.log(chalk.blue(`Found ${branches.length} merged branch(es):`));
    for (const b of branches) {
      console.log(chalk.dim(`  ${b}`));
    }

    if (flags.force) {
      for (const b of branches) {
        await runCommand(`git branch -d ${b}`, cwd);
      }
      console.log(chalk.green(`✓ Deleted ${branches.length} merged branches`));
    } else {
      console.log(chalk.dim("\n  Use --force to delete them."));
    }
  }
}

function generateGitignore(language: string | null, framework: string | null, pm: string | null): string {
  const lang = (language || "").toLowerCase();
  const lines: string[] = ["# Dependencies", "node_modules/", ".pnp.*", ".yarn/"];

  if (pm === "pnpm") lines.push(".pnpm-store/");

  lines.push("", "# Build output", "dist/", "build/", "out/", ".next/", ".nuxt/", ".output/");

  if (lang === "typescript" || lang === "javascript") {
    lines.push("", "# TypeScript", "*.tsbuildinfo");
  }
  if (lang === "python") {
    lines.push("", "# Python", "__pycache__/", "*.py[cod]", ".venv/", "venv/", "*.egg-info/");
  }
  if (lang === "rust") {
    lines.push("", "# Rust", "target/", "Cargo.lock");
  }
  if (lang === "go") {
    lines.push("", "# Go", "vendor/");
  }

  lines.push("", "# Environment", ".env", ".env.local", ".env.*.local");
  lines.push("", "# IDE", ".vscode/", ".idea/", "*.swp", "*.swo", ".DS_Store");
  lines.push("", "# Testing", "coverage/", ".nyc_output/");
  lines.push("", "# Logs", "*.log", "npm-debug.log*", "yarn-debug.log*", "pnpm-debug.log*");
  lines.push("", "# P-Setup", ".p-setup/");

  return lines.join("\n") + "\n";
}

async function gitIgnore(cwd: string, flags: GitFlags): Promise<void> {
  const { writeFile } = await import("fs/promises");
  const { join } = await import("path");
  const { existsSync } = await import("fs");

  const scan = await scanProject(cwd);
  const content = generateGitignore(scan.language, scan.framework, scan.packageManager);
  const gitignorePath = join(cwd, ".gitignore");

  if (existsSync(gitignorePath) && !flags.force) {
    // Append new entries that aren't already present
    const { readFile } = await import("fs/promises");
    const existing = await readFile(gitignorePath, "utf-8");
    const existingLines = new Set(existing.split("\n").map(l => l.trim()));
    const newEntries = content.split("\n").filter(l => l.trim() && !l.startsWith("#") && !existingLines.has(l.trim()));

    if (newEntries.length === 0) {
      console.log(chalk.green("✓ .gitignore is already comprehensive."));
      return;
    }

    const updated = existing.trimEnd() + "\n\n# Added by P-Setup\n" + newEntries.join("\n") + "\n";
    await writeFile(gitignorePath, updated);
    console.log(chalk.green(`✓ Added ${newEntries.length} entries to .gitignore`));
  } else {
    await writeFile(gitignorePath, content);
    console.log(chalk.green("✓ Generated .gitignore"));
  }
  console.log(chalk.dim(`  Stack: ${scan.language || "unknown"} / ${scan.framework || "none"} / ${scan.packageManager || "npm"}`));
}

async function gitChangelog(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "changelog", cwd }));
    return;
  }

  const sinceTag = flags.args?.[0];
  const cmd = sinceTag
    ? `git log ${sinceTag}..HEAD --pretty=format:"%h %s (%an, %ar)"`
    : `git log --pretty=format:"%h %s (%an, %ar)" -50`;

  const result = await runCommand(cmd, cwd);
  if (!result.stdout.trim()) {
    console.log(chalk.dim("No commits found."));
    return;
  }

  const lines = result.stdout.trim().split("\n");
  const groups: Record<string, string[]> = {
    feat: [], fix: [], docs: [], refactor: [], chore: [], other: [],
  };

  for (const line of lines) {
    const match = line.match(/^[a-f0-9]+ (feat|fix|docs|refactor|chore|perf|test|ci|build|style|revert)(\(.+?\))?:?\s*(.+)$/);
    if (match) {
      const type = match[1] === "perf" || match[1] === "test" || match[1] === "ci" || match[1] === "build" || match[1] === "style" || match[1] === "revert" ? "other" : match[1];
      groups[type].push(line);
    } else {
      groups.other.push(line);
    }
  }

  console.log(chalk.blue.bold("\n  Changelog\n"));
  if (sinceTag) console.log(chalk.dim(`  Since: ${sinceTag}\n`));

  const labels: Record<string, string> = {
    feat: "Features", fix: "Bug Fixes", docs: "Documentation", refactor: "Refactoring", chore: "Chores", other: "Other",
  };

  for (const [type, commits] of Object.entries(groups)) {
    if (commits.length === 0) continue;
    console.log(chalk.white(`  ${labels[type]} (${commits.length})`));
    for (const c of commits.slice(0, 10)) {
      console.log(chalk.dim(`    ${c}`));
    }
    if (commits.length > 10) console.log(chalk.dim(`    ... and ${commits.length - 10} more`));
    console.log("");
  }

  // Optionally write to file
  if (flags.force) {
    const { writeFile } = await import("fs/promises");
    const { join } = await import("path");
    let md = `# Changelog\n\n`;
    if (sinceTag) md += `## Changes since ${sinceTag}\n\n`;
    for (const [type, commits] of Object.entries(groups)) {
      if (commits.length === 0) continue;
      md += `### ${labels[type]}\n\n`;
      for (const c of commits) md += `- ${c}\n`;
      md += "\n";
    }
    await writeFile(join(cwd, "CHANGELOG.md"), md);
    console.log(chalk.green("✓ Written to CHANGELOG.md"));
  }
}

async function gitBlame(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "blame", cwd }));
    return;
  }

  const file = flags.args?.[0];
  if (!file) {
    printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "blame", cwd, details: ["Usage: setup git blame <file>"] }));
    return;
  }

  const lineRange = flags.args?.[1];
  const cmd = lineRange
    ? `git blame -L ${lineRange} "${file}"`
    : `git blame --color-lines "${file}" | head -40`;

  const result = await runCommand(cmd, cwd);
  if (result.exitCode === 0) {
    console.log(chalk.blue.bold(`\n  Blame: ${file}\n`));
    console.log(result.stdout);
  } else {
    printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "blame", cwd, details: [result.stderr] }));
  }
}

async function gitCherryPick(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "cherry-pick", cwd }));
    return;
  }

  const commit = flags.args?.[0];
  if (!commit) {
    printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "cherry-pick", cwd, details: ["Usage: setup git cherry-pick <commit-hash>"] }));
    return;
  }

  if (commit === "abort") {
    await runCommand("git cherry-pick --abort", cwd);
    console.log(chalk.green("✓ Cherry-pick aborted"));
    return;
  }
  if (commit === "continue") {
    const result = await runCommand("git cherry-pick --continue", cwd);
    if (result.exitCode === 0) console.log(chalk.green("✓ Cherry-pick continued"));
    else printPlainError(createPSetupError({ code: "GIT_MERGE_CONFLICT", command: "git", subcommand: "cherry-pick", cwd, details: [result.stderr] }));
    return;
  }

  const result = await runCommand(`git cherry-pick ${commit}`, cwd);
  if (result.exitCode === 0) {
    console.log(chalk.green(`✓ Cherry-picked ${commit}`));
  } else {
    printPlainError(createPSetupError({ code: "GIT_MERGE_CONFLICT", command: "git", subcommand: "cherry-pick", cwd, details: ["Resolve conflicts, then run: setup git cherry-pick continue"] }));
  }
}

async function gitWorktree(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "worktree", cwd }));
    return;
  }

  const action = flags.args?.[0] || "list";

  if (action === "list") {
    const result = await runCommand("git worktree list", cwd);
    console.log(chalk.blue.bold("\n  Worktrees\n"));
    console.log(result.stdout || chalk.dim("  Only main worktree."));
  } else if (action === "add") {
    const branch = flags.args?.[1];
    const path = flags.args?.[2] || `../${branch}`;
    if (!branch) {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "worktree", cwd, details: ["Usage: setup git worktree add <branch> [path]"] }));
      return;
    }
    const result = await runCommand(`git worktree add "${path}" ${branch}`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Created worktree at ${path} (branch: ${branch})`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "worktree", cwd, details: [result.stderr] }));
    }
  } else if (action === "remove") {
    const path = flags.args?.[1];
    if (!path) return;
    const result = await runCommand(`git worktree remove "${path}"`, cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green(`✓ Removed worktree at ${path}`));
    } else {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "worktree", cwd, details: [result.stderr] }));
    }
  } else if (action === "prune") {
    await runCommand("git worktree prune", cwd);
    console.log(chalk.green("✓ Pruned stale worktree references"));
  }
}

async function gitBisect(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "bisect", cwd }));
    return;
  }

  const action = flags.args?.[0] || "status";

  if (action === "start") {
    const bad = flags.args?.[1] || "HEAD";
    const good = flags.args?.[2];
    if (!good) {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "bisect", cwd, details: ["Usage: setup git bisect start [bad] <good>"] }));
      return;
    }
    await runCommand(`git bisect start ${bad} ${good}`, cwd);
    console.log(chalk.green(`✓ Bisect started (bad: ${bad}, good: ${good})`));
    console.log(chalk.dim("  Test this commit, then run: setup git bisect good/bad"));
  } else if (action === "good") {
    const result = await runCommand("git bisect good", cwd);
    console.log(result.stdout);
  } else if (action === "bad") {
    const result = await runCommand("git bisect bad", cwd);
    console.log(result.stdout);
  } else if (action === "reset") {
    await runCommand("git bisect reset", cwd);
    console.log(chalk.green("✓ Bisect session ended"));
  } else if (action === "status") {
    const result = await runCommand("git bisect log 2>/dev/null || echo 'No active bisect session'", cwd);
    console.log(result.stdout);
  }
}

async function gitContributors(cwd: string): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "contributors", cwd }));
    return;
  }

  const result = await runCommand("git shortlog -sn --no-merges HEAD", cwd);
  if (!result.stdout.trim()) {
    console.log(chalk.dim("No contributors found."));
    return;
  }

  console.log(chalk.blue.bold("\n  Contributors\n"));
  const lines = result.stdout.trim().split("\n");
  for (const line of lines.slice(0, 20)) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (match) {
      console.log(`  ${chalk.white(match[2].padEnd(30))} ${chalk.dim(match[1] + " commits")}`);
    }
  }
  if (lines.length > 20) console.log(chalk.dim(`\n  ... and ${lines.length - 20} more`));
  console.log("");
}

async function gitUndo(cwd: string, flags: GitFlags): Promise<void> {
  if (!await isGitRepo(cwd)) {
    printPlainError(createPSetupError({ code: "GIT_NOT_A_REPO", command: "git", subcommand: "undo", cwd }));
    return;
  }

  const action = flags.args?.[0] || "commit";

  if (action === "commit") {
    const result = await runCommand("git reset --soft HEAD~1", cwd);
    if (result.exitCode === 0) {
      console.log(chalk.green("✓ Undid last commit (changes kept staged)"));
    } else {
      printPlainError(createPSetupError({ code: "GIT_COMMAND_FAILED", command: "git", subcommand: "undo", cwd, details: [result.stderr] }));
    }
  } else if (action === "stage" || action === "add") {
    await runCommand("git reset HEAD", cwd);
    console.log(chalk.green("✓ Unstaged all changes"));
  } else if (action === "changes") {
    if (!flags.force) {
      console.log(chalk.yellow("This will discard all uncommitted changes. Use --force to confirm."));
      return;
    }
    await runCommand("git checkout -- .", cwd);
    console.log(chalk.green("✓ Discarded all uncommitted changes"));
  } else {
    console.log(chalk.dim("  Usage: setup git undo [commit|stage|changes]"));
    console.log(chalk.dim("  commit  — undo last commit (keep changes staged)"));
    console.log(chalk.dim("  stage   — unstage all changes"));
    console.log(chalk.dim("  changes — discard all uncommitted changes (--force required)"));
  }
}

function generateHooks(pm: string | null, language: string | null): Record<string, string> {
  const runner = pm || "npm";
  const lang = (language || "").toLowerCase();
  const hooks: Record<string, string> = {};

  hooks["pre-commit"] = `#!/bin/sh
# P-Setup pre-commit hook
# Run lint and format checks before committing

${runner} run lint 2>/dev/null
if [ $? -ne 0 ]; then
  echo "\\n❌ Lint failed. Fix errors before committing."
  exit 1
fi

${lang === "typescript" ? `${runner} run typecheck 2>/dev/null
if [ $? -ne 0 ]; then
  echo "\\n❌ Type check failed. Fix type errors before committing."
  exit 1
fi` : ""}
`;

  hooks["commit-msg"] = `#!/bin/sh
# P-Setup commit-msg hook
# Validates conventional commit format

MSG=$(cat "$1")
PATTERN="^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\\(.+\\))?!?: .+"

if ! echo "$MSG" | grep -qE "$PATTERN"; then
  echo "\\n❌ Commit message does not follow conventional format."
  echo "   Format: <type>(<scope>): <description>"
  echo "   Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert"
  exit 1
fi
`;

  hooks["pre-push"] = `#!/bin/sh
# P-Setup pre-push hook
# Run tests before pushing

${runner} run test 2>/dev/null
if [ $? -ne 0 ]; then
  echo "\\n❌ Tests failed. Fix before pushing."
  exit 1
fi
`;

  return hooks;
}
