/**
 * POSIX-safe single-quote escaping for interpolating untrusted values into shell commands.
 * Wraps the value in single quotes and escapes any embedded single quotes using the
 * `'\''` idiom, so the result is safe to splice into a `sh -c` style command line.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
