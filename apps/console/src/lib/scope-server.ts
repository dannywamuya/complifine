import { cookies } from "next/headers";
import { CERT_SCOPE_COOKIE, parseScope } from "./scope";

export async function certScopeFromCookie(): Promise<string[]> {
  const raw = (await cookies()).get(CERT_SCOPE_COOKIE)?.value;
  return parseScope(raw);
}
