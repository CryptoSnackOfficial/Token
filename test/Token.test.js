const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CryptoSnackToken", function () {
    let Token;
    let token;
    let owner;
    let addr1;
    let addr2;
    let addr3;
    let addrs;

    const NAME = "CryptoSnack";
    const SYMBOL = "SNACK";
    const INITIAL_SUPPLY = 1000000;
    const INITIAL_SELLING_TAX = 500; // 5%
    const INITIAL_BUYING_TAX = 300;  // 3%
    const MAX_TAX = 2500; // 25%
    const TAX_PRECISION = 10000;

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
        Token = await ethers.getContractFactory("CryptoSnackToken");
        token = await Token.deploy(
            NAME,
            SYMBOL,
            INITIAL_SUPPLY,
            INITIAL_SELLING_TAX,
            INITIAL_BUYING_TAX,
            owner.address
        );
    });

    describe("Deployment", function () {
        it("Should set the correct name and symbol", async function () {
            expect(await token.name()).to.equal(NAME);
            expect(await token.symbol()).to.equal(SYMBOL);
        });

        it("Should mint initial supply to owner", async function () {
            const decimals = await token.decimals();
            const expectedSupply = BigInt(INITIAL_SUPPLY) * BigInt(BigInt(10) ** BigInt(decimals));
            expect(await token.totalSupply()).to.equal(expectedSupply);
            expect(await token.balanceOf(owner.address)).to.equal(expectedSupply);
        });

        it("Should set initial tax rates correctly", async function () {
            expect(await token.getSellingTax()).to.equal(INITIAL_SELLING_TAX);
            expect(await token.getBuyingTax()).to.equal(INITIAL_BUYING_TAX);
        });

        it("Should enable taxes if initial rates are non-zero", async function () {
            expect(await token.isTaxEnabled()).to.be.true;
        });

        it("Should reject deployment with tax rates exceeding MAX_TAX", async function () {
            await expect(Token.deploy(
                NAME,
                SYMBOL,
                INITIAL_SUPPLY,
                MAX_TAX + 1,
                INITIAL_BUYING_TAX,
                owner.address
            )).to.be.revertedWithCustomError(token, "TaxTooHigh");
        });
    });

    describe("Minting", function () {
        it("Should allow owner to mint new tokens", async function () {
            const mintAmount = ethers.parseEther("1000");
            await token.mint(addr1.address, mintAmount);
            expect(await token.balanceOf(addr1.address)).to.equal(mintAmount);
        });

        it("Should emit TokensMinted event", async function () {
            const mintAmount = ethers.parseEther("1000");
            await expect(token.mint(addr1.address, mintAmount))
                .to.emit(token, "TokensMinted")
                .withArgs(addr1.address, mintAmount);
        });

        it("Should not allow non-owner to mint", async function () {
            const mintAmount = ethers.parseEther("1000");
            await expect(token.connect(addr1).mint(addr2.address, mintAmount))
                .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
    });

    describe("Pause Functionality", function () {
        it("Should allow owner to pause and unpause", async function () {
            await token.pause();
            expect(await token.paused()).to.be.true;

            await token.unpause();
            expect(await token.paused()).to.be.false;
        });

        it("Should prevent transfers when paused", async function () {
            await token.pause();
            const amount = ethers.parseEther("100");
            await expect(token.transfer(addr1.address, amount))
                .to.be.revertedWithCustomError(token, "EnforcedPause");
        });

        it("Should not allow non-owner to pause/unpause", async function () {
            await expect(token.connect(addr1).pause())
                .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
            await expect(token.connect(addr1).unpause())
                .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
    });

    describe("Tax Management", function () {
        it("Should allow owner to set selling tax", async function () {
            const newTax = 1000; // 10%
            await token.setSellingTax(newTax);
            expect(await token.getSellingTax()).to.equal(newTax);
        });

        it("Should allow owner to set buying tax", async function () {
            const newTax = 1000; // 10%
            await token.setBuyingTax(newTax);
            expect(await token.getBuyingTax()).to.equal(newTax);
        });

        it("Should reject tax rates above MAX_TAX", async function () {
            await expect(token.setSellingTax(MAX_TAX + 1))
                .to.be.revertedWithCustomError(token, "TaxTooHigh");
            await expect(token.setBuyingTax(MAX_TAX + 1))
                .to.be.revertedWithCustomError(token, "TaxTooHigh");
        });

        it("Should allow enabling/disabling taxes", async function () {
            await token.setTaxEnabled(false);
            expect(await token.isTaxEnabled()).to.be.false;

            await token.setTaxEnabled(true);
            expect(await token.isTaxEnabled()).to.be.true;
        });

        it("Should emit correct events when updating taxes", async function () {
            const newTax = 1000;
            await expect(token.setSellingTax(newTax))
                .to.emit(token, "TaxesUpdated")
                .withArgs(INITIAL_BUYING_TAX, newTax);
        });
    });

    describe("DEX Management", function () {
        it("Should allow setting DEX status", async function () {
            await token.setDex(addr1.address, true);
            expect(await token.isDex(addr1.address)).to.be.true;
        });

        it("Should reject zero address as DEX", async function () {
            await expect(token.setDex(ethers.ZeroAddress, true))
                .to.be.revertedWithCustomError(token, "InvalidDexAddress");
        });

        it("Should emit correct event when updating DEX status", async function () {
            await expect(token.setDex(addr1.address, true))
                .to.emit(token, "DexStatusChanged")
                .withArgs(addr1.address, true);
        });
    });

    describe("Whitelist/Blacklist Management", function () {
        it("Should allow setting whitelist status", async function () {
            await token.setWhitelist(addr1.address, true);
            expect(await token.isWhitelisted(addr1.address)).to.be.true;
        });

        it("Should allow setting blacklist status", async function () {
            await token.setBlacklist(addr1.address, true);
            expect(await token.isBlacklisted(addr1.address)).to.be.true;
        });

        it("Should prevent transfers to/from blacklisted addresses", async function () {
            await token.transfer(addr1.address, ethers.parseEther("100"));
            await token.setBlacklist(addr1.address, true);

            await expect(token.transfer(addr1.address, ethers.parseEther("10")))
                .to.be.revertedWithCustomError(token, "BlacklistedAccount");

            await expect(token.connect(addr1).transfer(addr2.address, ethers.parseEther("10")))
                .to.be.revertedWithCustomError(token, "BlacklistedAccount");
        });
    });

    describe("Tax Wallet Management", function () {
        it("Should allow setting tax wallet", async function () {
            await token.setTaxWallet(addr1.address);
            expect(await token.getTaxWallet()).to.equal(addr1.address);
        });

        it("Should reject zero address as tax wallet", async function () {
            await expect(token.setTaxWallet(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(token, "InvalidTaxWallet");
        });

        it("Should emit correct event when updating tax wallet", async function () {
            await expect(token.setTaxWallet(addr1.address))
                .to.emit(token, "TaxWalletUpdated")
                .withArgs(ethers.ZeroAddress, addr1.address);
        });
    });

    describe("Transfer Mechanics", function () {
        let tokenWithoutTaxWallet;

        beforeEach(async function () {
            await token.setDex(addr2.address, true);
            await token.setTaxWallet(addr3.address);

            const initialAmount = ethers.parseEther("10000");
            await token.transfer(addr1.address, initialAmount);
            await token.transfer(addr2.address, initialAmount);

            // Deploy separate token instance without tax wallet
            tokenWithoutTaxWallet = await Token.deploy(
                NAME,
                SYMBOL,
                INITIAL_SUPPLY,
                INITIAL_SELLING_TAX,
                INITIAL_BUYING_TAX,
                owner.address
            );
        });

        it("Should apply buying tax correctly", async function () {
            const transferAmount = ethers.parseEther("100");
            const initialBalance1 = await token.balanceOf(addr1.address);
            const initialBalance3 = await token.balanceOf(addr3.address);

            await token.connect(addr2).transfer(addr1.address, transferAmount);

            const taxAmount = (transferAmount * BigInt(INITIAL_BUYING_TAX)) / BigInt(TAX_PRECISION);
            const finalBalance1 = await token.balanceOf(addr1.address);
            const finalBalance3 = await token.balanceOf(addr3.address);

            expect(finalBalance3 - initialBalance3).to.equal(taxAmount);
            expect(finalBalance1 - initialBalance1).to.equal(transferAmount - taxAmount);
        });

        it("Should apply selling tax correctly", async function () {
            const transferAmount = ethers.parseEther("100");
            const initialBalance2 = await token.balanceOf(addr2.address);
            const initialBalance3 = await token.balanceOf(addr3.address);

            await token.connect(addr1).transfer(addr2.address, transferAmount);

            const taxAmount = (transferAmount * BigInt(INITIAL_SELLING_TAX)) / BigInt(TAX_PRECISION);
            const finalBalance2 = await token.balanceOf(addr2.address);
            const finalBalance3 = await token.balanceOf(addr3.address);

            expect(finalBalance3 - initialBalance3).to.equal(taxAmount);
            expect(finalBalance2 - initialBalance2).to.equal(transferAmount - taxAmount);
        });

        it("Should not apply tax for whitelisted addresses", async function () {
            await token.setWhitelist(addr1.address, true);
            const transferAmount = ethers.parseEther("100");

            const initialBalance2 = await token.balanceOf(addr2.address);
            const initialBalance3 = await token.balanceOf(addr3.address);

            await token.connect(addr1).transfer(addr2.address, transferAmount);

            const finalBalance2 = await token.balanceOf(addr2.address);
            const finalBalance3 = await token.balanceOf(addr3.address);

            expect(finalBalance2 - initialBalance2).to.equal(transferAmount);
            expect(finalBalance3).to.equal(initialBalance3);
        });

        it("Should not apply tax when taxes are disabled", async function () {
            await token.setTaxEnabled(false);
            const transferAmount = ethers.parseEther("100");

            const initialBalance2 = await token.balanceOf(addr2.address);
            const initialBalance3 = await token.balanceOf(addr3.address);

            await token.connect(addr1).transfer(addr2.address, transferAmount);

            const finalBalance2 = await token.balanceOf(addr2.address);
            const finalBalance3 = await token.balanceOf(addr3.address);

            expect(finalBalance2 - initialBalance2).to.equal(transferAmount);
            expect(finalBalance3).to.equal(initialBalance3);
        });

        it("Should require tax wallet to be set for taxed transfers", async function () {
            await tokenWithoutTaxWallet.setDex(addr2.address, true);
            const transferAmount = ethers.parseEther("100");

            // Transfer some tokens to addr1 first with taxes disabled
            await tokenWithoutTaxWallet.setTaxEnabled(false);
            await tokenWithoutTaxWallet.transfer(addr1.address, ethers.parseEther("1000"));

            // Re-enable taxes and try transfer
            await tokenWithoutTaxWallet.setTaxEnabled(true);
            await expect(tokenWithoutTaxWallet.connect(addr1).transfer(addr2.address, transferAmount))
                .to.be.revertedWithCustomError(tokenWithoutTaxWallet, "InvalidTaxWallet");
        });

        it("Should handle zero amount transfers correctly", async function () {
            const transferAmount = BigInt(0);
            await expect(token.connect(addr1).transfer(addr2.address, transferAmount))
                .to.not.be.reverted;
        });

        it("Should handle maximum possible transfer amount", async function () {
            const balance = await token.balanceOf(addr1.address);
            await expect(token.connect(addr1).transfer(addr2.address, balance))
                .to.not.be.reverted;
        });

        it("Should fail on insufficient balance", async function () {
            const balance = await token.balanceOf(addr1.address);
            await expect(token.connect(addr1).transfer(addr2.address, balance + BigInt(1)))
                .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
        });
    });

    describe("Token Recovery", function () {
        it("Should allow owner to recover BNB", async function () {
            const amount = ethers.parseEther("1");
            await owner.sendTransaction({
                to: token.target,
                value: amount
            });

            const initialBalance = await ethers.provider.getBalance(owner.address);
            await token.reclaimBNB();
            const finalBalance = await ethers.provider.getBalance(owner.address);

            expect(finalBalance).to.be.gt(initialBalance);
        });

        it("Should allow owner to recover ERC20 tokens", async function () {
            // Deploy a test token and send some to the contract
            const TestToken = await ethers.getContractFactory("CryptoSnackToken");
            const testToken = await TestToken.deploy(
                "Test",
                "TEST",
                1000000,
                0,
                0,
                owner.address
            );

            const amount = ethers.parseEther("100");
            await testToken.transfer(token.target, amount);

            await token.reclaimToken(testToken.target);
            expect(await testToken.balanceOf(owner.address)).to.equal(
                ethers.parseEther(INITIAL_SUPPLY.toString())
            );
        });
    });

    describe("Multi-Transfer Functions", function () {
        beforeEach(async function () {
            // Transfer some tokens to owner for testing
            const amount = ethers.parseEther("1000000");
            await token.mint(owner.address, amount);
        });

        describe("multiTransfer", function () {
            it("Should transfer different amounts to multiple recipients", async function () {
                const recipients = [addr1.address, addr2.address, addr3.address];
                const amounts = [
                    ethers.parseEther("100"),
                    ethers.parseEther("200"),
                    ethers.parseEther("300")
                ];

                await token.multiTransfer(recipients, amounts);

                expect(await token.balanceOf(addr1.address)).to.equal(amounts[0]);
                expect(await token.balanceOf(addr2.address)).to.equal(amounts[1]);
                expect(await token.balanceOf(addr3.address)).to.equal(amounts[2]);
            });

            it("Should revert if arrays length mismatch", async function () {
                const recipients = [addr1.address, addr2.address];
                const amounts = [ethers.parseEther("100")];

                await expect(token.multiTransfer(recipients, amounts))
                    .to.be.revertedWithCustomError(token, "ArraysLengthMismatch");
            });

            it("Should revert if batch size exceeds maximum", async function () {
                const recipients = Array(201).fill(addr1.address);
                const amounts = Array(201).fill(ethers.parseEther("1"));

                await expect(token.multiTransfer(recipients, amounts))
                    .to.be.revertedWithCustomError(token, "InvalidBatchLength");
            });

            it("Should revert if empty arrays provided", async function () {
                await expect(token.multiTransfer([], []))
                    .to.be.revertedWithCustomError(token, "InvalidBatchLength");
            });
        });

        describe("multiTransferEqual", function () {
            it("Should transfer equal amounts to multiple recipients", async function () {
                const recipients = [addr1.address, addr2.address, addr3.address];
                const amount = ethers.parseEther("100");

                await token.multiTransferEqual(recipients, amount);

                for (const recipient of recipients) {
                    expect(await token.balanceOf(recipient)).to.equal(amount);
                }
            });

            it("Should revert if batch size exceeds maximum", async function () {
                const recipients = Array(201).fill(addr1.address);
                const amount = ethers.parseEther("1");

                await expect(token.multiTransferEqual(recipients, amount))
                    .to.be.revertedWithCustomError(token, "InvalidBatchLength");
            });

            it("Should revert if insufficient balance", async function () {
                const recipients = [addr1.address, addr2.address];
                const amount = ethers.parseEther("1000000000"); // More than total supply

                await expect(token.multiTransferEqual(recipients, amount))
                    .to.be.revertedWithCustomError(token, "TransferFailed");
            });
        });
    });

    describe("Account Freezing", function () {
        beforeEach(async function () {
            await token.transfer(addr1.address, ethers.parseEther("1000"));
        });

        it("Should allow owner to freeze account", async function () {
            await token.freezeAccount(addr1.address);
            expect(await token.isFrozen(addr1.address)).to.be.true;
        });

        it("Should prevent transfers from frozen account", async function () {
            await token.freezeAccount(addr1.address);
            await expect(token.connect(addr1).transfer(addr2.address, ethers.parseEther("100")))
                .to.be.revertedWithCustomError(token, "FrozenAccount");
        });

        it("Should prevent transfers to frozen account", async function () {
            await token.freezeAccount(addr2.address);
            await expect(token.connect(addr1).transfer(addr2.address, ethers.parseEther("100")))
                .to.be.revertedWithCustomError(token, "FrozenAccount");
        });

        it("Should return correct freeze time", async function () {
            await token.freezeAccount(addr1.address);
            const freezeTime = await token.getFreezeTime(addr1.address);
            expect(freezeTime).to.be.gt(Math.floor(Date.now() / 1000));
        });

        it("Should not allow freezing already frozen account", async function () {
            await token.freezeAccount(addr1.address);
            await expect(token.freezeAccount(addr1.address))
                .to.be.revertedWithCustomError(token, "AccountAlreadyFrozen");
        });

        describe("Token Recovery", function () {
            it("Should allow recovering tokens from frozen account", async function () {
                const amount = ethers.parseEther("100");
                await token.freezeAccount(addr1.address);

                await token.recoverStolenTokens(
                    addr1.address,
                    addr2.address,
                    amount
                );

                expect(await token.balanceOf(addr2.address)).to.equal(amount);
                expect(await token.isFrozen(addr1.address)).to.be.false;
            });

            it("Should revert if trying to recover from non-frozen account", async function () {
                await expect(token.recoverStolenTokens(
                    addr1.address,
                    addr2.address,
                    ethers.parseEther("100")
                )).to.be.revertedWithCustomError(token, "AccountNotFrozen");
            });

            it("Should emit TokensRecovered event", async function () {
                const amount = ethers.parseEther("100");
                await token.freezeAccount(addr1.address);

                await expect(token.recoverStolenTokens(addr1.address, addr2.address, amount))
                    .to.emit(token, "TokensRecovered")
                    .withArgs(addr1.address, addr2.address, amount);
            });
        });
    });
});
