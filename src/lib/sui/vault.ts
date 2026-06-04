import { Transaction } from "@mysten/sui/transactions";
import {
  getJsonRpcFullnodeUrl,
  SuiJsonRpcClient,
} from "@mysten/sui/jsonRpc";

import {
  closeBudget,
  createBudget,
  overspend,
  redistributeBudget,
  spend,
  swapCategories,
  withdrawSavings,
} from "@/src/contracts/vault/vault";
import {
  MIST_PER_SUI,
  SUI_NETWORK,
  TREASURY_CONFIG_ID,
  VAULT_PACKAGE_ID,
  type BUDGET_CYCLES,
  type END_ACTIONS,
} from "@/src/config/vault";

type BudgetCycle = (typeof BUDGET_CYCLES)[keyof typeof BUDGET_CYCLES];
type EndAction = (typeof END_ACTIONS)[keyof typeof END_ACTIONS];

export type BudgetCategoryInput = {
  id: number;
  name: string;
  allocationMist: bigint;
};

export type CreateBudgetInput = {
  amountMist: bigint;
  cycle: BudgetCycle;
  startMs: number | bigint;
  endMs: number | bigint;
  categories: BudgetCategoryInput[];
  allowOverspend: boolean;
  memoryRef?: string | Uint8Array | number[];
};

export type SpendInput = {
  vaultId: string;
  categoryId: number;
  recipient: string;
  amountMist: bigint;
  note?: string | Uint8Array | number[];
};

export type SwapCategoriesInput = {
  vaultId: string;
  fromCategoryId: number;
  toCategoryId: number;
  amountMist: bigint;
};

export type OverspendInput = {
  vaultId: string;
  categoryId: number;
  recipient: string;
  amountMist: bigint;
  note?: string | Uint8Array | number[];
};

export type BatchVaultActionInput =
  | ({ action: "spend" } & SpendInput)
  | ({ action: "swap" } & SwapCategoriesInput)
  | ({ action: "overspend" } & OverspendInput);

export type RedistributeBudgetInput = Omit<CreateBudgetInput, "amountMist"> & {
  vaultId: string;
};

const textEncoder = new TextEncoder();

export function createVaultClient() {
  return new SuiJsonRpcClient({
    network: SUI_NETWORK,
    url: getJsonRpcFullnodeUrl(SUI_NETWORK),
  });
}

export function suiToMist(sui: string) {
  const trimmed = sui.trim();
  if (!/^\d+(\.\d{0,9})?$/.test(trimmed)) {
    throw new Error("SUI amount must have at most 9 decimal places.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole) * MIST_PER_SUI + BigInt(fraction.padEnd(9, "0"));
}

export function bytesFromText(value: string | Uint8Array | number[] = "") {
  if (typeof value === "string") {
    return Array.from(textEncoder.encode(value));
  }

  return Array.from(value);
}

export function buildCreateBudgetTransaction(input: CreateBudgetInput) {
  const tx = new Transaction();
  const [deposit] = tx.splitCoins(tx.gas, [input.amountMist]);

  createBudget({
    package: VAULT_PACKAGE_ID,
    arguments: {
      deposit,
      cycle: input.cycle,
      startMs: input.startMs,
      endMs: input.endMs,
      categoryIds: input.categories.map((category) => category.id),
      categoryNames: input.categories.map((category) => category.name),
      allocations: input.categories.map((category) => category.allocationMist),
      allowOverspend: input.allowOverspend,
      memoryRef: bytesFromText(input.memoryRef),
    },
  })(tx);

  return tx;
}

export function buildSpendTransaction(input: SpendInput) {
  const tx = new Transaction();

  spend({
    package: VAULT_PACKAGE_ID,
    arguments: {
      vault: input.vaultId,
      categoryId: input.categoryId,
      recipient: input.recipient,
      amount: input.amountMist,
      note: bytesFromText(input.note),
    },
  })(tx);

  return tx;
}

export function buildSwapCategoriesTransaction(input: SwapCategoriesInput) {
  const tx = new Transaction();

  swapCategories({
    package: VAULT_PACKAGE_ID,
    arguments: {
      config: TREASURY_CONFIG_ID,
      vault: input.vaultId,
      fromCategoryId: input.fromCategoryId,
      toCategoryId: input.toCategoryId,
      amount: input.amountMist,
    },
  })(tx);

  return tx;
}

export function buildOverspendTransaction(input: OverspendInput) {
  const tx = new Transaction();

  overspend({
    package: VAULT_PACKAGE_ID,
    arguments: {
      config: TREASURY_CONFIG_ID,
      vault: input.vaultId,
      categoryId: input.categoryId,
      recipient: input.recipient,
      amount: input.amountMist,
      note: bytesFromText(input.note),
    },
  })(tx);

  return tx;
}

export function buildBatchVaultActionsTransaction(actions: BatchVaultActionInput[]) {
  const tx = new Transaction();

  for (const action of actions) {
    if (action.action === "swap") {
      swapCategories({
        package: VAULT_PACKAGE_ID,
        arguments: {
          config: TREASURY_CONFIG_ID,
          vault: action.vaultId,
          fromCategoryId: action.fromCategoryId,
          toCategoryId: action.toCategoryId,
          amount: action.amountMist,
        },
      })(tx);
      continue;
    }

    if (action.action === "overspend") {
      overspend({
        package: VAULT_PACKAGE_ID,
        arguments: {
          config: TREASURY_CONFIG_ID,
          vault: action.vaultId,
          categoryId: action.categoryId,
          recipient: action.recipient,
          amount: action.amountMist,
          note: bytesFromText(action.note),
        },
      })(tx);
      continue;
    }

    spend({
      package: VAULT_PACKAGE_ID,
      arguments: {
        vault: action.vaultId,
        categoryId: action.categoryId,
        recipient: action.recipient,
        amount: action.amountMist,
        note: bytesFromText(action.note),
      },
    })(tx);
  }

  return tx;
}

export function buildCloseBudgetTransaction(vaultId: string, action: EndAction) {
  const tx = new Transaction();

  closeBudget({
    package: VAULT_PACKAGE_ID,
    arguments: {
      vault: vaultId,
      action,
    },
  })(tx);

  return tx;
}

export function buildRedistributeBudgetTransaction(
  input: RedistributeBudgetInput,
) {
  const tx = new Transaction();

  redistributeBudget({
    package: VAULT_PACKAGE_ID,
    arguments: {
      vault: input.vaultId,
      cycle: input.cycle,
      startMs: input.startMs,
      endMs: input.endMs,
      categoryIds: input.categories.map((category) => category.id),
      categoryNames: input.categories.map((category) => category.name),
      allocations: input.categories.map((category) => category.allocationMist),
      allowOverspend: input.allowOverspend,
      memoryRef: bytesFromText(input.memoryRef),
    },
  })(tx);

  return tx;
}

export function buildWithdrawSavingsTransaction(savingsVaultId: string) {
  const tx = new Transaction();

  withdrawSavings({
    package: VAULT_PACKAGE_ID,
    arguments: {
      savings: savingsVaultId,
    },
  })(tx);

  return tx;
}
