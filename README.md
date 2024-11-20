# CryptoSnack Token

## Deployment

Fill `.env` file
(specify [private key](https://support.metamask.io/managing-my-wallet/secret-recovery-phrase-and-private-keys/how-to-export-an-accounts-private-key/)):

```dotenv
PRIVATE_KEY=
BSCSCAN_API_KEY=

TOKEN_NAME=CryptoSnack 2.0
TOKEN_SYMBOL=SNACK
INITIAL_SUPPLY=10000000000
SELLING_TAX=250
BUYING_TAX=250
// Once published, insert token address here for verifying and vesting contract
TOKEN_ADDRESS=
```

Run script:

```bash
npx hardhat run scripts/deploy-token.ts --network bsc
```

Edit `.env` file to include `TOKEN_ADDRESS` value.

Run script:

```bash
npx hardhat run scripts/deploy-vesting.ts --network bsc
```

## Verify token

Edit `.env` file to include `TOKEN_ADDRESS` value.

Run script:

```bash
npx hardhat run scripts/verify-token.ts --network bsc
```

## DEX management

To take fees for swapping on DEX, the DEX wallet should be added to the list.

Example (for [pancakeswap](https://docs.pancakeswap.finance/developers/smart-contracts)):

```bash
# router v2
setDex("0x10ED43C718714eb63d5aA57B78B54704E256024E", true);

# router v3
setDex("0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", true);

# stableswap
setDex("0xC6665d98Efd81f47B03801187eB46cbC63F328B0", true)
```

## Run tests

```bash
npx hardhat test
```
