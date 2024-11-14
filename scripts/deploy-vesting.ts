// @ts-ignore
import { ethers, run } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;

async function main() {
    console.log('Deploying CryptoSnackVesting with parameters:');
    console.log('Token address:', TOKEN_ADDRESS);

    const [deployer] = await ethers.getSigners();
    console.log('Deploying with account:', deployer.address);

    const Vesting = await ethers.getContractFactory('CryptoSnackVesting');
    const vesting = await Vesting.deploy(TOKEN_ADDRESS);

    await vesting.waitForDeployment();
    const vestingAddress = await vesting.getAddress();
    console.log('Vesting contract deployed to:', vestingAddress);

    // Verify contract
    if (process.env.BSCSCAN_API_KEY) {
        console.log('Waiting for block confirmations...');
        await vesting.deploymentTransaction()?.wait(6);

        console.log('Verifying contract...');
        await run('verify:verify', {
            address: vestingAddress,
            constructorArguments: [TOKEN_ADDRESS],
        });
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
