export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CoinGeckoSimplePrice = {
  sui?: {
    usd?: number;
  };
};

export async function GET() {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd",
      {
        headers: {
          accept: "application/json",
        },
        next: { revalidate: 60 },
      },
    );

    if (!response.ok) {
      throw new Error(`CoinGecko returned ${response.status}.`);
    }

    const payload = (await response.json()) as CoinGeckoSimplePrice;
    const usd = payload.sui?.usd;

    if (typeof usd !== "number" || !Number.isFinite(usd)) {
      throw new Error("SUI/USD price was not available.");
    }

    return Response.json({
      result: {
        usd,
        source: "CoinGecko",
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to fetch SUI/USD price." },
      { status: 500 },
    );
  }
}
