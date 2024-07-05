import {
  Chain,
  ChainAddress,
  ChainContext,
  Network,
  Signer,
  Wormhole,
} from "@wormhole-foundation/sdk-connect";

// Importing from src so we dont have to rebuild to see debug stuff in signer
import { getEvmSignerForKey } from "@wormhole-foundation/sdk-evm";
import { getSolanaSignAndSendSigner } from "@wormhole-foundation/sdk-solana";

require("dotenv").config();

function getEnv(key: string): string {
  // If we're in the browser, return empty string
  if (typeof process === undefined) return "";

  // Otherwise, return the env var or error
  const val = process.env[key];
  if (!val)
    throw new Error(
      `Missing env var ${key}, did you forget to set valies in '.env'?`
    );

  return val;
}

export interface TransferStuff<N extends Network, C extends Chain> {
  chain: ChainContext<N, C>;
  signer: Signer<N, C>;
  address: ChainAddress<C>;
}

export async function getStuff<N extends Network, C extends Chain>(
  chain: ChainContext<N, C>
): Promise<TransferStuff<N, C>> {
  let signer: Signer;
  const platform = chain.platform.utils()._platform;
  switch (platform) {
    case "Solana":
      signer = await getSolanaSignAndSendSigner(
        await chain.getRpc(),
        getEnv("SOL_PRIVATE_KEY")
      );
      break;
    case "Evm":
      signer = await getEvmSignerForKey(
        await chain.getRpc(),
        getEnv("MAINNET_ETH_PRIVATE_KEY")
      );
      break;
    default:
      throw new Error("Unrecognized platform: " + platform);
  }

  return {
    chain,
    signer: signer as Signer<N, C>,
    address: Wormhole.chainAddress(chain.chain, signer.address()),
  };
}
