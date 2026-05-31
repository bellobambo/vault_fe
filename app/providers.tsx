"use client";

import "@mysten/dapp-kit/dist/index.css";

import { createNetworkConfig, SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, App as AntdApp } from "antd";
import { useState } from "react";
import { Toaster } from "react-hot-toast";

const { networkConfig } = createNetworkConfig({
  testnet: { network: "testnet", url: getJsonRpcFullnodeUrl("testnet") },
});

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <ConfigProvider
            theme={{
              token: {
                colorPrimary: "#007979",
                colorLink: "#007979",
                colorInfo: "#007979",
                colorText: "#007979",
                colorTextBase: "#007979",
                colorBgBase: "#F5F5F5",
                colorBgContainer: "#F5F5F5",
                colorBgElevated: "#F5F5F5",
                colorBgLayout: "#007979",
                colorBorder: "#007979",
                borderRadius: 8,
                fontFamily: "var(--font-montserrat), sans-serif",
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
                  background: "#F5F5F5",
                  border: "1px solid #007979",
                  color: "#007979",
                },
                success: {
                  iconTheme: {
                    primary: "#007979",
                    secondary: "#F5F5F5",
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
