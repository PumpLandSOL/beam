// BEAM X kit: writes brand/X-KIT.md and fails if any tweet is over 245 characters
'use strict';
const fs = require('fs'), path = require('path');
const BIO = "Robinhood Chain's oracle. Eight exchanges, open validators, one signed price verified on-chain. Run a validator from your browser.";
const NAME = 'BEAM · The Oracle';
const DEX = "BEAM is the oracle network for Robinhood Chain. Validators read eight exchanges and Wall Street data, agree on one price every 10 seconds, and deliver it on-chain with signatures any contract can verify. Anyone can run a BEAM validator, even from a browser tab.";
const T = [
  ['Launch', 'beam-hype-21s.mp4', "Robinhood Chain is putting stocks on-chain.\n\nEvery lending market, perp and vault on it needs a price it can trust.\n\nThat's an oracle. We built it.\n\n$BEAM, Robinhood Chain's oracle.\n\nbeamprotocol.org"],
  ['How it works', 'beam-g01-how.png', "How the $BEAM oracle works:\n\n1. Validators read 8 exchanges\n2. Every 10s they agree on one price (stake-weighted median)\n3. Prices get packed and signed\n4. Robinhood Chain verifies every signature before storing it\n\nbeamprotocol.org"],
  ['vs Chainlink', 'beam-g02-vs-chainlink.png', "Chainlink feeds are signed by approved node operators. You can't just join.\n\n$BEAM is permissionless. Anyone can run an oracle validator, even from a browser tab, and its signature rides on-chain.\n\nMore decentralized than Chainlink."],
  ['Run a validator', 'beam-g03-run.png', "Run an oracle validator from a browser tab.\n\nNo server. No install. No permission.\n\nYour tab reads 7 exchanges, signs prices every round and co-signs the packets it agrees with.\n\nbeamprotocol.org/run\n\n$BEAM"],
  ['Feeds', 'beam-g04-feeds.png', "39 oracle feeds, live on $BEAM:\n\nBTC, ETH, SOL and 15 more crypto\nHOOD, TSLA, NVDA, AAPL, SPY and 10 more US stocks\nGold, silver, oil, EUR, GBP, JPY\n\nCrypto and Wall Street. One oracle.\n\nbeamprotocol.org/feeds"],
  ['Proof', 'beam-g05-proof.png', "Don't trust the oracle. Check it.\n\nEvery $BEAM price lands with validator signatures. The contract recovers each one and only stores a price when 2/3+ of stake signed.\n\nVerify any packet in your browser: beamprotocol.org/verify"],
  ['Thesis', 'beam-g06-thesis.png', "Robinhood Chain is bringing stocks on-chain. Nothing built on it works without an oracle.\n\n$BEAM is that oracle: open to any validator, built for tokenized stocks, verified on-chain.\n\nbeamprotocol.org"],
  ['Live numbers', 'beam-g07-numbers.png', "$BEAM oracle, live right now:\n\n39 feeds\n8 exchanges\n10 second rounds\n2/3+ stake to sign\nAnyone can run a validator\n\nWatch every round and signature: beamprotocol.org/explorer"],
  ['Builders', 'beam-keyart.png', "Building on Robinhood Chain?\n\nOpen a $BEAM tunnel: pick your feeds, a heartbeat and a price-move trigger. Signed prices land in your contract.\n\nRead one with getPriceNoOlderThan(). Two lines.\n\nbeamprotocol.org/tunnels"],
];
let md = `# BEAM X kit\n\n**Handle:** @BeamProtocolRH · **Site:** beamprotocol.org\n\n## Display name\n\`\`\`\n${NAME}\n\`\`\`\n\n## Bio (${BIO.length}/160)\n\`\`\`\n${BIO}\n\`\`\`\n\n## Website field\n\`\`\`\nbeamprotocol.org\n\`\`\`\n\n## DexScreener / listing description\n\`\`\`\n${DEX}\n\`\`\`\n\n## Profile images\n- Avatar: \`beam-pfp.png\`\n- Header: \`beam-banner.png\`\n\n## Tweets (all ≤245 characters)\n`;
let bad = 0; T.forEach(([t, media, text], i) => { if (text.length > 245) { bad++; console.log('TOO LONG', t, text.length); } md += `\n### ${i + 1}. ${t} · ${text.length} chars · media: \`${media}\`\n\`\`\`\n${text}\n\`\`\`\n`; console.log(String(text.length).padStart(3), t); });
if (BIO.length > 160) { bad++; console.log('BIO TOO LONG', BIO.length); }
fs.writeFileSync(path.join(__dirname, '..', 'brand', 'X-KIT.md'), md); console.log(bad ? 'FAIL' : 'X-KIT.md written'); process.exit(bad ? 1 : 0);
