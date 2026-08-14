import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";

export const CHAIN_ID = 5042002;
export const BUNDLE_ID = "1";

export const ZERO_BI = BigInt.fromI32(0);
export const ONE_BI = BigInt.fromI32(1);
export const ZERO_BD = BigDecimal.fromString("0");
export const ONE_BD = BigDecimal.fromString("1");

export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86400;

// Arc Testnet stables / native
export const WUSDC = "0xde5db9049a8dd344dc1b7bbb098f9da60930a6da";
export const USDC_INTERFACE = "0x3600000000000000000000000000000000000000";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// AchSwap deployments (user-provided / arc-testnet)
export const V2_FACTORY = "0x7cc023c7184810b84657d55c1943ebff8603b72b";
export const V3_FACTORY = "0x65fa500712d451b521ba114a4d3962565969f06a";
export const V4_POOL_MANAGER = "0x016e91490d58dbea85ff91f4b941a9f39057bebb";
export const RWA_ORACLE = "0x76398cfa526d4a76eaec0c4709d6b7c966e5abdb";
export const RWA_VAULT = "0xb8dc1f767167b567227326d8849175a188a0e78c";

export function normalize(address: Address): string {
  return address.toHexString().toLowerCase();
}

export function isStable(addr: string): boolean {
  const a = addr.toLowerCase();
  return a == WUSDC || a == USDC_INTERFACE || a == ZERO_ADDRESS;
}
