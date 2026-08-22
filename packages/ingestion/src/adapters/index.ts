import type { StandardAdapter } from "./types.ts";
import { globalGapAdapter } from "./globalgap.ts";
import { smetaAdapter } from "./smeta.ts";

const ADAPTERS: readonly StandardAdapter[] = [globalGapAdapter, smetaAdapter];

export function adapterFor(standardCode: string): StandardAdapter {
  const adapter = ADAPTERS.find((item) => item.standardCode === standardCode);
  if (!adapter) {
    throw new Error(
      `No ingestion adapter for standard "${standardCode}". Add one under packages/ingestion/src/adapters/.`,
    );
  }
  return adapter;
}

export { globalGapAdapter, smetaAdapter };
export type { StandardAdapter, AdapterVersion } from "./types.ts";
