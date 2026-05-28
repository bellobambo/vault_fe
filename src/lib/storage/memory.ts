export type MemoryRecordKind = "budget" | "receipt" | "document" | "history";

export type MemoryRecordInput = {
  owner?: string;
  kind: MemoryRecordKind;
  title: string;
  body?: string;
  tags?: string[];
};

export type MemoryRecord = MemoryRecordInput & {
  id: string;
  memoryRef: string;
  createdAt: string;
  storage: {
    memwal: "pending" | "saved";
    walrus: "pending" | "saved";
  };
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
