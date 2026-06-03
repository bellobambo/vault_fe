export type MemoryRecordKind = "budget" | "receipt" | "document" | "history";

export type MemoryRecordInput = {
  owner?: string;
  kind: MemoryRecordKind;
  title: string;
  body?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentDataUrl?: string;
  tags?: string[];
};

export type MemoryRecord = MemoryRecordInput & {
  id: string;
  memoryRef: string;
  createdAt: string;
  memwalJobId?: string;
  walrusBlobId?: string;
  attachmentWalrusBlobId?: string;
  attachmentWalrusObjectId?: string;
  attachmentWalrusEndEpoch?: number;
  txDigest?: string;
  storage: {
    memwal: "pending" | "accepted" | "saved" | "failed";
    walrus: "pending" | "saved";
  };
};

export type RecalledMemory = {
  blob_id: string;
  text: string;
  distance: number;
};

const STORAGE_KEY = "vault:memory-records";

function normalizeOwner(owner?: string) {
  return owner?.trim().toLowerCase();
}

function recordBelongsToOwner(record: MemoryRecord, owner?: string) {
  const normalizedOwner = normalizeOwner(owner);

  if (!normalizedOwner) {
    return false;
  }

  return normalizeOwner(record.owner) === normalizedOwner;
}

export function createMemoryRecord(input: MemoryRecordInput): MemoryRecord {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = input.owner ?? "unconnected";

  return {
    ...input,
    id,
    owner,
    createdAt: new Date().toISOString(),
    memoryRef: `memwal://vault/${owner}/${input.kind}/${id}`,
    storage: {
      memwal: "pending",
      walrus: "pending",
    },
  };
}

export function saveMemoryRecordDraft(record: MemoryRecord) {
  if (typeof window === "undefined") {
    return;
  }

  const records = getAllMemoryRecordDrafts();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...records]));
}

export function updateMemoryRecordDraft(
  id: string,
  updates: Partial<
    Pick<
      MemoryRecord,
      | "memwalJobId"
      | "walrusBlobId"
      | "attachmentWalrusBlobId"
      | "attachmentWalrusObjectId"
      | "attachmentWalrusEndEpoch"
      | "txDigest"
      | "storage"
    >
  >,
) {
  if (typeof window === "undefined") {
    return;
  }

  const records = getAllMemoryRecordDrafts();
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      records.map((record) =>
        record.id === id
          ? {
              ...record,
              ...updates,
              storage: updates.storage ?? record.storage,
            }
          : record,
      ),
    ),
    );
}

export function replaceMemoryRecordDraft(record: MemoryRecord) {
  if (typeof window === "undefined") {
    return;
  }

  const records = getAllMemoryRecordDrafts();
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      records.map((item) => (item.id === record.id ? record : item)),
    ),
  );
}

function getAllMemoryRecordDrafts(): MemoryRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as MemoryRecord[];
  } catch {
    return [];
  }
}

export function getMemoryRecordDrafts(owner?: string): MemoryRecord[] {
  return getAllMemoryRecordDrafts().filter((record) => recordBelongsToOwner(record, owner));
}

export function getFallbackMemoryRecordDrafts(owner?: string): MemoryRecord[] {
  return getMemoryRecordDrafts(owner).filter(
    (record) => record.storage.memwal !== "saved" || record.storage.walrus !== "saved",
  );
}

export function parseSerializedMemoryRecord(
  text: string,
  options: { owner?: string; walrusBlobId?: string } = {},
): MemoryRecord | null {
  const fields = new Map<string, string>();

  for (const line of text.split("\n")) {
    const [label, ...rest] = line.split(":");
    const value = rest.join(":").trim();

    if (value) {
      fields.set(label.trim().toLowerCase(), value);
    }
  }

  const title = fields.get("vault memory");
  const kind = fields.get("kind");
  const owner = fields.get("owner") ?? options.owner;
  const memoryRef = fields.get("reference");
  const createdAt = fields.get("created");

  if (!title || !isMemoryRecordKind(kind) || !owner || !createdAt) {
    return null;
  }

  const requestedOwner = normalizeOwner(options.owner);

  if (requestedOwner && normalizeOwner(owner) !== requestedOwner) {
    return null;
  }

  const attachmentWalrusEndEpoch = Number(fields.get("attachment walrus end epoch"));

  return {
    id: memoryRef?.split("/").pop() || `${owner}-${createdAt}-${title}`,
    owner,
    kind,
    title,
    body: fields.get("details"),
    attachmentName: fields.get("attachment"),
    attachmentWalrusBlobId: fields.get("attachment walrus blob"),
    attachmentWalrusObjectId: fields.get("attachment walrus object"),
    attachmentWalrusEndEpoch: Number.isFinite(attachmentWalrusEndEpoch)
      ? attachmentWalrusEndEpoch
      : undefined,
    walrusBlobId: fields.get("memwal walrus blob") ?? options.walrusBlobId,
    txDigest: fields.get("sui transaction"),
    tags: fields.get("tags")?.split(",").map((tag) => tag.trim()).filter(Boolean),
    createdAt,
    memoryRef: memoryRef ?? `memwal://vault/${owner}/${kind}/${createdAt}`,
    storage: {
      memwal: "saved",
      walrus: fields.get("attachment walrus blob") || fields.get("memwal walrus blob") || options.walrusBlobId
        ? "saved"
        : "pending",
    },
  };
}

function isMemoryRecordKind(value?: string): value is MemoryRecordKind {
  return value === "budget" || value === "receipt" || value === "document" || value === "history";
}

export function serializeMemoryRecord(record: MemoryRecord) {
  return [
    `Vault memory: ${record.title}`,
    `Kind: ${record.kind}`,
    `Owner: ${record.owner}`,
    `Reference: ${record.memoryRef}`,
    `Created: ${record.createdAt}`,
    record.attachmentName ? `Attachment: ${record.attachmentName}` : undefined,
    record.attachmentWalrusBlobId ? `Attachment Walrus blob: ${record.attachmentWalrusBlobId}` : undefined,
    record.attachmentWalrusObjectId ? `Attachment Walrus object: ${record.attachmentWalrusObjectId}` : undefined,
    record.attachmentWalrusEndEpoch ? `Attachment Walrus end epoch: ${record.attachmentWalrusEndEpoch}` : undefined,
    record.walrusBlobId ? `MemWal Walrus blob: ${record.walrusBlobId}` : undefined,
    record.txDigest ? `Sui transaction: ${record.txDigest}` : undefined,
    record.body ? `Details: ${record.body}` : undefined,
    record.tags?.length ? `Tags: ${record.tags.join(", ")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}
