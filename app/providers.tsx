"use client";

import "@mysten/dapp-kit/dist/index.css";

import { createNetworkConfig, SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, App as AntdApp } from "antd";
import { useState } from "react";
import { Toaster } from "react-hot-toast";

import { SUI_NETWORK } from "@/src/config/vault";

const { networkConfig } = createNetworkConfig({
  testnet: { network: "testnet", url: getJsonRpcFullnodeUrl("testnet") },
});

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={SUI_NETWORK}>
        <WalletProvider autoConnect>
          <ConfigProvider
            theme={{
              token: {
                colorPrimary: "#007979",
                colorLink: "#007979",
                colorInfo: "#007979",
                colorBgLayout: "#f7faf9",
                colorBorder: "#d7e5e2",
                borderRadius: 8,
                fontFamily: "var(--font-geist-sans), Arial, sans-serif",
              },
              components: {
                Button: {
                  controlHeight: 38,
                  primaryShadow: "none",
                },
                Card: {
                  borderRadiusLG: 8,
                },
                Tabs: {
                  inkBarColor: "#007979",
                  itemSelectedColor: "#007979",
                },
              },
            }}
          >
            <AntdApp>{children}</AntdApp>
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  border: "1px solid #d7e5e2",
                  color: "#143332",
                },
                success: {
                  iconTheme: {
                    primary: "#007979",
                    secondary: "#FFE0C5",
                  },
                },
              }}
            />
          </ConfigProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
