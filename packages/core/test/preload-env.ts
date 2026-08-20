/**
 * Tests never talk to Postgres, but `env()` still requires DATABASE_URL
 * because production code refuses to start without it. A dummy connection
 * string is enough: the client is lazy and these suites never query.
 */
process.env.DATABASE_URL ??=
  "postgres://complifine:complifine@localhost:5434/complifine";
process.env.STORAGE_ROOT ??= "./storage";
