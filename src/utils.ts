import {
  ChainName as MayanChainName,
  Token as MayanToken,
  SolanaTransactionSigner,
  fetchTokenList,
} from "@mayanfinance/swap-sdk";
import { Transaction } from "@solana/web3.js";
import {
  AttestationReceipt,
  Chain,
  CompletedTransferReceipt,
  Signer,
  SourceFinalizedTransferReceipt,
  SourceInitiatedTransferReceipt,
  FailedTransferReceipt,
  TokenId,
  TransactionId,
  TransferState,
  VAA,
  deserialize,
  encoding,
  isSignOnlySigner,
  nativeTokenId,
  routes,
  toNative,
} from "@wormhole-foundation/connect-sdk";
import { isEvmNativeSigner } from "@wormhole-foundation/connect-sdk-evm";
import { SolanaUnsignedTransaction } from "@wormhole-foundation/connect-sdk-solana";
import axios from "axios";
import { ethers } from "ethers";
import tokenCache from "./tokens.json";

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

const reverseChainMap = Object.fromEntries(
  Object.entries(chainNameMap).map(([k, v]) => [v, k])
) as Record<MayanChainName, Chain>;

export function toMayanChainName(chain: Chain): MayanChainName {
  if (!chainNameMap[chain]) throw new Error(`Chain ${chain} not supported`);
  return chainNameMap[chain] as MayanChainName;
}

export function toWormholeChainName(chain: MayanChainName): Chain {
  if (!reverseChainMap[chain]) throw new Error(`Chain ${chain} not supported`);
  return reverseChainMap[chain] as Chain;
}

export function supportedChains(): Chain[] {
  return Object.keys(chainNameMap) as Chain[];
}

let tokenListCache = {} as Record<Chain, TokenId[]>;

export async function fetchTokensForChain(chain: Chain): Promise<TokenId[]> {
  if (chain in tokenListCache) {
    return tokenListCache[chain] as TokenId[];
  }

  let mayanTokens: MayanToken[];
  let chainName = toMayanChainName(chain);
  try {
    mayanTokens = await fetchTokenList(chainName);
  } catch (e) {
    mayanTokens = tokenCache[chainName];
  }

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

export function toWormholeTransferState(
  mts: MayanTransactionStatus
): TransferState {
  switch (mts) {
    case MayanTransactionStatus.SETTLED_ON_SOLANA:
      return TransferState.DestinationInitiated;
    case MayanTransactionStatus.REDEEMED_ON_EVM:
      return TransferState.DestinationInitiated;
    case MayanTransactionStatus.REFUNDED_ON_EVM:
      return TransferState.Failed;
    case MayanTransactionStatus.REFUNDED_ON_SOLANA:
      return TransferState.Failed;
    default:
      return TransferState.SourceInitiated;
  }
}

const possibleVaaTypes = [
  // Bridge to swap chain (solana)
  "transfer",
  // Info about the swap
  "swap",
  // Successful, bridge to destination chain
  "redeem",
  // Unsuccessful auction, refund back to source chain (evm)
  "refund",
];

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

export function txStatusToReceipt(txStatus: TransactionStatus): routes.Receipt {
  const state = toWormholeTransferState(txStatus.status);
  const srcChain = toWormholeChainName(txStatus.sourceChain as MayanChainName);
  const dstChain = toWormholeChainName(txStatus.destChain as MayanChainName);

  const originTxs = txStatus.txs
    .filter((tx) => {
      return (
        // Send from Evm to Solana
        tx.goals.includes(MayanTransactionGoal.Send) ||
        // Register for auction on Solana
        tx.goals.includes(MayanTransactionGoal.Register)
      );
    })
    .map((tx) => {
      return {
        chain: srcChain,
        txid: tx.txHash,
      };
    });

  const destinationTxs = txStatus.txs
    .filter((tx) => {
      return tx.goals.includes(MayanTransactionGoal.Settle);
    })
    .map((tx) => {
      return {
        chain: dstChain,
        txid: tx.txHash,
      };
    });

  const vaas: { [key: string]: VAA<"Uint8Array"> } = {};
  for (const vaaType of possibleVaaTypes) {
    const key = `${vaaType}SignedVaa`;
    if (key in txStatus && txStatus[key as keyof TransactionStatus] !== null) {
      vaas[vaaType] = deserialize(
        "Uint8Array",
        encoding.b64.decode(txStatus.redeemSignedVaa)
      );
    }
  }

  switch (state) {
    case TransferState.SourceInitiated:
      if ("transfer" in vaas && vaas["transfer"]) {
        const vaa = vaas["transfer"];
        const attestation = {
          id: {
            emitter: vaa.emitterAddress,
            sequence: vaa.sequence,
            chain: vaa.emitterChain,
          },
          attestation: vaa,
        };

        return {
          from: srcChain,
          to: dstChain,
          originTxs,
          state: TransferState.SourceFinalized,
          attestation,
        } satisfies SourceFinalizedTransferReceipt<
          AttestationReceipt<"WormholeCore">
        >;
      }
      break;

    case TransferState.DestinationInitiated:
      // VAA to redeem on dest chain
      if ("redeem" in vaas && vaas["redeem"]) {
        const vaa = vaas["redeem"];
        const attestation = {
          id: {
            emitter: vaa.emitterAddress,
            sequence: vaa.sequence,
            chain: vaa.emitterChain,
          },
          attestation: vaa,
        };

        return {
          from: srcChain,
          to: dstChain,
          originTxs,
          destinationTxs,
          state,
          attestation,
        } satisfies CompletedTransferReceipt<
          AttestationReceipt<"WormholeCore">
        >;
      }
      break;

    case TransferState.Failed:
      if ("refund" in vaas && vaas["refund"]) {
        const vaa = vaas["refund"];
        const attestation = {
          id: {
            emitter: vaa.emitterAddress,
            sequence: vaa.sequence,
            chain: vaa.emitterChain,
          },
          attestation: vaa,
        };

        return {
          from: srcChain,
          to: dstChain,
          originTxs,
          attestation,
          state: TransferState.Failed,
          error: "Refunded on source chain",
        } satisfies FailedTransferReceipt<AttestationReceipt<"WormholeCore">>;
      }
      break;
  }

  return {
    from: srcChain,
    to: dstChain,
    originTxs,
    state: TransferState.SourceInitiated,
  } satisfies SourceInitiatedTransferReceipt;
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
