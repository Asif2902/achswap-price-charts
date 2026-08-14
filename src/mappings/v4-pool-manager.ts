import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  Initialize as InitializeEvent,
  Swap as SwapEvent,
} from "../../generated/V4PoolManager/PoolManager";
import { Pool, Swap as SwapEntity, Token } from "../../generated/schema";
import { ONE_BI, ZERO_BD, ZERO_BI, normalize } from "../utils/constants";
import { absBD, sqrtPriceX96ToTokenPrices, toDecimal } from "../utils/math";
import {
  applyDerivedUsd,
  deriveUsdFromSqrtPrices,
  finalizePriceUpdate,
  swapVolumeUsd,
} from "../utils/pricing";
import { getOrCreateToken } from "../utils/token";

function poolIdFromBytes(id: Bytes): string {
  return "v4-" + id.toHexString().toLowerCase();
}

export function handleV4Initialize(event: InitializeEvent): void {
  const id = poolIdFromBytes(event.params.id);
  let pool = Pool.load(id);
  if (pool != null) return;

  const token0 = getOrCreateToken(event.params.currency0, event.block);
  const token1 = getOrCreateToken(event.params.currency1, event.block);

  const prices = sqrtPriceX96ToTokenPrices(
    event.params.sqrtPriceX96,
    token0.decimals,
    token1.decimals,
  );

  pool = new Pool(id);
  pool.address = event.address;
  pool.version = "V4";
  pool.token0 = token0.id;
  pool.token1 = token1.id;
  pool.feeTier = BigInt.fromI32(event.params.fee as i32);
  pool.token0Price = prices[0];
  pool.token1Price = prices[1];
  pool.token0PriceUsd = ZERO_BD;
  pool.token1PriceUsd = ZERO_BD;
  pool.reserve0 = ZERO_BD;
  pool.reserve1 = ZERO_BD;
  pool.liquidity = ZERO_BI;
  pool.sqrtPriceX96 = event.params.sqrtPriceX96;
  pool.tick = BigInt.fromI32(event.params.tick);
  pool.tvlUsd = ZERO_BD;
  pool.volumeToken0 = ZERO_BD;
  pool.volumeToken1 = ZERO_BD;
  pool.volumeUsd = ZERO_BD;
  pool.txCount = ZERO_BI;
  pool.swapCount = ZERO_BI;
  pool.hooks = event.params.hooks;
  pool.tickSpacing = BigInt.fromI32(event.params.tickSpacing);
  pool.createdAtTimestamp = event.block.timestamp;
  pool.createdAtBlock = event.block.number;
  pool.updatedAtTimestamp = event.block.timestamp;
  pool.updatedAtBlock = event.block.number;
  pool.save();

  token0.poolCount = token0.poolCount.plus(ONE_BI);
  token1.poolCount = token1.poolCount.plus(ONE_BI);
  token0.save();
  token1.save();

  const usd = deriveUsdFromSqrtPrices(token0, token1, prices[0], prices[1]);
  applyDerivedUsd(token0, token1, usd, event.block.timestamp);
  finalizePriceUpdate(pool as Pool, token0, token1, ZERO_BD, ZERO_BD, ZERO_BD, event.block, true);
}

export function handleV4Swap(event: SwapEvent): void {
  const id = poolIdFromBytes(event.params.id);
  const pool = Pool.load(id);
  if (pool == null) {
    log.warning("V4 swap for unknown pool {}", [id]);
    return;
  }

  const token0 = Token.load(pool.token0) as Token;
  const token1 = Token.load(pool.token1) as Token;

  const amount0 = toDecimal(event.params.amount0, token0.decimals);
  const amount1 = toDecimal(event.params.amount1, token1.decimals);
  const abs0 = absBD(amount0);
  const abs1 = absBD(amount1);

  const prices = sqrtPriceX96ToTokenPrices(
    event.params.sqrtPriceX96,
    token0.decimals,
    token1.decimals,
  );

  pool.sqrtPriceX96 = event.params.sqrtPriceX96;
  pool.tick = BigInt.fromI32(event.params.tick);
  pool.liquidity = event.params.liquidity;
  pool.token0Price = prices[0];
  pool.token1Price = prices[1];
  // V4 amounts are pool deltas; approximate reserves from liquidity not done here
  pool.feeTier = BigInt.fromI32(event.params.fee as i32);

  const usd = deriveUsdFromSqrtPrices(token0, token1, prices[0], prices[1]);
  applyDerivedUsd(token0, token1, usd, event.block.timestamp);

  const volumeUsd = swapVolumeUsd(token0, token1, abs0, abs1);

  pool.volumeToken0 = pool.volumeToken0.plus(abs0);
  pool.volumeToken1 = pool.volumeToken1.plus(abs1);
  pool.volumeUsd = pool.volumeUsd.plus(volumeUsd);
  pool.txCount = pool.txCount.plus(ONE_BI);
  pool.swapCount = pool.swapCount.plus(ONE_BI);

  token0.volumeUsd = token0.volumeUsd.plus(volumeUsd);
  token1.volumeUsd = token1.volumeUsd.plus(volumeUsd);
  token0.txCount = token0.txCount.plus(ONE_BI);
  token1.txCount = token1.txCount.plus(ONE_BI);
  token0.save();
  token1.save();

  const swap = new SwapEntity(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString(),
  );
  swap.txHash = event.transaction.hash;
  swap.logIndex = event.logIndex;
  swap.timestamp = event.block.timestamp;
  swap.blockNumber = event.block.number;
  swap.pool = pool.id;
  swap.version = "V4";
  swap.sender = event.params.sender;
  swap.recipient = null;
  swap.token0 = token0.id;
  swap.token1 = token1.id;
  swap.amount0 = amount0;
  swap.amount1 = amount1;
  swap.amountUsd = volumeUsd;
  swap.token0Price = pool.token0Price;
  swap.token1Price = pool.token1Price;
  swap.token0PriceUsd = token0.derivedUsd;
  swap.token1PriceUsd = token1.derivedUsd;
  swap.sqrtPriceX96 = event.params.sqrtPriceX96;
  swap.tick = BigInt.fromI32(event.params.tick);
  swap.save();

  finalizePriceUpdate(pool as Pool, token0, token1, abs0, abs1, volumeUsd, event.block, true);
}
