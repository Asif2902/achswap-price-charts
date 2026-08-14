# AchSwap Price Charts Subgraph

Goldsky (Graph Protocol) subgraph for **proper token price charts** on Arc Testnet.

Indexes:

| Source | Contract | What it feeds |
|--------|----------|----------------|
| Uniswap V2 | Factory `0x7cC0…B72B` | pair Sync/Swap → token + pool OHLC |
| Uniswap V3 | Factory `0x65fa…F06a` | pool Initialize/Swap → token + pool OHLC |
| Uniswap V4 | PoolManager `0x016E…bebb` | Initialize/Swap → token + pool OHLC |
| RWA Oracle | `0x7639…ABdB` | PriceSubmitted → RWA + synth token OHLC |

Vault address (context only, not required for price candles): `0xb8dc…e78C`.

## Chart entities

### Token charts (primary)

```graphql
# Latest price
{
  token(id: "0x...") {
    symbol
    derivedUsd
    lastPriceUpdate
  }
}

# Hourly OHLC candles (TradingView-style)
{
  tokenHourDatas(
    where: { token: "0x...", periodStartUnix_gte: 1700000000 }
    orderBy: periodStartUnix
    orderDirection: asc
  ) {
    periodStartUnix
    open
    high
    low
    close
    priceUsd
    volumeUsd
    txCount
  }
}

# Daily OHLC
{
  tokenDayDatas(
    where: { token: "0x..." }
    orderBy: date
    orderDirection: asc
  ) {
    date
    open
    high
    low
    close
    priceUsd
    volumeUsd
  }
}
```

### Pool charts

`poolHourDatas` / `poolDayDatas` — OHLC on `token0Price` (token1 per token0) plus USD prices.

### Trade ticks

```graphql
{
  swaps(
    first: 100
    where: { pool: "0x..." }
    orderBy: timestamp
    orderDirection: desc
  ) {
    timestamp
    amount0
    amount1
    amountUsd
    token0PriceUsd
    token1PriceUsd
  }
}
```

### RWA oracle charts

```graphql
{
  rwaPair(id: "1") {
    symbol
    priceUsd
    lastPriceTimestamp
  }
  rwaPairHourDatas(where: { pair: "1" }, orderBy: periodStartUnix) {
    periodStartUnix
    open
    high
    low
    close
  }
  rwaPricePoints(first: 60, where: { pair: "1" }, orderBy: timestamp, orderDirection: desc) {
    priceUsd
    timestamp
  }
}
```

RWA prices are also written onto the **synth `Token`**, so you can chart AAPL/GOLD/etc. with the same `tokenHourDatas` API as DEX tokens.

## Network

- Chain: Arc Testnet (`chainId` 5042002)
- Goldsky network slug: `arc-testnet`
- WUSDC (USD peg): `0xDe5DB9049a8dd344dC1B7Bbb098f9da60930A6dA`

## ABIs source

- V4 `PoolManager` ABI extracted from `achswap-contracts/v4/artifacts`
- RWA `AchRWAOracle` ABI extracted from `achswap-agg/artifacts-rwa`
- V2/V3 standard Uniswap event ABIs

## Develop

```bash
cd C:\Users\Asif\achswap-price-charts
npm install
npm run codegen
npm run build
```

## Deploy (Goldsky)

```bash
# login / select project first
goldsky project list

goldsky subgraph deploy achswap-price-charts/1.0.0 --path .
# stable frontend URL:
goldsky subgraph deploy achswap-price-charts/1.0.0 --path . --tag prod
```

Endpoint shape:

```text
https://api.goldsky.com/api/public/<project-id>/subgraphs/achswap-price-charts/<version-or-tag>/gn
```

## Frontend candle mapping

| Chart bar | Entity | Time field | OHLC fields |
|-----------|--------|------------|-------------|
| 1h | `TokenHourData` | `periodStartUnix` | `open/high/low/close` |
| 1d | `TokenDayData` | `date` | `open/high/low/close` |
| RWA 1h | `RwaPairHourData` | `periodStartUnix` | same |
| ticks | `Swap` or `RwaPricePoint` | `timestamp` | last price |

Use `close` as the bar close; `priceUsd` is the last print in that period.
