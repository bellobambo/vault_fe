import { getMemWalClient, resolveVaultNamespace } from "@/src/lib/memwal/server";

export const runtime = "nodejs";

type RecallRequest = {
  query?: unknown;
  namespace?: unknown;
  owner?: unknown;
  limit?: unknown;
  maxDistance?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecallRequest;
    const query = typeof body.query === "string" ? body.query.trim() : "";

    if (!query) {
      return Response.json({ error: "Recall query is required." }, { status: 400 });
    }

    const namespace =
      typeof body.namespace === "string" && body.namespace.trim()
        ? body.namespace.trim()
        : resolveVaultNamespace(typeof body.owner === "string" ? body.owner : undefined);
    const limit = typeof body.limit === "number" ? body.limit : 5;
    const maxDistance = typeof body.maxDistance === "number" ? body.maxDistance : undefined;
    const memwal = getMemWalClient(namespace);
    const result = await memwal.recall({ query, limit, maxDistance, namespace });

    return Response.json({ namespace, result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to recall memory." },
      { status: 500 },
    );
  }
}
