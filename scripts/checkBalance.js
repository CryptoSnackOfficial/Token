const hre = require("hardhat");

async function main() {
    // Replace with your deployed token address
    const TOKEN_ADDRESS = "0x13D60921a0Fb42c3734EBB99bEDEB9557D1B9fAe";
    // Replace with your wallet address
    const WALLET_ADDRESS = "0xAe7Ee1914b671E152340e0E2f6dd0079e111cfD1";

    const token = await ethers.getContractAt("Token", TOKEN_ADDRESS);
    const balance = await token.balanceOf(WALLET_ADDRESS);
    const symbol = await token.symbol();
    const decimals = await token.decimals();

    console.log(`Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
