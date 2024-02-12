import { fetchQuote, swapFromEvm, swapFromSolana, } from "@mayanfinance/swap-sdk";
import { TransferState, Wormhole, canonicalAddress, isNative, isSourceInitiated, amount, routes, } from "@wormhole-foundation/connect-sdk";
import { NATIVE_CONTRACT_ADDRESS, fetchTokensForChain, getTransactionStatus, mayanEvmSigner, mayanSolanaSigner, supportedChains, toMayanChainName, } from "./utils";
export class MayanRoute extends routes.AutomaticRoute {
    MIN_DEADLINE = 60;
    MAX_SLIPPAGE = 1;
    NATIVE_GAS_DROPOFF_SUPPORTED = true;
    tokenList;
    static meta = {
        name: "MayanSwap",
    };
    getDefaultOptions() {
        return { gasDrop: 0, slippage: 0.05, deadlineInSeconds: 60 * 10 };
    }
    static supportedNetworks() {
        return ["Mainnet"];
    }
    static supportedChains(_) {
        return supportedChains();
    }
    static async supportedSourceTokens(fromChain) {
        return fetchTokensForChain(fromChain.chain);
    }
    static isProtocolSupported(chain) {
        return supportedChains().includes(chain.chain);
    }
    static supportedDestinationTokens(_token, _fromChain, toChain) {
        return fetchTokensForChain(toChain.chain);
    }
    async isAvailable() {
        // No way to check relayer availability so assume true
        return true;
    }
    async validate(params) {
        try {
            params.options = params.options ?? this.getDefaultOptions();
            if (params.options.slippage > this.MAX_SLIPPAGE)
                throw new Error("Slippage must be less than 100%");
            if (params.options.deadlineInSeconds < this.MIN_DEADLINE)
                throw new Error("Deadline must be at least 60 seconds");
            return { valid: true, params };
        }
        catch (e) {
            return { valid: false, params, error: e };
        }
    }
    destTokenAddress() {
        const { destination } = this.request;
        return destination && !isNative(destination.id.address)
            ? canonicalAddress(destination.id)
            : NATIVE_CONTRACT_ADDRESS;
    }
    sourceTokenAddress() {
        const { source } = this.request;
        return !isNative(source.id.address)
            ? canonicalAddress(source.id)
            : NATIVE_CONTRACT_ADDRESS;
    }
    async fetchQuote(params) {
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
    async quote(params) {
        try {
            const { from, to } = this.request;
            const quote = await this.fetchQuote(params);
            const fullQuote = {
                success: true,
                params,
                sourceToken: {
                    token: Wormhole.tokenId(from.chain, this.sourceTokenAddress()),
                    amount: amount.parse(quote.effectiveAmountIn.toFixed(quote.fromToken.decimals), quote.fromToken.decimals),
                },
                destinationToken: {
                    token: Wormhole.tokenId(to.chain, this.destTokenAddress()),
                    amount: amount.parse(quote.expectedAmountOut.toFixed(quote.toToken.decimals), quote.toToken.decimals),
                },
                relayFee: {
                    token: Wormhole.tokenId(from.chain, this.sourceTokenAddress()),
                    amount: amount.parse(quote.redeemRelayerFee.toFixed(quote.fromToken.decimals), quote.fromToken.decimals),
                },
                destinationNativeGas: amount.parse(quote.gasDrop.toFixed(quote.toToken.decimals), quote.toToken.decimals),
            };
            return fullQuote;
        }
        catch (e) {
            return {
                success: false,
                error: e,
            };
        }
    }
    async initiate(signer, quote) {
        const { params } = quote;
        const originAddress = canonicalAddress(this.request.from);
        const destinationAddress = canonicalAddress(this.request.to);
        try {
            const quote = await this.fetchQuote(params);
            const rpc = await this.request.fromChain.getRpc();
            let txhash;
            if (this.request.from.chain === "Solana") {
                txhash = await swapFromSolana(quote, originAddress, destinationAddress, params.options.deadlineInSeconds, undefined, mayanSolanaSigner(signer), rpc);
            }
            else {
                const txres = await swapFromEvm(quote, destinationAddress, params.options.deadlineInSeconds, undefined, mayanEvmSigner(signer));
                txhash = txres.hash;
            }
            const txid = { chain: this.request.from.chain, txid: txhash };
            return {
                from: this.request.from.chain,
                to: this.request.to.chain,
                state: TransferState.SourceInitiated,
                originTxs: [txid],
            };
        }
        catch (e) {
            console.error(e);
            throw e;
        }
    }
    async *track(receipt, timeout) {
        if (!isSourceInitiated(receipt))
            throw new Error("Transfer not initiated");
        const txstatus = await getTransactionStatus(receipt.originTxs[receipt.originTxs.length - 1]);
        if (!txstatus)
            return;
        yield { ...receipt, txstatus };
    }
}
//# sourceMappingURL=index.js.map