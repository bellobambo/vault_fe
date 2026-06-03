import { readBlobFromWalrus } from "@/src/lib/walrus/cli";

export const runtime = "nodejs";

const MAX_READ_BYTES = 10 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const blobId = url.searchParams.get("blobId")?.trim();

    if (!blobId) {
      return Response.json({ error: "Walrus blob ID is required." }, { status: 400 });
    }

    const data = await readBlobFromWalrus(blobId);

    if (data.byteLength > MAX_READ_BYTES) {
      return Response.json(
        { error: "Blob is too large to return from this verifier." },
        { status: 413 },
      );
    }

    return Response.json({
      result: {
        blobId,
        size: data.byteLength,
        base64: data.toString("base64"),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read Walrus blob.";
    return Response.json(
      {
        error: message.includes("ENOENT")
          ? "Walrus CLI is not available in this server runtime. Use the Walrus HTTP aggregator or configure WALRUS_STORAGE_DRIVER=http."
          : message,
      },
      { status: 500 },
    );
  }
}
