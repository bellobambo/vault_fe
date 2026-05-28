This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.




Yes. Looking at the ABI/functions, this project is a Sui-based
  budgeting vault app.

  The core idea: a user locks SUI into a BudgetVault, splits that SUI
  across spending categories, then spends from those categories over a
  fixed time period. It is like an onchain personal finance envelope
  system.

  What It Does

  The user creates a budget:

  Deposit 10 SUI
  Cycle: Monthly
  Categories:
  - Food: 3 SUI
  - Transport: 2 SUI
  - Rent: 5 SUI

  The contract stores that budget onchain as a BudgetVault.

  Then the user can:

  - Spend from a category
  - Move unused allocation between categories
  - Overspend if enabled, with a fee
  - Close the budget when the cycle ends
  - Save leftover funds into a SavingsVault
  - Withdraw saved funds later
  - Track spending, fees, remaining category balances, and events

  Why It Could Be Useful

  It can be useful as a Web3 personal finance app where funds are not
  just tracked offchain, but actually controlled by smart contract
  rules.

  For example:

  - A user cannot spend more than the Food category allocation unless
    overspend is enabled.
  - Each spend emits an event, so spending history is transparent and
    indexable.
  - Budgets have real start and end dates.
  - Leftover money can be saved or withdrawn.
  - The memory_ref field suggests you may connect this to AI or
    Walrus/MemWal storage for offchain budgeting notes,
    recommendations, or financial memory.

  So the app could become something like:

  AI-assisted onchain budget vault for SUI users

  Main Features By Contract Function

  create_budget

  Creates a new budget vault. The user deposits SUI and splits it into
  categories.

  Useful for: starting a weekly/monthly/yearly spending plan.

  spend

  Pays someone from a specific category.

  Useful for: recording and enforcing spending limits.

  swap_categories

  Moves unused budget from one category to another, with a 5% fee.

  Useful for: adjusting your budget mid-cycle.

  overspend

  Allows spending beyond a category limit, with a 10% fee.

  Useful for: emergencies, but discourages careless overspending.

  close_budget

  Ends the budget after its expiry date. The remaining money can be
  saved or returned.

  Useful for: finishing a budget cycle cleanly.

  redistribute_budget

  Reuses remaining funds for a new budget cycle with new category
  allocations.

  Useful for: rolling leftover funds into the next month.

  withdraw_savings

  Withdraws money from a SavingsVault.

  Useful for: accessing saved leftover funds.

  Business/Product Angle

  This could be positioned as:

  A self-custodial budgeting app on Sui where users create spending
  envelopes, track usage, and build savings discipline.

  The strongest use case is budgeting discipline. Instead of just
  showing charts after money is spent, the contract actively enforces
  spending categories before money leaves the vault.

  One Important Note

  The contract only manages SUI, not other coins yet. So right now it
  is best suited for SUI-denominated budgeting. Later, it could be
  expanded to support generic coin types like Coin<T>.