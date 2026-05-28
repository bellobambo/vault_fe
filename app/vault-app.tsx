"use client";

import {
  ConnectButton,
  useCurrentAccount,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientQuery,
} from "@mysten/dapp-kit";
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  BUDGET_CYCLES,
  DEFAULT_CATEGORIES,
  MOVE_ABORT_ERRORS,
  SUI_NETWORK,
  TREASURY_ADDRESS,
  TREASURY_CONFIG_ID,
  VAULT_EVENT_TYPES,
  VAULT_FEES_BPS,
  VAULT_PACKAGE_ID,
  VAULT_TARGETS,
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
  days: number;
  memoryTitle?: string;
  memoryBody?: string;
  food: string;
  transport: string;
  academic: string;
  entertainment: string;
  other: string;
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

const categoryAmountFields = [
  "food",
  "transport",
  "academic",
  "entertainment",
  "other",
] as const;

const categoryFieldLabels = {
  food: "Food",
  transport: "Transport",
  academic: "Academic",
  entertainment: "Entertainment",
  other: "Other",
};

export function VaultApp() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const suiClient = useSuiClient();

  const suiBalance = useSuiClientQuery(
    "getBalance",
    { owner: account?.address ?? "" },
    { enabled: Boolean(account?.address) },
  );
  const [createForm] = Form.useForm<CreateBudgetValues>();
  const [actionForm] = Form.useForm<ActionValues>();
  const [receiptForm] = Form.useForm();
  const [activeAction, setActiveAction] = useState<ActionValues["action"]>("spend");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>([]);
  const [lastDigest, setLastDigest] = useState<string>();

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
    {
      enabled: Boolean(account?.address),
    },
  );

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
        };
      }) ?? []
    );
  }, [ownedVaults.data]);

  const vaultColumns: ColumnsType<(typeof vaultRows)[number]> = [
    {
      title: "Vault ID",
      dataIndex: "id",
      render: (value: string) => <span className="font-mono">{shortId(value)}</span>,
    },
    { title: "Balance", dataIndex: "balance" },
    { title: "Spent", dataIndex: "spent" },
    {
      title: "Status",
      dataIndex: "active",
      render: (value: string) => (
        <Tag color={value === "true" ? "#007979" : "default"}>
          {value === "true" ? "Active" : value}
        </Tag>
      ),
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

    const categories = categoryAmountFields.map((field, index) => ({
      id: DEFAULT_CATEGORIES[index].id,
      name: categoryFieldLabels[field],
      allocationMist: suiToMist(values[field] || "0"),
    }));
    const amountMist = categories.reduce(
      (total, category) => total + category.allocationMist,
      BigInt(0),
    );
    const now = Date.now();
    const endMs = now + values.days * 24 * 60 * 60 * 1000;
    const memory = remember({
      kind: "budget",
      title: values.memoryTitle || "Budget plan",
      body: values.memoryBody,
    });

    const tx = buildCreateBudgetTransaction({
      amountMist,
      cycle: BUDGET_CYCLES[values.cycle],
      startMs: now,
      endMs,
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

  function handleReceiptSave(values: { title: string; body?: string }) {
    remember({
      kind: "document",
      title: values.title,
      body: values.body,
    });
    receiptForm.resetFields();
    setReceiptOpen(false);
    toast.success("Document reference saved as a local draft.");
  }

  return (
    <>
      <header className="flex w-full items-center justify-between bg-[#007979] px-6 py-3">
        <span className="text-xl font-bold tracking-wide text-white">Vault</span>
        <div className="flex items-center gap-2">
          {account ? (
            <>
              <span className="rounded border border-white/60 px-3 py-1 text-sm text-white">
                {suiBalance.data ? formatMist(suiBalance.data.totalBalance) : "— SUI"}
              </span>
              <span className="rounded border border-white/60 px-3 py-1 text-sm text-white">
                {account.address.slice(0, 6)}...{account.address.slice(-4)}
              </span>
              <button
                onClick={() => disconnect()}
                className="rounded border border-white/60 px-3 py-1 text-sm text-white transition-colors hover:bg-white/10"
              >
                Disconnect
              </button>
            </>
          ) : (
            <ConnectButton connectText="Connect wallet" />
          )}
        </div>
      </header>
      <main className="min-h-screen bg-[var(--app-bg)] px-4 py-5 text-[#102322] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <Tabs
          defaultActiveKey="vault"
          items={[
            {
              key: "vault",
              label: "Vault",
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={14}>
                    <Card title="Create Budget" className="compact-card">
                      <Form
                        form={createForm}
                        layout="vertical"
                        initialValues={{
                          cycle: "monthly",
                          allowOverspend: true,
                          days: 30,
                          food: "0.4",
                          transport: "0.2",
                          academic: "0.25",
                          entertainment: "0.1",
                          other: "0.05",
                        }}
                        onFinish={handleCreateBudget}
                      >
                        <Row gutter={12}>
                          <Col xs={24} sm={12}>
                            <Form.Item label="Cycle" name="cycle">
                              <Select
                                options={Object.keys(BUDGET_CYCLES).map((cycle) => ({
                                  label: labelize(cycle),
                                  value: cycle,
                                }))}
                              />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Form.Item label="Length in days" name="days">
                              <InputNumber className="w-full" min={1} />
                            </Form.Item>
                          </Col>
                        </Row>

                        <Row gutter={12}>
                          {categoryAmountFields.map((field) => (
                            <Col xs={24} sm={12} md={field === "other" ? 24 : 12} key={field}>
                              <Form.Item
                                label={`${categoryFieldLabels[field]} allocation`}
                                name={field}
                                rules={[{ required: true }]}
                              >
                                <Input suffix="SUI" />
                              </Form.Item>
                            </Col>
                          ))}
                        </Row>

                        <Form.Item label="Allow overspend" name="allowOverspend">
                          <Radio.Group
                            options={[
                              { label: "Yes", value: true },
                              { label: "No", value: false },
                            ]}
                          />
                        </Form.Item>

                        <Row gutter={12}>
                          <Col xs={24} sm={10}>
                            <Form.Item label="Memory title" name="memoryTitle">
                              <Input placeholder="Monthly allowance" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={14}>
                            <Form.Item label="Memory note" name="memoryBody">
                              <Input placeholder="What this budget is for" />
                            </Form.Item>
                          </Col>
                        </Row>

                        <Button
                          block
                          htmlType="submit"
                          loading={isPending}
                          type="primary"
                        >
                          Create budget
                        </Button>
                      </Form>
                    </Card>
                  </Col>

                  <Col xs={24} lg={10}>
                    <Space className="w-full" direction="vertical" size={16}>
                      <Card title="My Vaults" className="compact-card">
                        <Table
                          columns={vaultColumns}
                          dataSource={vaultRows}
                          loading={Boolean(account?.address) && ownedVaults.isFetching}
                          pagination={false}
                          rowKey="id"
                          size="small"
                        />
                      </Card>

                      <Card
                        title="Vault Action"
                        extra={
                          <Button size="small" onClick={() => setReceiptOpen(true)}>
                            Add document
                          </Button>
                        }
                        className="compact-card"
                      >
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
                                  <CategorySelect />
                                </Form.Item>
                              </Col>
                              <Col span={12}>
                                <Form.Item label="To" name="toCategoryId" rules={[{ required: true }]}>
                                  <CategorySelect />
                                </Form.Item>
                              </Col>
                            </Row>
                          ) : (
                            <>
                              <Form.Item label="Recipient" name="recipient" rules={[{ required: true }]}>
                                <Input placeholder="0x..." />
                              </Form.Item>
                              <Form.Item label="Category" name="categoryId" rules={[{ required: true }]}>
                                <CategorySelect />
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
                      </Card>
                    </Space>
                  </Col>
                </Row>
              ),
            },
            {
              key: "details",
              label: "Details",
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={8}>
                    <StatisticCard label="Package" value={shortId(VAULT_PACKAGE_ID)} />
                  </Col>
                  <Col xs={24} md={8}>
                    <StatisticCard label="TreasuryConfig" value={shortId(TREASURY_CONFIG_ID)} />
                  </Col>
                  <Col xs={24} md={8}>
                    <StatisticCard label="Last digest" value={lastDigest ? shortId(lastDigest) : "-"} />
                  </Col>
                  <Col xs={24} md={8}>
                    <StatisticCard label="Swap fee" value={`${VAULT_FEES_BPS.categorySwap / 100}%`} />
                  </Col>
                  <Col xs={24} md={8}>
                    <StatisticCard label="Overspend fee" value={`${VAULT_FEES_BPS.overspend / 100}%`} />
                  </Col>
                  <Col xs={24} lg={12}>
                    <Card title="Contract IDs" className="compact-card">
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label="Package">{VAULT_PACKAGE_ID}</Descriptions.Item>
                        <Descriptions.Item label="TreasuryConfig">{TREASURY_CONFIG_ID}</Descriptions.Item>
                        <Descriptions.Item label="Treasury">{TREASURY_ADDRESS}</Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </Col>
                  <Col xs={24} lg={12}>
                    <Card title="Offchain Storage" className="compact-card">
                      <Typography.Paragraph>
                        Receipts, documents, and budget history are prepared as MemWal memory records.
                        Their `memoryRef` is attached to Move calls, while the full content belongs in
                        MemWal/Walrus storage.
                      </Typography.Paragraph>
                      <Space wrap>
                        <Tag color="#007979">MemWal memory</Tag>
                        <Tag color="#FFE0C5" className="!text-[#5a3321]">Walrus blobs</Tag>
                        <Tag>Drafts: {memoryRecords.length}</Tag>
                      </Space>
                    </Card>
                  </Col>
                  <Col span={24}>
                    <Card title="Write Targets" className="compact-card">
                      <Descriptions column={1} size="small">
                        {Object.entries(VAULT_TARGETS).map(([key, value]) => (
                          <Descriptions.Item key={key} label={key}>
                            <span className="font-mono">{value}</span>
                          </Descriptions.Item>
                        ))}
                      </Descriptions>
                    </Card>
                  </Col>
                  <Col span={24}>
                    <Card title="Events And Error Codes" className="compact-card">
                      <Row gutter={[16, 16]}>
                        <Col xs={24} lg={12}>
                          <Descriptions column={1} size="small">
                            {Object.entries(VAULT_EVENT_TYPES).map(([key, value]) => (
                              <Descriptions.Item key={key} label={key}>
                                <span className="font-mono">{value}</span>
                              </Descriptions.Item>
                            ))}
                          </Descriptions>
                        </Col>
                        <Col xs={24} lg={12}>
                          <Descriptions column={1} size="small">
                            {Object.entries(MOVE_ABORT_ERRORS).slice(0, 8).map(([key, value]) => (
                              <Descriptions.Item key={key} label={key}>
                                {value}
                              </Descriptions.Item>
                            ))}
                          </Descriptions>
                        </Col>
                      </Row>
                    </Card>
                  </Col>
                </Row>
              ),
            },
          ]}
        />

        <Drawer
          open={receiptOpen}
          title="Save Document Reference"
          onClose={() => setReceiptOpen(false)}
          width={420}
        >
          <Form form={receiptForm} layout="vertical" onFinish={handleReceiptSave}>
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
        </Drawer>
      </div>
    </main>
    </>
  );
}

function CategorySelect() {
  return (
    <Select
      options={DEFAULT_CATEGORIES.map((category) => ({
        label: category.name,
        value: category.id,
      }))}
    />
  );
}

function StatisticCard({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Card className="compact-card">
      <Statistic title={label} value={value} valueStyle={{ color: "#007979", fontSize: 22 }} />
    </Card>
  );
}

function labelize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
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
