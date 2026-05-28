import chalk from "chalk";
import { writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { scanProject } from "../../scanner/index.js";
import { createPSetupError, printPlainError } from "../../errors/index.js";

interface DockerFlags {
  force?: boolean;
  args?: string[];
  [key: string]: unknown;
}

export async function cmdDocker(sub: string | undefined, cwd: string, flags: DockerFlags): Promise<void> {
  const action = sub || "generate";

  switch (action) {
    case "generate": return dockerGenerate(cwd, flags);
    case "compose": return dockerCompose(cwd, flags);
    case "check": return dockerCheck(cwd);
    default:
      printPlainError(createPSetupError({
        code: "UNKNOWN_SUBCOMMAND",
        command: "docker",
        subcommand: sub,
        cwd,
        details: ["Valid: generate, compose, check"],
      }));
  }
}

async function dockerGenerate(cwd: string, flags: DockerFlags): Promise<void> {
  const dockerfilePath = join(cwd, "Dockerfile");
  if (existsSync(dockerfilePath) && !flags.force) {
    console.log(chalk.yellow("Dockerfile already exists. Use --force to overwrite."));
    return;
  }

  const scan = await scanProject(cwd);
  console.log(chalk.blue.bold("\n  Generating Dockerfile\n"));
  console.log(chalk.dim(`  Stack: ${scan.language || "unknown"} / ${scan.framework || "none"} / ${scan.packageManager || "npm"}`));

  let dockerfile = "";
  const lang = (scan.language || "").toLowerCase();

  if (lang === "typescript" || lang === "javascript") {
    dockerfile = generateNodeDockerfile(scan);
  } else if (lang === "python") {
    dockerfile = generatePythonDockerfile(scan);
  } else if (lang === "go") {
    dockerfile = generateGoDockerfile(scan);
  } else if (lang === "rust") {
    dockerfile = generateRustDockerfile(scan);
  } else {
    printPlainError(createPSetupError({
      code: "DOCKER_GENERATE_FAILED",
      command: "docker",
      cwd,
      details: [`Unsupported language: ${scan.language || "unknown"}`],
    }));
    return;
  }

  await writeFile(dockerfilePath, dockerfile);
  console.log(chalk.green("  ✓ Dockerfile"));

  const dockerignorePath = join(cwd, ".dockerignore");
  if (!existsSync(dockerignorePath) || flags.force) {
    const ignore = generateDockerignore(scan.language);
    await writeFile(dockerignorePath, ignore);
    console.log(chalk.green("  ✓ .dockerignore"));
  }

  console.log(chalk.green("\n✓ Docker files generated"));
}

async function dockerCompose(cwd: string, flags: DockerFlags): Promise<void> {
  const composePath = join(cwd, "docker-compose.yml");
  if (existsSync(composePath) && !flags.force) {
    console.log(chalk.yellow("docker-compose.yml already exists. Use --force to overwrite."));
    return;
  }

  const scan = await scanProject(cwd);
  const services = scan.services || [];
  const name = cwd.split("/").pop() || "app";

  let yaml = `version: "3.8"\n\nservices:\n  ${name}:\n    build: .\n    ports:\n      - "3000:3000"\n    environment:\n      - NODE_ENV=production\n    restart: unless-stopped\n`;

  if (services.includes("postgres") || services.includes("postgresql")) {
    yaml += `\n  postgres:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: ${name}\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: postgres\n    ports:\n      - "5432:5432"\n    volumes:\n      - postgres_data:/var/lib/postgresql/data\n`;
  }

  if (services.includes("redis")) {
    yaml += `\n  redis:\n    image: redis:7-alpine\n    ports:\n      - "6379:6379"\n`;
  }

  if (services.includes("mongodb") || services.includes("mongo")) {
    yaml += `\n  mongo:\n    image: mongo:7\n    ports:\n      - "27017:27017"\n    volumes:\n      - mongo_data:/data/db\n`;
  }

  const volumes: string[] = [];
  if (yaml.includes("postgres_data")) volumes.push("  postgres_data:");
  if (yaml.includes("mongo_data")) volumes.push("  mongo_data:");
  if (volumes.length > 0) {
    yaml += `\nvolumes:\n${volumes.join("\n")}\n`;
  }

  await writeFile(composePath, yaml);
  console.log(chalk.green("✓ Generated docker-compose.yml"));
  if (services.length > 0) {
    console.log(chalk.dim(`  Included services: ${services.join(", ")}`));
  }
}

async function dockerCheck(cwd: string): Promise<void> {
  const { runCommand } = await import("../../executor/index.js");
  const result = await runCommand("docker --version", cwd);

  if (result.exitCode !== 0) {
    printPlainError(createPSetupError({ code: "DOCKER_NOT_INSTALLED", command: "docker", subcommand: "check", cwd }));
    return;
  }

  console.log(chalk.blue.bold("\n  Docker Status\n"));
  console.log(`  Version: ${chalk.white(result.stdout.trim())}`);

  const composeResult = await runCommand("docker compose version 2>/dev/null || docker-compose --version 2>/dev/null", cwd);
  if (composeResult.exitCode === 0) {
    console.log(`  Compose: ${chalk.green("available")}`);
  } else {
    console.log(`  Compose: ${chalk.yellow("not found")}`);
  }

  const runningResult = await runCommand("docker ps --format '{{.Names}}' 2>/dev/null", cwd);
  const containers = runningResult.stdout.trim().split("\n").filter(Boolean);
  console.log(`  Running: ${chalk.white(`${containers.length} container${containers.length !== 1 ? "s" : ""}`)}`);

  if (existsSync(join(cwd, "Dockerfile"))) {
    console.log(`  Dockerfile: ${chalk.green("present")}`);
  } else {
    console.log(`  Dockerfile: ${chalk.dim("missing")} ${chalk.dim("(run setup docker generate)")}`);
  }
  console.log("");
}

function generateNodeDockerfile(scan: { packageManager: string | null; framework: string | null; scripts: Record<string, string> }): string {
  const pm = scan.packageManager || "npm";
  const hasLockfile = pm === "pnpm" ? "pnpm-lock.yaml" : pm === "yarn" ? "yarn.lock" : "package-lock.json";

  let installCmd = "npm ci --only=production";
  let devInstallCmd = "npm ci";
  if (pm === "pnpm") { installCmd = "pnpm install --frozen-lockfile --prod"; devInstallCmd = "pnpm install --frozen-lockfile"; }
  if (pm === "yarn") { installCmd = "yarn install --frozen-lockfile --production"; devInstallCmd = "yarn install --frozen-lockfile"; }
  if (pm === "bun") { installCmd = "bun install --production"; devInstallCmd = "bun install"; }

  const hasBuild = !!scan.scripts.build;

  if (hasBuild) {
    return `# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ${hasLockfile !== "package-lock.json" ? hasLockfile + " " : ""}./
${pm === "pnpm" ? "RUN corepack enable pnpm\n" : ""}RUN ${devInstallCmd}
COPY . .
RUN ${pm} run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY package*.json ${hasLockfile !== "package-lock.json" ? hasLockfile + " " : ""}./
${pm === "pnpm" ? "RUN corepack enable pnpm\n" : ""}RUN ${installCmd}
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
`;
  }

  return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ${hasLockfile !== "package-lock.json" ? hasLockfile + " " : ""}./
${pm === "pnpm" ? "RUN corepack enable pnpm\n" : ""}RUN ${installCmd}
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "src/index.js"]
`;
}

function generatePythonDockerfile(_scan: { scripts: Record<string, string> }): string {
  return `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "-m", "src.main"]
`;
}

function generateGoDockerfile(_scan: { scripts: Record<string, string> }): string {
  return `# Build stage
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server .

# Production stage
FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /app/server /server
EXPOSE 8080
USER nobody
ENTRYPOINT ["/server"]
`;
}

function generateRustDockerfile(_scan: { scripts: Record<string, string> }): string {
  return `# Build stage
FROM rust:1.77-alpine AS builder
WORKDIR /app
RUN apk add --no-cache musl-dev
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src
COPY . .
RUN cargo build --release

# Production stage
FROM alpine:3.19
COPY --from=builder /app/target/release/app /app
EXPOSE 8080
USER nobody
ENTRYPOINT ["/app"]
`;
}

function generateDockerignore(language: string | null): string {
  const lang = (language || "").toLowerCase();
  const lines = [
    "node_modules", ".git", ".gitignore", "*.md", ".env", ".env.*",
    "dist", "build", "coverage", ".nyc_output", ".p-setup",
    "Dockerfile", "docker-compose*.yml", ".dockerignore",
  ];
  if (lang === "python") lines.push("__pycache__", "*.pyc", ".venv", "venv");
  if (lang === "rust") lines.push("target");
  if (lang === "go") lines.push("vendor");
  return lines.join("\n") + "\n";
}
