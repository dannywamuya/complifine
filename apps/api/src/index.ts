#!/usr/bin/env bun
/**
 * CompliFine HTTP API.
 *
 * The knowledge base, search, the agent and the quality gates, reachable over
 * HTTP so the explorer UI and anything else can use the same code the CLI does
 * rather than a second implementation.
 */

import { env } from "@complifine/core";
import { createApp } from "./app.ts";

const { API_PORT } = env();
const app = createApp();

app.listen({ port: API_PORT, hostname: "0.0.0.0" }, () => {
  console.log(`CompliFine API  http://0.0.0.0:${API_PORT}`);
  console.log(`OpenAPI         http://0.0.0.0:${API_PORT}/swagger`);
});
