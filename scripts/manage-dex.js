import { ethers } from "hardhat";

async function main() {
    const action = process.argv[2];
    const dexAddress = process.argv[3];
    const tokenAddress = process.env.TOKEN_ADDRESS;

    if (!action || !dexAddress) {
        throw new Error("Usage: npx hardhat run scripts/manage-dex.js --network <network> -- <add|remove> <dex-address>");
    }

    if (!tokenAddress) {
        throw new Error("TOKEN_ADDRESS environment variable is not set");
    }

    if (!ethers.isAddress(dexAddress)) {
        throw new Error("Invalid DEX address format");
    }
    if (!ethers.isAddress(tokenAddress)) {
        throw new Error("Invalid token address format");
    }

    if (action !== "add" && action !== "remove") {
        throw new Error("Action must be either 'add' or 'remove'");
    }

    const isAdding = action === "add";
    console.log(`${isAdding ? "Adding" : "Removing"} DEX: ${dexAddress}`);
    console.log(`Token address: ${tokenAddress}`);

    const token = await ethers.getContractAt("CryptoSnackToken", tokenAddress);

    const currentStatus = await token.isDex(dexAddress);
    console.log(`Current DEX status: ${currentStatus}`);

    if (currentStatus === isAdding) {
        console.log(`DEX is already ${isAdding ? "added" : "removed"}`);
        return;
    }

    const tx = await token.setDex(dexAddress, isAdding);
    console.log("Transaction hash:", tx.hash);

    await tx.wait();
    console.log(`DEX ${isAdding ? "added" : "removed"} successfully`);

    const newStatus = await token.isDex(dexAddress);
    console.log(`Verification - Is DEX registered: ${newStatus}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
