# BEAM

The oracle for Robinhood Chain: a decentralized oracle network delivering signed prices on-chain.

Validators read prices from eight exchanges (Coinbase, Kraken, OKX, Gemini, Bitfinex, Binance.US, Crypto.com, Bitstamp) plus market data for US equities, FX and commodities. Every 10 s each validator signs what it saw; the network takes the stake-weighted median. **Tunnels** package prices into packets signed by the validator set, and the **BeamReceiver** contract on Robinhood Chain stores a price only when signers hold more than two thirds of stake.

- `server/sources.js`: price adapters (public, keyless endpoints)
- `server/engine.js`: validators, rounds, median, tunnels, packets
- `server/evm.js`: ABI, RLP, EIP-1559 signing, JSON-RPC (dependency-free)
- `shared/beam-crypto.js`: secp256k1 + packet hash, used by the server and the in-browser verifier
- `contracts/src/BeamReceiver.sol`: on-chain verification and price storage

## Run

```
node server/index.js        # http://localhost:8232
```

| Env | Purpose |
|---|---|
| `DATA_PATH` | where state is stored (use a persistent disk) |
| `BEAM_RECEIVER` | deployed BeamReceiver address on Robinhood Chain |
| `BEAM_RELAYER_KEY` | funded key that relays packets to `BEAM_RECEIVER` |
| `CHAIN_RPC` | defaults to https://rpc.mainnet.chain.robinhood.com |

## Deploy the receiver

```
BEAM_DEPLOYER_KEY=0x... node server/deploy.js
```

It deploys with the live validator set from `DATA_PATH/beam.json`. Then set `BEAM_RECEIVER` and `BEAM_RELAYER_KEY` and restart.

## Test

```
anvil --chain-id 4663 --port 8546 &
node _studio/anvil-e2e.cjs   # deploy, relay real packets, read prices, reject tampered/under-signed/replayed packets
```
