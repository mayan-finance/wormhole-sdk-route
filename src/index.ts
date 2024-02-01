import {
  Quote as MayanQuote,
  Token,
  fetchQuote,
  swapFromEvm,
  swapFromSolana,
} from "@mayanfinance/swap-sdk";
import {
  Chain,
  ChainContext,
  Network,
  Signer,
  SourceInitiatedTransferReceipt,
  TokenId,
  TransferState,
  Wormhole,
  canonicalAddress,
  isNative,
  isSourceInitiated,
  amount,
  routes,
} from "@wormhole-foundation/connect-sdk";
import {
  NATIVE_CONTRACT_ADDRESS,
  fetchTokensForChain,
  getTransactionStatus,
  mayanEvmSigner,
  mayanSolanaSigner,
  supportedChains,
  toMayanChainName,
} from "./utils";

export namespace MayanRoute {
  export type Options = {
    gasDrop: number;
    slippage: number;
    deadlineInSeconds: number;
  };
  export type NormalizedParams = {
    amount: string;
  };
  export interface ValidatedParams
    extends routes.ValidatedTransferParams<Options> {
    normalizedParams: NormalizedParams;
  }
}

type Q = routes.Quote;
type Op = MayanRoute.Options;
type Vp = MayanRoute.ValidatedParams;
type R = routes.Receipt;

type Tp = routes.TransferParams<Op>;
type Vr = routes.ValidationResult<Op>;

export class MayanRoute<N extends Network>
  extends routes.AutomaticRoute<N, Op, R, Q>
  implements routes.StaticRouteMethods<typeof MayanRoute>
{
  MIN_DEADLINE = 60;
  MAX_SLIPPAGE = 1;

  NATIVE_GAS_DROPOFF_SUPPORTED = true;
  tokenList?: Token[];

  static meta = {
    name: "MayanSwap",
  };

  getDefaultOptions(): Op {
    return { gasDrop: 0, slippage: 0.05, deadlineInSeconds: 60 * 10 };
  }

  static supportedNetworks(): Network[] {
    return ["Mainnet"];
  }

  static supportedChains(_: Network): Chain[] {
    return supportedChains();
  }

  static async supportedSourceTokens(
    fromChain: ChainContext<Network>
  ): Promise<TokenId[]> {
    return fetchTokensForChain(fromChain.chain);
  }

  static isProtocolSupported(chain: ChainContext<Network>): boolean {
    return supportedChains().includes(chain.chain);
  }

  static supportedDestinationTokens<N extends Network>(
    _token: TokenId,
    _fromChain: ChainContext<N>,
    toChain: ChainContext<N>
  ): Promise<TokenId[]> {
    return fetchTokensForChain(toChain.chain);
  }

  async isAvailable(): Promise<boolean> {
    // No way to check relayer availability so assume true
    return true;
  }

  async validate(params: Tp): Promise<Vr> {
    try {
      params.options = params.options ?? this.getDefaultOptions();

      if (params.options.slippage > this.MAX_SLIPPAGE)
        throw new Error("Slippage must be less than 100%");
      if (params.options.deadlineInSeconds < this.MIN_DEADLINE)
        throw new Error("Deadline must be at least 60 seconds");

      return { valid: true, params } as Vr;
    } catch (e) {
      return { valid: false, params, error: e as Error };
    }
  }

  private destTokenAddress(): string {
    const { destination } = this.request;
    return destination && !isNative(destination.id.address)
      ? canonicalAddress(destination.id)
      : NATIVE_CONTRACT_ADDRESS;
  }

  private sourceTokenAddress(): string {
    const { source } = this.request;
    return !isNative(source.id.address)
      ? canonicalAddress(source.id)
      : NATIVE_CONTRACT_ADDRESS;
  }

  private async fetchQuote(params: Vp): Promise<MayanQuote> {
    const { from, to } = this.request;

    const quoteOpts = {
      amount: Number(params.amount),
      fromToken: this.sourceTokenAddress(),
      toToken: this.destTokenAddress(),
      fromChain: toMayanChainName(from.chain),
      toChain: toMayanChainName(to.chain),
      ...params.options,
      ...this.getDefaultOptions(),
    };

    return await fetchQuote(quoteOpts);
  }

  async quote(params: Vp) {
    const { from, to } = this.request;
    const quote = await this.fetchQuote(params);

    const fullQuote: Q = {
      sourceToken: {
        token: Wormhole.tokenId(from.chain, this.sourceTokenAddress()),
        amount: amount.parse(quote.effectiveAmountIn, quote.fromToken.decimals),
      },
      destinationToken: {
        token: Wormhole.tokenId(to.chain, this.destTokenAddress()),
        amount: amount.parse(quote.expectedAmountOut, quote.toToken.decimals),
      },
      relayFee: {
        token: Wormhole.tokenId(from.chain, this.sourceTokenAddress()),
        amount: amount.parse(quote.redeemRelayerFee, quote.fromToken.decimals),
      },
      destinationNativeGas: amount.parse(quote.gasDrop, quote.toToken.decimals),
    };
    return fullQuote;
  }

  async initiate(signer: Signer<N>, params: Vp) {
    const originAddress = canonicalAddress(this.request.from);
    const destinationAddress = canonicalAddress(this.request.to);

    try {
      const quote = await this.fetchQuote(params);

      const rpc = await this.request.fromChain.getRpc();
      let txhash: string;
      if (this.request.from.chain === "Solana") {
        txhash = await swapFromSolana(
          quote,
          originAddress,
          destinationAddress,
          params.options.deadlineInSeconds,
          undefined,
          mayanSolanaSigner(signer),
          rpc
        );
      } else {
        const txres = await swapFromEvm(
          quote,
          destinationAddress,
          params.options.deadlineInSeconds,
          undefined,
          mayanEvmSigner(signer)
        );

        txhash = txres.hash;
      }

      const txid = { chain: this.request.from.chain, txid: txhash };

      return {
        from: this.request.from.chain,
        to: this.request.to.chain,
        state: TransferState.SourceInitiated,
        originTxs: [txid],
      } satisfies SourceInitiatedTransferReceipt;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  public override async *track(receipt: R, timeout?: number) {
    if (!isSourceInitiated(receipt)) throw new Error("Transfer not initiated");
    const txstatus = await getTransactionStatus(
      receipt.originTxs[receipt.originTxs.length - 1]!
    );
    if (!txstatus) return;
    yield { ...receipt, txstatus };
  }
}
