import { Address, BigDecimal, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { ERC20 } from "../../generated/FactoryV2/ERC20";
import { Bundle, Token } from "../../generated/schema";
import {
  BUNDLE_ID,
  ONE_BD,
  USDC_INTERFACE,
  WUSDC,
  ZERO_ADDRESS,
  ZERO_BD,
  ZERO_BI,
  isStable,
  normalize,
} from "./constants";

export function getOrCreateBundle(): Bundle {
  let bundle = Bundle.load(BUNDLE_ID);
  if (bundle == null) {
    bundle = new Bundle(BUNDLE_ID);
    bundle.usdPrice = ONE_BD;
    bundle.save();
  }
  return bundle as Bundle;
}

function defaultSymbol(id: string): string {
  if (isStable(id)) return "USDC";
  return "UNKNOWN";
}

function defaultName(id: string): string {
  if (id == ZERO_ADDRESS) return "Native USDC";
  if (id == USDC_INTERFACE) return "USDC Interface";
  if (id == WUSDC) return "Wrapped USDC";
  return "Unknown Token";
}

function defaultDecimals(id: string): i32 {
  if (id == USDC_INTERFACE) return 6;
  return 18;
}

export function getOrCreateToken(address: Address, block: ethereum.Block): Token {
  const id = normalize(address);
  let token = Token.load(id);
  if (token != null) return token as Token;

  token = new Token(id);
  token.address = address;
  token.symbol = defaultSymbol(id);
  token.name = defaultName(id);
  token.decimals = defaultDecimals(id);
  token.isStable = isStable(id);
  token.isRwaSynth = false;
  token.derivedUsd = token.isStable ? ONE_BD : ZERO_BD;
  token.lastPriceUpdate = block.timestamp;
  token.volumeUsd = ZERO_BD;
  token.txCount = ZERO_BI;
  token.poolCount = ZERO_BI;
  token.createdAtTimestamp = block.timestamp;
  token.createdAtBlock = block.number;

  if (id != ZERO_ADDRESS && id != USDC_INTERFACE) {
    const c = ERC20.bind(address);
    const sym = c.try_symbol();
    if (!sym.reverted && sym.value.length > 0) token.symbol = sym.value;
    const nm = c.try_name();
    if (!nm.reverted && nm.value.length > 0) token.name = nm.value;
    const dec = c.try_decimals();
    if (!dec.reverted) token.decimals = dec.value;
  }

  if (id == WUSDC || id == ZERO_ADDRESS) {
    token.decimals = 18;
    token.symbol = "USDC";
    token.derivedUsd = ONE_BD;
  }
  if (id == USDC_INTERFACE) {
    token.decimals = 6;
    token.symbol = "USDC";
    token.derivedUsd = ONE_BD;
  }

  token.save();
  getOrCreateBundle();
  return token as Token;
}

export function setTokenUsd(token: Token, priceUsd: BigDecimal, timestamp: BigInt): void {
  if (token.isStable) {
    token.derivedUsd = ONE_BD;
  } else if (priceUsd.gt(ZERO_BD)) {
    token.derivedUsd = priceUsd;
  }
  token.lastPriceUpdate = timestamp;
  token.save();
}
