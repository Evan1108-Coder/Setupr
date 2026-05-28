import chalk from "chalk";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export async function showTransition(command: string): Promise<void> {
  // Reset SGR attributes before clearing so a prior command cannot leave
  // reverse-video or background color active in the launch screen.
  process.stdout.write("\x1B[0m\x1B[2J\x1B[1;1H");

  const label = `Launching ${command}...`;
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  // Center the spinner
  const centerX = Math.floor(cols / 2 - label.length / 2);
  const centerY = Math.floor(rows / 2);

  for (let i = 0; i < 8; i++) {
    const frame = SPINNER_FRAMES[i % SPINNER_FRAMES.length];
    process.stdout.write(`\x1B[${centerY};${centerX}H`);
    process.stdout.write(chalk.blue(`${frame} ${label}`));
    await sleep(80);
  }

  // Clear for TUI
  process.stdout.write("\x1B[0m\x1B[2J\x1B[1;1H");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
