import chalk from "chalk";
import { readdir, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createSetuprError, printPlainError } from "../../errors/index.js";

interface InitFlags {
  force?: boolean;
  args?: string[];
  template?: string;
  [key: string]: unknown;
}

export async function cmdInit(cwd: string, flags: InitFlags): Promise<void> {
  const template = flags.args?.[0] || flags.template || "detect";

  if (template === "detect" || template === "auto") {
    return initFromDetection(cwd, flags);
  }

  return initFromTemplate(cwd, template, flags);
}

async function initFromDetection(cwd: string, flags: InitFlags): Promise<void> {
  const files = await readdir(cwd).catch(() => []);
  const hasProject = files.some(f =>
    ["package.json", "Cargo.toml", "go.mod", "pyproject.toml", "setup.py", "Gemfile", "pubspec.yaml"].includes(f)
  );

  if (hasProject && !flags.force) {
    printPlainError(createSetuprError({ code: "INIT_ALREADY_EXISTS", command: "init", cwd }));
    return;
  }

  console.log(chalk.blue.bold("\n  Setupr Init\n"));

  let language = "javascript";
  let pm = "npm";
  let framework: string | null = null;

  if (process.stdin.isTTY) {
    const { createInterface } = await import("readline");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string, def: string): Promise<string> =>
      new Promise((r) => rl.question(`  ${q} [${def}]: `, (a) => r(a.trim() || def)));

    language = await ask("Language (javascript/typescript/python/rust/go)", "typescript");
    pm = await ask("Package manager (npm/yarn/pnpm/bun/pip/cargo)", language === "typescript" || language === "javascript" ? "npm" : "none");
    framework = await ask("Framework (react/next/express/fastify/none)", "none") || null;
    if (framework === "none") framework = null;
    rl.close();
  }

  console.log(chalk.dim(`\n  Scaffolding ${language} project...`));

  if (language === "typescript" || language === "javascript") {
    await scaffoldNode(cwd, language, pm, framework);
  } else if (language === "python") {
    await scaffoldPython(cwd);
  } else if (language === "rust") {
    await scaffoldRust(cwd);
  } else if (language === "go") {
    await scaffoldGo(cwd);
  }

  console.log(chalk.green("\n✓ Project initialized"));
  console.log(chalk.dim("  Next: setup (to install and configure)"));
}

async function scaffoldNode(cwd: string, language: string, pm: string, framework: string | null): Promise<void> {
  const isTs = language === "typescript";
  const pkg = {
    name: cwd.split("/").pop() || "my-project",
    version: "0.1.0",
    description: "",
    type: "module",
    scripts: {
      dev: framework === "next" ? "next dev" : "node --watch src/index.js",
      build: isTs ? "tsc" : "echo 'No build step'",
      start: "node dist/index.js",
      test: "echo 'No tests configured'",
      lint: isTs ? "eslint src/" : "echo 'No linter configured'",
      ...(isTs ? { typecheck: "tsc --noEmit" } : {}),
    },
    dependencies: {} as Record<string, string>,
    devDependencies: {} as Record<string, string>,
  };

  if (isTs) {
    pkg.devDependencies.typescript = "^5.7.0";
    pkg.devDependencies["@types/node"] = "^22.0.0";
  }
  if (framework === "express") {
    pkg.dependencies.express = "^4.21.0";
    if (isTs) pkg.devDependencies["@types/express"] = "^5.0.0";
  }

  await writeFile(join(cwd, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  console.log(chalk.green("  ✓ package.json"));

  if (isTs) {
    const tsconfig = {
      compilerOptions: {
        target: "ES2022", module: "ESNext", moduleResolution: "bundler",
        outDir: "./dist", rootDir: "./src", strict: true,
        esModuleInterop: true, skipLibCheck: true, declaration: true,
      },
      include: ["src/**/*"],
      exclude: ["node_modules", "dist"],
    };
    await writeFile(join(cwd, "tsconfig.json"), JSON.stringify(tsconfig, null, 2) + "\n");
    console.log(chalk.green("  ✓ tsconfig.json"));
  }

  await mkdir(join(cwd, "src"), { recursive: true });
  const ext = isTs ? "ts" : "js";
  const main = framework === "express"
    ? `import express from "express";\n\nconst app = express();\nconst port = process.env.PORT || 3000;\n\napp.get("/", (req, res) => {\n  res.json({ status: "ok" });\n});\n\napp.listen(port, () => {\n  console.log(\`Server running on port \${port}\`);\n});\n`
    : `console.log("Hello from ${pkg.name}");\n`;
  await writeFile(join(cwd, `src/index.${ext}`), main);
  console.log(chalk.green(`  ✓ src/index.${ext}`));

  const envExample = "# Environment variables\nNODE_ENV=development\nPORT=3000\n";
  await writeFile(join(cwd, ".env.example"), envExample);
  console.log(chalk.green("  ✓ .env.example"));
}

async function scaffoldPython(cwd: string): Promise<void> {
  const pyproject = `[project]\nname = "${cwd.split("/").pop() || "my-project"}"\nversion = "0.1.0"\nrequires-python = ">=3.11"\ndependencies = []\n\n[project.scripts]\ndev = "python -m src.main"\n`;
  await writeFile(join(cwd, "pyproject.toml"), pyproject);
  console.log(chalk.green("  ✓ pyproject.toml"));

  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src/__init__.py"), "");
  await writeFile(join(cwd, "src/main.py"), 'def main():\n    print("Hello")\n\nif __name__ == "__main__":\n    main()\n');
  console.log(chalk.green("  ✓ src/main.py"));

  await writeFile(join(cwd, "requirements.txt"), "");
  console.log(chalk.green("  ✓ requirements.txt"));
}

async function scaffoldRust(cwd: string): Promise<void> {
  const name = cwd.split("/").pop() || "my-project";
  const cargo = `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n`;
  await writeFile(join(cwd, "Cargo.toml"), cargo);
  console.log(chalk.green("  ✓ Cargo.toml"));

  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src/main.rs"), 'fn main() {\n    println!("Hello from {name}");\n}\n');
  console.log(chalk.green("  ✓ src/main.rs"));
}

async function scaffoldGo(cwd: string): Promise<void> {
  const name = cwd.split("/").pop() || "my-project";
  await writeFile(join(cwd, "go.mod"), `module ${name}\n\ngo 1.22\n`);
  console.log(chalk.green("  ✓ go.mod"));

  await writeFile(join(cwd, "main.go"), 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello")\n}\n');
  console.log(chalk.green("  ✓ main.go"));
}

async function initFromTemplate(cwd: string, template: string, _flags: InitFlags): Promise<void> {
  const builtinTemplates: Record<string, () => Promise<void>> = {
    "node": () => scaffoldNode(cwd, "typescript", "npm", null),
    "javascript": () => scaffoldNode(cwd, "javascript", "npm", null),
    "typescript": () => scaffoldNode(cwd, "typescript", "npm", null),
    "python": () => scaffoldPython(cwd),
    "rust": () => scaffoldRust(cwd),
    "go": () => scaffoldGo(cwd),
    "express-api": () => scaffoldNode(cwd, "typescript", "npm", "express"),
    "react-app": () => scaffoldReactApp(cwd),
    "cli-tool": () => scaffoldCLI(cwd),
    "monorepo": () => scaffoldMonorepo(cwd),
  };

  if (builtinTemplates[template]) {
    console.log(chalk.blue(`Scaffolding from template: ${template}`));
    await builtinTemplates[template]();
    console.log(chalk.green(`\n✓ Initialized from template: ${template}`));
    return;
  }

  if (template.includes("/")) {
    console.log(chalk.blue(`Fetching template from: ${template}`));
    printPlainError(createSetuprError({
      code: "TEMPLATE_FETCH_FAILED",
      command: "init",
      cwd,
      details: [`Remote templates require: setup template new ${template}`],
    }));
    return;
  }

  printPlainError(createSetuprError({
    code: "TEMPLATE_NOT_FOUND",
    command: "init",
    cwd,
    details: [`Template "${template}" not found.`, `Available: express-api, react-app, cli-tool, monorepo`],
  }));
}

async function scaffoldReactApp(cwd: string): Promise<void> {
  const pkg = {
    name: cwd.split("/").pop() || "react-app",
    version: "0.1.0",
    type: "module",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
    dependencies: { react: "^18.3.0", "react-dom": "^18.3.0" },
    devDependencies: { vite: "^6.0.0", "@vitejs/plugin-react": "^4.3.0", typescript: "^5.7.0", "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0" },
  };
  await writeFile(join(cwd, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src/App.tsx"), 'export default function App() {\n  return <h1>Hello World</h1>;\n}\n');
  await writeFile(join(cwd, "src/main.tsx"), 'import { createRoot } from "react-dom/client";\nimport App from "./App";\n\ncreateRoot(document.getElementById("root")!).render(<App />);\n');
  await writeFile(join(cwd, "index.html"), '<!DOCTYPE html>\n<html><head><title>App</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n');
  console.log(chalk.green("  ✓ React + Vite + TypeScript project"));
}

async function scaffoldCLI(cwd: string): Promise<void> {
  const pkg = {
    name: cwd.split("/").pop() || "my-cli",
    version: "0.1.0",
    type: "module",
    bin: { [cwd.split("/").pop() || "my-cli"]: "./dist/index.js" },
    scripts: { dev: "tsup --watch", build: "tsup", start: "node dist/index.js" },
    devDependencies: { tsup: "^8.3.0", typescript: "^5.7.0", "@types/node": "^22.0.0" },
  };
  await writeFile(join(cwd, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src/index.ts"), '#!/usr/bin/env node\nconsole.log("Hello from CLI");\n');
  console.log(chalk.green("  ✓ CLI tool (TypeScript + tsup)"));
}

async function scaffoldMonorepo(cwd: string): Promise<void> {
  const pkg = {
    name: cwd.split("/").pop() || "monorepo",
    version: "0.1.0",
    private: true,
    workspaces: ["packages/*"],
    scripts: { dev: "turbo dev", build: "turbo build", test: "turbo test" },
    devDependencies: { turbo: "^2.0.0", typescript: "^5.7.0" },
  };
  await writeFile(join(cwd, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  await writeFile(join(cwd, "turbo.json"), JSON.stringify({ $schema: "https://turbo.build/schema.json", tasks: { build: { dependsOn: ["^build"], outputs: ["dist/**"] }, dev: { cache: false, persistent: true }, test: {} } }, null, 2) + "\n");
  await mkdir(join(cwd, "packages/shared/src"), { recursive: true });
  await writeFile(join(cwd, "packages/shared/package.json"), JSON.stringify({ name: "@monorepo/shared", version: "0.1.0", type: "module", main: "./dist/index.js", scripts: { build: "tsc", dev: "tsc --watch" } }, null, 2) + "\n");
  await writeFile(join(cwd, "packages/shared/src/index.ts"), 'export const hello = "world";\n');
  console.log(chalk.green("  ✓ Monorepo (Turborepo + workspaces)"));
}
