# Vault

Vault is a Sui-based DeFi, budgeting, and payments platform for student treasury management and category-based funds allocation.

Users deposit SUI into a budget vault, split it into categories, spend and swap from those categories with onchain rules, rebalance idle funds, and save financial records with Walrus/MemWal.

## Problem Vault Solves

Students need a simple way to manage spending across daily needs like food, transport, books, rent, and school fees without losing track of where funds are going or overspending on unnecessary items. Vault helps by turning a budget into an onchain vault with category rules, treasury rebalancing, and searchable financial records, so students can spend with more structure and move idle funds toward underfunded needs.

## Core Features

- Create a SUI budget vault with category allocations.
- Spend from categories such as Food, Transport, Academics, Entertainment/Utilities, and Other.
- Swap unused allocation between categories.
- Use Batch Transactions with Sui Programmable Transaction Blocks (PTBs) to submit multiple spends, swaps, or overspends with one wallet confirmation.
- Use Treasury Rebalance to move idle funds from the category with the highest remaining balance toward the category with the weakest remaining balance.
- Save receipts, notes, transaction memories, and documents with Walrus/MemWal.
- Search saved financial memory from the app.
- View SUI/USD estimates beside balances and action amounts.

## Treasury Rebalance

Treasury Rebalance is available inside each vault's details view.

The app:

- reads each category's remaining balance
- finds the category with the most idle capital
- finds the category with the weakest remaining balance
- suggests moving half of the gap between both balances
- applies the rebalance through the onchain `swap_categories` function

Supporting the **Vaults & Capital Management** track by making the vault act as a simple treasury management system and capital allocator.

## Batch Transactions with PTBs

Batch Transactions use Sui Programmable Transaction Blocks.

A user can combine actions like:

```text
send 0.001 SUI to 0xRECIPIENT for books and swap 0.05 SUI from transportation to academics
```

The app prepares the actions in one PTB, so the user signs once. If one operation fails, the whole batch rolls back.

## Intention Flow

The intention box helps users draft actions with natural language.

Examples:

```text
send 0xRECIPIENT 0.001 for food
swap 1 from entertainment/utilities to transport
send 0.001 SUI to 0xRECIPIENT for books and swap 0.05 SUI from transportation to academics
```

The app detects the action, amount, recipient, categories, and whether it should be a single transaction or batch PTB.

## Walrus and MemWal

Vault uses Walrus and MemWal for financial memory.

- MemWal stores searchable memories for budgets, receipts, documents, and transaction notes.
- Walrus stores uploaded receipt/document files.
- Recalled document memories can be downloaded from the app.
- Users can restore and verify saved records.

## Smart Contract

- Contract repo: https://github.com/bellobambo/vault-sui
- Network: Sui Testnet
- SuiVision package link: https://testnet.suivision.xyz/package/0x6e5fbdaf83d98b2e44c08470a563093184f130fd42f724892167905c43ae06c5
- Package ID:

```text
0x6e5fbdaf83d98b2e44c08470a563093184f130fd42f724892167905c43ae06c5
```

Main contract functions used:

- `create_budget`
- `spend`
- `swap_categories`
- `overspend`
- `close_budget`
- `redistribute_budget`

## Track Fit

I am submitting Vault for the **DeFi & Payments** track, especially **Vaults & Capital Management** , **Financial Automation** , the **Walrus/Memwal** track and for the University award.

- Vaults hold and manage user funds.
- Category rules enforce how funds can be spent.
- Treasury Rebalance suggests allocation changes.
- PTBs batch multiple financial actions into one wallet confirmation.
- Walrus/MemWal keeps receipts, notes, and transaction memory searchable.

## Tech Stack

- Next.js
- Sui dApp Kit
- Sui Move contract
- Walrus
- MemWal

## Environment Variables

Create a `.env` file with:

```bash
MEMWAL_ACCOUNT_ID=
MEMWAL_PRIVATE_KEY=
MEMWAL_SERVER_URL=
WALRUS_STORAGE_DRIVER=
WALRUS_PUBLISHER_URL=
WALRUS_AGGREGATOR_URL=
```

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Useful Scripts

```bash
npm run dev
npm run build
npm run lint
npm run codegen
```
