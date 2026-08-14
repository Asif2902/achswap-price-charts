import { Address, BigDecimal, log } from "@graphprotocol/graph-ts";
import { Swap, Sync } from "../../generated/templates/PairV2/PairV2";
import { Pool, Swap as SwapEntity, Token } from "../../generated/schema";
import { ONE_BI, ZERO_BD, normalize } from "../utils/constants";
import { absBD, safeDiv } from "../utils/math";
import {
  applyDerivedUsd,
  deriveUsdFromReserves,
  finalizePriceUpdate,
  swapVolumeUsd,
  toTokenAmount,
} from "../utils/pricing";

function loadPool(address: Address): Pool | null {
  return Pool.load(normalize(address));
}

export function handleSync(event: Sync): void {
  const pool = loadPool(event.address);
  if (pool == null) return;

  const token0 = Token.load(pool.token0);
  const token1 = Token.load(pool.token1);
  if (token0 == null || token1 == null) return;

  pool.reserve0 = toTokenAmount(event.params.reserve0, token0 as Token);
  pool.reserve1 = toTokenAmount(event.params.reserve1, token1 as Token);

  pool.token0Price = safeDiv(pool.reserve1, pool.reserve0);
  pool.token1Price = safeDiv(pool.reserve0, pool.reserve1);

  const usd = deriveUsdFromReserves(
    token0 as Token,
    token1 as Token,
    pool.reserve0,
    pool.reserve1,
  );
  applyDerivedUsd(token0 as Token, token1 as Token, usd, event.block.timestamp);

  finalizePriceUpdate(
    pool as Pool,
    token0 as Token,
    token1 as Token,
    ZERO_BD,
    ZERO_BD,
    ZERO_BD,
    event.block,
    true,
  );
}

export function handleSwapV2(event: Swap): void {
  const pool = loadPool(event.address);
  if (pool == null) {
    log.warning("V2 swap missing pool {}", [event.address.toHexString()]);
    return;
  }

  const token0 = Token.load(pool.token0) as Token;
  const token1 = Token.load(pool.token1) as Token;

  const amount0In = toTokenAmount(event.params.amount0In, token0);
  const amount1In = toTokenAmount(event.params.amount1In, token1);
  const amount0Out = toTokenAmount(event.params.amount0Out, token0);
  const amount1Out = toTokenAmount(event.params.amount1Out, token1);

  const amount0 = amount0In.gt(amount0Out)
    ? amount0In.minus(amount0Out)
    : amount0Out.minus(amount0In);
  const amount1 = amount1In.gt(amount1Out)
    ? amount1In.minus(amount1Out)
    : amount1Out.minus(amount1In);

  // Prefer relative price from swap amounts when possible
  if (amount0.gt(ZERO_BD) && amount1.gt(ZERO_BD)) {
    pool.token0Price = safeDiv(amount1, amount0);
    pool.token1Price = safeDiv(amount0, amount1);
  } else if (pool.reserve0.gt(ZERO_BD) && pool.reserve1.gt(ZERO_BD)) {
    pool.token0Price = safeDiv(pool.reserve1, pool.reserve0);
    pool.token1Price = safeDiv(pool.reserve0, pool.reserve1);
  }

  const usd = deriveUsdFromReserves(token0, token1, pool.reserve0, pool.reserve1);
  applyDerivedUsd(token0, token1, usd, event.block.timestamp);

  const volumeUsd = swapVolumeUsd(token0, token1, amount0, amount1);

  pool.volumeToken0 = pool.volumeToken0.plus(amount0);
  pool.volumeToken1 = pool.volumeToken1.plus(amount1);
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
  swap.version = "V2";
  swap.sender = event.params.sender;
  swap.recipient = event.params.to;
  swap.token0 = token0.id;
  swap.token1 = token1.id;
  // signed: positive = into pool, negative = out of pool (V2 convention simplified)
  swap.amount0 = amount0In.gt(amount0Out)
    ? amount0In.minus(amount0Out)
    : amount0Out.minus(amount0In).times(BigDecimal.fromString("-1"));
  swap.amount1 = amount1In.gt(amount1Out)
    ? amount1In.minus(amount1Out)
    : amount1Out.minus(amount1In).times(BigDecimal.fromString("-1"));
  swap.amountUsd = volumeUsd;
  swap.token0Price = pool.token0Price;
  swap.token1Price = pool.token1Price;
  swap.token0PriceUsd = token0.derivedUsd;
  swap.token1PriceUsd = token1.derivedUsd;
  swap.sqrtPriceX96 = null;
  swap.tick = null;
  swap.save();

  finalizePriceUpdate(pool, token0, token1, amount0, amount1, volumeUsd, event.block, true);
}
