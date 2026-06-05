# Vault

Vault is a Sui-based DeFi, budgeting, and payments app for student treasury management and category-based capital allocation.

The app lets a user lock SUI into a smart contract vault, split that SUI into spending categories, rebalance idle capital, and batch multiple actions with Sui Programmable Transaction Blocks (PTBs). It also stores receipts, notes, transaction memory, and uploaded documents using Walrus and MemWal so the user can search and recover their financial memory later.

## Problem

Students often receive money in chunks, such as allowance, school fees, or support for daily expenses. After that, it is easy to lose track of where the money goes.

Most budgeting tools only track spending after the money is already gone. Vault tries to make the money itself programmable:

- split money into clear categories
- enforce category spending onchain
- record receipts and notes
- remember past spending with AI memory
- show SUI values in USD for easier understanding

## What Vault Does

1. A user connects a Slush wallet.
2. The user creates a budget vault by depositing SUI.
3. The SUI is split into categories:
   - Food
   - Transport
   - Academics
   - Entertainment/Utilities
   - Other
4. The user can spend from a category.
5. The user can swap unused allocation between categories.
6. The user can batch multiple spends, swaps, and overspends into one Sui Programmable Transaction Block.
7. The app can suggest treasury rebalances by moving idle capital from overfunded categories to underfunded ones.
8. If enabled, the user can overspend with a contract-controlled fee.
9. When a budget cycle ends, the user can withdraw remaining SUI or redistribute it into a new budget cycle.
10. The app saves transaction notes and receipts to MemWal/Walrus.
11. The user can search past receipts, notes, and spending history later.

## Why Sui

Vault uses Sui because Sui assets are objects, not just balances. This makes it a good fit for programmable budgeting.

The budget vault is an onchain object that owns and manages SUI. The Move contract controls who can spend, which category the spend comes from, and what happens when the user swaps or overspends.

Vault also uses Sui Programmable Transaction Blocks in the frontend so a student can combine multiple category actions into one wallet confirmation. For example, a single batch transaction can spend for books and swap unused transport funds into academics atomically.

## Smart Contract

- Contract repo: https://github.com/bellobambo/vault-sui
- Network: Sui Testnet
- SuiVision package link: https://testnet.suivision.xyz/package/0x6e5fbdaf83d98b2e44c08470a563093184f130fd42f724892167905c43ae06c5
- Package/program ID:

```text
0x6e5fbdaf83d98b2e44c08470a563093184f130fd42f724892167905c43ae06c5
```

Main contract functions used by the frontend:

- `create_budget`
- `spend`
- `swap_categories`
- `overspend`
- `close_budget`
- `redistribute_budget`

End-cycle actions supported in the UI:

- `Withdraw`: closes an expired budget and sends the remaining balance back to the user's wallet.
- `Redistribute`: opens a new budget plan for the expired vault's remaining balance, then calls `redistribute_budget` when the user submits the new allocations.

## Walrus and MemWal

Vault uses Walrus and MemWal for persistent financial memory.

- MemWal stores searchable memories for budgets, receipts, and spending notes.
- Walrus stores uploaded receipt/document files.
- Saved records show both the MemWal Walrus blob ID and direct attachment Walrus blob ID.
- Users can restore memory from Walrus.
- Users can verify/read stored Walrus blobs from the app.

This means receipts and budget context are not only stored in the browser. They can persist across sessions and be recalled later.

## AI Intent Flow

Vault includes an intent box for faster actions.

Example spend prompts:

```text
send 0xRECIPIENT 0.001 for food
spend 0.5 SUI from transport to 0xRECIPIENT
```

Example swap prompts:

```text
swap 1 from entertainment/utilities to transport
move 0.5 from food to academics
```

Example batch transaction prompt:

```text
send 0.001 SUI to 0xRECIPIENT for books and swap 0.05 SUI from transportation to academics
```

The app uses the intention flow to draft actions, detect categories, and prepare single or batch transactions. Batch Transactions use Sui PTBs so multiple requests can be sent with one wallet confirmation.

## Batch Transactions with PTBs

Vault supports Batch Transactions for students who need to perform multiple financial actions at once.

- A batch can include multiple spends, swaps, and overspends.
- The frontend builds one Sui Programmable Transaction Block containing the selected Move calls.
- The user signs once in the wallet.
- The batch is atomic: if one operation fails, the whole transaction rolls back.
- Batch transaction records are saved to MemWal/Walrus like other transaction memories.
- The app checks category remaining balances before signing and warns when a spend should be converted to overspend.

## Treasury Rebalance

Vault includes a treasury management action inside each vault's details view.

- The app reads each category's remaining allocation.
- It detects the category with the most idle capital.
- It detects the category with the weakest remaining balance.
- It suggests moving half of the gap between those two remaining balances.
- The user can apply the suggestion with one onchain `swap_categories` transaction.
- The rebalance is saved as a financial memory so the user can recall the treasury decision later.

This makes the vault act like a simple capital allocator instead of only a spending tracker.

## SUI/USD Conversion

The app fetches a live SUI/USD estimate and shows:

- the current `1 SUI ≈ USD` rate
- USD estimates below spend/swap amount inputs
- USD values beside budget balance and spent amounts

This helps users understand the real-world value of their SUI budget.

## Tracks Fit

### DeFi & Payments

Vault fits the DeFi & Payments track because it turns simple payments into programmable financial actions. Its strongest fit is **Vaults & Capital Management**: the app behaves like a lightweight student treasury management system and capital allocator.

- SUI is locked into an onchain vault.
- Spending is controlled by category rules.
- Swapping reallocates budget mid-cycle.
- Batch Transactions use Sui Programmable Transaction Blocks (PTBs) to execute multiple spends and swaps with one wallet confirmation.
- Treasury Rebalance suggests moving idle category capital toward underfunded categories.
- Withdraw returns unspent funds after a budget cycle ends.
- Redistribute reuses the remaining balance for a new budget cycle.
- Overspending is enforced by contract logic and fees.
- The app gives users a simple financial interface for managing funds.

### Walrus

Vault fits the Walrus track because it gives the finance workflow persistent memory and artifact storage.

- Receipts and documents are stored on Walrus.
- Budget and transaction memories are stored with MemWal.
- Users can restore memory and verify stored blob IDs.
- The AI-style memory layer makes old spending context searchable.

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
WALRUS_STORAGE_DRIVER=http
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
```

Walrus file uploads use the HTTP publisher/aggregator by default. Set `WALRUS_STORAGE_DRIVER=cli` only for local environments where the Walrus CLI is installed and available in `PATH`.

## Run Locally

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
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

## Status

Vault currently supports SUI budgeting on Sui Testnet. The current version focuses on student-friendly budgeting, receipt storage, category spending, budget swaps, and persistent financial memory.
