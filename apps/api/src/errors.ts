import { status } from "elysia";

export function httpError(code: 404 | 409 | 503, message: string) {
  return status(code, { error: message });
}
