/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as balance from './deps/sui/balance';
const $moduleName = '@local-pkg/vault::vault';
export const Category = new MoveStruct({ name: `${$moduleName}::Category`, fields: {
        id: bcs.u8(),
        name: bcs.string(),
        allocation: bcs.u64(),
        spent: bcs.u64(),
        overspent: bcs.u64()
    } });
export const BudgetVault = new MoveStruct({ name: `${$moduleName}::BudgetVault`, fields: {
        id: bcs.Address,
        owner: bcs.Address,
        cycle: bcs.u8(),
        start_ms: bcs.u64(),
        end_ms: bcs.u64(),
        active: bcs.bool(),
        allow_overspend: bcs.bool(),
        total_deposited: bcs.u64(),
        total_spent: bcs.u64(),
        total_fees_paid: bcs.u64(),
        balance: balance.Balance,
        categories: bcs.vector(Category),
        /** Offchain pointer for the AI memory record stored with Walrus/MemWal. */
        memory_ref: bcs.vector(bcs.u8())
    } });
export const TreasuryConfig = new MoveStruct({ name: `${$moduleName}::TreasuryConfig`, fields: {
        id: bcs.Address,
        treasury: bcs.Address
    } });
export const BudgetCreated = new MoveStruct({ name: `${$moduleName}::BudgetCreated`, fields: {
        vault_id: bcs.Address,
        owner: bcs.Address,
        cycle: bcs.u8(),
        start_ms: bcs.u64(),
        end_ms: bcs.u64(),
        amount: bcs.u64(),
        allow_overspend: bcs.bool(),
        swap_fee_bps: bcs.u64(),
        overspend_fee_bps: bcs.u64(),
        memory_ref: bcs.vector(bcs.u8())
    } });
export const TreasuryCreated = new MoveStruct({ name: `${$moduleName}::TreasuryCreated`, fields: {
        config_id: bcs.Address,
        treasury: bcs.Address
    } });
export const CategorySwap = new MoveStruct({ name: `${$moduleName}::CategorySwap`, fields: {
        vault_id: bcs.Address,
        owner: bcs.Address,
        from_category: bcs.u8(),
        to_category: bcs.u8(),
        amount: bcs.u64(),
        fee: bcs.u64(),
        timestamp_ms: bcs.u64(),
        memory_ref: bcs.vector(bcs.u8())
    } });
export const BudgetSpend = new MoveStruct({ name: `${$moduleName}::BudgetSpend`, fields: {
        vault_id: bcs.Address,
        owner: bcs.Address,
        recipient: bcs.Address,
        category: bcs.u8(),
        amount: bcs.u64(),
        fee: bcs.u64(),
        overspend: bcs.bool(),
        note: bcs.vector(bcs.u8()),
        timestamp_ms: bcs.u64(),
        memory_ref: bcs.vector(bcs.u8())
    } });
export const BudgetClosed = new MoveStruct({ name: `${$moduleName}::BudgetClosed`, fields: {
        vault_id: bcs.Address,
        owner: bcs.Address,
        action: bcs.u8(),
        amount: bcs.u64(),
        timestamp_ms: bcs.u64(),
        memory_ref: bcs.vector(bcs.u8())
    } });
export const SavingsVault = new MoveStruct({ name: `${$moduleName}::SavingsVault`, fields: {
        id: bcs.Address,
        owner: bcs.Address,
        balance: balance.Balance,
        memory_ref: bcs.vector(bcs.u8())
    } });
export interface CycleDailyOptions {
    package?: string;
    arguments?: [
    ];
}
export function cycleDaily(options: CycleDailyOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'cycle_daily',
    });
}
export interface CycleWeeklyOptions {
    package?: string;
    arguments?: [
    ];
}
export function cycleWeekly(options: CycleWeeklyOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'cycle_weekly',
    });
}
export interface CycleMonthlyOptions {
    package?: string;
    arguments?: [
    ];
}
export function cycleMonthly(options: CycleMonthlyOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'cycle_monthly',
    });
}
export interface CycleHalfYearOptions {
    package?: string;
    arguments?: [
    ];
}
export function cycleHalfYear(options: CycleHalfYearOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'cycle_half_year',
    });
}
export interface CycleYearlyOptions {
    package?: string;
    arguments?: [
    ];
}
export function cycleYearly(options: CycleYearlyOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'cycle_yearly',
    });
}
export interface ActionSaveOptions {
    package?: string;
    arguments?: [
    ];
}
export function actionSave(options: ActionSaveOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'action_save',
    });
}
export interface ActionRollOverOptions {
    package?: string;
    arguments?: [
    ];
}
export function actionRollOver(options: ActionRollOverOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'action_roll_over',
    });
}
export interface ActionWithdrawOptions {
    package?: string;
    arguments?: [
    ];
}
export function actionWithdraw(options: ActionWithdrawOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'action_withdraw',
    });
}
export interface ActionRedistributeOptions {
    package?: string;
    arguments?: [
    ];
}
export function actionRedistribute(options: ActionRedistributeOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'action_redistribute',
    });
}
export interface SwapFeeBpsOptions {
    package?: string;
    arguments?: [
    ];
}
export function swapFeeBps(options: SwapFeeBpsOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'swap_fee_bps',
    });
}
export interface OverspendFeeBpsOptions {
    package?: string;
    arguments?: [
    ];
}
export function overspendFeeBps(options: OverspendFeeBpsOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'overspend_fee_bps',
    });
}
export interface CreateBudgetArguments {
    deposit: RawTransactionArgument<string>;
    cycle: RawTransactionArgument<number>;
    startMs: RawTransactionArgument<number | bigint>;
    endMs: RawTransactionArgument<number | bigint>;
    categoryIds: RawTransactionArgument<Array<number>>;
    categoryNames: RawTransactionArgument<Array<string>>;
    allocations: RawTransactionArgument<Array<number | bigint>>;
    allowOverspend: RawTransactionArgument<boolean>;
    memoryRef: RawTransactionArgument<Array<number>>;
}
export interface CreateBudgetOptions {
    package?: string;
    arguments: CreateBudgetArguments | [
        deposit: RawTransactionArgument<string>,
        cycle: RawTransactionArgument<number>,
        startMs: RawTransactionArgument<number | bigint>,
        endMs: RawTransactionArgument<number | bigint>,
        categoryIds: RawTransactionArgument<Array<number>>,
        categoryNames: RawTransactionArgument<Array<string>>,
        allocations: RawTransactionArgument<Array<number | bigint>>,
        allowOverspend: RawTransactionArgument<boolean>,
        memoryRef: RawTransactionArgument<Array<number>>
    ];
}
export function createBudget(options: CreateBudgetOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        'u8',
        'u64',
        'u64',
        'vector<u8>',
        'vector<0x1::string::String>',
        'vector<u64>',
        'bool',
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["deposit", "cycle", "startMs", "endMs", "categoryIds", "categoryNames", "allocations", "allowOverspend", "memoryRef"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'create_budget',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SpendArguments {
    vault: RawTransactionArgument<string>;
    categoryId: RawTransactionArgument<number>;
    recipient: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
    note: RawTransactionArgument<Array<number>>;
}
export interface SpendOptions {
    package?: string;
    arguments: SpendArguments | [
        vault: RawTransactionArgument<string>,
        categoryId: RawTransactionArgument<number>,
        recipient: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>,
        note: RawTransactionArgument<Array<number>>
    ];
}
export function spend(options: SpendOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        'u8',
        'address',
        'u64',
        'vector<u8>',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "categoryId", "recipient", "amount", "note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'spend',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SwapCategoriesArguments {
    config: RawTransactionArgument<string>;
    vault: RawTransactionArgument<string>;
    fromCategoryId: RawTransactionArgument<number>;
    toCategoryId: RawTransactionArgument<number>;
    amount: RawTransactionArgument<number | bigint>;
}
export interface SwapCategoriesOptions {
    package?: string;
    arguments: SwapCategoriesArguments | [
        config: RawTransactionArgument<string>,
        vault: RawTransactionArgument<string>,
        fromCategoryId: RawTransactionArgument<number>,
        toCategoryId: RawTransactionArgument<number>,
        amount: RawTransactionArgument<number | bigint>
    ];
}
export function swapCategories(options: SwapCategoriesOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        null,
        'u8',
        'u8',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["config", "vault", "fromCategoryId", "toCategoryId", "amount"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'swap_categories',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OverspendArguments {
    config: RawTransactionArgument<string>;
    vault: RawTransactionArgument<string>;
    categoryId: RawTransactionArgument<number>;
    recipient: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
    note: RawTransactionArgument<Array<number>>;
}
export interface OverspendOptions {
    package?: string;
    arguments: OverspendArguments | [
        config: RawTransactionArgument<string>,
        vault: RawTransactionArgument<string>,
        categoryId: RawTransactionArgument<number>,
        recipient: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>,
        note: RawTransactionArgument<Array<number>>
    ];
}
export function overspend(options: OverspendOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        null,
        'u8',
        'address',
        'u64',
        'vector<u8>',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["config", "vault", "categoryId", "recipient", "amount", "note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'overspend',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CloseBudgetArguments {
    vault: RawTransactionArgument<string>;
    action: RawTransactionArgument<number>;
}
export interface CloseBudgetOptions {
    package?: string;
    arguments: CloseBudgetArguments | [
        vault: RawTransactionArgument<string>,
        action: RawTransactionArgument<number>
    ];
}
export function closeBudget(options: CloseBudgetOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        'u8',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "action"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'close_budget',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RedistributeBudgetArguments {
    vault: RawTransactionArgument<string>;
    cycle: RawTransactionArgument<number>;
    startMs: RawTransactionArgument<number | bigint>;
    endMs: RawTransactionArgument<number | bigint>;
    categoryIds: RawTransactionArgument<Array<number>>;
    categoryNames: RawTransactionArgument<Array<string>>;
    allocations: RawTransactionArgument<Array<number | bigint>>;
    allowOverspend: RawTransactionArgument<boolean>;
    memoryRef: RawTransactionArgument<Array<number>>;
}
export interface RedistributeBudgetOptions {
    package?: string;
    arguments: RedistributeBudgetArguments | [
        vault: RawTransactionArgument<string>,
        cycle: RawTransactionArgument<number>,
        startMs: RawTransactionArgument<number | bigint>,
        endMs: RawTransactionArgument<number | bigint>,
        categoryIds: RawTransactionArgument<Array<number>>,
        categoryNames: RawTransactionArgument<Array<string>>,
        allocations: RawTransactionArgument<Array<number | bigint>>,
        allowOverspend: RawTransactionArgument<boolean>,
        memoryRef: RawTransactionArgument<Array<number>>
    ];
}
export function redistributeBudget(options: RedistributeBudgetOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        'u8',
        'u64',
        'u64',
        'vector<u8>',
        'vector<0x1::string::String>',
        'vector<u64>',
        'bool',
        'vector<u8>',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "cycle", "startMs", "endMs", "categoryIds", "categoryNames", "allocations", "allowOverspend", "memoryRef"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'redistribute_budget',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WithdrawSavingsArguments {
    savings: RawTransactionArgument<string>;
}
export interface WithdrawSavingsOptions {
    package?: string;
    arguments: WithdrawSavingsArguments | [
        savings: RawTransactionArgument<string>
    ];
}
export function withdrawSavings(options: WithdrawSavingsOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["savings"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'withdraw_savings',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OwnerArguments {
    vault: RawTransactionArgument<string>;
}
export interface OwnerOptions {
    package?: string;
    arguments: OwnerArguments | [
        vault: RawTransactionArgument<string>
    ];
}
export function owner(options: OwnerOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'owner',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsActiveArguments {
    vault: RawTransactionArgument<string>;
}
export interface IsActiveOptions {
    package?: string;
    arguments: IsActiveArguments | [
        vault: RawTransactionArgument<string>
    ];
}
export function isActive(options: IsActiveOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'is_active',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TotalSpentArguments {
    vault: RawTransactionArgument<string>;
}
export interface TotalSpentOptions {
    package?: string;
    arguments: TotalSpentArguments | [
        vault: RawTransactionArgument<string>
    ];
}
export function totalSpent(options: TotalSpentOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'total_spent',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TotalFeesPaidArguments {
    vault: RawTransactionArgument<string>;
}
export interface TotalFeesPaidOptions {
    package?: string;
    arguments: TotalFeesPaidArguments | [
        vault: RawTransactionArgument<string>
    ];
}
export function totalFeesPaid(options: TotalFeesPaidOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'total_fees_paid',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VaultBalanceArguments {
    vault: RawTransactionArgument<string>;
}
export interface VaultBalanceOptions {
    package?: string;
    arguments: VaultBalanceArguments | [
        vault: RawTransactionArgument<string>
    ];
}
export function vaultBalance(options: VaultBalanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'vault_balance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TreasuryArguments {
    config: RawTransactionArgument<string>;
}
export interface TreasuryOptions {
    package?: string;
    arguments: TreasuryArguments | [
        config: RawTransactionArgument<string>
    ];
}
export function treasury(options: TreasuryOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["config"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'treasury',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CategoryCountArguments {
    vault: RawTransactionArgument<string>;
}
export interface CategoryCountOptions {
    package?: string;
    arguments: CategoryCountArguments | [
        vault: RawTransactionArgument<string>
    ];
}
export function categoryCount(options: CategoryCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["vault"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'category_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CategoryRemainingArguments {
    vault: RawTransactionArgument<string>;
    categoryId: RawTransactionArgument<number>;
}
export interface CategoryRemainingOptions {
    package?: string;
    arguments: CategoryRemainingArguments | [
        vault: RawTransactionArgument<string>,
        categoryId: RawTransactionArgument<number>
    ];
}
export function categoryRemaining(options: CategoryRemainingOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "categoryId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'category_remaining',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CategorySpentArguments {
    vault: RawTransactionArgument<string>;
    categoryId: RawTransactionArgument<number>;
}
export interface CategorySpentOptions {
    package?: string;
    arguments: CategorySpentArguments | [
        vault: RawTransactionArgument<string>,
        categoryId: RawTransactionArgument<number>
    ];
}
export function categorySpent(options: CategorySpentOptions) {
    const packageAddress = options.package ?? '@local-pkg/vault';
    const argumentsTypes = [
        null,
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "categoryId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'vault',
        function: 'category_spent',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
