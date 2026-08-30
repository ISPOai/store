import { ProjectRpcError } from "@ispo/sdk";

export type CadErrorKind =
  | "access"
  | "cancelled"
  | "timeout"
  | "runtime"
  | "invalid"
  | "unknown";

export type CadProductError = {
  kind: CadErrorKind;
  code: string;
  message: string;
  recoverable: boolean;
};

export function classifyProjectError(error: unknown, fallback: string): CadProductError {
  if (error instanceof ProjectRpcError) {
    if (["not-requested", "not-granted", "revoked", "denied", "outside-reviewed-eligibility"].includes(error.code)) {
      return {
        kind: "access",
        code: error.code,
        message: "CAD needs host approval for this operation. Review Project Access, then retry.",
        recoverable: true,
      };
    }
    if (error.code === "timeout") {
      return {
        kind: "timeout",
        code: error.code,
        message: "The host took too long to respond. The outcome may be uncertain.",
        recoverable: false,
      };
    }
    return {
      kind: "unknown",
      code: error.code,
      message: fallback,
      recoverable: false,
    };
  }
  return {
    kind: "unknown",
    code: "unknown",
    message: error instanceof Error && error.message ? error.message : fallback,
    recoverable: true,
  };
}

export function isAccessError(error: unknown) {
  return classifyProjectError(error, "").kind === "access";
}
