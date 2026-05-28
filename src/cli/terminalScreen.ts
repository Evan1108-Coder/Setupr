const ENTER_ALT_SCREEN = "\x1B[?1049h";
const EXIT_ALT_SCREEN = "\x1B[?1049l";
const ENABLE_MOUSE = "\x1B[?1000h\x1B[?1006h";
const DISABLE_MOUSE = "\x1B[?1000l\x1B[?1002l\x1B[?1003l\x1B[?1006l\x1B[?1015l";
const RESET_ATTRIBUTES = "\x1B[0m";
const CLEAR_SCREEN = "\x1B[2J\x1B[1;1H";
const HIDE_CURSOR = "\x1B[?25l";
const SHOW_CURSOR = "\x1B[?25h";

interface InteractiveScreenOptions {
  title?: string;
}

export async function withInteractiveScreen(
  work: () => Promise<void>,
  options: InteractiveScreenOptions = {}
): Promise<void> {
  if (!process.stdout.isTTY) {
    await work();
    return;
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    process.stdout.write(`${RESET_ATTRIBUTES}${DISABLE_MOUSE}${SHOW_CURSOR}${setTerminalTitle("Terminal")}${EXIT_ALT_SCREEN}`);
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    cleanup();
    process.kill(process.pid, signal);
  };
  const title = options.title ? setTerminalTitle(options.title) : "";
  process.stdout.write(`${DISABLE_MOUSE}${title}${ENTER_ALT_SCREEN}${RESET_ATTRIBUTES}${CLEAR_SCREEN}${ENABLE_MOUSE}${HIDE_CURSOR}`);
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  process.once("exit", cleanup);

  try {
    await work();
  } finally {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
    process.off("exit", cleanup);
    cleanup();
  }
}

function setTerminalTitle(title: string): string {
  const escape = String.fromCharCode(27);
  const bell = String.fromCharCode(7);
  const clean = title.split(escape).join("").split(bell).join("").slice(0, 80);
  return `\x1B]0;${clean}\x07`;
}
