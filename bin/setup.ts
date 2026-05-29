import { run } from "../src/cli/index.js";
import { fromUnknownError, printPlainError } from "../src/errors/index.js";

process.title = "Setupr";

run().catch((err) => {
  printPlainError(fromUnknownError(err, {
    command: process.argv.slice(2).join(" ") || "setup",
    cwd: process.cwd(),
  }));
  process.exit(1);
});
