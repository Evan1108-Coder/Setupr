import { readFile, access } from "fs/promises";
import { join } from "path";

export async function detectServices(cwd: string): Promise<string[]> {
  const services: Set<string> = new Set();

  // Check docker-compose
  await checkDockerCompose(cwd, services);

  // Check package.json dependencies
  await checkPackageDeps(cwd, services);

  // Check .env.example for service hints
  await checkEnvExample(cwd, services);

  // Check for Dockerfile
  try {
    await access(join(cwd, "Dockerfile"));
    services.add("Docker");
  } catch {}

  return Array.from(services);
}

async function checkDockerCompose(cwd: string, services: Set<string>) {
  const composeFiles = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];

  for (const file of composeFiles) {
    try {
      const content = await readFile(join(cwd, file), "utf-8");
      if (content.includes("postgres")) services.add("PostgreSQL");
      if (content.includes("mysql")) services.add("MySQL");
      if (content.includes("mongo")) services.add("MongoDB");
      if (content.includes("redis")) services.add("Redis");
      if (content.includes("rabbitmq")) services.add("RabbitMQ");
      if (content.includes("elasticsearch")) services.add("Elasticsearch");
      if (content.includes("kafka")) services.add("Kafka");
      if (content.includes("minio") || content.includes("s3")) services.add("S3/MinIO");
      if (content.includes("nginx")) services.add("Nginx");
      if (content.includes("mailhog") || content.includes("mailtrap")) services.add("Mail");
      services.add("Docker");
      return;
    } catch {}
  }
}

async function checkPackageDeps(cwd: string, services: Set<string>) {
  try {
    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (allDeps.pg || allDeps["@prisma/client"] || allDeps.prisma) services.add("PostgreSQL");
    if (allDeps.mysql2 || allDeps.mysql) services.add("MySQL");
    if (allDeps.mongoose || allDeps.mongodb) services.add("MongoDB");
    if (allDeps.redis || allDeps.ioredis || allDeps["@redis/client"]) services.add("Redis");
    if (allDeps.amqplib || allDeps.amqp) services.add("RabbitMQ");
    if (allDeps["@elastic/elasticsearch"]) services.add("Elasticsearch");
    if (allDeps.kafkajs) services.add("Kafka");
    if (allDeps["@aws-sdk/client-s3"]) services.add("S3");
    if (allDeps.sqlite3 || allDeps["better-sqlite3"]) services.add("SQLite");
  } catch {}
}

async function checkEnvExample(cwd: string, services: Set<string>) {
  try {
    const content = await readFile(join(cwd, ".env.example"), "utf-8");
    const entries = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const [rawKey, ...rawValue] = line.split("=");
        return {
          key: (rawKey || "").trim().toLowerCase(),
          value: rawValue.join("=").trim().toLowerCase(),
        };
      });

    const haystack = entries.map((entry) => `${entry.key}=${entry.value}`).join("\n");
    if (entries.some((entry) => entry.key === "database_url" || entry.key === "db_host")) {
      if (haystack.includes("postgres")) services.add("PostgreSQL");
      else if (haystack.includes("mysql")) services.add("MySQL");
      else if (haystack.includes("mongo")) services.add("MongoDB");
      else services.add("Database");
    }
    if (entries.some((entry) => entry.key.includes("redis") || entry.value.includes("redis://"))) services.add("Redis");
    if (entries.some(isMailServiceEntry)) services.add("Mail");
    if (entries.some((entry) => entry.key.startsWith("s3_") || entry.key.startsWith("aws_") || entry.value.includes("s3://"))) services.add("S3");
  } catch {}
}

function isMailServiceEntry(entry: { key: string; value: string }): boolean {
  return (
    entry.key.startsWith("smtp_") ||
    entry.key === "smtp" ||
    entry.key === "mail_host" ||
    entry.key === "mailhog_host" ||
    entry.key === "mailtrap_host" ||
    entry.key.startsWith("mailgun_") ||
    entry.key === "email_server" ||
    entry.value.includes("smtp://") ||
    entry.value.includes("mailhog") ||
    entry.value.includes("mailtrap")
  );
}
