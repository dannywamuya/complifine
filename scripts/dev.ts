#!/usr/bin/env bun
/**
 * Start the API, producer web app, and operator console together.
 *
 * `package.json` used to background the three `bun run` children with `&` and
 * no `wait`, so Ctrl+C left `bun --watch` listening on 3311. The next
 * `bun run dev` then shared the port (SO_REUSEPORT): half the requests hit a
 * stale process whose Postgres sockets were already dead.
 */

const children = ["api", "web", "console"].map((script) =>
  Bun.spawn(["bun", "run", script], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  }),
);

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const codes = await Promise.all(children.map((child) => child.exited));
const failed = codes.find((code) => code !== 0 && code !== 130 && code !== 143);
process.exit(failed ?? 0);
