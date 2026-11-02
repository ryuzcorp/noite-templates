/** Sandbox name validation. Pure: unit-tested. */

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export type NameValidation = { ok: true; name: string } | { ok: false; message: string };

/**
 * Validate a `:name` path segment. Lowercase letters, digits and dashes,
 * 1-63 chars: this also satisfies Void's sandbox-id rule (1-63 chars), and
 * because names are already lowercase Void's id lowercasing is a no-op, so
 * the Durable Object name and the sandbox id are always identical.
 */
export function validateSandboxName(name: string): NameValidation {
  if (!NAME_PATTERN.test(name)) {
    return { ok: false, message: "invalid sandbox name (lowercase letters, digits, dashes)" };
  }
  return { ok: true, name };
}
