import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import { ONE_BD, ZERO_BD, ZERO_BI } from "./constants";

const TEN = BigInt.fromI32(10);

export function exponentToBigDecimal(decimals: i32): BigDecimal {
  let result = ONE_BD;
  const ten = BigDecimal.fromString("10");
  for (let i = 0; i < decimals; i++) {
    result = result.times(ten);
  }
  return result;
}

export function toDecimal(value: BigInt, decimals: i32): BigDecimal {
  if (decimals == 0) return value.toBigDecimal();
  return value.toBigDecimal().div(exponentToBigDecimal(decimals));
}

export function absBD(value: BigDecimal): BigDecimal {
  return value.lt(ZERO_BD) ? value.times(BigDecimal.fromString("-1")) : value;
}

export function absBI(value: BigInt): BigInt {
  return value.lt(ZERO_BI) ? value.times(BigInt.fromI32(-1)) : value;
}

export function safeDiv(a: BigDecimal, b: BigDecimal): BigDecimal {
  if (b.equals(ZERO_BD)) return ZERO_BD;
  return a.div(b);
}

/**
 * Convert Uniswap V3/V4 sqrtPriceX96 into token0Price (token1 per token0)
 * and token1Price (token0 per token1), adjusted for decimals.
 */
export function sqrtPriceX96ToTokenPrices(
  sqrtPriceX96: BigInt,
  token0Decimals: i32,
  token1Decimals: i32,
): BigDecimal[] {
  const Q96 = BigDecimal.fromString("79228162514264337593543950336");
  const sqrtRatio = sqrtPriceX96.toBigDecimal().div(Q96);
  const rawRatio = sqrtRatio.times(sqrtRatio);

  let decimalAdjust: BigDecimal;
  if (token0Decimals >= token1Decimals) {
    decimalAdjust = exponentToBigDecimal(token0Decimals - token1Decimals);
  } else {
    decimalAdjust = safeDiv(ONE_BD, exponentToBigDecimal(token1Decimals - token0Decimals));
  }

  const token0Price = rawRatio.gt(ZERO_BD) ? rawRatio.times(decimalAdjust) : ZERO_BD;
  const token1Price = token0Price.gt(ZERO_BD) ? safeDiv(ONE_BD, token0Price) : ZERO_BD;
  return [token0Price, token1Price];
}
