import { getMemWalClient } from "@/src/lib/memwal/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const memwal = getMemWalClient();
    const result = await memwal.health();

    return Response.json({ result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to check MemWal health." },
      { status: 500 },
    );
  }
}
