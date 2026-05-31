"use client";

import {
  ConnectButton,
  useCurrentAccount,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientQuery,
} from "@mysten/dapp-kit";
import { CloudDownloadOutlined, RobotOutlined, SendOutlined, SyncOutlined } from "@ant-design/icons";
import type { SuiEvent } from "@mysten/sui/jsonRpc";
import {
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { SelectProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  BUDGET_CYCLES,
  DEFAULT_CATEGORIES,
  SUI_NETWORK,
  VAULT_FEES_BPS,
  VAULT_EVENT_TYPES,
  VAULT_PACKAGE_ID,
} from "@/src/config/vault";
import {
  buildCreateBudgetTransaction,
  buildOverspendTransaction,
  buildSpendTransaction,
  buildSwapCategoriesTransaction,
  suiToMist,
} from "@/src/lib/sui/vault";
import {
  createMemoryRecord,
  getMemoryRecordDrafts,
  saveMemoryRecordDraft,
  serializeMemoryRecord,
  type MemoryRecord,
  type RecalledMemory,
  updateMemoryRecordDraft,
} from "@/src/lib/storage/memory";

type CreateBudgetValues = {
  cycle: keyof typeof BUDGET_CYCLES;
  allowOverspend: boolean;
  memoryTitle?: string;
  memoryBody?: string;
  allocations: Array<{
    categoryId: number;
    amount: string;
  }>;
};

type AllocationDraft = {
  categoryId: number;
  name?: string;
  amount: string;
};

type VaultCategoryOption = {
  id: number;
  name: string;
  allocation: string | number | bigint;
};

type HistoryEvent = {
  event: SuiEvent;
  fields: Record<string, unknown>;
  name: string;
};

type ActionValues = {
  action: "spend" | "swap" | "overspend";
  vaultId: string;
  recipient?: string;
  categoryId?: number;
  fromCategoryId?: number;
  toCategoryId?: number;
  amount: string;
  note?: string;
  _skipOverspendCheck?: boolean;
};

type DrawerKey = "createBudget" | "actions" | "storage" | "history" | "assistant";

type RememberApiResponse = {
  namespace: string;
  result: {
    id?: string;
    job_id?: string;
    blob_id?: string;
    status?: string;
  };
};

type RecallApiResponse = {
  namespace: string;
  result: {
    results: RecalledMemory[];
    total: number;
  };
};

const cycleDurationsMs: Record<keyof typeof BUDGET_CYCLES, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  halfYear: 182 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000,
};

const cycleDurationDays: Record<keyof typeof BUDGET_CYCLES, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  halfYear: 182,
  yearly: 365,
};

export function VaultApp() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const suiClient = useSuiClient();
  const [createForm] = Form.useForm<CreateBudgetValues>();
  const [actionForm] = Form.useForm<ActionValues>();
  const [documentForm] = Form.useForm();
  const [openDrawer, setOpenDrawer] = useState<DrawerKey | null>(null);
  const [activeAction, setActiveAction] = useState<ActionValues["action"]>("spend");
  const [isAICommanderOpen, setIsAICommanderOpen] = useState(false);
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>(getMemoryRecordDrafts);
  const [recalledMemories, setRecalledMemories] = useState<RecalledMemory[]>([]);
  const [assistantText, setAssistantText] = useState("");
  const [isRemembering, setIsRemembering] = useState(false);
  const [isRecalling, setIsRecalling] = useState(false);
  const [isExecutingAI, setIsExecutingAI] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastDigest, setLastDigest] = useState<string>();
  const [actionCategories, setActionCategories] = useState<VaultCategoryOption[]>([]);
  const [overspendModal, setOverspendModal] = useState<{
    visible: boolean;
    vaultId: string;
    categoryId: number;
    amount: number;
    categoryName: string;
    remaining: number;
  } | null>(null);

  // Handle form value changes to auto-calculate Other category in real-time
  function handleCreateFormValuesChange(
    _changedFields: Partial<CreateBudgetValues>,
    allFields: Partial<CreateBudgetValues>,
  ) {
    const allocations = allFields.allocations || [];
    const firstFourAmounts = allocations
      .slice(0, 4)
      .map((allocation) => parseFloat(allocation?.amount ?? "") || 0);
    const validAmounts = firstFourAmounts.filter((amount: number) => amount > 0);

    // Always recalculate Other whenever allocations change
    if (allocations.length > 0 && validAmounts.length > 0) {
      const average = validAmounts.reduce((sum: number, a: number) => sum + a, 0) / validAmounts.length;
      const suggestedValue = average.toFixed(2);
      createForm.setFieldValue(["allocations", 4, "amount"], suggestedValue);
    }
  }

  const suiBalance = useSuiClientQuery(
    "getBalance",
    { owner: account?.address ?? "" },
    { enabled: Boolean(account?.address) },
  );

  const ownedVaults = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address ?? "",
      filter: { StructType: `${VAULT_PACKAGE_ID}::vault::BudgetVault` },
      options: {
        showContent: true,
        showType: true,
      },
    },
    { enabled: Boolean(account?.address) },
  );

  const historyEvents = useSuiClientQuery(
    "queryEvents",
    {
      query: {
        MoveEventModule: {
          package: VAULT_PACKAGE_ID,
          module: "vault",
        },
      },
      limit: 50,
      order: "descending",
    },
    { enabled: openDrawer === "history" && Boolean(account?.address) },
  );

  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction({
    execute: async ({ bytes, signature }) =>
      suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
          showRawEffects: true,
        },
      }),
  });

  const vaultRows = useMemo(() => {
    return (
      ownedVaults.data?.data.map((item) => {
        const content = item.data?.content;
        const fields =
          content && "fields" in content
            ? (content.fields as Record<string, unknown>)
            : {};

        return {
          id: item.data?.objectId ?? "",
          balance: formatMist(fields.balance),
          spent: formatMist(fields.total_spent),
          active: String(fields.active ?? "-"),
          categories: parseVaultCategories(fields.categories),
          duration: formatBudgetDuration(fields.start_ms, fields.end_ms),
          createdAt: formatDateTimeFromMs(fields.start_ms),
        };
      }) ?? []
    );
  }, [ownedVaults.data]);

  const historyRows = useMemo(() => {
    const walletAddress = account?.address.toLowerCase();

    if (!walletAddress) {
      return [];
    }

    return (
      historyEvents.data?.data
        .map((event) => {
          const fields = readEventFields(event.parsedJson);
          return {
            event,
            fields,
            name: event.type.split("::").at(-1) ?? event.type,
          };
        })
        .filter((item) => isVaultHistoryEvent(item.event.type))
        .filter((item) => item.name !== "BudgetCreated")
        .filter((item) => {
          const owner = readStringField(item.fields.owner)?.toLowerCase();
          return owner === walletAddress || item.event.sender.toLowerCase() === walletAddress;
        }) ?? []
    );
  }, [account?.address, historyEvents.data]);

  const spendHistoryRows = useMemo(
    () => historyRows.filter((item) => item.name === "BudgetSpend"),
    [historyRows],
  );

  const swapHistoryRows = useMemo(
    () => historyRows.filter((item) => item.name === "CategorySwap"),
    [historyRows],
  );

  const otherHistoryRows = useMemo(
    () => historyRows.filter((item) => item.name !== "BudgetSpend" && item.name !== "CategorySwap"),
    [historyRows],
  );

  const spendHistoryColumns: ColumnsType<HistoryEvent> = [
    {
      title: "Date",
      key: "date",
      width: 150,
      render: (_value, item) => formatEventTime(item.event),
    },
    {
      title: "Vault",
      key: "vault",
      width: 110,
      render: (_value, item) => shortId(readStringField(item.fields.vault_id) ?? "-"),
    },
    {
      title: "Category",
      key: "category",
      width: 110,
      render: (_value, item) => formatCategoryName(item.fields.category),
    },
    {
      title: "Amount",
      key: "amount",
      width: 110,
      render: (_value, item) => formatMist(item.fields.amount),
    },
    {
      title: "Fee",
      key: "fee",
      width: 100,
      render: (_value, item) => formatMist(item.fields.fee),
    },
    {
      title: "Recipient",
      key: "recipient",
      width: 115,
      render: (_value, item) => shortId(readStringField(item.fields.recipient) ?? "-"),
    },
    {
      title: "Type",
      key: "type",
      width: 100,
      render: (_value, item) => (
        <span style={{ color: item.fields.overspend ? "#ff4d4f" : "inherit" }}>
          {item.fields.overspend ? "Overspend" : "Spend"}
        </span>
      ),
    },
    {
      title: "Tx",
      key: "tx",
      width: 115,
      render: (_value, item) => shortId(item.event.id.txDigest),
    },
  ];

  const swapHistoryColumns: ColumnsType<HistoryEvent> = [
    {
      title: "Date",
      key: "date",
      width: 150,
      render: (_value, item) => formatEventTime(item.event),
    },
    {
      title: "Vault",
      key: "vault",
      width: 110,
      render: (_value, item) => shortId(readStringField(item.fields.vault_id) ?? "-"),
    },
    {
      title: "From",
      key: "from",
      width: 110,
      render: (_value, item) => formatCategoryName(item.fields.from_category),
    },
    {
      title: "To",
      key: "to",
      width: 110,
      render: (_value, item) => formatCategoryName(item.fields.to_category),
    },
    {
      title: "Amount",
      key: "amount",
      width: 110,
      render: (_value, item) => formatMist(item.fields.amount),
    },
    {
      title: "Fee",
      key: "fee",
      width: 100,
      render: (_value, item) => formatMist(item.fields.fee),
    },
    {
      title: "Tx",
      key: "tx",
      width: 115,
      render: (_value, item) => shortId(item.event.id.txDigest),
    },
  ];

  async function remember(input: {
    kind: "budget" | "receipt" | "document" | "history";
    title?: string;
    body?: string;
  }) {
    const record = createMemoryRecord({
      owner: account?.address,
      kind: input.kind,
      title: input.title?.trim() || `${input.kind} record`,
      body: input.body,
      tags: ["vault", SUI_NETWORK],
    });

    saveMemoryRecordDraft(record);
    setMemoryRecords(getMemoryRecordDrafts());

    try {
      setIsRemembering(true);
      const response = await fetch("/api/memwal/remember", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: account?.address,
          text: serializeMemoryRecord(record),
          wait: true,
        }),
      });
      const payload = (await response.json()) as RememberApiResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to save memory.");
      }

      const result = (payload as RememberApiResponse).result;
      const savedRecord: MemoryRecord = {
        ...record,
        memwalJobId: result.job_id ?? result.id,
        walrusBlobId: result.blob_id,
        storage: {
          memwal: result.blob_id ? "saved" : "accepted",
          walrus: result.blob_id ? "saved" : "pending",
        },
      };

      updateMemoryRecordDraft(savedRecord.id, {
        memwalJobId: savedRecord.memwalJobId,
        walrusBlobId: savedRecord.walrusBlobId,
        storage: savedRecord.storage,
      });
      setMemoryRecords(getMemoryRecordDrafts());
      return savedRecord;
    } catch (error) {
      updateMemoryRecordDraft(record.id, {
        storage: {
          memwal: "failed",
          walrus: "pending",
        },
      });
      setMemoryRecords(getMemoryRecordDrafts());
      throw error;
    } finally {
      setIsRemembering(false);
    }
  }

  async function handleCreateBudget(values: CreateBudgetValues) {
    if (!account) {
      toast.error("Connect your Sui wallet first.");
      return;
    }

    const categories = values.allocations.map((allocation) => {
      const category = DEFAULT_CATEGORIES.find(
        (item) => item.id === allocation.categoryId,
      );

      return {
        id: allocation.categoryId,
        name: category?.name ?? "Category",
        allocationMist: suiToMist(allocation.amount || "0"),
      };
    });
    const amountMist = categories.reduce(
      (total, category) => total + category.allocationMist,
      BigInt(0),
    );
    const now = Date.now();
    let memory: MemoryRecord;

    try {
      memory = await remember({
        kind: "budget",
        title: values.memoryTitle || "Budget plan",
        body: [
          values.memoryBody,
          `Cycle: ${values.cycle}`,
          `Total: ${formatMist(amountMist)}`,
          `Allocations: ${categories
            .map((category) => `${category.name} ${formatMist(category.allocationMist)}`)
            .join(", ")}`,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save memory.");
      return;
    }

    const tx = buildCreateBudgetTransaction({
      amountMist,
      cycle: BUDGET_CYCLES[values.cycle],
      startMs: now,
      endMs: now + cycleDurationsMs[values.cycle],
      categories,
      allowOverspend: values.allowOverspend,
      memoryRef: memory.memoryRef,
    });

    signAndExecute(
      { transaction: tx, chain: "sui:testnet" },
      {
        onSuccess: (result) => {
          setLastDigest(result.digest);
          toast.success("Budget transaction sent.");
          ownedVaults.refetch();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  async function handleVaultAction(values: ActionValues, onComplete?: () => void) {
    if (!account) {
      toast.error("Connect your Sui wallet first.");
      onComplete?.();
      return;
    }

    // Check for overspend on spend action (but not if already confirmed via modal)
    if (values.action === "spend" && values.categoryId !== undefined && !values._skipOverspendCheck) {
      const vault = vaultRows.find((v) => v.id === values.vaultId);

      if (!vault) {
        toast.error("Vault not found. Please refresh and try again.");
        onComplete?.();
        return;
      }

      const category = vault.categories.find((c) => c.id === values.categoryId);

      if (!category) {
        toast.error(`Category ${values.categoryId} not found in vault. Please select a valid category.`);
        onComplete?.();
        return;
      }

      const allocation = Number(category.allocation) / 1e9; // Convert from MIST to SUI

      // Calculate spent in this category from history
      const spentInCategory = spendHistoryRows
        .filter(
          (item) =>
            readStringField(item.fields.vault_id) === values.vaultId &&
            Number(item.fields.category) === values.categoryId,
        )
        .reduce((sum, item) => sum + (Number(item.fields.amount) || 0), 0) / 1e9;

      const remaining = allocation - spentInCategory;
      const spendAmount = Number(values.amount);

      if (spendAmount > remaining) {
        // Show overspend modal with full category details
        setOverspendModal({
          visible: true,
          vaultId: values.vaultId,
          categoryId: values.categoryId,
          amount: spendAmount,
          categoryName: category.name,
          remaining,
        });
        onComplete?.();
        return;
      }
    }

    let memory: MemoryRecord;

    try {
      memory = await remember({
        kind: values.action === "spend" ? "receipt" : "history",
        title: `${values.action} record`,
        body: [
          values.note,
          `Vault: ${values.vaultId}`,
          `Action: ${values.action}`,
          `Amount: ${values.amount} SUI`,
          values.categoryId !== undefined ? `Category: ${values.categoryId}` : undefined,
          values.fromCategoryId !== undefined ? `From category: ${values.fromCategoryId}` : undefined,
          values.toCategoryId !== undefined ? `To category: ${values.toCategoryId}` : undefined,
          values.recipient ? `Recipient: ${values.recipient}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save memory.");
      onComplete?.();
      return;
    }

    const amountMist = suiToMist(values.amount);
    const tx =
      values.action === "swap"
        ? buildSwapCategoriesTransaction({
          vaultId: values.vaultId,
          fromCategoryId: Number(values.fromCategoryId),
          toCategoryId: Number(values.toCategoryId),
          amountMist,
        })
        : values.action === "overspend"
          ? buildOverspendTransaction({
            vaultId: values.vaultId,
            categoryId: Number(values.categoryId),
            recipient: values.recipient ?? "",
            amountMist,
            note: memory.memoryRef,
          })
          : buildSpendTransaction({
            vaultId: values.vaultId,
            categoryId: Number(values.categoryId),
            recipient: values.recipient ?? "",
            amountMist,
            note: memory.memoryRef,
          });

    signAndExecute(
      { transaction: tx, chain: "sui:testnet" },
      {
        onSuccess: (result) => {
          setLastDigest(result.digest);
          toast.success(`${values.action} transaction sent.`);
          ownedVaults.refetch();
          onComplete?.();
        },
        onError: (error) => {
          toast.error(error.message);
          onComplete?.();
        },
      },
    );
  }

  async function handleDocumentSave(values: { title: string; body?: string }) {
    try {
      await remember({
        kind: "document",
        title: values.title,
        body: values.body,
      });
      documentForm.resetFields();
      toast.success("Document saved to MemWal/Walrus.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save document.");
    }
  }

  async function handleMemoryRecall(query = assistantText) {
    if (!account) {
      toast.error("Connect your Sui wallet first.");
      return [];
    }

    const trimmed = query.trim();
    if (!trimmed) {
      toast.error("Enter a memory query.");
      return [];
    }

    try {
      setIsRecalling(true);
      const response = await fetch("/api/memwal/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: account.address,
          query: trimmed,
          limit: 6,
          maxDistance: 0.85,
        }),
      });
      const payload = (await response.json()) as RecallApiResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to recall memory.");
      }

      const memories = (payload as RecallApiResponse).result.results;
      setRecalledMemories(memories);
      return memories;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to recall memory.");
      return [];
    } finally {
      setIsRecalling(false);
    }
  }

  async function handleMemoryRestore() {
    if (!account) {
      toast.error("Connect your Sui wallet first.");
      return;
    }

    try {
      setIsRestoring(true);
      const response = await fetch("/api/memwal/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: account.address, limit: 50 }),
      });
      const payload = (await response.json()) as {
        result?: { restored?: number; skipped?: number; total?: number };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to restore memory index.");
      }

      toast.success(
        `Restored ${payload.result?.restored ?? 0}, skipped ${payload.result?.skipped ?? 0}.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to restore memory index.");
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleAssistantDraft() {
    const text = assistantText.trim();

    if (!text) {
      toast.error("Enter an action.");
      return;
    }

    await handleMemoryRecall(text);

    const draft = createActionDraft(text, vaultRows);

    if (draft.kind === "budget") {
      setIsAICommanderOpen(false);
      setAssistantText("");
      createForm.setFieldsValue(draft.values);
      setOpenDrawer("createBudget");
      return;
    }

    const vault = vaultRows.find((item) => item.id === draft.values.vaultId);
    setActionCategories(vault?.categories ?? []);
    setActiveAction(draft.values.action);
    actionForm.setFieldsValue(draft.values);

    // Direct Execution: Instead of opening drawer, trigger the action handler directly
    if (draft.values.vaultId && draft.values.amount) {
      setIsExecutingAI(true);
      handleVaultAction(draft.values as ActionValues, () => {
        setIsExecutingAI(false);
        setIsAICommanderOpen(false);
        setAssistantText("");
      });
    } else {
      // Fallback: if data is incomplete, open drawer for manual completion
      setIsAICommanderOpen(false);
      setAssistantText("");
      setOpenDrawer("actions");
    }
  }

  async function copyAddress() {
    if (!account?.address) {
      return;
    }

    await navigator.clipboard.writeText(account.address);
    toast.success("Wallet address copied.");
  }

  return (
    <>
      <header className="theme-navbar sticky top-0 z-20 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="theme-brand rounded px-3 py-1.5 text-lg font-bold tracking-wide">
              Vault
            </span>
          </div>

          <Space wrap>
            {account ? (
              <>
                <span className="text-base font-semibold text-[#007979]">
                  {suiBalance.data ? formatMist(suiBalance.data.totalBalance) : "- SUI"}
                </span>
                <button
                  className="wallet-address-button text-base font-semibold text-[#007979]"
                  onClick={copyAddress}
                  type="button"
                >
                  {shortId(account.address)}
                </button>
                <Button onClick={() => disconnect()}>Disconnect</Button>
              </>
            ) : (
              <ConnectButton connectText="Connect wallet" />
            )}
          </Space>
        </div>
      </header>

      <nav className="bg-[#007979] px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex w-full flex-wrap justify-end gap-3">
          <Button
            onClick={() => {
              createForm.resetFields();
              setOpenDrawer("createBudget");
            }}
          >
            Create Budget
          </Button>
          <Button
            onClick={() => {
              setMemoryRecords(getMemoryRecordDrafts());
              setOpenDrawer("storage");
            }}
          >
            Storage
          </Button>
          <Button onClick={() => setOpenDrawer("history")}>History</Button>
        </div>
      </nav>

      <Button
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9999,
          width: "64px",
          height: "64px",
          borderRadius: "50%",
          backgroundColor: "var(--vault-accent)",
          borderColor: "var(--vault-primary)",
          border: "2px solid var(--vault-primary)",
          color: "var(--vault-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3)",
          padding: 0,
          cursor: "pointer",
          transition: "transform 0.2s ease"
        }}
        icon={<RobotOutlined style={{ fontSize: "32px" }} />}
        onClick={() => setIsAICommanderOpen(true)}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      />

      <main className="min-h-[calc(100vh-116px)] bg-[#007979] px-4 py-8 text-[var(--vault-accent)] sm:px-6">
        {!account ? (
          <section className="vault-disconnected mx-auto flex min-h-[calc(100vh-180px)] w-full max-w-3xl flex-col items-center justify-center text-center">
            <Typography.Title className="vault-page-title !mb-3" level={1}>
              Vault
            </Typography.Title>
            <Typography.Paragraph className="vault-page-description !mx-auto !max-w-xl !text-lg">
              Split SUI into spending categories and save the budget memory reference for receipts,
              history, and documents.
            </Typography.Paragraph>
          </section>
        ) : (
          <section className="mx-auto w-full max-w-6xl">
            <div className="mb-8 text-left">
              <Typography.Title className="vault-page-title !mb-0" level={2}>
                My Vault
              </Typography.Title>
            </div>

            {vaultRows.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {vaultRows.map((vault, index) => (
                  <Card
                    key={vault.id}
                    className="compact-card centered-form-card"
                    title={
                      <div className="flex items-center justify-between">
                        <span>Budget Vault #{index + 1}</span>
                        <Tag className="theme-tag">
                          {vault.active === "true" ? "Active" : vault.active}
                        </Tag>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      <div>
                        <Typography.Text type="secondary">Vault ID</Typography.Text>
                        <Typography.Paragraph
                          className="!my-1 break-all font-mono text-xs cursor-pointer hover:text-blue-500 hover:underline transition-all"
                          onClick={async () => {
                            await navigator.clipboard.writeText(vault.id);
                            toast.success("Vault ID copied.");
                          }}
                        >
                          {shortId(vault.id)}
                        </Typography.Paragraph>
                      </div>
                      <div className="flex justify-between gap-4">
                        <div>
                          <Typography.Text type="secondary">Duration</Typography.Text>
                          <Typography.Paragraph className="!my-1 font-bold">
                            {vault.duration}
                          </Typography.Paragraph>
                        </div>
                        <div className="text-right">
                          <Typography.Text type="secondary">Created</Typography.Text>
                          <Typography.Paragraph className="!my-1 font-bold">
                            {vault.createdAt}
                          </Typography.Paragraph>
                        </div>
                      </div>
                      <div className="flex justify-between gap-4">
                        <div>
                          <Typography.Text type="secondary">Balance</Typography.Text>
                          <Typography.Paragraph className="!my-1 font-bold">
                            {vault.balance}
                          </Typography.Paragraph>
                        </div>
                        <div>
                          <Typography.Text type="secondary">Spent</Typography.Text>
                          <Typography.Paragraph className="!my-1 font-bold">
                            {vault.spent}
                          </Typography.Paragraph>
                        </div>
                      </div>
                      <div className="vault-card-actions flex gap-2 border-t border-[var(--vault-primary)] pt-4">
                        <Button
                          className="vault-card-action-primary"
                          size="small"
                          onClick={() => {
                            actionForm.setFieldValue("vaultId", vault.id);
                            actionForm.setFieldValue("action", "spend");
                            setActionCategories(vault.categories);
                            setActiveAction("spend");
                            setOpenDrawer("actions");
                          }}
                        >
                          Spend
                        </Button>
                        <Button
                          size="small"
                          onClick={() => {
                            actionForm.setFieldValue("vaultId", vault.id);
                            actionForm.setFieldValue("action", "swap");
                            setActionCategories(vault.categories);
                            setActiveAction("swap");
                            setOpenDrawer("actions");
                          }}
                        >
                          Swap
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="compact-card centered-form-card text-center">
                <Typography.Paragraph className="!text-[var(--vault-accent)]">
                  No vaults yet. Create your first budget vault to get started.
                </Typography.Paragraph>
              </Card>
            )}

            {lastDigest ? (
              <div className="mt-6 text-center">
                <Typography.Text className="text-xs">
                  Last digest: <span className="font-mono">{lastDigest}</span>
                </Typography.Text>
              </div>
            ) : null}
          </section>
        )}
      </main>

      <Drawer
        open={openDrawer === "createBudget"}
        title="Create Budget Vault"
        onClose={() => setOpenDrawer(null)}
        size="large"
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{
            cycle: "monthly",
            allowOverspend: true,
            allocations: [
              { categoryId: 0, amount: "" },
              { categoryId: 1, amount: "" },
              { categoryId: 2, amount: "" },
              { categoryId: 3, amount: "" },
              { categoryId: 4, amount: "" },
            ],
          }}
          onFinish={handleCreateBudget}
          onValuesChange={handleCreateFormValuesChange}
        >
          <Row gutter={12} align="bottom">
            <Col xs={24}>
              <Form.Item label="Cycle" name="cycle">
                <Select
                  className="theme-control"
                  options={Object.keys(BUDGET_CYCLES).map((cycle) => ({
                    label: `${labelize(cycle)} (${formatDays(cycleDurationDays[cycle as keyof typeof BUDGET_CYCLES])})`,
                    value: cycle,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <div className="allocation-group">
            <Typography.Text className="allocation-title">
              Category allocations
            </Typography.Text>
            <div className="allocation-grid">
              {DEFAULT_CATEGORIES.map((category, index) => (
                <div className="allocation-row" key={category.id}>
                  <Form.Item
                    className="allocation-select"
                    name={["allocations", index, "categoryId"]}
                    rules={[{ required: true }]}
                  >
                    <Input className="hidden-input" readOnly />
                  </Form.Item>
                  <div className="allocation-label">{category.name}</div>
                  <Form.Item
                    className="allocation-amount"
                    name={["allocations", index, "amount"]}
                    rules={[
                      { required: true, message: "Please enter an amount" },
                      ...(category.id === 4
                        ? [{
                          validator: (_rule: unknown, value: string) => {
                            const allocations =
                              (createForm.getFieldValue("allocations") || []) as AllocationDraft[];
                            const firstFourAmounts = allocations
                              .slice(0, 4)
                              .map((allocation) => parseFloat(allocation?.amount ?? "") || 0);
                            const validAmounts = firstFourAmounts.filter((amount: number) => amount > 0);

                            if (validAmounts.length > 0) {
                              const average = validAmounts.reduce((sum: number, a: number) => sum + a, 0) / validAmounts.length;
                              const otherValue = parseFloat(value) || 0;
                              if (otherValue > average) {
                                return Promise.reject(`Other cannot exceed ${average.toFixed(2)} SUI (the average)`);
                              }
                            }
                            return Promise.resolve();
                          }
                        }]
                        : []
                      )
                    ]}
                  >
                    <Input placeholder="0.00" suffix="SUI" />
                  </Form.Item>
                  {category.id === 4 ? (
                    <Typography.Text className="allocation-note">
                      Other input/amount is the average of the four categories
                    </Typography.Text>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <Row gutter={12}>
            <Col xs={24} sm={10}>
              <Form.Item label="Memory title (Optional)" name="memoryTitle">
                <Input className="theme-control" placeholder="Monthly allowance" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={14}>
              <Form.Item label="Memory note (Optional)" name="memoryBody">
                <Input className="theme-control" placeholder="What this budget is for" />
              </Form.Item>
            </Col>
          </Row>

          <Button block htmlType="submit" loading={isPending || isRemembering} type="primary">
            Create budget
          </Button>
        </Form>
      </Drawer>

      <Drawer
        open={openDrawer === "actions"}
        title="Vault Actions"
        onClose={() => {
          setOpenDrawer(null);
          setActionCategories([]);
          actionForm.resetFields();
        }}
        size="large"
      >
        <Space className="mb-4" wrap>
          <Tag className="theme-tag">Swap fee {VAULT_FEES_BPS.categorySwap / 100}%</Tag>
          <Tag className="theme-tag">
            Overspend fee {VAULT_FEES_BPS.overspend / 100}%
          </Tag>
        </Space>

        <Form
          form={actionForm}
          layout="vertical"
          initialValues={{ action: "spend" }}
          onFinish={handleVaultAction}
        >
          <Form.Item name="action">
            <Radio.Group
              buttonStyle="solid"
              onChange={(event) => setActiveAction(event.target.value)}
            >
              <Radio.Button value="spend">Spend</Radio.Button>
              <Radio.Button value="swap">Swap</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="BudgetVault ID" name="vaultId" rules={[{ required: true }]}>
            <Input placeholder="0x..." />
          </Form.Item>

          {activeAction === "swap" ? (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item label="From" name="fromCategoryId" rules={[{ required: true }]}>
                  <CategorySelect categories={actionCategories} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="To" name="toCategoryId" rules={[{ required: true }]}>
                  <CategorySelect categories={actionCategories} />
                </Form.Item>
              </Col>
            </Row>
          ) : (
            <>
              <Form.Item label="Recipient" name="recipient" rules={[{ required: true }]}>
                <Input placeholder="0x..." />
              </Form.Item>
              <Form.Item label="Category" name="categoryId" rules={[{ required: true }]}>
                <CategorySelect categories={actionCategories} />
              </Form.Item>
            </>
          )}

          <Form.Item label="Amount" name="amount" rules={[{ required: true }]}>
            <Input suffix="SUI" />
          </Form.Item>
          <Form.Item label="Receipt note" name="note">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>

          <Button block htmlType="submit" loading={isPending || isRemembering} type="primary">
            Send {activeAction}
          </Button>
        </Form>
      </Drawer>

      <Drawer
        open={openDrawer === "storage"}
        title="Receipts And Documents"
        onClose={() => setOpenDrawer(null)}
        size="large"
      >
        <Typography.Paragraph>
          Save valuable documents, receipts, and history as memory drafts. The app creates a
          `memoryRef` that can be attached to Move calls and later backed by MemWal/Walrus storage.
        </Typography.Paragraph>
        <Form form={documentForm} layout="vertical" onFinish={handleDocumentSave}>
          <Form.Item label="Title" name="title" rules={[{ required: true }]}>
            <Input placeholder="School fee receipt" />
          </Form.Item>
          <Form.Item label="Details" name="body">
            <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} />
          </Form.Item>
          <Button block htmlType="submit" loading={isRemembering} type="primary">
            Save reference
          </Button>
        </Form>

        <Space className="mt-4" wrap>
          <Button disabled={!account} loading={isRestoring} onClick={handleMemoryRestore}>
            Restore from Walrus
          </Button>
          <Button
            disabled={!account}
            loading={isRecalling}
            onClick={() => handleMemoryRecall("vault receipts documents budgets history")}
          >
            Recall saved memory
          </Button>
        </Space>

        <div className="mt-5 grid gap-2">
          {memoryRecords.map((record) => (
            <div className="theme-memory-item rounded p-3" key={record.id}>
              <Typography.Text strong>{record.title}</Typography.Text>
              <Typography.Text className="block font-mono text-xs">
                {record.memoryRef}
              </Typography.Text>
              <div className="mt-2 flex flex-wrap gap-2">
                <Tag className="theme-tag">MemWal {record.storage.memwal}</Tag>
                <Tag className="theme-tag">Walrus {record.storage.walrus}</Tag>
                {record.walrusBlobId ? (
                  <Tag className="theme-tag">Blob {shortId(record.walrusBlobId)}</Tag>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {recalledMemories.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {recalledMemories.map((memory) => (
              <Card
                className="compact-card centered-form-card"
                key={memory.blob_id}
                title={`Walrus blob ${shortId(memory.blob_id)}`}
              >
                <Typography.Paragraph className="!mb-2 whitespace-pre-wrap">
                  {memory.text}
                </Typography.Paragraph>
                <Tag className="theme-tag">Distance {memory.distance.toFixed(4)}</Tag>
              </Card>
            ))}
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={openDrawer === "history"}
        title="Vault History"
        onClose={() => setOpenDrawer(null)}
        size={1200}
      // width={1400}
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <Typography.Text>
            Contract events and AI memory for your connected wallet.
          </Typography.Text>
          <Space>
            <Button
              disabled={!account}
              icon={<CloudDownloadOutlined />}
              loading={isRestoring}
              onClick={handleMemoryRestore}
              size="small"
              type="text"
            >
              Restore from Walrus
            </Button>
            <Button
              aria-label="Refresh history"
              className="history-refresh-button"
              disabled={!account?.address}
              icon={<SyncOutlined />}
              loading={historyEvents.isFetching}
              onClick={() => historyEvents.refetch()}
              title="Refresh history"
              type="text"
            />
          </Space>
        </div>

        <div className="mb-8">
          <Typography.Text className="block mb-2 font-medium text-xs uppercase tracking-wider opacity-60">
            Search financial memory
          </Typography.Text>
          <div className="relative p-4 bg-[#007979]/5 rounded-lg border border-[#007979]/20 history-search-area">
            <Input.TextArea
              className="intention-textarea !bg-white"
              placeholder="Search your past receipts, notes, and budgets (e.g. 'grocery trip', 'savings plans')..."
              autoSize={{ minRows: 4, maxRows: 15 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleMemoryRecall((e.target as HTMLTextAreaElement).value);
                }
              }}
            />
            <div className="mt-3 flex justify-end">
              <Button
                type="primary"
                loading={isRecalling}
                onClick={() => {
                  const textarea = document.querySelector('.history-search-area textarea') as HTMLTextAreaElement;
                  if (textarea) handleMemoryRecall(textarea.value);
                }}
                className="px-8 h-9 text-sm"
              >
                Recall
              </Button>
            </div>
          </div>
        </div>

        {recalledMemories.length > 0 && (
          <div className="mb-8 p-4 bg-[#007979]/5 rounded-lg border border-[#007979]/10">
            <div className="flex items-center justify-between mb-4">
              <Typography.Text className="font-medium text-xs uppercase tracking-wider opacity-60">
                Recalled from MemWal
              </Typography.Text>
              <Button
                type="link"
                size="small"
                onClick={() => setRecalledMemories([])}
                className="text-xs"
              >
                Clear Search
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recalledMemories.map((memory) => (
                <Card
                  className="compact-card recalled-memory-card"
                  key={memory.blob_id}
                >
                  <Typography.Paragraph className="!mb-2 text-sm whitespace-pre-wrap">
                    {memory.text}
                  </Typography.Paragraph>
                  <div className="flex items-center justify-between mt-auto">
                    <Typography.Text className="text-[10px] opacity-40">
                      Ref: {shortId(memory.blob_id)}
                    </Typography.Text>
                    <Tag className="theme-tag !text-[10px] !m-0 py-0 px-1">
                      {((1 - memory.distance) * 100).toFixed(0)}% Match
                    </Tag>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {!account ? (
          <Card className="compact-card centered-form-card text-center">
            <Typography.Paragraph className="!mb-0">
              Connect your wallet to view vault history.
            </Typography.Paragraph>
          </Card>
        ) : historyEvents.isPending ? (
          <Card className="compact-card centered-form-card text-center">
            <Typography.Paragraph className="!mb-0">
              Loading history...
            </Typography.Paragraph>
          </Card>
        ) : historyEvents.error ? (
          <Card className="compact-card centered-form-card text-center">
            <Typography.Paragraph className="!mb-0">
              {historyEvents.error.message}
            </Typography.Paragraph>
          </Card>
        ) : historyRows.length > 0 ? (
          <div className="grid gap-4">
            <Card className="compact-card centered-form-card" title="Budget Spend">
              <Table
                className="history-table"
                columns={spendHistoryColumns}
                dataSource={spendHistoryRows}
                locale={{ emptyText: "No spend history found." }}
                pagination={{ pageSize: 8 }}
                rowKey={(item) => `${item.event.id.txDigest}-${item.event.id.eventSeq}`}
                scroll={{ x: 760 }}
                size="small"
              />
            </Card>

            <Card className="compact-card centered-form-card" title="Category Swap">
              <Table
                className="history-table"
                columns={swapHistoryColumns}
                dataSource={swapHistoryRows}
                locale={{ emptyText: "No swap history found." }}
                pagination={{ pageSize: 8 }}
                rowKey={(item) => `${item.event.id.txDigest}-${item.event.id.eventSeq}`}
                scroll={{ x: 760 }}
                size="small"
              />
            </Card>

            {otherHistoryRows.length > 0 ? (
              <div className="grid gap-3">
                {otherHistoryRows.map((item) => (
                  <Card
                    className="compact-card centered-form-card"
                    key={`${item.event.id.txDigest}-${item.event.id.eventSeq}`}
                    title={
                      <div className="flex items-center justify-between gap-3">
                        <span>{formatEventName(item.name)}</span>
                        <Tag className="theme-tag">{formatEventTime(item.event)}</Tag>
                      </div>
                    }
                  >
                    <div className="history-detail-grid">
                      {getHistoryDetails(item).map((detail) => (
                        <div className="history-detail" key={detail.label}>
                          <Typography.Text type="secondary">{detail.label}</Typography.Text>
                          <Typography.Text className="history-detail-value">
                            {detail.value}
                          </Typography.Text>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <Card className="compact-card centered-form-card text-center">
            <Typography.Paragraph className="!mb-0">
              No vault history found for this wallet yet.
            </Typography.Paragraph>
          </Card>
        )}
      </Drawer>

      {/* AI Commander Modal */}
      <Modal
        title={<span className="text-lg font-bold">Intention</span>}
        open={isAICommanderOpen}
        onCancel={() => {
          if (!isExecutingAI) {
            setIsAICommanderOpen(false);
            setAssistantText("");
          }
        }}
        footer={null}
        centered
        width={700}
        closable={!isExecutingAI}
        styles={{
          body: { minHeight: "300px" }
        }}
      >
        <div className="py-2">
          <div className="mb-2 p-4 bg-[#007979]/5 rounded-lg border border-[#007979]/20">
            <Input.TextArea
              className="intention-textarea !bg-white"
              disabled={isExecutingAI}
              placeholder="e.g. 'Spend 2 SUI on Food', 'Swap 1 SUI from Rent to Other', or 'Create a 10 SUI budget'..."
              autoSize={{ minRows: 5, maxRows: 40 }}
              value={assistantText}
              onChange={(e) => setAssistantText(e.target.value)}
            />
            <div className="mt-4 flex justify-between items-start gap-4">
              <div className="flex-grow">

              </div>
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={isRecalling || isExecutingAI}
                disabled={isExecutingAI}
                onClick={handleAssistantDraft}
                className="px-8 h-9 text-sm shrink-0"
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Overspend Modal */}
      {overspendModal?.visible && (
        <Modal
          title={<span className="text-xl font-bold">Allocation Exhausted</span>}
          open={true}
          onCancel={() => {
            setOverspendModal(null);
          }}
          footer={null}
          centered
          closable={true}
          closeIcon={<span className="text-lg">✕</span>}
          styles={{ body: { minHeight: "140px", display: "flex", flexDirection: "column" } }}
          width={480}
        >
          <div className="flex flex-col justify-between h-full py-2 flex-grow">
            <div>
              <Typography.Paragraph className="text-base !mb-2">
                Your <strong>{overspendModal.categoryName}</strong> allocation ({overspendModal.remaining.toFixed(2)} SUI remaining) is not enough for this transaction ({overspendModal.amount.toFixed(2)} SUI).
              </Typography.Paragraph>
              <div className="mb-3 p-2 bg-red-50/10 rounded border border-red-500/20">
                <Typography.Text className="block text-sm font-medium">
                  Total deduction: <span className="text-red-400">{(overspendModal.amount * 1.1).toFixed(2)} SUI</span>
                </Typography.Text>
              </div>
              <Typography.Text className="text-xs block leading-tight text-red-500/60 italic">
                * Overspending incurs a <strong>10% fee</strong> and reduces the total SUI available for your other categories.
              </Typography.Text>
            </div>

            <div className="flex gap-2 justify-end items-center mt-4">
              <Button
                size="small"
                type="primary"
                className="px-4 text-xs h-7"
                onClick={() => {
                  setOverspendModal(null);
                  actionForm.setFieldValue("action", "swap");
                  setActiveAction("swap");
                  setOpenDrawer("actions");
                }}
              >
                Swap
              </Button>
              <Button
                size="small"
                className="px-4 text-xs h-7"
                onClick={() => {
                  setOverspendModal(null);
                  // Proceed with overspend transaction
                  const currentValues = actionForm.getFieldsValue();
                  handleVaultAction({
                    ...currentValues,
                    action: "overspend",
                  });
                }}
              >
                Proceed
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}


type CategorySelectProps = SelectProps<number> & {
  categories?: VaultCategoryOption[];
};

function CategorySelect({ categories = [], ...props }: CategorySelectProps) {
  const categoryOptions = categories.length > 0 ? categories : DEFAULT_CATEGORIES;

  return (
    <Select
      {...props}
      className={["theme-control", props.className].filter(Boolean).join(" ")}
      options={categoryOptions.map((category) => ({
        label:
          "allocation" in category
            ? `${category.name} (${formatMist(category.allocation)})`
            : category.name,
        value: category.id,
      }))}
    />
  );
}

type AssistantDraft =
  | { kind: "budget"; values: Partial<CreateBudgetValues> }
  | { kind: "action"; values: Partial<ActionValues> & Pick<ActionValues, "action"> };

function createActionDraft(text: string, vaultRows: Array<{ id: string; categories: VaultCategoryOption[] }>): AssistantDraft {
  const lower = text.toLowerCase();
  const amount = extractSuiAmount(text);
  const cycle = extractCycle(lower);

  if (lower.includes("budget") || lower.includes("split")) {
    return {
      kind: "budget",
      values: {
        cycle,
        allowOverspend: true,
        memoryTitle: "AI drafted budget",
        memoryBody: text,
        allocations: buildAllocationDrafts(text, amount),
      },
    };
  }

  const action: ActionValues["action"] =
    lower.includes("over") ? "overspend" : lower.includes("swap") || lower.includes("move") ? "swap" : "spend";
  const vault = findVaultForText(text, vaultRows);

  if (action === "swap") {
    const categories = extractCategoryMentions(text);
    return {
      kind: "action",
      values: {
        action,
        vaultId: vault?.id,
        fromCategoryId: categories[0],
        toCategoryId: categories[1],
        amount: amount ?? "",
        note: text,
      },
    };
  }

  const addresses = extractAddresses(text).filter(
    (address) => address.toLowerCase() !== vault?.id.toLowerCase(),
  );

  return {
    kind: "action",
    values: {
      action,
      vaultId: vault?.id,
      recipient: addresses[0],
      categoryId: extractCategoryMentions(text)[0],
      amount: amount ?? "",
      note: text,
    },
  };
}

function extractCycle(text: string): keyof typeof BUDGET_CYCLES {
  if (text.includes("daily")) return "daily";
  if (text.includes("weekly")) return "weekly";
  if (text.includes("yearly") || text.includes("annual")) return "yearly";
  if (text.includes("half") || text.includes("six month")) return "halfYear";
  return "monthly";
}

function buildAllocationDrafts(text: string, fallbackAmount?: string) {
  const categoriesFound = DEFAULT_CATEGORIES.filter((category) =>
    new RegExp(`\\b${category.name}\\b`, "i").test(text)
  );

  // If no categories found, fallback to all defaults if amount provided, else empty
  const activeCategories = categoriesFound.length > 0 ? categoriesFound : (fallbackAmount ? DEFAULT_CATEGORIES : []);

  const allocations = activeCategories.map((category) => {
    const match = new RegExp(`${category.name}\\D+(\\d+(?:\\.\\d{1,9})?)`, "i").exec(text);
    return {
      categoryId: category.id,
      amount: match?.[1] ?? "",
    };
  });

  const hasExplicitAmounts = allocations.some((item) => item.amount);

  if (!hasExplicitAmounts && fallbackAmount && activeCategories.length > 0) {
    const totalAmount = Number(fallbackAmount);
    if (Number.isFinite(totalAmount)) {
      // Define weights: Food (0) and Transport (1) get 1.5x priority
      const getWeight = (id: number) => (id === 0 || id === 1 ? 1.5 : 1.0);
      let totalWeight = 0;
      for (const cat of activeCategories) {
        totalWeight += getWeight(cat.id);
      }

      return activeCategories.map((category) => {
        const weight = getWeight(category.id);
        const amount = totalWeight > 0 ? (totalAmount * (weight / totalWeight)).toFixed(2) : "0.00";
        return {
          categoryId: category.id,
          amount,
        };
      });
    }
  }

  // Filter out any that remained empty if some were explicitly filled
  const filtered = hasExplicitAmounts ? allocations.filter(a => a.amount !== "") : allocations;

  // Always return 5 categories for the manual form layout
  return DEFAULT_CATEGORIES.map(cat => {
    const draft = filtered.find(f => f.categoryId === cat.id);
    return {
      categoryId: cat.id,
      amount: draft?.amount ?? ""
    };
  });
}

function findVaultForText(text: string, vaultRows: Array<{ id: string; categories: VaultCategoryOption[] }>) {
  const lower = text.toLowerCase();

  // 1. Identification by Index (e.g., "vault 1", "budget 2")
  const indexMatch = /(?:vault|budget|number)\s*(\d+)/i.exec(text);
  if (indexMatch) {
    const index = parseInt(indexMatch[1]) - 1; // Convert 1-based to 0-based
    if (vaultRows[index]) return vaultRows[index];
  }

  // 2. Identification by Keywords ("first", "last", "latest", "recent")
  if (lower.includes("first")) return vaultRows[0];
  if (lower.includes("last") || lower.includes("latest") || lower.includes("recent")) {
    return vaultRows[vaultRows.length - 1];
  }

  // 3. Identification by ID Fragment (0x...)
  const idMatch = vaultRows.find((vault) => lower.includes(vault.id.toLowerCase()));
  if (idMatch) return idMatch;

  // 4. Default: Return newest vault
  return vaultRows[vaultRows.length - 1] || vaultRows[0];
}

function extractSuiAmount(text: string) {
  // 1. Try "1.5 sui" format
  const suiMatch = /(\d+(?:\.\d{1,9})?)\s*sui/i.exec(text);
  if (suiMatch) return suiMatch[1];

  // 2. Try "spend/swap/budget 1.5" format
  const actionMatch = /(?:spend|swap|budget|amount|of)\s+(\d+(?:\.\d{1,9})?)/i.exec(text);
  if (actionMatch) return actionMatch[1];

  // 3. Fallback: find the first decimal or number that isn't part of an 0x address
  // We strip addresses first to avoid confusion
  const textWithoutAddresses = text.replace(/0x[a-fA-F0-9]{16,64}/g, "");
  const fallbackMatch = /(\d+(?:\.\d{1,9})?)/.exec(textWithoutAddresses);

  return fallbackMatch ? fallbackMatch[1] : "";
}

function extractAddresses(text: string) {
  return text.match(/0x[a-fA-F0-9]{16,64}/g) ?? [];
}

function extractCategoryMentions(text: string) {
  const lower = text.toLowerCase();
  return DEFAULT_CATEGORIES.flatMap((category) =>
    lower.includes(category.name.toLowerCase()) ? [category.id] : [],
  );
}

function parseVaultCategories(value: unknown): VaultCategoryOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const fields =
      item && typeof item === "object" && "fields" in item
        ? (item.fields as Record<string, unknown>)
        : item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : null;

    if (!fields) {
      return [];
    }

    const id = Number(fields.id);
    const name = typeof fields.name === "string" ? fields.name : undefined;

    if (!Number.isFinite(id) || !name) {
      return [];
    }

    return [
      {
        id,
        name,
        allocation: normalizeMoveScalar(fields.allocation),
      },
    ];
  });
}

function normalizeMoveScalar(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "fields" in value &&
    (value.fields as Record<string, unknown>).value !== undefined
  ) {
    return (value.fields as Record<string, unknown>).value as string | number | bigint;
  }

  return value as string | number | bigint;
}

function readEventFields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function isVaultHistoryEvent(type: string) {
  return Object.values(VAULT_EVENT_TYPES).includes(
    type as (typeof VAULT_EVENT_TYPES)[keyof typeof VAULT_EVENT_TYPES],
  );
}

function readStringField(value: unknown) {
  const normalized = normalizeMoveScalar(value);
  return typeof normalized === "string" ? normalized : undefined;
}

function readNumberField(value: unknown) {
  const normalized = normalizeMoveScalar(value);

  if (
    typeof normalized !== "string" &&
    typeof normalized !== "number" &&
    typeof normalized !== "bigint"
  ) {
    return undefined;
  }

  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function getHistoryDetails(item: HistoryEvent) {
  const fields = item.fields;
  const details: Array<{ label: string; value: string }> = [
    { label: "Vault", value: shortId(readStringField(fields.vault_id) ?? "-") },
  ];

  if (item.name === "BudgetCreated") {
    details.push(
      { label: "Amount", value: formatMist(fields.amount) },
      { label: "Cycle", value: formatCycle(fields.cycle) },
      { label: "Duration", value: formatBudgetDuration(fields.start_ms, fields.end_ms) },
      { label: "Overspend", value: fields.allow_overspend ? "Allowed" : "Disabled" },
      { label: "Swap fee", value: formatBps(fields.swap_fee_bps) },
      { label: "Overspend fee", value: formatBps(fields.overspend_fee_bps) },
    );
  }

  if (item.name === "BudgetSpend") {
    details.push(
      { label: "Category", value: formatCategoryName(fields.category) },
      { label: "Amount", value: formatMist(fields.amount) },
      { label: "Fee", value: formatMist(fields.fee) },
      { label: "Recipient", value: shortId(readStringField(fields.recipient) ?? "-") },
      {
        label: "Type",
        value: (
          <span style={{ color: fields.overspend ? "#ff4d4f" : "inherit" }}>
            {fields.overspend ? "Overspend" : "Spend"}
          </span>
        ) as unknown as string,
      },
    );
  }

  if (item.name === "CategorySwap") {
    details.push(
      { label: "From", value: formatCategoryName(fields.from_category) },
      { label: "To", value: formatCategoryName(fields.to_category) },
      { label: "Amount", value: formatMist(fields.amount) },
      { label: "Fee", value: formatMist(fields.fee) },
    );
  }

  if (item.name === "BudgetClosed") {
    details.push(
      { label: "Action", value: formatCloseAction(fields.action) },
      { label: "Amount", value: formatMist(fields.amount) },
    );
  }

  details.push(
    { label: "Tx", value: shortId(item.event.id.txDigest) },
    { label: "Event", value: item.event.id.eventSeq },
  );

  return details;
}

function formatEventName(name: string) {
  return name.replace(/([A-Z])/g, " $1").trim();
}

function formatEventTime(event: SuiEvent) {
  const timestamp = event.timestampMs ?? readStringField(readEventFields(event.parsedJson).timestamp_ms);
  return formatDateTimeFromMs(timestamp);
}

function formatDateTimeFromMs(value: unknown) {
  const timestamp = parseTimestampMs(value);

  if (timestamp === null) {
    return "On-chain";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatCycle(value: unknown) {
  const cycleValue = readNumberField(value);
  const match = Object.entries(BUDGET_CYCLES).find(([, cycle]) => cycle === cycleValue);
  return match ? labelize(match[0]) : "-";
}

function formatBps(value: unknown) {
  const bps = readNumberField(value);
  return bps === undefined ? "-" : `${bps / 100}%`;
}

function formatCategoryName(value: unknown) {
  const categoryId = readNumberField(value);
  const category = DEFAULT_CATEGORIES.find((item) => item.id === categoryId);
  return category ? category.name : "-";
}

function formatCloseAction(value: unknown) {
  const action = readNumberField(value);

  switch (action) {
    case 0:
      return "Save";
    case 1:
      return "Roll over";
    case 2:
      return "Withdraw";
    case 3:
      return "Redistribute";
    default:
      return "-";
  }
}

function labelize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function formatDays(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function formatBudgetDuration(startValue: unknown, endValue: unknown) {
  const startMs = parseTimestampMs(startValue);
  const endMs = parseTimestampMs(endValue);

  if (startMs === null || endMs === null || endMs < startMs) {
    return "-";
  }

  const days = Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));
  return formatDays(days);
}

function parseTimestampMs(value: unknown) {
  const normalized = normalizeMoveScalar(value);

  if (
    typeof normalized !== "string" &&
    typeof normalized !== "number" &&
    typeof normalized !== "bigint"
  ) {
    return null;
  }

  const timestamp = Number(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function shortId(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function formatMist(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    return "-";
  }

  const mist = BigInt(value);
  const whole = mist / BigInt(1_000_000_000);
  const fraction = String(mist % BigInt(1_000_000_000)).padStart(9, "0").slice(0, 3);

  return `${whole}.${fraction} SUI`;
}
