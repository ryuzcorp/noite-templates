/**
 * Stable error codes for container failures. Deliberately duck-typed: the
 * DO↔DO call transports failures as plain data keeping only
 * `name`/`message` (plus a string `code` when the thrower set one), so
 * matches run on the `code` string first (minifier-safe, unlike class
 * identity) and on the class name as a fallback. Pure: unit-tested.
 */

export interface DescribedError {
  /** Stable machine-readable code for the page and API clients. */
  code: string;
  /** Human-readable message, safe to show the operator. */
  message: string;
  /** HTTP status the Worker should answer with. */
  status: number;
  /** Whether retrying the same operation later could succeed. */
  retryable: boolean;
}

interface QuacksLikeSdkError {
  code?: unknown;
  name?: unknown;
  message?: unknown;
}

function fieldsOf(error: unknown): QuacksLikeSdkError {
  if (typeof error !== "object" || error === null) {
    return {};
  }
  const record = error as Record<string, unknown>;
  return { code: record["code"], name: record["name"], message: record["message"] };
}

function messageOf(error: unknown, fallback: string): string {
  const message = fieldsOf(error).message;
  return typeof message === "string" && message !== "" ? message : fallback;
}

/** Container-layer `code` values with dedicated template codes. */
const BY_CODE: Record<string, { code: string; retryable: boolean }> = {
  CONTAINER_UNAVAILABLE: { code: "container_unavailable", retryable: true },
  RPC_TRANSPORT_ERROR: { code: "container_transport", retryable: true },
  OPERATION_INTERRUPTED: { code: "container_interrupted", retryable: true },
  SESSION_TERMINATED: { code: "container_session_terminated", retryable: true },
  PROCESS_READY_TIMEOUT: { code: "container_not_ready", retryable: false },
  PROCESS_EXITED_BEFORE_READY: { code: "container_not_ready", retryable: false },
};

/** Class names for errors that crossed the DO RPC boundary (code lost). */
const BY_NAME: Record<string, { code: string; retryable: boolean }> = {
  ContainerUnavailableError: { code: "container_unavailable", retryable: true },
  RPCTransportError: { code: "container_transport", retryable: true },
  OperationInterruptedError: { code: "container_interrupted", retryable: true },
  SessionTerminatedError: { code: "container_session_terminated", retryable: true },
  ProcessReadyTimeoutError: { code: "container_not_ready", retryable: false },
  ProcessExitedBeforeReadyError: { code: "container_not_ready", retryable: false },
};

/**
 * Map a container-layer failure to a stable code. Unknown coded errors keep
 * their own code; anything else is `internal`. Used both inside the DOs and
 * in the Worker around DO RPCs (transported errors); `rpc` only changes
 * the fallback status.
 */
export function describeContainerError(error: unknown, rpc = false): DescribedError {
  const fields = fieldsOf(error);
  if (typeof fields.code === "string" && fields.code !== "") {
    const known = BY_CODE[fields.code];
    if (known !== undefined) {
      return { code: known.code, message: messageOf(error, known.code), status: 502, retryable: known.retryable };
    }
    return { code: fields.code, message: messageOf(error, fields.code), status: 502, retryable: false };
  }
  if (typeof fields.name === "string") {
    const known = BY_NAME[fields.name];
    if (known !== undefined) {
      return { code: known.code, message: messageOf(error, known.code), status: 502, retryable: known.retryable };
    }
  }
  if (typeof fields.message === "string" && fields.message !== "") {
    return { code: "internal", message: fields.message, status: rpc ? 502 : 500, retryable: false };
  }
  return { code: "internal", message: String(error), status: rpc ? 502 : 500, retryable: false };
}

/**
 * Best-effort mapping for errors that crossed the DO RPC boundary. The
 * DO's methods return result unions, so this path only sees transport-level
 * and unexpected failures; unexpected ones are 502, never 500, because the
 * Worker cannot tell them from container faults.
 */
export function describeRpcError(error: unknown): DescribedError {
  return describeContainerError(error, true);
}
