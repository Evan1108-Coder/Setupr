export type PSetupErrorSeverity = "info" | "warning" | "error" | "fatal";
export type PSetupErrorCategory =
  | "usage"
  | "project"
  | "env"
  | "auth"
  | "ai"
  | "provider"
  | "runtime"
  | "package-manager"
  | "filesystem"
  | "network"
  | "executor"
  | "tui"
  | "config"
  | "unknown";

export type RecoveryActionKind =
  | "retry"
  | "skip"
  | "continue"
  | "stop"
  | "ask-user"
  | "switch-model"
  | "open-docs"
  | "run-command"
  | "edit-file";

export interface RecoveryAction {
  kind: RecoveryActionKind;
  label: string;
  command?: string;
  details?: string;
  risky?: boolean;
}

export interface PSetupErrorInput {
  code: string;
  category: PSetupErrorCategory;
  severity: PSetupErrorSeverity;
  title: string;
  command?: string;
  subcommand?: string;
  cwd?: string;
  explanation: string;
  details?: string[];
  nextSteps?: string[];
  recovery?: RecoveryAction[];
  canContinue?: boolean;
  forceBehavior?: string;
  exitCode?: number;
  cause?: unknown;
  metadata?: Record<string, unknown>;
}

export interface PSetupError extends PSetupErrorInput {
  code: PSetupErrorCode;
  timestamp: number;
}

export type PSetupErrorCode =
  | "UNKNOWN_COMMAND"
  | "UNKNOWN_SUBCOMMAND"
  | "INVALID_FLAG"
  | "INVALID_FLAG_COMBINATION"
  | "NON_INTERACTIVE_CONFIRMATION_REQUIRED"
  | "NON_INTERACTIVE_INPUT_REQUIRED"
  | "NO_PROJECT_DETECTED"
  | "MALFORMED_PROJECT_FILE"
  | "PROJECT_CONFIG_INVALID"
  | "MISSING_PACKAGE_JSON"
  | "MISSING_PACKAGE_MANAGER"
  | "MISSING_SCRIPT"
  | "MISSING_RUNTIME"
  | "ENV_TEMPLATE_MISSING"
  | "ENV_ALREADY_EXISTS"
  | "ENV_SYNC_FAILED"
  | "ENV_CHECK_FAILED"
  | "ENV_SMART_FAILED"
  | "ENV_WRITE_FAILED"
  | "ENV_INVALID_VALUE"
  | "ENV_DUPLICATE_KEY"
  | "AUTH_PROVIDER_REQUIRED"
  | "AUTH_PROVIDER_UNKNOWN"
  | "AUTH_KEY_MISSING"
  | "AUTH_KEY_EMPTY"
  | "AUTH_KEY_REPLACE_CANCELLED"
  | "AUTH_STORAGE_FAILED"
  | "AUTH_STORAGE_INVALID"
  | "AUTH_MIGRATION_FAILED"
  | "AI_MODEL_REQUIRED"
  | "AI_MODEL_UNKNOWN"
  | "AI_MODEL_UNAVAILABLE"
  | "AI_KEY_MISSING"
  | "AI_PROVIDER_TIMEOUT"
  | "AI_PROVIDER_AUTH_FAILED"
  | "AI_PROVIDER_RATE_LIMITED"
  | "AI_PROVIDER_QUOTA_EXHAUSTED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_PROVIDER_PROTOCOL_ERROR"
  | "AI_PROVIDER_REQUEST_FAILED"
  | "COMMAND_FAILED"
  | "COMMAND_NOT_FOUND"
  | "COMMAND_TIMEOUT"
  | "COMMAND_ABORTED"
  | "INSTALL_FAILED"
  | "BUILD_FAILED"
  | "TEST_FAILED"
  | "UPDATE_CHECK_FAILED"
  | "CLEAN_TARGET_FAILED"
  | "CLEAN_MODE_INVALID"
  | "PORT_CHECK_FAILED"
  | "LOCK_STATE_MISSING"
  | "LOG_FILE_MISSING"
  | "OPEN_TARGET_MISSING"
  | "TUI_TERMINAL_TOO_SMALL"
  | "TUI_MOUSE_PROTOCOL_LEFT_ON"
  | "TUI_RENDER_FAILED"
  | "FILESYSTEM_PERMISSION_DENIED"
  | "FILESYSTEM_READ_ONLY"
  | "NETWORK_UNAVAILABLE"
  | "UNKNOWN_ERROR";
