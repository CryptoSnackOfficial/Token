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

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;

async function main() {
    if (!TOKEN_ADDRESS) {
        console.log('Token address address is missing');
        return;
    }

    const [deployer] = await ethers.getSigners();
    console.log('Verifying with account:', deployer.address, ", token address:", TOKEN_ADDRESS);

    if (process.env.BSCSCAN_API_KEY) {
        console.log('Verifying contract...');
        await run('verify:verify', {
            address: TOKEN_ADDRESS,
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
