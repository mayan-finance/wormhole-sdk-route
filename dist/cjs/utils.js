import { fetchTokenList, } from "@mayanfinance/swap-sdk";
import { Transaction } from "@solana/web3.js";
import { isSignOnlySigner, toNative, nativeTokenId, } from "@wormhole-foundation/connect-sdk";
import { isEvmNativeSigner } from "@wormhole-foundation/connect-sdk-evm";
import tokenCache from "./tokens.json";
import axios from "axios";
export const NATIVE_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";
const chainNameMap = {
    Solana: "solana",
    Ethereum: "ethereum",
    Bsc: "bsc",
    Polygon: "polygon",
    Avalanche: "avalanche",
    Arbitrum: "arbitrum",
    Aptos: "aptos",
};
export function toMayanChainName(chain) {
    if (!chainNameMap[chain])
        throw new Error(`Chain ${chain} not supported`);
    return chainNameMap[chain];
}
export function supportedChains() {
    return Object.keys(chainNameMap);
}
let tokenListCache = {};
export async function fetchTokensForChain(chain) {
    if (chain in tokenListCache) {
        return tokenListCache[chain];
    }
    let mayanTokens;
    let chainName = toMayanChainName(chain);
    try {
        mayanTokens = await fetchTokenList(chainName);
    }
    catch (e) {
        mayanTokens = tokenCache[chainName];
    }
    const whTokens = mayanTokens.map((mt) => {
        if (mt.contract === NATIVE_CONTRACT_ADDRESS) {
            return nativeTokenId(chain);
        }
        else {
            return {
                chain,
                address: toNative(chain, mt.contract),
            };
        }
    });
    tokenListCache[chain] = whTokens;
    return whTokens;
}
export function mayanSolanaSigner(signer) {
    if (!isSignOnlySigner(signer))
        throw new Error("Signer must be a SignOnlySigner");
    return async (tx) => {
        const ust = {
            transaction: { transaction: tx },
            description: "Mayan.InitiateSwap",
            network: "Mainnet",
            chain: "Solana",
            parallelizable: false,
        };
        const signed = (await signer.sign([ust]));
        return Transaction.from(signed[0]);
    };
}
export function mayanEvmSigner(signer) {
    if (isEvmNativeSigner(signer))
        return signer.unwrap();
    throw new Error("Signer must be an EvmNativeSigner");
}
export var MayanTransactionStatus;
(function (MayanTransactionStatus) {
    MayanTransactionStatus["SETTLED_ON_SOLANA"] = "SETTLED_ON_SOLANA";
    MayanTransactionStatus["REDEEMED_ON_EVM"] = "REDEEMED_ON_EVM";
    MayanTransactionStatus["REFUNDED_ON_EVM"] = "REFUNDED_ON_EVM";
    MayanTransactionStatus["REFUNDED_ON_SOLANA"] = "REFUNDED_ON_SOLANA";
})(MayanTransactionStatus || (MayanTransactionStatus = {}));
export var MayanTransactionGoal;
(function (MayanTransactionGoal) {
    // send from evm to solana
    MayanTransactionGoal["Send"] = "SEND";
    // bridge to destination chain
    MayanTransactionGoal["Bridge"] = "BRIDGE";
    // perform the swap
    MayanTransactionGoal["Swap"] = "SWAP";
    // register for auction
    MayanTransactionGoal["Register"] = "REGISTER";
    // settle on destination
    MayanTransactionGoal["Settle"] = "SETTLE";
})(MayanTransactionGoal || (MayanTransactionGoal = {}));
export async function getTransactionStatus(tx) {
    const url = `https://explorer-api.mayan.finance/v3/swap/trx/${tx.txid}`;
    try {
        const response = await axios.get(url);
        if (response.data.id)
            return response.data;
    }
    catch (error) {
        if (!error)
            return null;
        if (typeof error === "object") {
            // A 404 error means the VAA is not yet available
            // since its not available yet, we return null signaling it can be tried again
            if (axios.isAxiosError(error) && error.response?.status === 404)
                return null;
            if ("status" in error && error.status === 404)
                return null;
        }
        throw error;
    }
    return null;
}
//# sourceMappingURL=utils.js.map