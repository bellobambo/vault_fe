"use client";

import {
  useConnectWallet,
  useCurrentAccount,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientQuery,
  useWallets,
} from "@mysten/dapp-kit";
import { registerSlushWallet } from "@mysten/slush-wallet";
import {
  CloudDownloadOutlined,
  ExportOutlined,
  FileTextOutlined,
  RobotOutlined,
  SendOutlined,
  SyncOutlined,
  UploadOutlined,
} from "@ant-design/icons";
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
import { useEffect, useMemo, useRef, useState } from "react";
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

type VaultRow = {
  id: string;
  balance: string;
  spent: string;
  active: string;
  categories: VaultCategoryOption[];
  duration: string;
  createdAt: string;
};

type HistoryEvent = {
  event: SuiEvent;
  fields: Record<string, unknown>;
  name: string;
};

type FinancialMemoryAnswer = {
  title: string;
  summary: string;
  details: Array<{ label: string; value: string }>;
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

type WalrusStoreApiResponse = {
  result: {
    blobId: string;
    objectId?: string;
    endEpoch?: number;
    size?: number;
    path: string;
  };
};

type WalrusReadApiResponse = {
  result: {
    blobId: string;
    size: number;
    base64: string;
  };
};

type SuiPriceApiResponse = {
  result: {
    usd: number;
    source: string;
    updatedAt: string;
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
  const wallets = useWallets();
  const slushWallet = wallets.find((wallet) => wallet.name.toLowerCase().includes("slush"));
  const { mutate: connectWallet, isPending: isConnectingWallet } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const suiClient = useSuiClient();
  const [createForm] = Form.useForm<CreateBudgetValues>();
  const [actionForm] = Form.useForm<ActionValues>();
  const [documentForm] = Form.useForm();
  const actionAmount = Form.useWatch("amount", actionForm);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const [openDrawer, setOpenDrawer] = useState<DrawerKey | null>(null);
  const [activeAction, setActiveAction] = useState<ActionValues["action"]>("spend");
  const [isAICommanderOpen, setIsAICommanderOpen] = useState(false);
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>(getMemoryRecordDrafts);
  const [recalledMemories, setRecalledMemories] = useState<RecalledMemory[]>([]);
  const [financialMemoryAnswer, setFinancialMemoryAnswer] = useState<FinancialMemoryAnswer | null>(null);
  const [memoryRecallEmptyMessage, setMemoryRecallEmptyMessage] = useState<string | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [openMemoryRecord, setOpenMemoryRecord] = useState<MemoryRecord | null>(null);
  const [openVaultDetails, setOpenVaultDetails] = useState<VaultRow | null>(null);
  const [verifiedWalrusBlobId, setVerifiedWalrusBlobId] = useState<string | null>(null);
  const [verifiedWalrusSize, setVerifiedWalrusSize] = useState<number | null>(null);
  const [suiUsdPrice, setSuiUsdPrice] = useState<number | null>(null);
  const [suiUsdUpdatedAt, setSuiUsdUpdatedAt] = useState<string>();
  const [assistantText, setAssistantText] = useState("");
  const [isRemembering, setIsRemembering] = useState(false);
  const [isRecalling, setIsRecalling] = useState(false);
  const [isExecutingAI, setIsExecutingAI] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isVerifyingWalrus, setIsVerifyingWalrus] = useState(false);
  const [lastRestoreSummary, setLastRestoreSummary] = useState<string>();
  const [lastDigest, setLastDigest] = useState<string>();
  const [actionCategories, setActionCategories] = useState<VaultCategoryOption[]>([]);
  const hasManuallyEditedOtherAllocationRef = useRef(false);
  const [overspendModal, setOverspendModal] = useState<{
    visible: boolean;
    vaultId: string;
    categoryId: number;
    amount: number;
    categoryName: string;
    remaining: number;
  } | null>(null);

  useEffect(() => {
    const registration = registerSlushWallet("Slush");
    return () => registration?.unregister();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadSuiPrice() {
      try {
        const response = await fetch("/api/prices/sui");
        const payload = (await response.json()) as SuiPriceApiResponse | { error?: string };

        if (!response.ok) {
          throw new Error("error" in payload && payload.error ? payload.error : "Unable to fetch SUI/USD price.");
        }

        const result = (payload as SuiPriceApiResponse).result;

        if (isMounted) {
          setSuiUsdPrice(result.usd);
          setSuiUsdUpdatedAt(result.updatedAt);
        }
      } catch {
        if (isMounted) {
          setSuiUsdPrice(null);
          setSuiUsdUpdatedAt(undefined);
        }
      }
    }

    void loadSuiPrice();
    const intervalId = window.setInterval(loadSuiPrice, 60_000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  // Handle form value changes to auto-calculate Other category in real-time
  function handleCreateFormValuesChange(
    changedFields: Partial<CreateBudgetValues>,
    allFields: Partial<CreateBudgetValues>,
  ) {
    if (hasManuallyEditedOtherAllocationRef.current) {
      return;
    }

    const changedAllocation = changedFields.allocations?.find((allocation) => allocation);

    if (changedAllocation?.categoryId === 4 || changedFields.allocations?.[4]?.amount !== undefined) {
      hasManuallyEditedOtherAllocationRef.current = true;
      return;
    }

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

  const vaultRows = useMemo<VaultRow[]>(() => {
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

  const vaultCategoryBalances = useMemo(() => {
    const balances = new Map<string, Array<{ id: number; name: string; allocation: string; spent: string; remaining: string }>>();

    for (const vault of vaultRows) {
      balances.set(
        vault.id,
        vault.categories.map((category) => {
          const allocationMist = BigInt(category.allocation);
          const spentMist = spendHistoryRows
            .filter(
              (item) =>
                readStringField(item.fields.vault_id) === vault.id &&
                readNumberField(item.fields.category) === category.id,
            )
            .reduce((total, item) => total + BigInt(normalizeMoveScalar(item.fields.amount) ?? 0), BigInt(0));

          return {
            id: category.id,
            name: category.name,
            allocation: formatMist(allocationMist),
            spent: formatMist(spentMist),
            remaining: formatMist(allocationMist - spentMist),
          };
        }),
      );
    }

    return balances;
  }, [spendHistoryRows, vaultRows]);

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

  const memoryRecordColumns: ColumnsType<MemoryRecord> = [
    {
      title: "Title",
      key: "title",
      render: (_value, record) => (
        <Space size={8}>
          <FileTextOutlined />
          <Typography.Text strong>{record.title}</Typography.Text>
        </Space>
      ),
    },
    {
      title: "Type",
      dataIndex: "kind",
      width: 110,
      render: (kind: MemoryRecord["kind"]) => labelize(kind),
    },
    {
      title: "File",
      key: "file",
      width: 180,
      render: (_value, record) => record.attachmentName ?? "Note only",
    },
    {
      title: "Saved",
      dataIndex: "createdAt",
      width: 150,
      render: (createdAt: string) => formatMemoryCreated(createdAt),
    },
    {
      title: "Status",
      key: "status",
      width: 150,
      render: (_value, record) => (
        <Tag className="theme-tag">
          {record.attachmentWalrusBlobId && record.walrusBlobId
            ? "Walrus + MemWal saved"
            : record.attachmentWalrusBlobId
              ? "Walrus file saved"
              : record.walrusBlobId
                ? "MemWal synced"
                : `MemWal ${record.storage.memwal}`}
        </Tag>
      ),
    },
  ];

  function createMemoryDraft(input: {
    kind: "budget" | "receipt" | "document" | "history";
    title?: string;
    body?: string;
    attachmentName?: string;
    attachmentType?: string;
    attachmentDataUrl?: string;
  }) {
    return createMemoryRecord({
      owner: account?.address,
      kind: input.kind,
      title: input.title?.trim() || `${input.kind} record`,
      body: input.body,
      attachmentName: input.attachmentName,
      attachmentType: input.attachmentType,
      attachmentDataUrl: input.attachmentDataUrl,
      tags: ["vault", SUI_NETWORK],
    });
  }

  async function persistMemoryRecord(record: MemoryRecord, attachmentFile?: File) {
    saveMemoryRecordDraft(record);
    setMemoryRecords(getMemoryRecordDrafts());

    let recordForMemWal = record;

    try {
      setIsRemembering(true);

      if (attachmentFile) {
        const walrusResult = await storeAttachmentOnWalrus(attachmentFile);
        recordForMemWal = {
          ...recordForMemWal,
          attachmentWalrusBlobId: walrusResult.blobId,
          attachmentWalrusObjectId: walrusResult.objectId,
          attachmentWalrusEndEpoch: walrusResult.endEpoch,
          storage: {
            ...recordForMemWal.storage,
            walrus: "saved",
          },
        };
        updateMemoryRecordDraft(recordForMemWal.id, {
          attachmentWalrusBlobId: recordForMemWal.attachmentWalrusBlobId,
          attachmentWalrusObjectId: recordForMemWal.attachmentWalrusObjectId,
          attachmentWalrusEndEpoch: recordForMemWal.attachmentWalrusEndEpoch,
          storage: recordForMemWal.storage,
        });
        setMemoryRecords(getMemoryRecordDrafts());
      }

      const response = await fetch("/api/memwal/remember", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: account?.address,
          text: serializeMemoryRecord(recordForMemWal),
          wait: true,
        }),
      });
      const payload = (await response.json()) as RememberApiResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to save memory.");
      }

      const result = (payload as RememberApiResponse).result;
      const savedRecord: MemoryRecord = {
        ...recordForMemWal,
        memwalJobId: result.job_id ?? result.id,
        walrusBlobId: result.blob_id,
        storage: {
          memwal: result.blob_id ? "saved" : "accepted",
          walrus: recordForMemWal.attachmentWalrusBlobId || result.blob_id ? "saved" : "pending",
        },
      };

      updateMemoryRecordDraft(savedRecord.id, {
        memwalJobId: savedRecord.memwalJobId,
        walrusBlobId: savedRecord.walrusBlobId,
        attachmentWalrusBlobId: savedRecord.attachmentWalrusBlobId,
        attachmentWalrusObjectId: savedRecord.attachmentWalrusObjectId,
        attachmentWalrusEndEpoch: savedRecord.attachmentWalrusEndEpoch,
        txDigest: savedRecord.txDigest,
        storage: savedRecord.storage,
      });
      setMemoryRecords(getMemoryRecordDrafts());
      return savedRecord;
    } catch (error) {
      updateMemoryRecordDraft(recordForMemWal.id, {
        storage: {
          memwal: "failed",
          walrus: recordForMemWal.storage.walrus,
        },
      });
      setMemoryRecords(getMemoryRecordDrafts());
      throw error;
    } finally {
      setIsRemembering(false);
    }
  }

  async function remember(input: {
    kind: "budget" | "receipt" | "document" | "history";
    title?: string;
    body?: string;
    attachmentName?: string;
    attachmentType?: string;
    attachmentDataUrl?: string;
    attachmentFile?: File;
  }) {
    return persistMemoryRecord(createMemoryDraft(input), input.attachmentFile);
  }

  function saveFailedTransactionMemory(record: MemoryRecord) {
    saveMemoryRecordDraft({
      ...record,
      storage: {
        memwal: "failed",
        walrus: "pending",
      },
    });
    setMemoryRecords(getMemoryRecordDrafts());
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
    const memory = createMemoryDraft({
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
          void persistMemoryRecord({ ...memory, txDigest: result.digest }).catch((error) => {
            toast.error(error instanceof Error ? error.message : "Unable to save transaction memory.");
          });
          ownedVaults.refetch();
        },
        onError: (error) => {
          saveFailedTransactionMemory(memory);
          toast.error(error.message);
        },
      },
    );
  }

  async function handleVaultAction(values: ActionValues, onComplete?: () => void) {
    if (!account) {
      toast.error("Connect your Sui wallet first.");
      onComplete?.();
      return;
    }

    const vault = vaultRows.find((v) => v.id === values.vaultId);

    // Check for overspend on spend action (but not if already confirmed via modal)
    if (values.action === "spend" && values.categoryId !== undefined && !values._skipOverspendCheck) {
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

    const memory = createMemoryDraft({
      kind: values.action === "spend" ? "receipt" : "history",
      title: `${values.action} record`,
      body: [
        values.note?.replace(/\s+on\s+0x[a-fA-F0-9]{64}\s*$/, ""), // Remove trailing vault ID from natural language note
        `Action: ${values.action}`,
        `Amount: ${values.amount} SUI`,
        values.categoryId !== undefined ? `Category: ${vault?.categories.find(c => c.id === values.categoryId)?.name || values.categoryId}` : undefined,
        values.fromCategoryId !== undefined ? `From category: ${vault?.categories.find(c => c.id === values.fromCategoryId)?.name || values.fromCategoryId}` : undefined,
        values.toCategoryId !== undefined ? `To category: ${vault?.categories.find(c => c.id === values.toCategoryId)?.name || values.toCategoryId}` : undefined,
        values.recipient ? `Recipient: ${values.recipient}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    });

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
          void persistMemoryRecord({ ...memory, txDigest: result.digest }).catch((error) => {
            toast.error(error instanceof Error ? error.message : "Unable to save transaction memory.");
          });
          ownedVaults.refetch();
          onComplete?.();
        },
        onError: (error) => {
          saveFailedTransactionMemory(memory);
          toast.error(error.message);
          onComplete?.();
        },
      },
    );
  }

  async function handleDocumentSave(values: { title: string; body?: string }) {
    try {
      const attachmentDataUrl = documentFile ? await readFileAsDataUrl(documentFile) : undefined;

      await remember({
        kind: "document",
        title: values.title,
        body: values.body,
        attachmentName: documentFile?.name,
        attachmentType: documentFile?.type,
        attachmentDataUrl,
        attachmentFile: documentFile ?? undefined,
      });
      documentForm.resetFields();
      setDocumentFile(null);
      if (documentFileInputRef.current) {
        documentFileInputRef.current.value = "";
      }
      toast.success("Document saved to MemWal/Walrus.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save document.");
    }
  }

  function handleMemoryRecordOpen(record: MemoryRecord) {
    setVerifiedWalrusBlobId(null);
    setVerifiedWalrusSize(null);
    setOpenMemoryRecord(record);
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

    const financialAnswer = buildFinancialMemoryAnswer(trimmed, spendHistoryRows, historyRows);

    if (financialAnswer) {
      setFinancialMemoryAnswer(financialAnswer);
      setRecalledMemories([]);
      setMemoryRecallEmptyMessage(null);
      return [];
    }

    try {
      setIsRecalling(true);
      setFinancialMemoryAnswer(null);
      setMemoryRecallEmptyMessage(null);
      const response = await fetch("/api/memwal/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: account.address,
          query: trimmed,
          limit: 6,
          maxDistance: 0.45,
        }),
      });
      const payload = (await response.json()) as RecallApiResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to recall memory.");
      }

      const memories = (payload as RecallApiResponse).result.results;
      setRecalledMemories(memories);
      setMemoryRecallEmptyMessage(
        memories.length === 0 ? `No saved memory matched "${trimmed}".` : null,
      );
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

      const restored = payload.result?.restored ?? 0;
      const skipped = payload.result?.skipped ?? 0;
      const total = payload.result?.total ?? 0;

      let summary = "";
      if (total === 0) {
        summary = "No memories found on the network.";
      } else if (restored === 0) {
        summary = `All ${total} memories are already up to date.`;
      } else {
        summary = `Successfully synced ${restored} missing memories (found ${total} total).`;
      }

      setLastRestoreSummary(summary);
      toast.success(summary);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to restore memory index.");
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleVerifyWalrusAttachment(record = openMemoryRecord) {
    if (!record?.attachmentWalrusBlobId) {
      toast.error("No attachment Walrus blob ID to verify.");
      return;
    }

    try {
      setIsVerifyingWalrus(true);
      const response = await fetch(
        `/api/walrus/read?blobId=${encodeURIComponent(record.attachmentWalrusBlobId)}`,
      );
      const payload = (await response.json()) as WalrusReadApiResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to verify Walrus blob.");
      }

      const result = (payload as WalrusReadApiResponse).result;
      setVerifiedWalrusBlobId(result.blobId);
      setVerifiedWalrusSize(result.size);
      toast.success(`Verified ${formatBytes(result.size)} from Walrus.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to verify Walrus blob.");
    } finally {
      setIsVerifyingWalrus(false);
    }
  }

  async function handleAssistantDraft() {
    const text = assistantText.trim();

    if (!text) {
      toast.error("Enter an action.");
      return;
    }

    const memories = await handleMemoryRecall(text);

    if (isMemoryLookupIntent(text)) {
      if (memories.length === 0) {
        toast.error("No matching memories found.");
      }
      return;
    }

    const draft = (await createOpenAiActionDraft(text, vaultRows, memories)) ?? createActionDraft(text, vaultRows);

    if (draft.kind === "budget") {
      setIsAICommanderOpen(false);
      setAssistantText("");
      hasManuallyEditedOtherAllocationRef.current = false;
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

  function handleSlushConnect() {
    if (!slushWallet) {
      toast.error("Slush wallet is not available in this browser.");
      return;
    }

    connectWallet({ wallet: slushWallet });
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
              <Button
                className="slush-connect-button"
                loading={isConnectingWallet}
                onClick={handleSlushConnect}
                type="primary"
              >
                Connect Slush
              </Button>
            )}
          </Space>
        </div>
      </header>

      <nav className="vault-nav-pattern px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex w-full flex-wrap justify-end gap-3">
          {account ? (
            <>
              <Button
                onClick={() => {
                  hasManuallyEditedOtherAllocationRef.current = false;
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
                Records
              </Button>
              <Button onClick={() => setOpenDrawer("history")}>History</Button>
            </>
          ) : null}
        </div>
      </nav>

      {account ? (
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
      ) : null}

      <main className="vault-main min-h-[calc(100vh-116px)] bg-[#007979] px-4 py-8 text-[var(--vault-accent)] sm:px-6">
        {!account ? (
          <section className="vault-disconnected mx-auto flex min-h-[calc(100vh-180px)] w-full max-w-3xl flex-col items-center justify-center text-center">
            <Typography.Title className="vault-page-title !mb-3" level={1}>
              Vault
            </Typography.Title>
            <Typography.Paragraph className="vault-page-description !mx-auto !max-w-xl !text-lg">
              Help students budget money properly in SUI across daily needs, while keeping receipts, notes, and spending memory together.
            </Typography.Paragraph>
          </section>
        ) : (
          <section className="mx-auto w-full max-w-6xl">
            <div className="mb-8 text-left">
              <Typography.Title className="vault-page-title !mb-0" level={2}>
                My Vault
              </Typography.Title>
              <SuiUsdRateText price={suiUsdPrice} updatedAt={suiUsdUpdatedAt} />
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
                          className="vault-card-action-primary"
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
                        <Button
                          size="small"
                          onClick={() => setOpenVaultDetails(vault)}
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center">
                <Typography.Paragraph className="!mb-0 !text-[var(--vault-accent)]">
                  No vaults yet. Create one for everyday expenses like meals, transport, and fees.
                </Typography.Paragraph>
              </div>
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

      <Modal
        footer={null}
        onCancel={() => setOpenVaultDetails(null)}
        open={Boolean(openVaultDetails)}
        title="Budget Details"
        width={760}
        style={{ top: 96 }}
      >
        {openVaultDetails ? (
          <div className="vault-details-modal">
            <div className="memory-record-modal-meta">
              <div>
                <Typography.Text type="secondary">Vault</Typography.Text>
                <Typography.Text strong>{shortId(openVaultDetails.id)}</Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary">Balance</Typography.Text>
                <Typography.Text strong>
                  {formatSuiWithUsd(openVaultDetails.balance, suiUsdPrice)}
                </Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary">Spent</Typography.Text>
                <Typography.Text strong>
                  {formatSuiWithUsd(openVaultDetails.spent, suiUsdPrice)}
                </Typography.Text>
              </div>
            </div>

            <Table
              className="vault-details-table"
              columns={[
                { title: "Category", dataIndex: "name", key: "name" },
                { title: "Allocated", dataIndex: "allocation", key: "allocation" },
                { title: "Spent", dataIndex: "spent", key: "spent" },
                { title: "Remaining", dataIndex: "remaining", key: "remaining" },
              ]}
              dataSource={vaultCategoryBalances.get(openVaultDetails.id) ?? []}
              pagination={false}
              rowKey={(category) => category.id}
              size="small"
            />
          </div>
        ) : null}
      </Modal>

      <Drawer
        open={openDrawer === "createBudget"}
        title="Create Budget Vault"
        onClose={() => setOpenDrawer(null)}
        size="large"
      >
        <SuiUsdRateText price={suiUsdPrice} updatedAt={suiUsdUpdatedAt} />
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
                    <Input
                      onChange={category.id === 4 ? () => {
                        hasManuallyEditedOtherAllocationRef.current = true;
                      } : undefined}
                      onFocus={category.id === 4 ? () => {
                        hasManuallyEditedOtherAllocationRef.current = true;
                      } : undefined}
                      placeholder="0.00"
                      suffix="SUI"
                    />
                  </Form.Item>
                  {category.id === 4 ? (
                    <Typography.Text className="allocation-note">
                      Other stays within the average of the main categories
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
                <Input className="theme-control" placeholder="Food, transport, books, rent..." />
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
        <SuiUsdRateText price={suiUsdPrice} updatedAt={suiUsdUpdatedAt} />
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
          <UsdEstimateText amount={actionAmount} price={suiUsdPrice} />
          <Form.Item label="Receipt note" name="note">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Lunch, textbook, transport fare..." />
          </Form.Item>

          <Button block htmlType="submit" loading={isPending || isRemembering} type="primary">
            Send {activeAction}
          </Button>
        </Form>
      </Drawer>

      <Drawer
        open={openDrawer === "storage"}
        title="Records & Notes"
        onClose={() => setOpenDrawer(null)}
        width={1100}
      >
        <SuiUsdRateText price={suiUsdPrice} updatedAt={suiUsdUpdatedAt} />
        <div className="storage-drawer-layout">
          <section className="storage-section">
            <div className="storage-section-heading">
              <Typography.Title level={5}>Add Receipt Or Document</Typography.Title>
              <Typography.Text>
                Save a searchable student note for fees, meals, books, transport, or rent.
              </Typography.Text>
            </div>

            <Form form={documentForm} layout="vertical" onFinish={handleDocumentSave}>
              <Form.Item label="Title" name="title" rules={[{ required: true }]}>
                <Input placeholder="School fee receipt" />
              </Form.Item>
              <Form.Item label="Details" name="body">
                <Input.TextArea
                  autoSize={{ minRows: 3, maxRows: 6 }}
                  placeholder="Paid 4 SUI for May school fees"
                />
              </Form.Item>
              <div className="storage-upload-row">
                <input
                  accept="image/*,.pdf,.txt,.csv,.doc,.docx"
                  className="hidden-input"
                  onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                  ref={documentFileInputRef}
                  type="file"
                />
                <Button
                  icon={<UploadOutlined />}
                  onClick={() => documentFileInputRef.current?.click()}
                  type="default"
                >
                  Upload File
                </Button>
                <Typography.Text>
                  {documentFile ? documentFile.name : "No file selected"}
                </Typography.Text>
              </div>
              <Button block htmlType="submit" loading={isRemembering} type="primary">
                Save
              </Button>
            </Form>
          </section>

          <section className="storage-section">
            <div className="storage-section-heading">
              <Typography.Title level={5}>Saved Records</Typography.Title>
              <Typography.Text>
                Click a row to review the note, receipt file, or onchain proof.
              </Typography.Text>
            </div>

            <Table
              className="storage-record-table"
              columns={memoryRecordColumns}
              dataSource={memoryRecords.filter((record) => record.title !== "Autonomous vault checkpoint")}
              locale={{ emptyText: "No saved receipts or documents yet." }}
              onRow={(record) => ({
                onClick: () => handleMemoryRecordOpen(record),
              })}
              pagination={{ pageSize: 6 }}
              rowKey={(record) => record.id}
              scroll={{ x: 720 }}
              size="small"
            />
          </section>
        </div>
      </Drawer>

      <Modal
        footer={
          openMemoryRecord?.attachmentDataUrl ? (
            <Space>
              {openMemoryRecord.attachmentWalrusBlobId ? (
                <Button
                  loading={isVerifyingWalrus}
                  onClick={() => void handleVerifyWalrusAttachment(openMemoryRecord)}
                >
                  Verify Walrus
                </Button>
              ) : null}
              {isPreviewableAttachment(openMemoryRecord.attachmentType) ? (
                <Button onClick={() => openAttachment(openMemoryRecord)}>
                  Open File
                </Button>
              ) : null}
              <Button
                onClick={() =>
                  downloadDataUrl(
                    openMemoryRecord.attachmentDataUrl ?? "",
                    openMemoryRecord.attachmentName ?? `${openMemoryRecord.title}.download`,
                  )
                }
                type="primary"
              >
                Download
              </Button>
            </Space>
          ) : null
        }
        onCancel={() => setOpenMemoryRecord(null)}
        open={Boolean(openMemoryRecord)}
        title={<span className="capitalize">{openMemoryRecord?.title}</span>}
        width={720}
        zIndex={1700}
      >
        {openMemoryRecord ? (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex flex-col gap-1">
                <Typography.Text type="secondary" className="text-xs uppercase tracking-wider">Type</Typography.Text>
                <Typography.Text strong>{labelize(openMemoryRecord.kind)}</Typography.Text>
              </div>
              <div className="flex flex-col gap-1">
                <Typography.Text type="secondary" className="text-xs uppercase tracking-wider">Saved</Typography.Text>
                <Typography.Text strong>{formatMemoryCreated(openMemoryRecord.createdAt)}</Typography.Text>
              </div>
              <div className="flex flex-col gap-1">
                <Typography.Text type="secondary" className="text-xs uppercase tracking-wider">Storage</Typography.Text>
                <Typography.Text strong>
                  {openMemoryRecord.attachmentWalrusBlobId && openMemoryRecord.walrusBlobId
                    ? "Walrus + MemWal saved"
                    : openMemoryRecord.attachmentWalrusBlobId
                      ? "Walrus file saved"
                      : openMemoryRecord.walrusBlobId
                        ? "MemWal synced"
                        : `MemWal ${openMemoryRecord.storage.memwal}`}
                </Typography.Text>
              </div>
              <div className="flex flex-col gap-1">
                <Typography.Text type="secondary" className="text-xs uppercase tracking-wider">MemWal blob</Typography.Text>
                <Typography.Text strong>
                  {openMemoryRecord.walrusBlobId ? shortId(openMemoryRecord.walrusBlobId) : "Not saved"}
                </Typography.Text>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Typography.Text type="secondary" className="text-xs uppercase tracking-wider border-b pb-2">Details</Typography.Text>
              <div className="bg-[#007979]/5 p-4 rounded-md border border-[#007979]/10">
                <Typography.Paragraph className="!mb-0 whitespace-pre-wrap font-mono text-sm">
                  {openMemoryRecord.body || "No note details saved for this record."}
                </Typography.Paragraph>
              </div>
            </div>

            {openMemoryRecord.txDigest ? (
              <div>
                <a
                  href={getSuiExplorerTxUrl(openMemoryRecord.txDigest)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#007979] hover:underline"
                >
                  View transaction onchain <ExportOutlined />
                </a>
              </div>
            ) : null}

            {openMemoryRecord.walrusBlobId ? (
              <div className="flex flex-col gap-2">
                <Typography.Text type="secondary" className="text-xs uppercase tracking-wider border-b pb-2">MemWal Walrus blob ID</Typography.Text>
                <Typography.Text
                  className="break-all font-mono text-xs cursor-pointer hover:text-[#007979] hover:underline transition-colors"
                  onClick={() => void copyText(openMemoryRecord.walrusBlobId ?? "")}
                  title="Click to copy"
                >
                  {openMemoryRecord.walrusBlobId}
                </Typography.Text>
              </div>
            ) : null}

            {openMemoryRecord.attachmentWalrusBlobId ? (
              <div className="flex flex-col gap-2">
                <Typography.Text type="secondary" className="text-xs uppercase tracking-wider border-b pb-2">Attachment Walrus blob ID</Typography.Text>
                <Typography.Text
                  className="break-all font-mono text-xs cursor-pointer hover:text-[#007979] hover:underline transition-colors"
                  onClick={() => void copyText(openMemoryRecord.attachmentWalrusBlobId ?? "")}
                  title="Click to copy"
                >
                  {openMemoryRecord.attachmentWalrusBlobId}
                </Typography.Text>
                {openMemoryRecord.attachmentWalrusObjectId ? (
                  <Typography.Text
                    className="break-all font-mono text-xs cursor-pointer hover:text-[#007979] hover:underline transition-colors mt-2"
                    onClick={() => void copyText(openMemoryRecord.attachmentWalrusObjectId ?? "")}
                    title="Click to copy"
                  >
                    {openMemoryRecord.attachmentWalrusObjectId}
                  </Typography.Text>
                ) : null}
                <div className="proof-status-row">
                  <Tag className="theme-tag">
                    {openMemoryRecord.attachmentWalrusEndEpoch
                      ? `Expires epoch ${openMemoryRecord.attachmentWalrusEndEpoch}`
                      : "Stored on Walrus"}
                  </Tag>
                  <Button
                    loading={isVerifyingWalrus}
                    onClick={() => void handleVerifyWalrusAttachment(openMemoryRecord)}
                    size="small"
                  >
                    Read From Walrus
                  </Button>
                </div>
                {verifiedWalrusBlobId === openMemoryRecord.attachmentWalrusBlobId && verifiedWalrusSize !== null ? (
                  <Typography.Text className="text-xs text-[#007979]">
                    Verified read: {formatBytes(verifiedWalrusSize)}
                  </Typography.Text>
                ) : null}
              </div>
            ) : null}

            {openMemoryRecord.attachmentName ? (
              <div className="flex flex-col gap-2">
                <Typography.Text type="secondary" className="text-xs uppercase tracking-wider border-b pb-2">Attachment</Typography.Text>
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md border border-gray-100">
                  <FileTextOutlined />
                  <Typography.Text strong>{openMemoryRecord.attachmentName}</Typography.Text>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Drawer
        open={openDrawer === "history"}
        title="Vault History"
        onClose={() => setOpenDrawer(null)}
        size={1200}
      // width={1400}
      >
        <SuiUsdRateText price={suiUsdPrice} updatedAt={suiUsdUpdatedAt} />
        <div className="mb-6 flex items-center justify-end gap-4">
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
              placeholder="Search past school fees, lunch receipts, transport fares, or allowance notes..."
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

        {(financialMemoryAnswer || memoryRecallEmptyMessage || recalledMemories.length > 0) && (
          <div className="mb-8 p-4 bg-[#007979]/5 rounded-lg border border-[#007979]/10">
            <div className="flex items-center justify-between mb-4">
              <Typography.Text className="font-medium text-xs uppercase tracking-wider opacity-60">
                {financialMemoryAnswer ? "History Answer" : "Recalled from MemWal"}
              </Typography.Text>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setFinancialMemoryAnswer(null);
                  setRecalledMemories([]);
                  setMemoryRecallEmptyMessage(null);
                }}
                className="text-xs"
              >
                Clear Search
              </Button>
            </div>
            {financialMemoryAnswer ? (
              <FinancialAnswerCard answer={financialMemoryAnswer} />
            ) : null}
            {memoryRecallEmptyMessage ? (
              <Card className="compact-card centered-form-card text-center">
                <Typography.Paragraph className="!mb-0">
                  {memoryRecallEmptyMessage}
                </Typography.Paragraph>
              </Card>
            ) : null}
            <MemoryRecallResults memories={recalledMemories} />
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
            setRecalledMemories([]);
            setFinancialMemoryAnswer(null);
            setMemoryRecallEmptyMessage(null);
          }
        }}
        footer={null}
        centered
        width={700}
        zIndex={1800}
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
              placeholder="e.g. 'send 0x... 0.001 for food', 'swap 1 from entertainment/utilities to transport', or 'create a 10 SUI monthly budget', Remeber, Recall..."
              autoSize={{ minRows: 5, maxRows: 40 }}
              value={assistantText}
              onChange={(e) => setAssistantText(e.target.value)}
            />
            <div className="mt-4 flex justify-between items-start gap-4">
              <div className="flex-grow" />
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

type ParsedRecalledMemory = {
  title: string;
  kind?: string;
  details?: string;
  action?: string;
  amount?: string;
  category?: string;
};

function SuiUsdRateText({
  price,
  updatedAt,
}: {
  price: number | null;
  updatedAt?: string;
}) {
  return (
    <Typography.Text className="sui-usd-rate" style={{ color: "var(--vault-accent)" }}>
      {price
        ? `1 SUI ≈ ${formatUsd(price)}${updatedAt ? ` · ${formatRateUpdatedAt(updatedAt)}` : ""}`
        : "SUI/USD estimate unavailable"}
    </Typography.Text>
  );
}

function UsdEstimateText({
  amount,
  price,
}: {
  amount: unknown;
  price: number | null;
}) {
  const suiAmount = parseSuiNumberInput(amount);

  if (!price || suiAmount === null) {
    return null;
  }

  return (
    <Typography.Text className="usd-estimate">
      ≈ {formatUsd(suiAmount * price)}
    </Typography.Text>
  );
}

function FinancialAnswerCard({
  answer,
  className,
  compact = false,
}: {
  answer: FinancialMemoryAnswer;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Card
      className={["compact-card centered-form-card financial-answer-card", className]
        .filter(Boolean)
        .join(" ")}
      title={answer.title}
    >
      <div className="financial-answer-content">
        <div className="financial-answer-summary">
          <Typography.Paragraph className="!mb-0 whitespace-pre-wrap">
            {answer.summary}
          </Typography.Paragraph>
        </div>
        <div className={compact ? "financial-answer-details compact" : "financial-answer-details"}>
          {answer.details.map((detail) => (
            <div className="history-detail" key={detail.label}>
              <Typography.Text type="secondary">{detail.label}</Typography.Text>
              <Typography.Text className="history-detail-value">
                {detail.value}
              </Typography.Text>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function MemoryRecallResults({
  compact = false,
  memories,
}: {
  compact?: boolean;
  memories: RecalledMemory[];
}) {
  if (memories.length === 0) {
    return null;
  }

  return (
    <div className={compact ? "mt-4 grid gap-3" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
      {memories.map((memory) => {
        const parsed = parseRecalledMemory(memory.text);

        return (
          <Card
            className="compact-card recalled-memory-card"
            key={memory.blob_id}
            title={
              <div className="recalled-memory-title">
                <span>{parsed.title}</span>
                {parsed.kind ? <Tag className="theme-tag">{labelize(parsed.kind)}</Tag> : null}
              </div>
            }
          >
            <div className="recalled-memory-body">
              {parsed.details ? (
                <Typography.Paragraph className="!mb-0 whitespace-pre-wrap">
                  {parsed.details}
                </Typography.Paragraph>
              ) : (
                <Typography.Paragraph className="!mb-0 whitespace-pre-wrap">
                  {memory.text}
                </Typography.Paragraph>
              )}

              <div className="recalled-memory-meta">
                {parsed.action ? (
                  <Typography.Text>
                    Action: <span>{labelize(parsed.action)}</span>
                  </Typography.Text>
                ) : null}
                {parsed.amount ? (
                  <Typography.Text>
                    Amount: <span>{parsed.amount}</span>
                  </Typography.Text>
                ) : null}
                {parsed.category ? (
                  <Typography.Text>
                    Category: <span>{formatRecalledCategory(parsed.category)}</span>
                  </Typography.Text>
                ) : null}
                <Typography.Text>
                  Walrus blob: <span>{shortId(memory.blob_id)}</span>
                </Typography.Text>
              </div>

              <div className="recalled-memory-footer">
                <span />
                <Tag className="theme-tag">
                  {formatRecallMatch(memory.distance)} match
                </Tag>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

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

type IntentionDraftApiResponse = {
  draft?: AssistantDraft | null;
  error?: string;
};

async function createOpenAiActionDraft(
  text: string,
  vaultRows: VaultRow[],
  memories: RecalledMemory[],
): Promise<AssistantDraft | null> {
  try {
    const response = await fetch("/api/intentions/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        vaultRows: vaultRows.map((vault) => ({
          id: vault.id,
          categories: vault.categories,
        })),
        memories,
      }),
    });
    const payload = (await response.json()) as IntentionDraftApiResponse;

    if (!response.ok) {
      console.warn(payload.error ?? "OpenAI intention drafting failed.");
      return null;
    }

    return payload.draft ?? null;
  } catch (error) {
    console.warn(error instanceof Error ? error.message : "OpenAI intention drafting failed.");
    return null;
  }
}

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
  if (/\b(daily|day|1 day|one day)\b/.test(text)) return "daily";
  if (/\b(weekly|week|1 week|one week|7 days|seven days)\b/.test(text)) return "weekly";
  if (/\b(half\s*year|half-year|six months?|6 months?)\b/.test(text)) return "halfYear";
  if (/\b(yearly|annual|annually|year|1 year|one year|12 months?)\b/.test(text)) return "yearly";
  if (/\b(monthly|month|1 month|one month|30 days|thirty days)\b/.test(text)) return "monthly";
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

  // 2. Try "spend/swap/send/pay 1.5" format
  const actionMatch = /(?:spend|swap|send|pay|budget|amount)\s+(\d+(?:\.\d{1,9})?)/i.exec(text);
  if (actionMatch) return actionMatch[1];

  // 3. Try "send 0x... 0.001 for food" format. Strip addresses first so
  // address digits are not mistaken for amounts.
  const textWithoutAddresses = text.replace(/0x[a-fA-F0-9]{16,64}/g, " ");
  const fallbackMatch = /\b(\d+(?:\.\d{1,9})?)\b/.exec(textWithoutAddresses);

  return fallbackMatch?.[1] ?? "";
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

function isMemoryLookupIntent(text: string) {
  const lower = text.toLowerCase();
  const hasMemoryVerb =
    /\b(recall|remember|search|find|show|what|when|where|how|total|history|receipt|document|note|memory|memories)\b/.test(
      lower,
    );
  const hasTransactionVerb = /\b(spend|send|pay|swap|move|create|budget|split|overspend)\b/.test(lower);
  const asksQuestion = /\b(how much|what|when|where|total|history|so far)\b/.test(lower);

  return hasMemoryVerb && (!hasTransactionVerb || asksQuestion);
}

function buildFinancialMemoryAnswer(
  query: string,
  spendRows: HistoryEvent[],
  historyRows: HistoryEvent[],
): FinancialMemoryAnswer | null {
  const lower = query.toLowerCase();
  const dateAnswer = buildHistoryDateAnswer(query, historyRows);

  if (dateAnswer) {
    return dateAnswer;
  }

  const asksForSpendTotal =
    /\b(how much|total|sum|so far|spent|spend|spending)\b/.test(lower) &&
    /\b(spent|spend|spending|transaction|transactions)\b/.test(lower);

  if (!asksForSpendTotal) {
    return null;
  }

  const category = DEFAULT_CATEGORIES.find((item) => lower.includes(item.name.toLowerCase()));
  const matchingRows = category
    ? spendRows.filter((item) => readNumberField(item.fields.category) === category.id)
    : spendRows;
  const totalMist = matchingRows.reduce(
    (total, item) => total + BigInt(normalizeMoveScalar(item.fields.amount) ?? 0),
    BigInt(0),
  );
  const scope = category ? `${category.name} spending` : "spending";

  return {
    title: `Total ${scope}`,
    summary: `You have spent ${formatMist(totalMist)}${category ? ` on ${category.name}` : ""} across ${matchingRows.length} ${matchingRows.length === 1 ? "transaction" : "transactions"}.`,
    details: [
      { label: "Category", value: category?.name ?? "All categories" },
      { label: "Transactions", value: String(matchingRows.length) },
      { label: "Total spent", value: formatMist(totalMist) },
    ],
  };
}

function buildHistoryDateAnswer(query: string, historyRows: HistoryEvent[]): FinancialMemoryAnswer | null {
  const targetDate = parseQueryDate(query);

  if (!targetDate) {
    return null;
  }

  const matchingRows = historyRows.filter((item) => {
    const timestamp = parseTimestampMs(
      item.event.timestampMs ?? readStringField(readEventFields(item.event.parsedJson).timestamp_ms),
    );

    if (timestamp === null) {
      return false;
    }

    const eventDate = new Date(timestamp);
    return (
      eventDate.getFullYear() === targetDate.getFullYear() &&
      eventDate.getMonth() === targetDate.getMonth() &&
      eventDate.getDate() === targetDate.getDate()
    );
  });

  if (matchingRows.length === 0) {
    return {
      title: `Activity on ${formatDateForAnswer(targetDate)}`,
      summary: `No vault activity was found on ${formatDateForAnswer(targetDate)}.`,
      details: [{ label: "Events", value: "0" }],
    };
  }

  return {
    title: `Activity on ${formatDateForAnswer(targetDate)}`,
    summary: matchingRows.map(formatHistoryAnswerRow).join("\n"),
    details: [
      { label: "Events", value: String(matchingRows.length) },
      {
        label: "Total spent",
        value: formatMist(
          matchingRows
            .filter((item) => item.name === "BudgetSpend")
            .reduce((total, item) => total + BigInt(normalizeMoveScalar(item.fields.amount) ?? 0), BigInt(0)),
        ),
      },
    ],
  };
}

function parseQueryDate(query: string) {
  const match = /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.exec(query);

  if (!match) {
    return null;
  }

  const monthIndex = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].findIndex((month) => match[2].toLowerCase().startsWith(month));

  if (monthIndex === -1) {
    return null;
  }

  return new Date(new Date().getFullYear(), monthIndex, Number(match[1]));
}

function formatDateForAnswer(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatHistoryAnswerRow(item: HistoryEvent) {
  const vault = shortId(readStringField(item.fields.vault_id) ?? "-");

  if (item.name === "BudgetSpend") {
    return `Vault ${vault}: spent ${formatMist(item.fields.amount)} from ${formatCategoryName(item.fields.category)} to ${shortId(readStringField(item.fields.recipient) ?? "-")}.`;
  }

  if (item.name === "CategorySwap") {
    return `Vault ${vault}: swapped ${formatMist(item.fields.amount)} from ${formatCategoryName(item.fields.from_category)} to ${formatCategoryName(item.fields.to_category)}.`;
  }

  return `Vault ${vault}: ${formatEventName(item.name)}.`;
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

function parseRecalledMemory(text: string): ParsedRecalledMemory {
  const fields = new Map<string, string>();

  for (const line of text.split("\n")) {
    const [label, ...rest] = line.split(":");
    const value = rest.join(":").trim();

    if (!value) {
      continue;
    }

    const normalizedLabel = label.trim().toLowerCase();
    fields.set(normalizedLabel, value);
  }

  return {
    title: fields.get("vault memory") ?? "Vault memory",
    kind: fields.get("kind"),
    details: fields.get("details"),
    action: fields.get("action"),
    amount: fields.get("amount"),
    category: fields.get("category"),
  };
}

function formatRecalledCategory(value: string) {
  const categoryId = Number(value);

  if (!Number.isFinite(categoryId)) {
    return value;
  }

  return DEFAULT_CATEGORIES.find((category) => category.id === categoryId)?.name ?? value;
}

function readFileAsDataUrl(file: File) {
  const maxBytes = 1.5 * 1024 * 1024;

  if (file.size > maxBytes) {
    throw new Error("Upload a file smaller than 1.5 MB.");
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read file."));
    };
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

async function storeAttachmentOnWalrus(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/walrus/store", {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json()) as WalrusStoreApiResponse | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Unable to store file on Walrus.");
  }

  return (payload as WalrusStoreApiResponse).result;
}

async function copyText(value: string) {
  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(value);
  toast.success("Copied.");
}

function isPreviewableAttachment(type?: string) {
  return Boolean(type && (type.startsWith("image/") || type === "application/pdf" || type.startsWith("text/")));
}

function openAttachment(record: MemoryRecord) {
  if (!record.attachmentDataUrl) {
    return;
  }

  window.open(record.attachmentDataUrl, "_blank", "noopener,noreferrer");
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function formatMemoryCreated(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1 ? 2 : 4,
  }).format(value);
}

function formatSuiWithUsd(value: string, price: number | null) {
  if (!price) {
    return value;
  }

  const amount = parseSuiNumberInput(value);
  return amount === null ? value : `${value} (${formatUsd(amount * price)})`;
}

function formatRateUpdatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "live estimate";
  }

  return `updated ${new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function parseSuiNumberInput(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = /-?\d+(?:\.\d+)?/.exec(value.replace(/,/g, ""));
  const parsed = match ? Number(match[0]) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

function getSuiExplorerTxUrl(digest: string) {
  return `https://${SUI_NETWORK === "mainnet" ? "" : SUI_NETWORK + "."}suivision.xyz/txblock/${digest}`;
}

function formatRecallMatch(distance: number) {
  const score = Math.max(0, Math.min(100, (1 - distance) * 100));
  return `${score.toFixed(0)}%`;
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
