import { ChainName as MayanChainName, SolanaTransactionSigner } from "@mayanfinance/swap-sdk";
import { ethers } from "ethers";
import { Chain, TokenId, Signer, TransactionId } from "@wormhole-foundation/connect-sdk";
export declare const NATIVE_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";
export declare function toMayanChainName(chain: Chain): MayanChainName;
export declare function supportedChains(): Chain[];
export declare function fetchTokensForChain(chain: Chain): Promise<TokenId[]>;
export declare function mayanSolanaSigner(signer: Signer): SolanaTransactionSigner;
export declare function mayanEvmSigner(signer: Signer): ethers.Signer;
export declare enum MayanTransactionStatus {
    SETTLED_ON_SOLANA = "SETTLED_ON_SOLANA",
    REDEEMED_ON_EVM = "REDEEMED_ON_EVM",
    REFUNDED_ON_EVM = "REFUNDED_ON_EVM",
    REFUNDED_ON_SOLANA = "REFUNDED_ON_SOLANA"
}
export declare enum MayanTransactionGoal {
    Send = "SEND",
    Bridge = "BRIDGE",
    Swap = "SWAP",
    Register = "REGISTER",
    Settle = "SETTLE"
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
export declare function getTransactionStatus(tx: TransactionId): Promise<TransactionStatus | null>;
//# sourceMappingURL=utils.d.ts.map