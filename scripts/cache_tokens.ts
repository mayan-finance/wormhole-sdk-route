import {
  fetchTokenList,
  ChainName,
} from "@mayanfinance/swap-sdk";
import fs from 'node:fs';

const chains: ChainName[] = ['solana', 'ethereum', 'bsc', 'polygon', 'avalanche', 'arbitrum', 'aptos'];
let tokensCache: Partial<Record<ChainName, any>> = {};


Promise.all(
  chains.map(async (chain) => {
    return fetchTokenList(chain).then((tokens) => {
      tokensCache[chain] = tokens;
      console.log('fetched', chain);
    });
  })
).then(() => {
  fs.writeFile('src/tokens.json', JSON.stringify(tokensCache), err => console.error(err));
  console.log('cached tokens to src/tokens.json');
});

