import {
  AttestationReceipt,
  ProtocolName,
  TransferReceipt,
  TransferState,
  Wormhole,
  routes,
} from "@wormhole-foundation/sdk-connect";
import { EvmPlatform } from "@wormhole-foundation/sdk-evm";
import { SolanaPlatform } from "@wormhole-foundation/sdk-solana";
import { MayanRoute } from "../src/index";

import { getStuff } from "./utils";

(async function () {
  // Setup
  const wh = new Wormhole("Mainnet", [EvmPlatform, SolanaPlatform]);

  const sendChain = wh.getChain("Ethereum");
  const destChain = wh.getChain("Solana");

  // Doing transaction of native ETH on Ethereum to native SOL on Solana
  const source = Wormhole.tokenId(sendChain.chain, "native");
  const destination = Wormhole.tokenId(destChain.chain, "native");

  // Create a new Wormhole route resolver, adding the Mayan route to the default list
  const resolver = wh.resolver([MayanRoute]);

  // Show supported tokens
  console.log(await resolver.supportedSourceTokens(sendChain));
  console.log(
    await resolver.supportedDestinationTokens(source, sendChain, destChain)
  );

  // Pull private keys from env for testing purposes
  const sender = await getStuff(sendChain);
  const receiver = await getStuff(destChain);

  console.log(sender);
  console.log(receiver);

  // Creating a transfer request fetches token details
  // since all routes will need to know about the tokens
  const tr = await routes.RouteTransferRequest.create(
    wh,
    {
      source,
      destination,
    },
    sendChain,
    destChain
  );

  // resolve the transfer request to a set of routes that can perform it
  const foundRoutes = await resolver.findRoutes(tr);
  console.log(
    "For the transfer parameters, we found these routes: ",
    foundRoutes
  );

  // Sort the routes given some input (not required for mvp)
  // const bestRoute = (await resolver.sortRoutes(foundRoutes, "cost"))[0]!;
  //const bestRoute = foundRoutes.filter((route) => routes.isAutomatic(route))[0]!;
  const bestRoute = foundRoutes[0]!;

  // Specify the amount as a decimal string
  const transferParams = {
    amount: "0.040",
    options: bestRoute.getDefaultOptions(),
  };

  let validated = await bestRoute.validate(transferParams);
  if (!validated.valid) {
    console.error(validated.error);
    return;
  }
  console.log("Validated: ", validated);

  const quote = await bestRoute.quote(validated.params);
  console.log(quote);

  if (!quote.success) {
    console.error(`Error fetching a quote: ${quote.error.message}`);
    return;
  }

  // initiate the transfer
  const receipt = await bestRoute.initiate(
    sender.signer,
    quote,
    receiver.address
  );
  console.log("Initiated transfer with receipt: ", receipt);

  // track the transfer until the destination is initiated
  const checkAndComplete = async (
    receipt: TransferReceipt<AttestationReceipt<ProtocolName>>
  ) => {
    console.log("Checking transfer state...");
    // overwrite receipt var
    for await (receipt of bestRoute.track(receipt, 120 * 1000)) {
      console.log("Transfer State:", TransferState[receipt.state]);
    }

    // gucci
    if (receipt.state >= TransferState.DestinationFinalized) return;

    // if the route is one we need to complete, do it
    if (receipt.state === TransferState.Attested) {
      if (routes.isManual(bestRoute)) {
        const completedTxids = await bestRoute.complete(
          receiver.signer,
          receipt
        );
        console.log("Completed transfer with txids: ", completedTxids);
        return;
      }
    }

    // give it time to breath and try again
    const wait = 2 * 1000;
    console.log(`Transfer not complete, trying again in a ${wait}ms...`);
    setTimeout(() => checkAndComplete(receipt), wait);
  };

  await checkAndComplete(receipt);
})();
