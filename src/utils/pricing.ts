import { Address, BigDecimal, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { ERC20 } from "../../generated/FactoryV2/ERC20";
import { Pool, Token } from "../../generated/schema";
import { ONE_BD, ZERO_BD } from "./constants";
import { absBD, safeDiv, toDecimal } from "./math";
import { setTokenUsd } from "./token";
import { updatePoolCandles, updateTokenCandles } from "./candles";

const MIN_STABLE_RESERVE = BigDecimal.fromString("1");

/** Returns [token0Usd, token1Usd] from V2-style reserves. */
export function deriveUsdFromReserves(
  token0: Token,
  token1: Token,
  reserve0: BigDecimal,
  reserve1: BigDecimal,
): BigDecimal[] {
  if (token0.isStable && token1.isStable) return [ONE_BD, ONE_BD];
  if (token0.isStable) {
    const t1 =
      reserve1.gt(ZERO_BD) && reserve0.ge(MIN_STABLE_RESERVE)
        ? safeDiv(reserve0, reserve1)
        : token1.derivedUsd;
    return [ONE_BD, t1];
  }
  if (token1.isStable) {
    const t0 =
      reserve0.gt(ZERO_BD) && reserve1.ge(MIN_STABLE_RESERVE)
        ? safeDiv(reserve1, reserve0)
        : token0.derivedUsd;
    return [t0, ONE_BD];
  }
  return [token0.derivedUsd, token1.derivedUsd];
}

/** Returns [token0Usd, token1Usd] from V3/V4 relative prices. */
export function deriveUsdFromSqrtPrices(
  token0: Token,
  token1: Token,
  token0Price: BigDecimal,
  token1Price: BigDecimal,
): BigDecimal[] {
  if (token0.isStable && token1.isStable) return [ONE_BD, ONE_BD];
  if (token0.isStable) {
    return [ONE_BD, token1Price.gt(ZERO_BD) ? token1Price : token1.derivedUsd];
  }
  if (token1.isStable) {
    return [token0Price.gt(ZERO_BD) ? token0Price : token0.derivedUsd, ONE_BD];
  }
  if (token0.derivedUsd.gt(ZERO_BD) && token0Price.gt(ZERO_BD)) {
    return [token0.derivedUsd, token0.derivedUsd.times(token0Price)];
  }
  if (token1.derivedUsd.gt(ZERO_BD) && token1Price.gt(ZERO_BD)) {
    return [token1.derivedUsd.times(token1Price), token1.derivedUsd];
  }
  return [token0.derivedUsd, token1.derivedUsd];
}

export function swapVolumeUsd(
  token0: Token,
  token1: Token,
  amount0: BigDecimal,
  amount1: BigDecimal,
): BigDecimal {
  const a0 = absBD(amount0);
  const a1 = absBD(amount1);
  if (token0.isStable && token1.isStable) {
    return a0.plus(a1).div(BigDecimal.fromString("2"));
  }
  if (token0.isStable) return a0;
  if (token1.isStable) return a1;
  const u0 = a0.times(token0.derivedUsd);
  const u1 = a1.times(token1.derivedUsd);
  if (u0.equals(ZERO_BD)) return u1;
  if (u1.equals(ZERO_BD)) return u0;
  return u0.plus(u1).div(BigDecimal.fromString("2"));
}

export function readErc20Balance(token: Address, holder: Address): BigInt {
  const c = ERC20.bind(token);
  const call = c.try_balanceOf(holder);
  if (call.reverted) return BigInt.zero();
  return call.value;
}

export function applyDerivedUsd(
  token0: Token,
  token1: Token,
  usd: BigDecimal[],
  timestamp: BigInt,
): void {
  if (usd[0].gt(ZERO_BD)) setTokenUsd(token0, usd[0], timestamp);
  if (usd[1].gt(ZERO_BD)) setTokenUsd(token1, usd[1], timestamp);
}

export function finalizePriceUpdate(
  pool: Pool,
  token0: Token,
  token1: Token,
  amount0: BigDecimal,
  amount1: BigDecimal,
  volumeUsd: BigDecimal,
  block: ethereum.Block,
  writeTokenPrice: boolean,
): void {
  pool.token0PriceUsd = token0.derivedUsd;
  pool.token1PriceUsd = token1.derivedUsd;
  pool.tvlUsd = pool.reserve0.times(token0.derivedUsd).plus(pool.reserve1.times(token1.derivedUsd));
  pool.updatedAtTimestamp = block.timestamp;
  pool.updatedAtBlock = block.number;
  pool.save();

  if (writeTokenPrice) {
    if (!token0.isStable && token0.derivedUsd.gt(ZERO_BD)) {
      updateTokenCandles(token0, token0.derivedUsd, absBD(amount0), volumeUsd, block);
    }
    if (!token1.isStable && token1.derivedUsd.gt(ZERO_BD)) {
      updateTokenCandles(token1, token1.derivedUsd, absBD(amount1), volumeUsd, block);
    }
  }

  updatePoolCandles(pool, absBD(amount0), absBD(amount1), volumeUsd, block);
}

export function toTokenAmount(raw: BigInt, token: Token): BigDecimal {
  return toDecimal(raw, token.decimals);
}
