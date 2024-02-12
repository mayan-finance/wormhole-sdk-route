import { Token } from "@mayanfinance/swap-sdk";
import { Chain, ChainContext, Network, Signer, TokenId, TransferState, routes } from "@wormhole-foundation/connect-sdk";
export declare namespace MayanRoute {
    type Options = {
        gasDrop: number;
        slippage: number;
        deadlineInSeconds: number;
    };
    type NormalizedParams = {
        amount: string;
    };
    interface ValidatedParams extends routes.ValidatedTransferParams<Options> {
        normalizedParams: NormalizedParams;
    }
}
type Op = MayanRoute.Options;
type Vp = MayanRoute.ValidatedParams;
type Q = routes.Quote<Op, Vp>;
type QR = routes.QuoteResult<Op, Vp>;
type R = routes.Receipt;
type Tp = routes.TransferParams<Op>;
type Vr = routes.ValidationResult<Op>;
export declare class MayanRoute<N extends Network> extends routes.AutomaticRoute<N, Op, Vp, R> implements routes.StaticRouteMethods<typeof MayanRoute> {
    MIN_DEADLINE: number;
    MAX_SLIPPAGE: number;
    NATIVE_GAS_DROPOFF_SUPPORTED: boolean;
    tokenList?: Token[];
    static meta: {
        name: string;
    };
    getDefaultOptions(): Op;
    static supportedNetworks(): Network[];
    static supportedChains(_: Network): Chain[];
    static supportedSourceTokens(fromChain: ChainContext<Network>): Promise<TokenId[]>;
    static isProtocolSupported(chain: ChainContext<Network>): boolean;
    static supportedDestinationTokens<N extends Network>(_token: TokenId, _fromChain: ChainContext<N>, toChain: ChainContext<N>): Promise<TokenId[]>;
    isAvailable(): Promise<boolean>;
    validate(params: Tp): Promise<Vr>;
    private destTokenAddress;
    private sourceTokenAddress;
    private fetchQuote;
    quote(params: Vp): Promise<QR>;
    initiate(signer: Signer<N>, quote: Q): Promise<{
        from: "Solana" | "Ethereum" | "Terra" | "Bsc" | "Polygon" | "Avalanche" | "Oasis" | "Algorand" | "Aurora" | "Fantom" | "Karura" | "Acala" | "Klaytn" | "Celo" | "Near" | "Moonbeam" | "Neon" | "Terra2" | "Injective" | "Osmosis" | "Sui" | "Aptos" | "Arbitrum" | "Optimism" | "Gnosis" | "Pythnet" | "Xpla" | "Btc" | "Base" | "Sei" | "Rootstock" | "Wormchain" | "Cosmoshub" | "Evmos" | "Kujira" | "Sepolia" | "ArbitrumSepolia" | "BaseSepolia" | "OptimismSepolia" | "Holesky";
        to: "Solana" | "Ethereum" | "Terra" | "Bsc" | "Polygon" | "Avalanche" | "Oasis" | "Algorand" | "Aurora" | "Fantom" | "Karura" | "Acala" | "Klaytn" | "Celo" | "Near" | "Moonbeam" | "Neon" | "Terra2" | "Injective" | "Osmosis" | "Sui" | "Aptos" | "Arbitrum" | "Optimism" | "Gnosis" | "Pythnet" | "Xpla" | "Btc" | "Base" | "Sei" | "Rootstock" | "Wormchain" | "Cosmoshub" | "Evmos" | "Kujira" | "Sepolia" | "ArbitrumSepolia" | "BaseSepolia" | "OptimismSepolia" | "Holesky";
        state: TransferState.SourceInitiated;
        originTxs: {
            chain: "Solana" | "Ethereum" | "Terra" | "Bsc" | "Polygon" | "Avalanche" | "Oasis" | "Algorand" | "Aurora" | "Fantom" | "Karura" | "Acala" | "Klaytn" | "Celo" | "Near" | "Moonbeam" | "Neon" | "Terra2" | "Injective" | "Osmosis" | "Sui" | "Aptos" | "Arbitrum" | "Optimism" | "Gnosis" | "Pythnet" | "Xpla" | "Btc" | "Base" | "Sei" | "Rootstock" | "Wormchain" | "Cosmoshub" | "Evmos" | "Kujira" | "Sepolia" | "ArbitrumSepolia" | "BaseSepolia" | "OptimismSepolia" | "Holesky";
            txid: string;
        }[];
    }>;
    track(receipt: R, timeout?: number): AsyncGenerator<{
        txstatus: import("./utils").TransactionStatus;
        state: TransferState.SourceInitiated;
        originTxs: import("@wormhole-foundation/connect-sdk").TransactionId<"Solana" | "Ethereum" | "Terra" | "Bsc" | "Polygon" | "Avalanche" | "Oasis" | "Algorand" | "Aurora" | "Fantom" | "Karura" | "Acala" | "Klaytn" | "Celo" | "Near" | "Moonbeam" | "Neon" | "Terra2" | "Injective" | "Osmosis" | "Sui" | "Aptos" | "Arbitrum" | "Optimism" | "Gnosis" | "Pythnet" | "Xpla" | "Btc" | "Base" | "Sei" | "Rootstock" | "Wormchain" | "Cosmoshub" | "Evmos" | "Kujira" | "Sepolia" | "ArbitrumSepolia" | "BaseSepolia" | "OptimismSepolia" | "Holesky">[];
        from: "Solana" | "Ethereum" | "Terra" | "Bsc" | "Polygon" | "Avalanche" | "Oasis" | "Algorand" | "Aurora" | "Fantom" | "Karura" | "Acala" | "Klaytn" | "Celo" | "Near" | "Moonbeam" | "Neon" | "Terra2" | "Injective" | "Osmosis" | "Sui" | "Aptos" | "Arbitrum" | "Optimism" | "Gnosis" | "Pythnet" | "Xpla" | "Btc" | "Base" | "Sei" | "Rootstock" | "Wormchain" | "Cosmoshub" | "Evmos" | "Kujira" | "Sepolia" | "ArbitrumSepolia" | "BaseSepolia" | "OptimismSepolia" | "Holesky";
        to: "Solana" | "Ethereum" | "Terra" | "Bsc" | "Polygon" | "Avalanche" | "Oasis" | "Algorand" | "Aurora" | "Fantom" | "Karura" | "Acala" | "Klaytn" | "Celo" | "Near" | "Moonbeam" | "Neon" | "Terra2" | "Injective" | "Osmosis" | "Sui" | "Aptos" | "Arbitrum" | "Optimism" | "Gnosis" | "Pythnet" | "Xpla" | "Btc" | "Base" | "Sei" | "Rootstock" | "Wormchain" | "Cosmoshub" | "Evmos" | "Kujira" | "Sepolia" | "ArbitrumSepolia" | "BaseSepolia" | "OptimismSepolia" | "Holesky";
    }, void, unknown>;
}
export {};
//# sourceMappingURL=index.d.ts.map