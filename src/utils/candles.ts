import { BigDecimal, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  Pool,
  PoolDayData,
  PoolHourData,
  RwaPair,
  RwaPairDayData,
  RwaPairHourData,
  Token,
  TokenDayData,
  TokenHourData,
} from "../../generated/schema";
import { ONE_BI, SECONDS_PER_DAY, SECONDS_PER_HOUR, ZERO_BD, ZERO_BI } from "./constants";

export function hourStart(timestamp: BigInt): i32 {
  return (timestamp.toI32() / SECONDS_PER_HOUR) * SECONDS_PER_HOUR;
}

export function dayStart(timestamp: BigInt): i32 {
  return (timestamp.toI32() / SECONDS_PER_DAY) * SECONDS_PER_DAY;
}

function updateOhlc(
  open: BigDecimal,
  high: BigDecimal,
  low: BigDecimal,
  close: BigDecimal,
  price: BigDecimal,
  isNew: boolean,
): BigDecimal[] {
  if (isNew || open.equals(ZERO_BD)) {
    return [price, price, price, price];
  }
  let h = high;
  let l = low;
  if (price.gt(h)) h = price;
  if (price.lt(l) || l.equals(ZERO_BD)) l = price;
  return [open, h, l, price];
}

/** Update token hour + day OHLC candles from a USD price print. */
export function updateTokenCandles(
  token: Token,
  priceUsd: BigDecimal,
  volumeToken: BigDecimal,
  volumeUsd: BigDecimal,
  block: ethereum.Block,
): void {
  if (priceUsd.le(ZERO_BD)) return;

  const hour = hourStart(block.timestamp);
  const hourId = token.id + "-" + hour.toString();
  let th = TokenHourData.load(hourId);
  let isNewHour = false;
  if (th == null) {
    th = new TokenHourData(hourId);
    th.token = token.id;
    th.periodStartUnix = hour;
    th.open = ZERO_BD;
    th.high = ZERO_BD;
    th.low = ZERO_BD;
    th.close = ZERO_BD;
    th.priceUsd = ZERO_BD;
    th.volume = ZERO_BD;
    th.volumeUsd = ZERO_BD;
    th.txCount = ZERO_BI;
    isNewHour = true;
  }
  const hOhlc = updateOhlc(th.open, th.high, th.low, th.close, priceUsd, isNewHour);
  th.open = hOhlc[0];
  th.high = hOhlc[1];
  th.low = hOhlc[2];
  th.close = hOhlc[3];
  th.priceUsd = priceUsd;
  th.volume = th.volume.plus(volumeToken);
  th.volumeUsd = th.volumeUsd.plus(volumeUsd);
  th.txCount = th.txCount.plus(ONE_BI);
  th.save();

  const day = dayStart(block.timestamp);
  const dayId = token.id + "-" + day.toString();
  let td = TokenDayData.load(dayId);
  let isNewDay = false;
  if (td == null) {
    td = new TokenDayData(dayId);
    td.token = token.id;
    td.date = day;
    td.open = ZERO_BD;
    td.high = ZERO_BD;
    td.low = ZERO_BD;
    td.close = ZERO_BD;
    td.priceUsd = ZERO_BD;
    td.volume = ZERO_BD;
    td.volumeUsd = ZERO_BD;
    td.txCount = ZERO_BI;
    isNewDay = true;
  }
  const dOhlc = updateOhlc(td.open, td.high, td.low, td.close, priceUsd, isNewDay);
  td.open = dOhlc[0];
  td.high = dOhlc[1];
  td.low = dOhlc[2];
  td.close = dOhlc[3];
  td.priceUsd = priceUsd;
  td.volume = td.volume.plus(volumeToken);
  td.volumeUsd = td.volumeUsd.plus(volumeUsd);
  td.txCount = td.txCount.plus(ONE_BI);
  td.save();
}

/** Update pool hour + day OHLC on token0Price (token1 per token0). */
export function updatePoolCandles(
  pool: Pool,
  amount0: BigDecimal,
  amount1: BigDecimal,
  volumeUsd: BigDecimal,
  block: ethereum.Block,
): void {
  const price = pool.token0Price;
  if (price.le(ZERO_BD)) return;

  const hour = hourStart(block.timestamp);
  const hourId = pool.id + "-" + hour.toString();
  let ph = PoolHourData.load(hourId);
  let isNewHour = false;
  if (ph == null) {
    ph = new PoolHourData(hourId);
    ph.pool = pool.id;
    ph.periodStartUnix = hour;
    ph.open = ZERO_BD;
    ph.high = ZERO_BD;
    ph.low = ZERO_BD;
    ph.close = ZERO_BD;
    ph.token0Price = ZERO_BD;
    ph.token1Price = ZERO_BD;
    ph.token0PriceUsd = ZERO_BD;
    ph.token1PriceUsd = ZERO_BD;
    ph.tvlUsd = ZERO_BD;
    ph.volumeToken0 = ZERO_BD;
    ph.volumeToken1 = ZERO_BD;
    ph.volumeUsd = ZERO_BD;
    ph.txCount = ZERO_BI;
    isNewHour = true;
  }
  const hOhlc = updateOhlc(ph.open, ph.high, ph.low, ph.close, price, isNewHour);
  ph.open = hOhlc[0];
  ph.high = hOhlc[1];
  ph.low = hOhlc[2];
  ph.close = hOhlc[3];
  ph.token0Price = pool.token0Price;
  ph.token1Price = pool.token1Price;
  ph.token0PriceUsd = pool.token0PriceUsd;
  ph.token1PriceUsd = pool.token1PriceUsd;
  ph.tvlUsd = pool.tvlUsd;
  ph.volumeToken0 = ph.volumeToken0.plus(amount0);
  ph.volumeToken1 = ph.volumeToken1.plus(amount1);
  ph.volumeUsd = ph.volumeUsd.plus(volumeUsd);
  ph.txCount = ph.txCount.plus(ONE_BI);
  ph.save();

  const day = dayStart(block.timestamp);
  const dayId = pool.id + "-" + day.toString();
  let pd = PoolDayData.load(dayId);
  let isNewDay = false;
  if (pd == null) {
    pd = new PoolDayData(dayId);
    pd.pool = pool.id;
    pd.date = day;
    pd.open = ZERO_BD;
    pd.high = ZERO_BD;
    pd.low = ZERO_BD;
    pd.close = ZERO_BD;
    pd.token0Price = ZERO_BD;
    pd.token1Price = ZERO_BD;
    pd.token0PriceUsd = ZERO_BD;
    pd.token1PriceUsd = ZERO_BD;
    pd.tvlUsd = ZERO_BD;
    pd.volumeToken0 = ZERO_BD;
    pd.volumeToken1 = ZERO_BD;
    pd.volumeUsd = ZERO_BD;
    pd.txCount = ZERO_BI;
    isNewDay = true;
  }
  const dOhlc = updateOhlc(pd.open, pd.high, pd.low, pd.close, price, isNewDay);
  pd.open = dOhlc[0];
  pd.high = dOhlc[1];
  pd.low = dOhlc[2];
  pd.close = dOhlc[3];
  pd.token0Price = pool.token0Price;
  pd.token1Price = pool.token1Price;
  pd.token0PriceUsd = pool.token0PriceUsd;
  pd.token1PriceUsd = pool.token1PriceUsd;
  pd.tvlUsd = pool.tvlUsd;
  pd.volumeToken0 = pd.volumeToken0.plus(amount0);
  pd.volumeToken1 = pd.volumeToken1.plus(amount1);
  pd.volumeUsd = pd.volumeUsd.plus(volumeUsd);
  pd.txCount = pd.txCount.plus(ONE_BI);
  pd.save();
}

export function updateRwaCandles(pair: RwaPair, priceUsd: BigDecimal, block: ethereum.Block): void {
  if (priceUsd.le(ZERO_BD)) return;

  const hour = hourStart(block.timestamp);
  const hourId = pair.id + "-h-" + hour.toString();
  let rh = RwaPairHourData.load(hourId);
  let isNewHour = false;
  if (rh == null) {
    rh = new RwaPairHourData(hourId);
    rh.pair = pair.id;
    rh.periodStartUnix = hour;
    rh.open = ZERO_BD;
    rh.high = ZERO_BD;
    rh.low = ZERO_BD;
    rh.close = ZERO_BD;
    rh.priceUsd = ZERO_BD;
    rh.updateCount = ZERO_BI;
    isNewHour = true;
  }
  const hOhlc = updateOhlc(rh.open, rh.high, rh.low, rh.close, priceUsd, isNewHour);
  rh.open = hOhlc[0];
  rh.high = hOhlc[1];
  rh.low = hOhlc[2];
  rh.close = hOhlc[3];
  rh.priceUsd = priceUsd;
  rh.updateCount = rh.updateCount.plus(ONE_BI);
  rh.save();

  const day = dayStart(block.timestamp);
  const dayId = pair.id + "-d-" + day.toString();
  let rd = RwaPairDayData.load(dayId);
  let isNewDay = false;
  if (rd == null) {
    rd = new RwaPairDayData(dayId);
    rd.pair = pair.id;
    rd.date = day;
    rd.open = ZERO_BD;
    rd.high = ZERO_BD;
    rd.low = ZERO_BD;
    rd.close = ZERO_BD;
    rd.priceUsd = ZERO_BD;
    rd.updateCount = ZERO_BI;
    isNewDay = true;
  }
  const dOhlc = updateOhlc(rd.open, rd.high, rd.low, rd.close, priceUsd, isNewDay);
  rd.open = dOhlc[0];
  rd.high = dOhlc[1];
  rd.low = dOhlc[2];
  rd.close = dOhlc[3];
  rd.priceUsd = priceUsd;
  rd.updateCount = rd.updateCount.plus(ONE_BI);
  rd.save();
}
