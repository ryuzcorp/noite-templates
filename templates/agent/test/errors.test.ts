import { describe, expect, test } from "bun:test";

import { describeContainerError, describeRpcError } from "../src/errors";

/** Shape of a real SDK error instance (code getter + name + message). */
function sdkError(code: string, name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  Object.defineProperty(error, "code", { value: code });
  return error;
}

describe("describeContainerError", () => {
  test("container-down errors map to stable retryable codes", () => {
    expect(describeContainerError(sdkError("CONTAINER_UNAVAILABLE", "ContainerUnavailableError", "no VM"))).toEqual(
      {
        code: "container_unavailable",
        message: "no VM",
        status: 502,
        retryable: true,
      }
    );
    expect(
      describeContainerError(sdkError("RPC_TRANSPORT_ERROR", "RPCTransportError", "ws died"))
    ).toMatchObject({ code: "container_transport", retryable: true });
    expect(
      describeContainerError(sdkError("OPERATION_INTERRUPTED", "OperationInterruptedError", "evicted"))
    ).toMatchObject({ code: "container_interrupted", retryable: true });
  });

  test("process-not-ready errors are not retryable", () => {
    expect(
      describeContainerError(
        sdkError("PROCESS_READY_TIMEOUT", "ProcessReadyTimeoutError", "port never opened")
      )
    ).toMatchObject({ code: "container_not_ready", status: 502, retryable: false });
  });

  test("unknown SDK errors keep the SDK code; other errors are internal", () => {
    expect(describeContainerError(sdkError("GIT_CLONE_FAILED", "SandboxError", "clone blew up"))).toMatchObject(
      { code: "GIT_CLONE_FAILED", status: 502 }
    );
    expect(describeContainerError(new Error("boom"))).toEqual({
      code: "internal",
      message: "boom",
      status: 500,
      retryable: false,
    });
    expect(describeContainerError("plain").code).toBe("internal");
  });
});

describe("describeRpcError", () => {
  test("RPC-transported SDK errors map by name", () => {
    const transported = new Error("no VM right now");
    transported.name = "ContainerUnavailableError";
    expect(describeRpcError(transported)).toMatchObject({
      code: "container_unavailable",
      status: 502,
      retryable: true,
    });
  });

  test("unexpected RPC failures become a 502 internal JSON error", () => {
    expect(describeRpcError(new Error("Worker failed: doh"))).toEqual({
      code: "internal",
      message: "Worker failed: doh",
      status: 502,
      retryable: false,
    });
  });
});
