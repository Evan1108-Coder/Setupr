import chalk from "chalk";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { createPSetupError, printPlainError } from "../../errors/index.js";

interface ScaffoldFlags {
  force?: boolean;
  args?: string[];
  [key: string]: unknown;
}

export async function cmdScaffold(sub: string | undefined, cwd: string, flags: ScaffoldFlags): Promise<void> {
  const target = sub || "help";

  switch (target) {
    case "component": return scaffoldComponent(cwd, flags);
    case "page": return scaffoldPage(cwd, flags);
    case "api": return scaffoldAPI(cwd, flags);
    case "hook": return scaffoldHook(cwd, flags);
    case "model": return scaffoldModel(cwd, flags);
    case "test": return scaffoldTest(cwd, flags);
    case "service": return scaffoldService(cwd, flags);
    case "middleware": return scaffoldMiddleware(cwd, flags);
    case "help":
      console.log(chalk.blue.bold("\n  Scaffold — Quick file generators\n"));
      console.log("  Usage: setup scaffold <type> <name>\n");
      console.log("  Types:");
      console.log(`    ${chalk.green("component")}   React/Vue component`);
      console.log(`    ${chalk.green("page")}        Page/route component`);
      console.log(`    ${chalk.green("api")}         API endpoint/route handler`);
      console.log(`    ${chalk.green("hook")}        React hook / composable`);
      console.log(`    ${chalk.green("model")}       Data model / schema`);
      console.log(`    ${chalk.green("test")}        Test file for existing module`);
      console.log(`    ${chalk.green("service")}     Service class / module`);
      console.log(`    ${chalk.green("middleware")}  Middleware function`);
      console.log("");
      break;
    default:
      printPlainError(createPSetupError({
        code: "UNKNOWN_SUBCOMMAND",
        command: "scaffold",
        subcommand: sub,
        cwd,
        details: ["Valid: component, page, api, hook, model, test, service, middleware"],
      }));
  }
}

async function scaffoldComponent(cwd: string, flags: ScaffoldFlags): Promise<void> {
  const name = flags.args?.[0];
  if (!name) { console.log(chalk.yellow("Usage: setup scaffold component <Name>")); return; }

  const pascal = toPascalCase(name);
  const dir = join(cwd, "src", "components", pascal);
  await mkdir(dir, { recursive: true });

  const tsx = `interface ${pascal}Props {
  className?: string;
}

export function ${pascal}({ className }: ${pascal}Props) {
  return (
    <div className={className}>
      <h2>${pascal}</h2>
    </div>
  );
}
`;

  const testContent = `import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ${pascal} } from "./${pascal}";

describe("${pascal}", () => {
  it("renders without crashing", () => {
    const { getByText } = render(<${pascal} />);
    expect(getByText("${pascal}")).toBeTruthy();
  });
});
`;

  await writeFile(join(dir, `${pascal}.tsx`), tsx);
  await writeFile(join(dir, `${pascal}.test.tsx`), testContent);
  await writeFile(join(dir, "index.ts"), `export { ${pascal} } from "./${pascal}";\n`);

  console.log(chalk.green(`✓ Created component: ${pascal}`));
  console.log(chalk.dim(`  ${dir}/${pascal}.tsx`));
  console.log(chalk.dim(`  ${dir}/${pascal}.test.tsx`));
  console.log(chalk.dim(`  ${dir}/index.ts`));
}

async function scaffoldPage(cwd: string, flags: ScaffoldFlags): Promise<void> {
  const name = flags.args?.[0];
  if (!name) { console.log(chalk.yellow("Usage: setup scaffold page <Name>")); return; }

  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  // Detect if Next.js or standard routing
  const isNextApp = existsSync(join(cwd, "src", "app")) || existsSync(join(cwd, "app"));
  const isNextPages = existsSync(join(cwd, "src", "pages")) || existsSync(join(cwd, "pages"));

  let filePath: string;
  let content: string;

  if (isNextApp) {
    const dir = join(cwd, existsSync(join(cwd, "src", "app")) ? "src/app" : "app", kebab);
    await mkdir(dir, { recursive: true });
    content = `export default function ${pascal}Page() {
  return (
    <main>
      <h1>${pascal}</h1>
    </main>
  );
}
`;
    filePath = join(dir, "page.tsx");
  } else if (isNextPages) {
    const dir = join(cwd, existsSync(join(cwd, "src", "pages")) ? "src/pages" : "pages");
    content = `export default function ${pascal}Page() {
  return (
    <main>
      <h1>${pascal}</h1>
    </main>
  );
}
`;
    filePath = join(dir, `${kebab}.tsx`);
  } else {
    const dir = join(cwd, "src", "pages");
    await mkdir(dir, { recursive: true });
    content = `export function ${pascal}Page() {
  return (
    <div>
      <h1>${pascal}</h1>
    </div>
  );
}
`;
    filePath = join(dir, `${pascal}.tsx`);
  }

  await writeFile(filePath, content);
  console.log(chalk.green(`✓ Created page: ${pascal}`));
  console.log(chalk.dim(`  ${filePath}`));
}

async function scaffoldAPI(cwd: string, flags: ScaffoldFlags): Promise<void> {
  const name = flags.args?.[0];
  if (!name) { console.log(chalk.yellow("Usage: setup scaffold api <name>")); return; }

  const kebab = toKebabCase(name);
  const isNextApp = existsSync(join(cwd, "src", "app")) || existsSync(join(cwd, "app"));

  if (isNextApp) {
    const dir = join(cwd, existsSync(join(cwd, "src", "app")) ? "src/app/api" : "app/api", kebab);
    await mkdir(dir, { recursive: true });
    const content = `import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "Hello from ${name}" });
}

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json({ received: body });
}
`;
    await writeFile(join(dir, "route.ts"), content);
    console.log(chalk.green(`✓ Created API route: /api/${kebab}`));
  } else {
    const dir = join(cwd, "src", "routes");
    await mkdir(dir, { recursive: true });
    const content = `import type { Request, Response } from "express";

export function ${toCamelCase(name)}Handler(req: Request, res: Response) {
  if (req.method === "GET") {
    res.json({ message: "Hello from ${name}" });
  } else if (req.method === "POST") {
    res.json({ received: req.body });
  }
}
`;
    await writeFile(join(dir, `${kebab}.ts`), content);
    console.log(chalk.green(`✓ Created API handler: ${kebab}`));
  }
}

async function scaffoldHook(cwd: string, flags: ScaffoldFlags): Promise<void> {
  const name = flags.args?.[0];
  if (!name) { console.log(chalk.yellow("Usage: setup scaffold hook <name>")); return; }

  const camel = toCamelCase(name);
  const hookName = camel.startsWith("use") ? camel : `use${toPascalCase(name)}`;

  const dir = join(cwd, "src", "hooks");
  await mkdir(dir, { recursive: true });

  const content = `import { useState, useEffect } from "react";

export function ${hookName}() {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // TODO: implement hook logic
  }, []);

  return { data, loading, error };
}
`;

  await writeFile(join(dir, `${hookName}.ts`), content);
  console.log(chalk.green(`✓ Created hook: ${hookName}`));
  console.log(chalk.dim(`  ${dir}/${hookName}.ts`));
}

async function scaffoldModel(cwd: string, flags: ScaffoldFlags): Promise<void> {
  const name = flags.args?.[0];
  if (!name) { console.log(chalk.yellow("Usage: setup scaffold model <Name>")); return; }

  const pascal = toPascalCase(name);
  const dir = join(cwd, "src", "models");
  await mkdir(dir, { recursive: true });

  const content = `export interface ${pascal} {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Create${pascal}Input {
  // TODO: define creation fields
}

export interface Update${pascal}Input {
  // TODO: define update fields
}

export function validate${pascal}(data: unknown): data is ${pascal} {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.id === "string";
}
`;

  await writeFile(join(dir, `${toKebabCase(name)}.ts`), content);
  console.log(chalk.green(`✓ Created model: ${pascal}`));
}

async function scaffoldTest(cwd: string, flags: ScaffoldFlags): Promise<void> {
  const target = flags.args?.[0];
  if (!target) { console.log(chalk.yellow("Usage: setup scaffold test <module-path>")); return; }

  const testPath = target.replace(/\.(ts|tsx|js|jsx)$/, "") + ".test.ts";
  const moduleName = target.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/, "") || "module";

  const content = `import { describe, it, expect } from "vitest";
// import { } from "./${moduleName}";

describe("${moduleName}", () => {
  it("should work", () => {
    expect(true).toBe(true);
  });

  it.todo("add real tests");
});
`;

  await writeFile(join(cwd, testPath), content);
  console.log(chalk.green(`✓ Created test: ${testPath}`));
}

async function scaffoldService(cwd: string, flags: ScaffoldFlags): Promise<void> {
  const name = flags.args?.[0];
  if (!name) { console.log(chalk.yellow("Usage: setup scaffold service <Name>")); return; }

  const pascal = toPascalCase(name);
  const dir = join(cwd, "src", "services");
  await mkdir(dir, { recursive: true });

  const content = `export class ${pascal}Service {
  constructor() {}

  async getAll(): Promise<unknown[]> {
    throw new Error("Not implemented");
  }

  async getById(id: string): Promise<unknown> {
    throw new Error("Not implemented");
  }

  async create(data: unknown): Promise<unknown> {
    throw new Error("Not implemented");
  }

  async update(id: string, data: unknown): Promise<unknown> {
    throw new Error("Not implemented");
  }

  async delete(id: string): Promise<void> {
    throw new Error("Not implemented");
  }
}

export const ${toCamelCase(name)}Service = new ${pascal}Service();
`;

  await writeFile(join(dir, `${toKebabCase(name)}.service.ts`), content);
  console.log(chalk.green(`✓ Created service: ${pascal}Service`));
}

async function scaffoldMiddleware(cwd: string, flags: ScaffoldFlags): Promise<void> {
  const name = flags.args?.[0];
  if (!name) { console.log(chalk.yellow("Usage: setup scaffold middleware <name>")); return; }

  const camel = toCamelCase(name);
  const dir = join(cwd, "src", "middleware");
  await mkdir(dir, { recursive: true });

  const isNext = existsSync(join(cwd, "next.config.js")) || existsSync(join(cwd, "next.config.mjs")) || existsSync(join(cwd, "next.config.ts"));

  let content: string;
  if (isNext) {
    content = `import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function ${camel}Middleware(request: NextRequest) {
  // TODO: implement middleware logic
  return NextResponse.next();
}
`;
  } else {
    content = `import type { Request, Response, NextFunction } from "express";

export function ${camel}(req: Request, res: Response, next: NextFunction) {
  // TODO: implement middleware logic
  next();
}
`;
  }

  await writeFile(join(dir, `${toKebabCase(name)}.ts`), content);
  console.log(chalk.green(`✓ Created middleware: ${camel}`));
}

function toPascalCase(str: string): string {
  return str.replace(/(^|[-_\s])(\w)/g, (_, __, c) => c.toUpperCase()).replace(/[-_\s]/g, "");
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
}
