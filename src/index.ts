import {
  Quote as MayanQuote,
  Token,
  addresses,
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
  TransactionId,
  TransferState,
  Wormhole,
  amount,
  canonicalAddress,
  isNative,
  isSourceInitiated,
  routes,
} from "@wormhole-foundation/connect-sdk";
import { EvmPlatform } from "@wormhole-foundation/connect-sdk-evm";
import {
  NATIVE_CONTRACT_ADDRESS,
  fetchTokensForChain,
  getDefaultDeadline,
  getTransactionStatus,
  mayanEvmProvider,
  mayanEvmSigner,
  mayanSolanaSigner,
  supportedChains,
  toMayanChainName,
  txStatusToReceipt,
} from "./utils";

export namespace MayanRoute {
  export type Options = {
    gasDrop: number;
    slippage: number;
    deadlineInSeconds: number;
  };
  export type NormalizedParams = {
    slippagePercentage: number;
  };
  export interface ValidatedParams
    extends routes.ValidatedTransferParams<Options> {
    normalizedParams: NormalizedParams;
  }
}

type Op = MayanRoute.Options;
type Vp = MayanRoute.ValidatedParams;
type Q = routes.Quote<Op, Vp, MayanQuote>;
type QR = routes.QuoteResult<Op, Vp, MayanQuote>;
type R = routes.Receipt;

type Tp = routes.TransferParams<Op>;
type Vr = routes.ValidationResult<Op>;

export class MayanRoute<N extends Network>
  extends routes.AutomaticRoute<N, Op, Vp, R>
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
    return {
      gasDrop: 0,
      slippage: 0.05,
      deadlineInSeconds: getDefaultDeadline(this.request.from.chain),
    };
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

      return {
        valid: true,
        params: {
          ...params,
          normalizedParams: {
            slippagePercentage: params.options.slippage * 100,
          },
        },
      } as Vr;
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
      ...this.getDefaultOptions(),
      ...params.options,
    };

    return await fetchQuote(quoteOpts);
  }

  async quote(params: Vp): Promise<QR> {
    try {
      const { from, to } = this.request;
      const quote = await this.fetchQuote({
        ...params,
        options: {
          ...params.options,
          // overwrite slippage with mayan-normalized value
          slippage: params.normalizedParams.slippagePercentage,
        },
      });

      const fullQuote: Q = {
        success: true,
        params,
        sourceToken: {
          token: Wormhole.tokenId(from.chain, this.sourceTokenAddress()),
          amount: amount.parse(
            amount.denoise(quote.effectiveAmountIn, quote.fromToken.decimals),
            quote.fromToken.decimals
          ),
        },
        destinationToken: {
          token: Wormhole.tokenId(to.chain, this.destTokenAddress()),
          amount: amount.parse(
            amount.denoise(quote.expectedAmountOut, quote.toToken.decimals),
            quote.toToken.decimals
          ),
        },
        relayFee: {
          token: Wormhole.tokenId(from.chain, this.sourceTokenAddress()),
          amount: amount.parse(
            amount.denoise(quote.redeemRelayerFee, quote.fromToken.decimals),
            quote.fromToken.decimals
          ),
        },
        destinationNativeGas: amount.parse(
          amount.denoise(quote.gasDrop, quote.toToken.decimals),
          quote.toToken.decimals
        ),
        details: quote,
      };
      return fullQuote;
    } catch (e) {
      return {
        success: false,
        error: e as Error,
      };
    }
  }

  async initiate(signer: Signer<N>, quote: Q) {
    const { params } = quote;
    const originAddress = canonicalAddress(this.request.from);
    const destinationAddress = canonicalAddress(this.request.to);

    try {
      const rpc = await this.request.fromChain.getRpc();
      const txs: TransactionId[] = [];
      if (this.request.from.chain === "Solana") {
        txs.push({
          chain: "Solana",
          txid: await swapFromSolana(
            quote.details!,
            originAddress,
            destinationAddress,
            params.options.deadlineInSeconds,
            undefined,
            mayanSolanaSigner(signer),
            rpc
          ),
        });
      } else {
        const mayanSigner = mayanEvmSigner(signer);

        if (!isNative(this.request.source.id.address)) {
          const tokenContract = EvmPlatform.getTokenImplementation(
            await this.request.fromChain.getRpc(),
            this.sourceTokenAddress()
          );

          const allowance = await tokenContract.allowance(
            canonicalAddress(this.request.from),
            addresses.MAYAN_EVM_CONTRACT
          );

          const amt = amount.units(quote.sourceToken.amount);
          if (allowance < amt) {
            const txReq = await tokenContract.approve.populateTransaction(
              // mayan contract address,
              addresses.MAYAN_EVM_CONTRACT,
              amt
            );

            const result = await mayanSigner.sendTransaction(txReq);

            // Waits until the transaction has been confirmed
            await mayanSigner.provider?.waitForTransaction(result.hash);

            txs.push({ chain: this.request.from.chain, txid: result.hash });
          }
        }

        const swapResult = await swapFromEvm(
          quote.details!,
          destinationAddress,
          params.options.deadlineInSeconds,
          undefined,
          mayanEvmProvider(mayanSigner),
          mayanSigner
        );

        txs.push({
          chain: this.request.from.chain,
          txid: swapResult.hash,
        });
      }

      return {
        from: this.request.from.chain,
        to: this.request.to.chain,
        state: TransferState.SourceInitiated,
        originTxs: txs,
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

    receipt = txStatusToReceipt(txstatus);

    // TODO: loop until timeout?

    yield { ...receipt, txstatus };
  }

  override transferUrl(txid: string): string {
    return `https://explorer.mayan.finance/swap/${txid}`;
  }
}
