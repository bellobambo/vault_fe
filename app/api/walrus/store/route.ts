import { storeBufferOnWalrus } from "@/src/lib/walrus/cli";

export const runtime = "nodejs";

const DEFAULT_WALRUS_EPOCHS = "2";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const epochsValue = formData.get("epochs");

    if (!(file instanceof File)) {
      return Response.json({ error: "File is required." }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: "Upload a file smaller than 10 MB for Walrus storage." },
        { status: 400 },
      );
    }

    const epochs =
      typeof epochsValue === "string" && epochsValue.trim()
        ? epochsValue.trim()
        : process.env.WALRUS_EPOCHS ?? DEFAULT_WALRUS_EPOCHS;

    if (!/^([1-9]\d*|max)$/.test(epochs)) {
      return Response.json({ error: "Walrus epochs must be a positive integer or max." }, { status: 400 });
    }

    const result = await storeBufferOnWalrus({
      data: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      epochs,
    });

    return Response.json({ result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to store file on Walrus." },
      { status: 500 },
    );
  }
}
