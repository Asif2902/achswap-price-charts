import { BigInt } from "@graphprotocol/graph-ts";
import { PairCreated } from "../../generated/FactoryV2/FactoryV2";
import { Pool } from "../../generated/schema";
import { PairV2 as PairTemplate } from "../../generated/templates";
import { ONE_BI, ZERO_BD, ZERO_BI, normalize } from "../utils/constants";
import { getOrCreateToken } from "../utils/token";

export function handlePairCreated(event: PairCreated): void {
  const token0 = getOrCreateToken(event.params.token0, event.block);
  const token1 = getOrCreateToken(event.params.token1, event.block);

  const id = normalize(event.params.pair);
  let pool = Pool.load(id);
  if (pool == null) {
    pool = new Pool(id);
    pool.address = event.params.pair;
    pool.version = "V2";
    pool.token0 = token0.id;
    pool.token1 = token1.id;
    pool.feeTier = BigInt.fromI32(3000);
    pool.token0Price = ZERO_BD;
    pool.token1Price = ZERO_BD;
    pool.token0PriceUsd = ZERO_BD;
    pool.token1PriceUsd = ZERO_BD;
    pool.reserve0 = ZERO_BD;
    pool.reserve1 = ZERO_BD;
    pool.liquidity = ZERO_BI;
    pool.sqrtPriceX96 = ZERO_BI;
    pool.tick = ZERO_BI;
    pool.tvlUsd = ZERO_BD;
    pool.volumeToken0 = ZERO_BD;
    pool.volumeToken1 = ZERO_BD;
    pool.volumeUsd = ZERO_BD;
    pool.txCount = ZERO_BI;
    pool.swapCount = ZERO_BI;
    pool.hooks = null;
    pool.tickSpacing = null;
    pool.createdAtTimestamp = event.block.timestamp;
    pool.createdAtBlock = event.block.number;
    pool.updatedAtTimestamp = event.block.timestamp;
    pool.updatedAtBlock = event.block.number;
    pool.save();

    token0.poolCount = token0.poolCount.plus(ONE_BI);
    token1.poolCount = token1.poolCount.plus(ONE_BI);
    token0.save();
    token1.save();
  }

  PairTemplate.create(event.params.pair);
}
