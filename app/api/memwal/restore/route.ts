import { getMemWalClient, resolveVaultNamespace } from "@/src/lib/memwal/server";

export const runtime = "nodejs";

type RestoreRequest = {
  namespace?: unknown;
  owner?: unknown;
  limit?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RestoreRequest;
    const namespace =
      typeof body.namespace === "string" && body.namespace.trim()
        ? body.namespace.trim()
        : resolveVaultNamespace(typeof body.owner === "string" ? body.owner : undefined);
    const limit = typeof body.limit === "number" ? body.limit : 10;
    const memwal = getMemWalClient(namespace);
    const result = await memwal.restore(namespace, limit);

    return Response.json({ namespace, result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to restore memory index." },
      { status: 500 },
    );
  }
}
