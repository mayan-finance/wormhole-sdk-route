import {
  ChainName as MayanChainName,
  SolanaTransactionSigner,
  Token as MayanToken,
} from "@mayanfinance/swap-sdk";
import { ethers } from "ethers";
import { Transaction } from "@solana/web3.js";
import {
  Chain,
  TokenId,
  isSignOnlySigner,
  Signer,
  TransactionId,
  toNative,
  nativeTokenId,
} from "@wormhole-foundation/connect-sdk";
import { isEvmNativeSigner } from "@wormhole-foundation/connect-sdk-evm";
import { SolanaUnsignedTransaction } from "@wormhole-foundation/connect-sdk-solana";
import tokenCache from "./tokens.json";
import axios from "axios";

export const NATIVE_CONTRACT_ADDRESS =
  "0x0000000000000000000000000000000000000000";

const chainNameMap = {
  Solana: "solana",
  Ethereum: "ethereum",
  Bsc: "bsc",
  Polygon: "polygon",
  Avalanche: "avalanche",
  Arbitrum: "arbitrum",
  Aptos: "aptos",
} as Record<Chain, MayanChainName>;

export function toMayanChainName(chain: Chain): MayanChainName {
  if (!chainNameMap[chain]) throw new Error(`Chain ${chain} not supported`);
  return chainNameMap[chain] as MayanChainName;
}

export function supportedChains(): Chain[] {
  return Object.keys(chainNameMap) as Chain[];
}

let tokenListCache = {} as Record<Chain, TokenId[]>;

export async function fetchTokensForChain(chain: Chain): Promise<TokenId[]> {
  if (chain in tokenListCache) {
    return tokenListCache[chain] as TokenId[];
  }

  const mayanTokens: MayanToken[] = tokenCache[toMayanChainName(chain)];

  const whTokens: TokenId[] = mayanTokens.map((mt: MayanToken): TokenId => {
    if (mt.contract === NATIVE_CONTRACT_ADDRESS) {
      return nativeTokenId(chain);
    } else {
      return {
        chain,
        address: toNative(chain, mt.contract),
      } as TokenId;
    }
  });

  tokenListCache[chain] = whTokens;
  return whTokens;
}

export function mayanSolanaSigner(signer: Signer): SolanaTransactionSigner {
  if (!isSignOnlySigner(signer))
    throw new Error("Signer must be a SignOnlySigner");

  return async (tx: Transaction) => {
    const ust: SolanaUnsignedTransaction<"Mainnet"> = {
      transaction: { transaction: tx },
      description: "Mayan.InitiateSwap",
      network: "Mainnet",
      chain: "Solana",
      parallelizable: false,
    };
    const signed = (await signer.sign([ust])) as Buffer[];
    return Transaction.from(signed[0]!);
  };
}

export function mayanEvmSigner(signer: Signer): ethers.Signer {
  if (isEvmNativeSigner(signer))
    return signer.unwrap() as unknown as ethers.Signer;

  throw new Error("Signer must be an EvmNativeSigner");
}

export enum MayanTransactionStatus {
  SETTLED_ON_SOLANA = "SETTLED_ON_SOLANA",
  REDEEMED_ON_EVM = "REDEEMED_ON_EVM",
  REFUNDED_ON_EVM = "REFUNDED_ON_EVM",
  REFUNDED_ON_SOLANA = "REFUNDED_ON_SOLANA",
}

export enum MayanTransactionGoal {
  // send from evm to solana
  Send = "SEND",
  // bridge to destination chain
  Bridge = "BRIDGE",
  // perform the swap
  Swap = "SWAP",
  // register for auction
  Register = "REGISTER",
  // settle on destination
  Settle = "SETTLE",
}

export interface TransactionStatus {
  id: string;
  trader: string;

  sourceChain: string;
  sourceTxHash: string;
  sourceTxBlockNo: number;
  status: MayanTransactionStatus;

  transferSequence: string;
  swapSequence: string;
  redeemSequence: string;
  refundSequence: string;
  fulfillSequence: string;

  deadline: string;

  swapChain: string;

  destChain: string;
  destAddress: string;

  fromTokenAddress: string;
  fromTokenChain: string;
  fromTokenSymbol: string;
  fromAmount: string;
  fromAmount64: any;

  toTokenAddress: string;
  toTokenChain: string;
  toTokenSymbol: string;

  stateAddr: string;
  stateNonce: string;

  toAmount: any;

  transferSignedVaa: string;
  swapSignedVaa: string;
  redeemSignedVaa: string;
  refundSignedVaa: string;
  fulfillSignedVaa: string;

  savedAt: string;
  initiatedAt: string;
  completedAt: string;
  insufficientFees: boolean;
  retries: number;

  swapRelayerFee: string;
  redeemRelayerFee: string;
  refundRelayerFee: string;
  bridgeFee: string;

  statusUpdatedAt: string;

  redeemTxHash: string;
  refundTxHash: string;
  fulfillTxHash: string;

  unwrapRedeem: boolean;
  unwrapRefund: boolean;

  auctionAddress: string;
  driverAddress: string;
  mayanAddress: string;
  referrerAddress: string;
  auctionStateAddr: any;

  auctionStateNonce: any;

  gasDrop: string;
  gasDrop64: any;

  payloadId: number;
  orderHash: string;

  minAmountOut: any;
  minAmountOut64: any;

  service: string;

  refundAmount: string;

  posAddress: string;

  unlockRecipient: any;

  fromTokenLogoUri: string;
  toTokenLogoUri: string;

  fromTokenScannerUrl: string;
  toTokenScannerUrl: string;

  txs: Tx[];
}

export interface Tx {
  txHash: string;
  goals: MayanTransactionGoal[];
  scannerUrl: string;
}

export async function getTransactionStatus(
  tx: TransactionId
): Promise<TransactionStatus | null> {
  const url = `https://explorer-api.mayan.finance/v3/swap/trx/${tx.txid}`;
  try {
    const response = await axios.get<TransactionStatus>(url);
    if (response.data.id) return response.data;
  } catch (error) {
    if (!error) return null;
    if (typeof error === "object") {
      // A 404 error means the VAA is not yet available
      // since its not available yet, we return null signaling it can be tried again
      if (axios.isAxiosError(error) && error.response?.status === 404)
        return null;
      if ("status" in error && error.status === 404) return null;
    }
    throw error;
  }
  return null;
}
