// @ts-ignore
import { ethers, run } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();

const TOKEN_NAME = process.env.TOKEN_NAME;
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL;
const INITIAL_SUPPLY = process.env.INITIAL_SUPPLY;
// @ts-ignore
const SELLING_TAX = parseInt(process.env.SELLING_TAX); // basis points, e.g. 250 == 2.5%
// @ts-ignore
const BUYING_TAX = parseInt(process.env.BUYING_TAX);  // basis points, e.g. 250 == 2.5%

async function main() {
    console.log('Deploying CryptoSnackToken with parameters:');
    console.log('Name:', TOKEN_NAME);
    console.log('Symbol:', TOKEN_SYMBOL);
    console.log('Initial Supply:', INITIAL_SUPPLY);
    console.log('Selling Tax:', SELLING_TAX);
    console.log('Buying Tax:', BUYING_TAX);

    const [deployer] = await ethers.getSigners();
    console.log('Deploying with account:', deployer.address);

    const Token = await ethers.getContractFactory('CryptoSnackToken');
    const token = await Token.deploy(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        INITIAL_SUPPLY,
        SELLING_TAX,
        BUYING_TAX,
        deployer.address
    );

    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log('Token deployed to:', tokenAddress);

    // Verify contract
    if (process.env.BSCSCAN_API_KEY) {
        console.log('Waiting for block confirmations...');
        await token.deploymentTransaction()?.wait(6);

        console.log('Verifying contract...');
        await run('verify:verify', {
            address: tokenAddress,
            constructorArguments: [
                TOKEN_NAME,
                TOKEN_SYMBOL,
                INITIAL_SUPPLY,
                SELLING_TAX,
                BUYING_TAX,
                deployer.address
            ],
        });
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
