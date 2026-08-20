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

app.listen(API_PORT, () => {
  console.log(`CompliFine API  http://localhost:${API_PORT}`);
  console.log(`OpenAPI         http://localhost:${API_PORT}/swagger`);
});
