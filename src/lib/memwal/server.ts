import { MemWal } from "@mysten-incubation/memwal";

const DEFAULT_MEMWAL_SERVER_URL = "https://relayer.memwal.ai";

export function getMemWalClient(namespace?: string) {
  const key = process.env.MEMWAL_PRIVATE_KEY;
  const accountId = process.env.MEMWAL_ACCOUNT_ID;

  if (!key || !accountId) {
    throw new Error("MEMWAL_PRIVATE_KEY and MEMWAL_ACCOUNT_ID must be configured.");
  }

  return MemWal.create({
    key,
    accountId,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? DEFAULT_MEMWAL_SERVER_URL,
    namespace: namespace ?? "vault",
  });
}

export function resolveVaultNamespace(owner?: string) {
  return owner ? `vault-${owner.toLowerCase()}` : "vault";
}
