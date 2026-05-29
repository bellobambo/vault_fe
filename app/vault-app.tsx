"use client";

import {
  ConnectButton,
  useCurrentAccount,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientQuery,
} from "@mysten/dapp-kit";
import { SyncOutlined } from "@ant-design/icons";
import type { SuiEvent } from "@mysten/sui/jsonRpc";
import {
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
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
  type MemoryRecord,
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
  categoryId?: number;
  amount?: string;
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
};

type DrawerKey = "createBudget" | "actions" | "storage" | "history";

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
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>([]);
  const [lastDigest, setLastDigest] = useState<string>();
  const [actionCategories, setActionCategories] = useState<VaultCategoryOption[]>([]);

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

  const otherHistoryRows = useMemo(
    () => historyRows.filter((item) => item.name !== "BudgetSpend"),
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
      render: (_value, item) => (item.fields.overspend ? "Overspend" : "Spend"),
    },
    {
      title: "Tx",
      key: "tx",
      width: 115,
      render: (_value, item) => shortId(item.event.id.txDigest),
    },
  ];

  function remember(input: {
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
    return record;
  }

  function handleCreateBudget(values: CreateBudgetValues) {
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
    const memory = remember({
      kind: "budget",
      title: values.memoryTitle || "Budget plan",
      body: values.memoryBody,
    });

    const tx = buildCreateBudgetTransaction({
      amountMist,
      cycle: BUDGET_CYCLES[values.cycle],
      startMs: now,
      endMs: now + cycleDurationsMs[values.cycle],
      categories,
      allowOverspend: true,
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

  function handleVaultAction(values: ActionValues) {
    if (!account) {
      toast.error("Connect your Sui wallet first.");
      return;
    }

    const memory = remember({
      kind: values.action === "spend" ? "receipt" : "history",
      title: `${values.action} record`,
      body: values.note,
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
          ownedVaults.refetch();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function handleDocumentSave(values: { title: string; body?: string }) {
    remember({
      kind: "document",
      title: values.title,
      body: values.body,
    });
    documentForm.resetFields();
    toast.success("Document reference saved as a local draft.");
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
          <Button onClick={() => setOpenDrawer("createBudget")}>Create Budget</Button>
          <Button onClick={() => setOpenDrawer("storage")}>Storage</Button>
          <Button onClick={() => setOpenDrawer("history")}>History</Button>
        </div>
      </nav>

      <main className="min-h-[calc(100vh-116px)] bg-[#007979] px-4 py-8 text-[var(--vault-accent)] sm:px-6">
        {!account ? (
          <section className="vault-disconnected mx-auto flex min-h-[calc(100vh-180px)] w-full max-w-3xl flex-col items-center justify-center text-center">
            <Typography.Title className="vault-page-title !mb-3" level={1}>
              Vault
            </Typography.Title>
            <Typography.Paragraph className="vault-page-description !mx-auto !max-w-xl !text-lg">
              Create Budget Vault
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
              {vaultRows.map((vault) => (
                <Card
                  key={vault.id}
                  className="compact-card centered-form-card"
                  title={
                    <div className="flex items-center justify-between">
                      <span>Budget Vault</span>
                      <Tag className="theme-tag">
                        {vault.active === "true" ? "Active" : vault.active}
                      </Tag>
                    </div>
                  }
                >
                  <div className="space-y-4">
                    <div>
                      <Typography.Text type="secondary">Vault ID</Typography.Text>
                      <Typography.Paragraph className="!my-1 break-all font-mono text-xs">
                        {vault.id}
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
                      <Button
                        size="small"
                        onClick={() => {
                          actionForm.setFieldValue("vaultId", vault.id);
                          actionForm.setFieldValue("action", "overspend");
                          setActionCategories(vault.categories);
                          setActiveAction("overspend");
                          setOpenDrawer("actions");
                        }}
                      >
                        Overspend
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

          <Button block htmlType="submit" loading={isPending} type="primary">
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
              <Radio.Button value="overspend">Overspend</Radio.Button>
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

          <Button block htmlType="submit" loading={isPending} type="primary">
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
          <Button block htmlType="submit" type="primary">
            Save reference
          </Button>
        </Form>

        <div className="mt-5 grid gap-2">
          {memoryRecords.map((record) => (
            <div className="theme-memory-item rounded p-3" key={record.id}>
              <Typography.Text strong>{record.title}</Typography.Text>
              <Typography.Text className="block font-mono text-xs">
                {record.memoryRef}
              </Typography.Text>
            </div>
          ))}
        </div>
      </Drawer>

      <Drawer
        open={openDrawer === "history"}
        title="Vault History"
        onClose={() => setOpenDrawer(null)}
        size={1200}
        // width={1400}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <Typography.Text>
            Contract events for your connected wallet.
          </Typography.Text>
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
        </div>

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
      { label: "Type", value: fields.overspend ? "Overspend" : "Spend" },
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
