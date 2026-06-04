import { BUDGET_CYCLES, DEFAULT_CATEGORIES } from "@/src/config/vault";

export const runtime = "nodejs";

type VaultOption = {
  id?: unknown;
  categories?: unknown;
};

type DraftRequest = {
  text?: unknown;
  vaultRows?: unknown;
  memories?: unknown;
};

type OpenAiIntentDraft = {
  kind: "budget" | "action" | "memory" | "unknown";
  confidence: number;
  values: {
    action: "spend" | "swap" | "overspend" | null;
    cycle: keyof typeof BUDGET_CYCLES | null;
    allowOverspend: boolean | null;
    memoryTitle: string | null;
    memoryBody: string | null;
    allocations: Array<{ categoryId: number; amount: string }>;
    vaultId: string | null;
    recipient: string | null;
    categoryId: number | null;
    fromCategoryId: number | null;
    toCategoryId: number | null;
    amount: string | null;
    note: string | null;
    batchActions: Array<{
      action: "spend" | "swap" | "overspend";
      recipient: string | null;
      categoryId: number | null;
      fromCategoryId: number | null;
      toCategoryId: number | null;
      amount: string;
      note: string | null;
    }>;
  };
};

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "confidence", "values"],
  properties: {
    kind: { type: "string", enum: ["budget", "action", "memory", "unknown"] },
    confidence: { type: "number" },
    values: {
      type: "object",
      additionalProperties: false,
      required: [
        "action",
        "cycle",
        "allowOverspend",
        "memoryTitle",
        "memoryBody",
        "allocations",
        "vaultId",
        "recipient",
        "categoryId",
        "fromCategoryId",
        "toCategoryId",
        "amount",
        "note",
        "batchActions",
      ],
      properties: {
        action: { anyOf: [{ type: "string", enum: ["spend", "swap", "overspend"] }, { type: "null" }] },
        cycle: {
          anyOf: [
            { type: "string", enum: Object.keys(BUDGET_CYCLES) },
            { type: "null" },
          ],
        },
        allowOverspend: { anyOf: [{ type: "boolean" }, { type: "null" }] },
        memoryTitle: { anyOf: [{ type: "string" }, { type: "null" }] },
        memoryBody: { anyOf: [{ type: "string" }, { type: "null" }] },
        allocations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["categoryId", "amount"],
            properties: {
              categoryId: { type: "integer", enum: DEFAULT_CATEGORIES.map((category) => category.id) },
              amount: { type: "string" },
            },
          },
        },
        vaultId: { anyOf: [{ type: "string" }, { type: "null" }] },
        recipient: { anyOf: [{ type: "string" }, { type: "null" }] },
        categoryId: {
          anyOf: [
            { type: "integer", enum: DEFAULT_CATEGORIES.map((category) => category.id) },
            { type: "null" },
          ],
        },
        fromCategoryId: {
          anyOf: [
            { type: "integer", enum: DEFAULT_CATEGORIES.map((category) => category.id) },
            { type: "null" },
          ],
        },
        toCategoryId: {
          anyOf: [
            { type: "integer", enum: DEFAULT_CATEGORIES.map((category) => category.id) },
            { type: "null" },
          ],
        },
        amount: { anyOf: [{ type: "string" }, { type: "null" }] },
        note: { anyOf: [{ type: "string" }, { type: "null" }] },
        batchActions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["action", "recipient", "categoryId", "fromCategoryId", "toCategoryId", "amount", "note"],
            properties: {
              action: { type: "string", enum: ["spend", "swap", "overspend"] },
              recipient: { anyOf: [{ type: "string" }, { type: "null" }] },
              categoryId: {
                anyOf: [
                  { type: "integer", enum: DEFAULT_CATEGORIES.map((category) => category.id) },
                  { type: "null" },
                ],
              },
              fromCategoryId: {
                anyOf: [
                  { type: "integer", enum: DEFAULT_CATEGORIES.map((category) => category.id) },
                  { type: "null" },
                ],
              },
              toCategoryId: {
                anyOf: [
                  { type: "integer", enum: DEFAULT_CATEGORIES.map((category) => category.id) },
                  { type: "null" },
                ],
              },
              amount: { type: "string" },
              note: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
          },
        },
      },
    },
  },
} as const;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
    }

    const body = (await request.json()) as DraftRequest;
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return Response.json({ error: "Intention text is required." }, { status: 400 });
    }

    const vaultRows = normalizeVaultRows(body.vaultRows);
    const memories = normalizeMemories(body.memories);
    const model = process.env.OPENAI_INTENT_MODEL ?? "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        input: [
          {
            role: "system",
            content: [
              "You convert student budgeting commands into structured Vault app drafts.",
              "Return only fields supported by the schema.",
              "Prefer budget when the user asks to create, budget, allocate, split, or plan funds.",
              "Prefer action for spend, send, pay, swap, move, or overspend commands.",
              "Use memory when the user is asking to search or recall receipts, notes, documents, history, or totals.",
              "Use unknown if the request is unrelated to Vault.",
              "Cycles: daily=1 day, weekly=7 days, monthly=30 days, halfYear=6 months, yearly=12 months.",
              "For budget drafts, set memoryTitle to 'AI drafted budget', memoryBody to the original user text, and include five allocation rows.",
              "If a budget gives only a total amount, split it across all five categories with Food and Transport slightly higher priority.",
              "For action drafts, use only a vaultId from the provided vaults. If none is clear, use the latest vault when available.",
              "For multi-action prompts, return one action draft with batchActions filled in order. Set top-level action to spend, top-level amount to the first operation amount, and use null for top-level single-action fields when they do not apply.",
              "Detect category aliases from natural language: transport, transportation, bus, taxi, and fares mean Transport; books, textbooks, school, fees, and academics mean Academics; entertainment, utilities, data, internet, and light mean Entertainment/Utilities.",
              "For swap operations, fill fromCategoryId and toCategoryId whenever the source and destination categories are stated.",
              "Do not invent Sui addresses.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              intention: text,
              categories: DEFAULT_CATEGORIES,
              vaults: vaultRows,
              recalledMemories: memories,
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "vault_intention_draft",
            strict: true,
            schema: responseSchema,
          },
        },
      }),
    });

    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      return Response.json({ error: readOpenAiError(payload) }, { status: 502 });
    }

    const draft = parseOpenAiDraft(payload);

    if (!draft || draft.kind === "memory" || draft.kind === "unknown" || draft.confidence < 0.35) {
      return Response.json({ draft: null, model });
    }

    return Response.json({ draft: normalizeDraft(draft, text, vaultRows), model });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to draft intention." },
      { status: 500 },
    );
  }
}

function normalizeVaultRows(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item: VaultOption, index) => {
    if (!item || typeof item.id !== "string") {
      return [];
    }

    return [{
      id: item.id,
      index: index + 1,
      categories: normalizeCategories(item.categories),
    }];
  });
}

function normalizeCategories(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const category = item as { id?: unknown; name?: unknown; allocation?: unknown };
    return typeof category.id === "number"
      ? [{
        id: category.id,
        name: typeof category.name === "string" ? category.name : "Category",
        allocation: String(category.allocation ?? ""),
      }]
      : [];
  });
}

function normalizeMemories(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const memory = item as { text?: unknown };
    return typeof memory.text === "string" ? [memory.text.slice(0, 800)] : [];
  }).slice(0, 6);
}

function parseOpenAiDraft(payload: unknown): OpenAiIntentDraft | null {
  const text = readOutputText(payload);

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as OpenAiIntentDraft;
  } catch {
    return null;
  }
}

function readOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const response = payload as { output_text?: unknown; output?: unknown };

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return "";
  }

  for (const item of response.output) {
    if (!item || typeof item !== "object" || !Array.isArray((item as { content?: unknown }).content)) {
      continue;
    }

    for (const content of (item as { content: unknown[] }).content) {
      if (content && typeof content === "object" && typeof (content as { text?: unknown }).text === "string") {
        return (content as { text: string }).text;
      }
    }
  }

  return "";
}

function normalizeDraft(draft: OpenAiIntentDraft, originalText: string, vaultRows: Array<{ id: string }>) {
  if (draft.kind === "budget") {
    return {
      kind: "budget",
      values: {
        cycle: draft.values.cycle ?? "monthly",
        allowOverspend: draft.values.allowOverspend ?? true,
        memoryTitle: draft.values.memoryTitle || "AI drafted budget",
        memoryBody: draft.values.memoryBody || originalText,
        allocations: normalizeAllocations(draft.values.allocations),
      },
    };
  }

  if (draft.kind === "action") {
    const batchActions = normalizeBatchActions(draft.values.batchActions);

    return {
      kind: "action",
      values: {
        mode: batchActions.length > 1 ? "batch" : "single",
        action: draft.values.action ?? "spend",
        vaultId: draft.values.vaultId && vaultRows.some((vault) => vault.id === draft.values.vaultId)
          ? draft.values.vaultId
          : vaultRows[vaultRows.length - 1]?.id,
        recipient: draft.values.recipient ?? undefined,
        categoryId: draft.values.categoryId ?? undefined,
        fromCategoryId: draft.values.fromCategoryId ?? undefined,
        toCategoryId: draft.values.toCategoryId ?? undefined,
        amount: draft.values.amount ?? "",
        note: draft.values.note || originalText,
        batchActions,
      },
    };
  }

  return null;
}

function normalizeBatchActions(actions: OpenAiIntentDraft["values"]["batchActions"]) {
  return actions.flatMap((action) => {
    if (!action.amount) {
      return [];
    }

    return [{
      action: action.action,
      recipient: action.recipient ?? undefined,
      categoryId: action.categoryId ?? undefined,
      fromCategoryId: action.fromCategoryId ?? undefined,
      toCategoryId: action.toCategoryId ?? undefined,
      amount: action.amount,
      note: action.note ?? undefined,
    }];
  });
}

function normalizeAllocations(allocations: OpenAiIntentDraft["values"]["allocations"]) {
  return DEFAULT_CATEGORIES.map((category) => {
    const allocation = allocations.find((item) => item.categoryId === category.id);
    return {
      categoryId: category.id,
      amount: allocation?.amount ?? "",
    };
  });
}

function readOpenAiError(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "OpenAI request failed.";
  }

  const error = (payload as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : "OpenAI request failed.";
}
