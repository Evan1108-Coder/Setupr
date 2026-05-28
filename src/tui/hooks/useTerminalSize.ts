import { useEffect, useState } from "react";
import { useStdout } from "ink";

export interface TerminalSize {
  width: number;
  height: number;
  compact: boolean;
  stacked: boolean;
}

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const readSize = () => ({
    width: stdout?.columns || process.stdout.columns || 100,
    rows: stdout?.rows || process.stdout.rows || 30,
  });
  const [size, setSize] = useState(readSize);

  useEffect(() => {
    const update = () => {
      const next = readSize();
      setSize((current) => (
        current.width === next.width && current.rows === next.rows ? current : next
      ));
    };
    process.stdout.on("resize", update);
    process.on("SIGWINCH", update);
    const timer = setInterval(update, 250);
    update();
    return () => {
      process.stdout.off("resize", update);
      process.off("SIGWINCH", update);
      clearInterval(timer);
    };
  }, [stdout]);

  const width = size.width;
  // Keep one row of headroom so Ink never falls into its full-terminal
  // clear path, which emits a scrollback-clear sequence that iTerm warns about.
  const height = Math.max(1, size.rows - 1);

  return {
    width,
    height,
    compact: width < 92 || height < 24,
    stacked: width < 104,
  };
}
