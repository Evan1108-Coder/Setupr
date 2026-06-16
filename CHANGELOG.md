# Changelog

All notable changes to Setupr will be documented in this file. Setupr keeps a changelog because it is a versioned developer tool with user-facing CLI behavior.

## 1.0.4

### Changed
- Promoted the public README from beta language to stable-release language now that the npm package, install flow, and release checks are in place.
- Hardened repository ignore rules for additional local secret and credential file patterns that should never be committed during real-world CLI use.

### Validation
- Re-ran the full release gate: unit tests, typecheck, lint, build, plain and TUI smoke fixtures, `release check`, npm pack/publish dry-runs, and fresh-install execution from the packed tarball.

## 1.0.3

### Fixed
- Merged the latest GitHub `1.0.2` release line with the local TUI hardening work.
- Added terminal-size protection for TUI screens so very small terminals show a resize notice instead of breaking panel borders.
- Added configurable TUI border fallback styles through `SETUPR_TUI_BORDER=bold`, `double`, `round`, or `classic` for terminal/font profiles that render thin Unicode borders with gaps.
- Improved AI provider error classification for structured SDK errors, including nested status/statusCode/code/response fields and clearer quota-vs-rate-limit handling.
- Hardened plugin runtime loading by supporting common package `exports` objects, rejecting entrypoints that escape the plugin directory, and wrapping plugin command crashes in structured Setupr errors.

### Testing
- Added regression coverage for structured provider errors, plugin package `exports`, plugin path escapes, plugin command failures, terminal-size fallback, and border-style fallback behavior.

## 1.0.2

### Fixed
- `--cwd <path>` now fails fast with a clear `INVALID_CWD` error when the path does not exist or is not a directory, instead of silently inventing an empty project for a bad path.
- `add`, `remove`, and `deps why` with no package argument now report a `MISSING_PACKAGE` ("package name required") error instead of a misleading "unknown subcommand".

### Testing
- Completed two full test→fix QA rounds: ran typecheck, lint, the unit suite, and both fixture smoke harnesses (plain + TUI), and exercised every command and its flags against sample projects looking for crashes, arg-parsing bugs, and error-path regressions.
- Added unit coverage for the new error codes plus two new fixture smoke checks (`INVALID_CWD`, `MISSING_PACKAGE`). Suite is green at 192 unit tests + 45 smoke checks.

### Docs
- Documented the `--json` and `--cwd` global flags in `docs/COMMANDS.md`.

## Unreleased

### Added
- Added real repository visual snapshot assets generated from the current file tree.
- Added public maintenance documentation updates: security policy, issue/PR templates, and repository snapshot notes.

### Validation
- Re-ran the documented test suite during the polish pass and recorded the real test status in `docs/project-snapshot.md`.

## Initial Public Version

- Published the first public project version.
