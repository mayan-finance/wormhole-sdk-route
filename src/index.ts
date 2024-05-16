import {
  Quote as MayanQuote,
  QuoteParams,
  Token,
  addresses,
  fetchQuote,
  getSwapFromEvmTxPayload,
  swapFromSolana,
} from "@mayanfinance/swap-sdk";
import {
  Chain,
  ChainAddress,
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
  isCompleted,
  isNative,
  isSignAndSendSigner,
  isSignOnlySigner,
  isSourceInitiated,
  nativeChainIds,
  routes,
} from "@wormhole-foundation/sdk-connect";
import {
  EvmChains,
  EvmPlatform,
  EvmUnsignedTransaction,
} from "@wormhole-foundation/sdk-evm";
import {
  NATIVE_CONTRACT_ADDRESS,
  fetchTokensForChain,
  getDefaultDeadline,
  getTransactionStatus,
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
    slippageBps: number;
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
      deadlineInSeconds: getDefaultDeadline(this.request.fromChain.chain),
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
            slippageBps: params.options.slippage * 10000,
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
    const { fromChain, toChain } = this.request;

    const quoteOpts: QuoteParams = {
      amount: Number(params.amount),
      fromToken: this.sourceTokenAddress(),
      toToken: this.destTokenAddress(),
      fromChain: toMayanChainName(fromChain.chain),
      toChain: toMayanChainName(toChain.chain),
      ...this.getDefaultOptions(),
      ...params.options,
      slippageBps: params.normalizedParams.slippageBps,
    };

    const quotes = await fetchQuote(quoteOpts);
    // Note: Only taking the first quote
    return quotes[0]!;
  }

  async quote(params: Vp): Promise<QR> {
    try {
      const { fromChain, toChain } = this.request;
      const quote = await this.fetchQuote(params);

      if (quote.effectiveAmountIn < quote.refundRelayerFee) {
        throw new Error(
          "Refund relayer fee is greater than the effective amount in"
        );
      }

      // TODO: what if source and dest are _both_ EVM?
      const relayFee =
        quote.fromChain !== "solana"
          ? {
              token: Wormhole.tokenId(
                fromChain.chain,
                this.sourceTokenAddress()
              ),
              amount: amount.parse(
                amount.denoise(quote.swapRelayerFee, quote.fromToken.decimals),
                quote.fromToken.decimals
              ),
            }
          : {
              token: Wormhole.tokenId(toChain.chain, this.destTokenAddress()),
              amount: amount.parse(
                amount.denoise(quote.redeemRelayerFee, quote.toToken.decimals),
                quote.toToken.decimals
              ),
            };

      const fullQuote: Q = {
        success: true,
        params,
        sourceToken: {
          token: Wormhole.tokenId(fromChain.chain, this.sourceTokenAddress()),
          amount: amount.parse(
            amount.denoise(quote.effectiveAmountIn, quote.fromToken.decimals),
            quote.fromToken.decimals
          ),
        },
        destinationToken: {
          token: Wormhole.tokenId(toChain.chain, this.destTokenAddress()),
          amount: amount.parse(
            amount.denoise(quote.expectedAmountOut, quote.toToken.decimals),
            quote.toToken.decimals
          ),
        },
        relayFee,
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

  async initiate(signer: Signer<N>, quote: Q, to: ChainAddress) {
    const { params } = quote;
    const originAddress = signer.address();
    const destinationAddress = canonicalAddress(to);

    try {
      const rpc = await this.request.fromChain.getRpc();
      const txs: TransactionId[] = [];
      if (this.request.fromChain.chain === "Solana") {
        const swapResult = await swapFromSolana(
          quote.details!,
          originAddress,
          destinationAddress,
          params.options.deadlineInSeconds,
          undefined,
          mayanSolanaSigner(signer),
          rpc
        );
        txs.push({ chain: "Solana", txid: swapResult.signature });
      } else {
        const txReqs: EvmUnsignedTransaction<N, EvmChains>[] = [];
        const nativeChainId = nativeChainIds.networkChainToNativeChainId.get(
          this.request.fromChain.network,
          this.request.fromChain.chain
        );

        if (!isNative(this.request.source.id.address)) {
          const tokenContract = EvmPlatform.getTokenImplementation(
            await this.request.fromChain.getRpc(),
            this.sourceTokenAddress()
          );

          const contractAddress =
            quote.details!.type.toLowerCase() === "wh"
              ? addresses.MAYAN_EVM_CONTRACT
              : addresses.MAYAN_FORWARDER_CONTRACT;

          const allowance = await tokenContract.allowance(
            originAddress,
            contractAddress
          );

          const amt = amount.units(quote.sourceToken.amount);
          if (allowance < amt) {
            const txReq = await tokenContract.approve.populateTransaction(
              // mayan contract address,
              contractAddress,
              amt
            );
            txReqs.push(
              new EvmUnsignedTransaction(
                {
                  from: signer.address(),
                  chainId: nativeChainId as bigint,
                  ...txReq,
                },
                this.request.fromChain.network,
                this.request.fromChain.chain as EvmChains,
                "Approve Allowance"
              )
            );
          }
        }

        const txReq = await getSwapFromEvmTxPayload(
          quote.details!,
          destinationAddress,
          params.options.deadlineInSeconds,
          undefined,
          originAddress,
          Number(nativeChainId!),
          undefined,
          undefined // permit?
        );
        txReqs.push(
          new EvmUnsignedTransaction(
            {
              from: signer.address(),
              chainId: nativeChainId,
              ...txReq,
            },
            this.request.fromChain.network,
            this.request.fromChain.chain as EvmChains,
            "Execute Swap"
          )
        );

        if (isSignOnlySigner(signer)) {
          const signed = await signer.sign(txReqs);
          const txids = await EvmPlatform.sendWait(
            this.request.fromChain.chain,
            rpc,
            signed
          );
          txs.push(
            ...txids.map((txid) => ({
              chain: this.request.fromChain.chain,
              txid,
            }))
          );
        } else if (isSignAndSendSigner(signer)) {
          const txids = await signer.signAndSend(txReqs);
          txs.push(
            ...txids.map((txid) => ({
              chain: this.request.fromChain.chain,
              txid,
            }))
          );
        }
      }

      return {
        from: this.request.fromChain.chain,
        to: this.request.toChain.chain,
        state: TransferState.SourceInitiated,
        originTxs: txs,
      } satisfies SourceInitiatedTransferReceipt;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  public override async *track(receipt: R, timeout?: number) {
    // What should be the default if no timeout is provided?
    let leftover = timeout ? timeout : 60 * 60 * 1000;
    while (leftover > 0) {
      const start = Date.now();
      if (!isSourceInitiated(receipt))
        throw new Error("Transfer not initiated");

      const txstatus = await getTransactionStatus(
        receipt.originTxs[receipt.originTxs.length - 1]!
      );

      if (txstatus) {
        receipt = txStatusToReceipt(txstatus);
        yield { ...receipt, txstatus };

        if (isCompleted(receipt)) return receipt;
      }

      // sleep for 1 second so we dont spam the endpoint
      await new Promise((resolve) => setTimeout(resolve, 1000));
      leftover -= Date.now() - start;
    }

    return receipt;
  }

  override transferUrl(txid: string): string {
    return `https://explorer.mayan.finance/swap/${txid}`;
  }
}
