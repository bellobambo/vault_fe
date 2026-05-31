export const SUI_NETWORK: "mainnet" | "testnet" | "devnet" | "localnet" = "testnet";

export const VAULT_PACKAGE_ID =
  "0x6e5fbdaf83d98b2e44c08470a563093184f130fd42f724892167905c43ae06c5";

export const VAULT_MODULE = "vault";

export const TREASURY_CONFIG_ID =
  "0xb2c611826592da1834d8f383291b07298c15c756526b92362477e95668cfa511";

export const TREASURY_ADDRESS =
  "0x53a382534cff621f23ea14563ab594f94d4125d96ef53d3f4ded693ba9c49201";

export const UPGRADE_CAP_ID =
  "0xd6c1d7d14069c02d6c65555be9452eda8aaa4946243b880af5b021b7a46e2f19";

export const CLOCK_OBJECT_ID = "0x6";
export const SUI_COIN_TYPE = "0x2::sui::SUI";
export const MIST_PER_SUI = BigInt(1_000_000_000);

export const VAULT_TARGETS = {
  createBudget: `${VAULT_PACKAGE_ID}::${VAULT_MODULE}::create_budget`,
  spend: `${VAULT_PACKAGE_ID}::${VAULT_MODULE}::spend`,
  swapCategories: `${VAULT_PACKAGE_ID}::${VAULT_MODULE}::swap_categories`,
  overspend: `${VAULT_PACKAGE_ID}::${VAULT_MODULE}::overspend`,
  closeBudget: `${VAULT_PACKAGE_ID}::${VAULT_MODULE}::close_budget`,
  redistributeBudget: `${VAULT_PACKAGE_ID}::${VAULT_MODULE}::redistribute_budget`,
  withdrawSavings: `${VAULT_PACKAGE_ID}::${VAULT_MODULE}::withdraw_savings`,
} as const;

export const VAULT_EVENT_TYPES = {
  budgetCreated: `${VAULT_PACKAGE_ID}::${VAULT_MODULE}::BudgetCreated`,
  treasuryCreated: `${VAULT_PACKAGE_ID}::${VAULT_MODULE}::TreasuryCreated`,
  categorySwap: `${VAULT_PACKAGE_ID}::${VAULT_MODULE}::CategorySwap`,
  budgetSpend: `${VAULT_PACKAGE_ID}::${VAULT_MODULE}::BudgetSpend`,
  budgetClosed: `${VAULT_PACKAGE_ID}::${VAULT_MODULE}::BudgetClosed`,
} as const;

export const BUDGET_CYCLES = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  halfYear: 3,
  yearly: 4,
} as const;

export const END_ACTIONS = {
  save: 0,
  rollOver: 1,
  withdraw: 2,
  redistribute: 3,
} as const;

export const DEFAULT_CATEGORIES = [
  { id: 0, name: "Food" },
  { id: 1, name: "Transport" },
  { id: 2, name: "Academics" },
  { id: 3, name: "Entertainment/Utilities" },
  { id: 4, name: "Other" },
] as const;

export const VAULT_FEES_BPS = {
  categorySwap: 500,
  overspend: 1000,
} as const;

export const MOVE_ABORT_ERRORS: Record<number, string> = {
  0: "Only the vault owner can perform this action.",
  1: "The vault is not active.",
  2: "The budget cycle has expired.",
  3: "Invalid budget cycle.",
  4: "Invalid start or end date.",
  5: "At least one category is required.",
  6: "Category IDs, names, and allocations must have matching lengths.",
  7: "Category allocations must equal the deposited amount.",
  8: "Category was not found.",
  9: "Category allocation is exhausted.",
  10: "Vault balance is too low.",
  11: "Unused allocation is too low for this swap.",
  12: "Overspending is disabled for this vault.",
  13: "Invalid fee.",
  14: "Budget cycle is still active.",
  15: "Invalid budget close action.",
  16: "Vault has no balance.",
  17: "Invalid redistribution.",
  18: "Other category cannot exceed the average of the main categories.",
};
