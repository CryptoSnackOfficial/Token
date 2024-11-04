const hre = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    const Token = await ethers.getContractFactory("Token");
    const token = await Token.deploy(
        "CryptoS",     // name
        "CRPTS",           // symbol
        1000000000,         // initial supply
        5,               // selling tax (5%)
        3,               // buying tax (3%)
        deployer.address // initial owner
    );

    await token.waitForDeployment();

    const vestingAddress = await token.vestingContract();
    await token.setWhitelist(vestingAddress, true);

    const isWhitelisted = await token.isWhitelisted(vestingAddress);
    if (!isWhitelisted) {
        throw new Error("Vesting contract not whitelisted!");
    }

    const address = await token.getAddress();
    console.log("Token deployed to:", address);
    console.log("Vesting contract at:", vestingAddress);
    console.log("Vesting contract whitelisted:", isWhitelisted);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
