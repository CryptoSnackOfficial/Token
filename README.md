# CryptoSnack Token

## Deployment

Fill `.env` file:

```dotenv
PRIVATE_KEY=
BSCSCAN_API_KEY=

# should be filled later, after deployment
TOKEN_ADDRESS=
```

Edit a deployment script (`scripts/deploy.js`) to match your needs.

Run script:

```bash
npx hardhat run scripts/deploy.js --network bscTestnet
```

## DEX management

To take fees for swapping on DEX, the DEX wallet should be added to the list.

Usage:

```bash
npx hardhat run scripts/manage-dex.js --network <network> -- <add|remove> <dex-address>
```

Example (for [pancakeswap](https://docs.pancakeswap.finance/developers/smart-contracts)):

```bash
npx hardhat run scripts/manage-dex.js --network bscTestnet -- add 0x10ED43C718714eb63d5aA57B78B54704E256024E # router v2
npx hardhat run scripts/manage-dex.js --network bscTestnet -- add 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4 # router v3
```

## Run tests

```bash
npx hardhat test
```
