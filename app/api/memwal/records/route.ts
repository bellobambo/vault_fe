import { getMemWalClient, resolveVaultNamespace } from "@/src/lib/memwal/server";
import { parseSerializedMemoryRecord } from "@/src/lib/storage/memory";

export const runtime = "nodejs";

type RecordsRequest = {
  namespace?: unknown;
  owner?: unknown;
  limit?: unknown;
};

type MemWalRecallResult = {
  results?: Array<{
    blob_id?: string;
    text?: string;
    distance?: number;
  }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecordsRequest;
    const owner = typeof body.owner === "string" ? body.owner.trim() : "";

    if (!owner) {
      return Response.json({ error: "Wallet owner is required." }, { status: 400 });
    }

    const namespace =
      typeof body.namespace === "string" && body.namespace.trim()
        ? body.namespace.trim()
        : resolveVaultNamespace(owner);
    const limit = typeof body.limit === "number" ? body.limit : 50;
    const memwal = getMemWalClient(namespace);
    const result = await memwal.recall({
      query: "Vault memory budget receipt document history",
      limit,
      namespace,
    }) as MemWalRecallResult;
    const records = (result.results ?? []).flatMap((memory) => {
      if (typeof memory.text !== "string") {
        return [];
      }

      const record = parseSerializedMemoryRecord(memory.text, {
        owner,
        walrusBlobId: memory.blob_id,
      });

      return record ? [record] : [];
    });

    return Response.json({
      namespace,
      result: {
        records,
        total: records.length,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load records from Walrus." },
      { status: 500 },
    );
  }
}
