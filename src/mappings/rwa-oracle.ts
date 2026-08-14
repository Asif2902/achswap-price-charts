import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  PairActiveSet,
  PairCreated,
  PairFrozenSet,
  PriceSubmitted,
  RWAOracle,
} from "../../generated/RWAOracle/RWAOracle";
import { RwaPair, RwaPricePoint, Token } from "../../generated/schema";
import { ONE_BI, ZERO_BD, ZERO_BI } from "../utils/constants";
import { toDecimal } from "../utils/math";
import { updateRwaCandles, updateTokenCandles } from "../utils/candles";
import { getOrCreateToken, setTokenUsd } from "../utils/token";

const PRICE_DECIMALS = 18;

function ensurePair(
  pairId: BigInt,
  name: string,
  symbol: string,
  category: i32,
  synth: Address,
  maxStaleness: BigInt,
  maxDeviation: BigInt,
  blockNumber: BigInt,
  timestamp: BigInt,
): RwaPair {
  const id = pairId.toString();
  let pair = RwaPair.load(id);
  if (pair != null) return pair as RwaPair;

  pair = new RwaPair(id);
  pair.pairId = pairId;
  pair.name = name;
  pair.symbol = symbol;
  pair.category = category;
  pair.synth = synth;
  pair.synthToken = null;
  pair.active = true;
  pair.frozen = false;
  pair.priceUsd = ZERO_BD;
  pair.lastPriceTimestamp = ZERO_BI;
  pair.maxStaleness = maxStaleness;
  pair.maxDeviation = maxDeviation;
  pair.updateCount = ZERO_BI;
  pair.createdAtTimestamp = timestamp;
  pair.createdAtBlock = blockNumber;
  pair.updatedAtTimestamp = timestamp;
  pair.updatedAtBlock = blockNumber;
  pair.save();
  return pair as RwaPair;
}

function linkSynth(
  pair: RwaPair,
  synth: Address,
  symbol: string,
  name: string,
  block: ethereum.Block,
): void {
  if (synth.equals(Address.zero())) return;
  const token = getOrCreateToken(synth, block);
  token.isRwaSynth = true;
  if (symbol.length > 0) token.symbol = symbol;
  if (name.length > 0) token.name = name;
  token.save();
  pair.synth = synth;
  pair.synthToken = token.id;
}

export function handleRwaPairCreated(event: PairCreated): void {
  const pair = ensurePair(
    event.params.pairId,
    event.params.name,
    event.params.symbol,
    event.params.category,
    event.params.synth,
    event.params.maxStaleness,
    event.params.maxDeviation,
    event.block.number,
    event.block.timestamp,
  );

  linkSynth(pair, event.params.synth, event.params.symbol, event.params.name, event.block);
  pair.name = event.params.name;
  pair.symbol = event.params.symbol;
  pair.category = event.params.category;
  pair.maxStaleness = event.params.maxStaleness;
  pair.maxDeviation = event.params.maxDeviation;
  pair.lastPriceTimestamp = event.params.timestamp;
  pair.updatedAtTimestamp = event.block.timestamp;
  pair.updatedAtBlock = event.block.number;
  pair.save();
}

export function handlePriceSubmitted(event: PriceSubmitted): void {
  let pair = RwaPair.load(event.params.pairId.toString());
  if (pair == null) {
    const oracle = RWAOracle.bind(event.address);
    const call = oracle.try_getPair(event.params.pairId);
    if (!call.reverted) {
      const p = call.value;
      pair = ensurePair(
        p.pairId,
        p.name,
        p.symbol,
        p.category,
        p.synth,
        p.maxStaleness,
        p.maxDeviation,
        event.block.number,
        event.block.timestamp,
      );
      linkSynth(pair as RwaPair, p.synth, p.symbol, p.name, event.block);
    } else {
      pair = ensurePair(
        event.params.pairId,
        event.params.symbol,
        event.params.symbol,
        0,
        Address.zero(),
        ZERO_BI,
        ZERO_BI,
        event.block.number,
        event.block.timestamp,
      );
    }
  }

  const priceUsd = toDecimal(event.params.price, PRICE_DECIMALS);
  const prevUsd = toDecimal(event.params.previousPrice, PRICE_DECIMALS);

  pair.priceUsd = priceUsd;
  pair.lastPriceTimestamp = event.params.timestamp;
  pair.updateCount = pair.updateCount.plus(ONE_BI);
  pair.updatedAtTimestamp = event.block.timestamp;
  pair.updatedAtBlock = event.block.number;
  pair.save();

  const point = new RwaPricePoint(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString(),
  );
  point.pair = pair.id;
  point.symbol = event.params.symbol;
  point.priceUsd = priceUsd;
  point.previousPriceUsd = prevUsd;
  point.delta = event.params.delta;
  point.submitter = event.params.submitter;
  point.timestamp = event.params.timestamp;
  point.blockNumber = event.block.number;
  point.txHash = event.transaction.hash;
  point.save();

  updateRwaCandles(pair as RwaPair, priceUsd, event.block);

  // Mirror oracle price onto the synth Token so charts can use TokenHourData / TokenDayData
  if (pair.synthToken != null) {
    const token = Token.load(pair.synthToken!);
    if (token != null) {
      const t = token as Token;
      t.isRwaSynth = true;
      setTokenUsd(t, priceUsd, event.block.timestamp);
      updateTokenCandles(t, priceUsd, ZERO_BD, ZERO_BD, event.block);
    }
  }
}

export function handlePairActiveSet(event: PairActiveSet): void {
  const pair = RwaPair.load(event.params.pairId.toString());
  if (pair == null) return;
  pair.active = event.params.active;
  pair.lastPriceTimestamp = event.params.timestamp;
  pair.updatedAtTimestamp = event.block.timestamp;
  pair.updatedAtBlock = event.block.number;
  pair.save();
}

export function handlePairFrozenSet(event: PairFrozenSet): void {
  const pair = RwaPair.load(event.params.pairId.toString());
  if (pair == null) return;
  pair.frozen = event.params.frozen;
  pair.lastPriceTimestamp = event.params.timestamp;
  pair.updatedAtTimestamp = event.block.timestamp;
  pair.updatedAtBlock = event.block.number;
  pair.save();
}
