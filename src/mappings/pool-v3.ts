import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import { Initialize, Swap } from "../../generated/templates/PoolV3/PoolV3";
import { ERC20 } from "../../generated/FactoryV2/ERC20";
import { Pool, Swap as SwapEntity, Token } from "../../generated/schema";
import { ONE_BI, ZERO_BD, normalize } from "../utils/constants";
import { absBD, sqrtPriceX96ToTokenPrices, toDecimal } from "../utils/math";
import {
  applyDerivedUsd,
  deriveUsdFromSqrtPrices,
  finalizePriceUpdate,
  swapVolumeUsd,
} from "../utils/pricing";

function loadPool(address: Address): Pool | null {
  return Pool.load(normalize(address));
}

function refreshReserves(pool: Pool, token0: Token, token1: Token): void {
  const holder = Address.fromString(pool.id);
  const c0 = ERC20.bind(Address.fromString(token0.id));
  const c1 = ERC20.bind(Address.fromString(token1.id));
  const b0 = c0.try_balanceOf(holder);
  const b1 = c1.try_balanceOf(holder);
  if (!b0.reverted) pool.reserve0 = toDecimal(b0.value, token0.decimals);
  if (!b1.reverted) pool.reserve1 = toDecimal(b1.value, token1.decimals);
}

export function handleInitialize(event: Initialize): void {
  const pool = loadPool(event.address);
  if (pool == null) return;

  const token0 = Token.load(pool.token0) as Token;
  const token1 = Token.load(pool.token1) as Token;

  pool.sqrtPriceX96 = event.params.sqrtPriceX96;
  pool.tick = BigInt.fromI32(event.params.tick);

  const prices = sqrtPriceX96ToTokenPrices(
    event.params.sqrtPriceX96,
    token0.decimals,
    token1.decimals,
  );
  pool.token0Price = prices[0];
  pool.token1Price = prices[1];

  const usd = deriveUsdFromSqrtPrices(token0, token1, prices[0], prices[1]);
  applyDerivedUsd(token0, token1, usd, event.block.timestamp);
  refreshReserves(pool as Pool, token0, token1);

  finalizePriceUpdate(
    pool as Pool,
    token0,
    token1,
    ZERO_BD,
    ZERO_BD,
    ZERO_BD,
    event.block,
    true,
  );
}

export function handleSwapV3(event: Swap): void {
  const pool = loadPool(event.address);
  if (pool == null) {
    log.warning("V3 swap missing pool {}", [event.address.toHexString()]);
    return;
  }

  const token0 = Token.load(pool.token0) as Token;
  const token1 = Token.load(pool.token1) as Token;

  const amount0 = toDecimal(event.params.amount0, token0.decimals);
  const amount1 = toDecimal(event.params.amount1, token1.decimals);
  const abs0 = absBD(amount0);
  const abs1 = absBD(amount1);

  pool.sqrtPriceX96 = event.params.sqrtPriceX96;
  pool.tick = BigInt.fromI32(event.params.tick);
  pool.liquidity = event.params.liquidity;

  const prices = sqrtPriceX96ToTokenPrices(
    event.params.sqrtPriceX96,
    token0.decimals,
    token1.decimals,
  );
  pool.token0Price = prices[0];
  pool.token1Price = prices[1];

  refreshReserves(pool as Pool, token0, token1);

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
  swap.version = "V3";
  swap.sender = event.params.sender;
  swap.recipient = event.params.recipient;
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
