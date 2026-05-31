import { getMemWalClient, resolveVaultNamespace } from "@/src/lib/memwal/server";

export const runtime = "nodejs";

type RememberRequest = {
  text?: unknown;
  namespace?: unknown;
  owner?: unknown;
  wait?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RememberRequest;
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return Response.json({ error: "Memory text is required." }, { status: 400 });
    }

    const namespace =
      typeof body.namespace === "string" && body.namespace.trim()
        ? body.namespace.trim()
        : resolveVaultNamespace(typeof body.owner === "string" ? body.owner : undefined);
    const memwal = getMemWalClient(namespace);
    const result =
      body.wait === true
        ? await memwal.rememberAndWait(text, namespace, { timeoutMs: 45_000 })
        : await memwal.remember(text, namespace);

    return Response.json({ namespace, result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to remember memory." },
      { status: 500 },
    );
  }
}
