import {
  routes,
  TransferReceipt,
  TransferState,
  Wormhole,
} from "@wormhole-foundation/sdk-connect";
import { EvmPlatform } from "@wormhole-foundation/sdk-evm";
import { SolanaPlatform } from "@wormhole-foundation/sdk-solana";
import { MayanRoute } from "../src/index";

(async function () {
  const wh = new Wormhole("Mainnet", [EvmPlatform, SolanaPlatform]);

  const from = "Solana";
  const to = "Ethereum";

  const source = Wormhole.tokenId(from, "native");
  const destination = Wormhole.tokenId(to, "native");

  //
  const tr = await routes.RouteTransferRequest.create(wh, {
    source,
    destination,
  });
  const route = new MayanRoute(wh, tr);

  // Transaction to recover
  const txid =
    "5KhCLcb3WphH5Ncb8jw7XLFg5qLC8B8Ri7XBPZhxXDtYSqEcpXYKbGASZfmdZzAHuamW6UZEokCydEuQ7xfrystT";

  let receipt: TransferReceipt<any> = {
    state: TransferState.SourceInitiated,
    from,
    to,
    originTxs: [{ chain: from, txid }],
  };
  console.log("Initial State: ", TransferState[receipt.state]);

  for await (receipt of route.track(receipt))
    console.log("State: ", TransferState[receipt.state]);

  console.log("Final State: ", TransferState[receipt.state]);
})();
