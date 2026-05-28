import type { SuiCodegenConfig } from "@mysten/codegen";

const config: SuiCodegenConfig = {
  output: "./src/contracts",
  generateSummaries: true,
  prune: true,
  packages: [
    {
      package: "@local-pkg/vault",
      path: "../vault",
    },
  ],
};

export default config;
