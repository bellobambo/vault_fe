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

  const records = getMemoryRecordDrafts();
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

  const records = getMemoryRecordDrafts();
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

  const records = getMemoryRecordDrafts();
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      records.map((item) => (item.id === record.id ? record : item)),
    ),
  );
}

export function getMemoryRecordDrafts(): MemoryRecord[] {
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
