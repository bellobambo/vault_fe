import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_WALRUS_PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space";
const DEFAULT_WALRUS_AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";

export type WalrusStoreResult = {
  blobId: string;
  objectId?: string;
  endEpoch?: number;
  size?: number;
  path: string;
};

type WalrusCliStoreEntry = {
  blobStoreResult?: {
    newlyCreated?: {
      blobObject?: {
        id?: string;
        blobId?: string;
        size?: number;
        storage?: {
          endEpoch?: number;
        };
      };
    };
    alreadyCertified?: {
      blobId?: string;
      endEpoch?: number;
    };
  };
  path?: string;
};

type WalrusHttpStoreResponse = {
  newlyCreated?: {
    blobObject?: {
      id?: string;
      blobId?: string;
      size?: number;
      storage?: {
        endEpoch?: number;
      };
    };
  };
  alreadyCertified?: {
    blobId?: string;
    endEpoch?: number;
  };
};

export async function storeBufferOnWalrus({
  data,
  filename,
  epochs,
}: {
  data: Buffer;
  filename: string;
  epochs: string;
}): Promise<WalrusStoreResult> {
  if ((process.env.WALRUS_STORAGE_DRIVER ?? "http") !== "cli") {
    return storeBufferWithPublisher({ data, filename, epochs });
  }

  return storeBufferWithCli({ data, filename, epochs });
}

async function storeBufferWithCli({
  data,
  filename,
  epochs,
}: {
  data: Buffer;
  filename: string;
  epochs: string;
}): Promise<WalrusStoreResult> {
  const workDir = path.join(tmpdir(), `vault-walrus-${randomUUID()}`);
  const safeFilename = sanitizeFilename(filename);
  const filePath = path.join(workDir, safeFilename);

  await mkdir(workDir, { recursive: true });

  try {
    await writeFile(filePath, data);

    const { stdout, stderr } = await execFileAsync(
      process.env.WALRUS_BIN ?? "walrus",
      [
        "store",
        filePath,
        "--epochs",
        epochs,
        "--context",
        process.env.WALRUS_CONTEXT ?? "testnet",
        "--json",
      ],
      {
        maxBuffer: 1024 * 1024 * 8,
        timeout: 180_000,
      },
    );

    return parseWalrusStoreOutput(`${stdout}\n${stderr}`, filePath);
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
}

export async function readBlobFromWalrus(blobId: string): Promise<Buffer> {
  if ((process.env.WALRUS_STORAGE_DRIVER ?? "http") !== "cli") {
    return readBlobWithAggregator(blobId);
  }

  return readBlobWithCli(blobId);
}

async function readBlobWithCli(blobId: string): Promise<Buffer> {
  const workDir = path.join(tmpdir(), `vault-walrus-read-${randomUUID()}`);
  const outPath = path.join(workDir, "blob");

  await mkdir(workDir, { recursive: true });

  try {
    await execFileAsync(
      process.env.WALRUS_BIN ?? "walrus",
      [
        "read",
        blobId,
        "--out",
        outPath,
        "--context",
        process.env.WALRUS_CONTEXT ?? "testnet",
        "--skip-consistency-check",
      ],
      {
        maxBuffer: 1024 * 1024 * 8,
        timeout: 120_000,
      },
    );

    return readFile(outPath);
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
}

async function storeBufferWithPublisher({
  data,
  filename,
  epochs,
}: {
  data: Buffer;
  filename: string;
  epochs: string;
}): Promise<WalrusStoreResult> {
  const publisherUrl = process.env.WALRUS_PUBLISHER_URL ?? DEFAULT_WALRUS_PUBLISHER_URL;
  const url = new URL("/v1/blobs", publisherUrl);

  if (epochs !== "max") {
    url.searchParams.set("epochs", epochs);
  }

  const response = await fetch(url, {
    method: "PUT",
    body: new Uint8Array(data),
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Vault-Filename": sanitizeFilename(filename),
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Walrus publisher failed (${response.status}): ${text || response.statusText}`);
  }

  return parseWalrusHttpStoreOutput(text, filename);
}

async function readBlobWithAggregator(blobId: string): Promise<Buffer> {
  const aggregatorUrl = process.env.WALRUS_AGGREGATOR_URL ?? DEFAULT_WALRUS_AGGREGATOR_URL;
  const url = new URL(`/v1/blobs/${encodeURIComponent(blobId)}`, aggregatorUrl);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Walrus aggregator failed (${response.status}): ${await response.text() || response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function parseWalrusStoreOutput(output: string, fallbackPath: string): WalrusStoreResult {
  const trimmed = output.trim();
  const jsonStart = trimmed.indexOf("[");
  const jsonEnd = trimmed.lastIndexOf("]");

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    throw new Error("Walrus store did not return JSON output.");
  }

  const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as WalrusCliStoreEntry[];
  const entry = parsed[0];
  const newlyCreated = entry?.blobStoreResult?.newlyCreated?.blobObject;
  const alreadyCertified = entry?.blobStoreResult?.alreadyCertified;
  const blobId = newlyCreated?.blobId ?? alreadyCertified?.blobId;

  if (!blobId) {
    throw new Error("Walrus store response did not include a blob ID.");
  }

  return {
    blobId,
    objectId: newlyCreated?.id,
    endEpoch: newlyCreated?.storage?.endEpoch ?? alreadyCertified?.endEpoch,
    size: newlyCreated?.size,
    path: entry?.path ?? fallbackPath,
  };
}

function parseWalrusHttpStoreOutput(output: string, fallbackPath: string): WalrusStoreResult {
  const parsed = JSON.parse(output) as WalrusHttpStoreResponse;
  const newlyCreated = parsed.newlyCreated?.blobObject;
  const alreadyCertified = parsed.alreadyCertified;
  const blobId = newlyCreated?.blobId ?? alreadyCertified?.blobId;

  if (!blobId) {
    throw new Error("Walrus publisher response did not include a blob ID.");
  }

  return {
    blobId,
    objectId: newlyCreated?.id,
    endEpoch: newlyCreated?.storage?.endEpoch ?? alreadyCertified?.endEpoch,
    size: newlyCreated?.size,
    path: fallbackPath,
  };
}

function sanitizeFilename(filename: string) {
  const sanitized = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized || "upload.bin";
}
