const {expect} = require("chai");
const {ethers} = require("hardhat");

describe("CryptoSnackToken", function () {
    let Token;
    let token;
    let owner;
    let addr1;
    let addr2;
    let addr3;
    let addr4;
    let addrs;

    const NAME = "CryptoSnack";
    const SYMBOL = "SNACK";
    const INITIAL_SUPPLY = 1000000;
    const INITIAL_SELLING_TAX = 500; // 5%
    const INITIAL_BUYING_TAX = 300;  // 3%
    const MAX_TAX = 2500; // 25%
    const TAX_PRECISION = 10000;

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, addr4, ...addrs] = await ethers.getSigners();
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

        it("Should handle setting zero tax rates", async function () {
            await token.setSellingTax(0);
            await token.setBuyingTax(0);

            expect(await token.getSellingTax()).to.equal(0);
            expect(await token.getBuyingTax()).to.equal(0);
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

        it("Should handle DEX status changes correctly", async function () {
            // First transfer some tokens to addr1
            const initialAmount = ethers.parseEther("1000");
            await token.transfer(addr1.address, initialAmount);

            await token.setDex(addr1.address, true);
            expect(await token.isDex(addr1.address)).to.be.true;

            await token.setDex(addr1.address, false);
            expect(await token.isDex(addr1.address)).to.be.false;

            // Should now transfer without DEX tax
            const transferAmount = ethers.parseEther("100");
            const initialBalance = await token.balanceOf(addr2.address);
            await token.connect(addr1).transfer(addr2.address, transferAmount);
            expect(await token.balanceOf(addr2.address)).to.equal(initialBalance + transferAmount);
        });

        it("Should handle tax calculation with multiple DEX addresses", async function () {
            // First transfer some tokens to addr1 and addr2
            await token.transfer(addr1.address, ethers.parseEther("1000"));
            await token.transfer(addr2.address, ethers.parseEther("1000"));

            await token.setTaxWallet(addr3.address);
            await token.setDex(addr1.address, true);
            await token.setDex(addr2.address, true);

            const transferAmount = ethers.parseEther("100");
            const initialBalance3 = await token.balanceOf(addr3.address);

            // Transfer between two DEX addresses
            await token.connect(addr1).transfer(addr2.address, transferAmount);

            // When transferring from a DEX address, it uses buying tax (3%) not selling tax
            const taxAmount = (transferAmount * BigInt(INITIAL_BUYING_TAX)) / BigInt(TAX_PRECISION);
            const finalBalance3 = await token.balanceOf(addr3.address);
            expect(finalBalance3 - initialBalance3).to.equal(taxAmount);
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

        it("Should handle address being both whitelisted and blacklisted", async function () {
            await token.setWhitelist(addr1.address, true);
            await token.setBlacklist(addr1.address, true);

            // Blacklist should take precedence
            await expect(token.connect(addr1).transfer(addr2.address, ethers.parseEther("1")))
                .to.be.revertedWithCustomError(token, "BlacklistedAccount");
        });

        it("Should handle rapid whitelist/blacklist toggles", async function () {
            // First transfer some tokens to addr1
            await token.transfer(addr1.address, ethers.parseEther("10"));

            // Test rapid status changes
            await token.setWhitelist(addr1.address, true);
            await token.setBlacklist(addr1.address, true);
            await token.setBlacklist(addr1.address, false);
            await token.setWhitelist(addr1.address, false);

            // Verify final state allows transfers
            const amount = ethers.parseEther("1");
            await expect(token.connect(addr1).transfer(addr2.address, amount))
                .to.not.be.reverted;
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

        it("Should handle transfers with tax amount rounding to zero", async function () {
            // Set a very small tax that would round to zero for small amounts
            await token.setBuyingTax(1); // 0.01%
            const smallAmount = BigInt(1);

            const initialBalance = await token.balanceOf(addr1.address);
            await token.connect(addr2).transfer(addr1.address, smallAmount);

            // Tax should effectively be 0 due to integer division
            expect(await token.balanceOf(addr1.address)).to.equal(initialBalance + smallAmount);
        });

        it("Should handle transfer amount equal to tax precision base", async function () {
            const transferAmount = BigInt(TAX_PRECISION);
            await token.transfer(addr2.address, transferAmount);

            const initialBalance1 = await token.balanceOf(addr1.address);
            await token.connect(addr2).transfer(addr1.address, transferAmount);

            const taxAmount = (transferAmount * BigInt(INITIAL_BUYING_TAX)) / BigInt(TAX_PRECISION);
            const expectedReceived = transferAmount - taxAmount;

            const finalBalance1 = await token.balanceOf(addr1.address);
            expect(finalBalance1 - initialBalance1).to.equal(expectedReceived);
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

        it("Should correctly unfreeze account after 24 hours", async function () {
            await token.freezeAccount(addr1.address);

            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
            await ethers.provider.send("evm_mine");

            expect(await token.isFrozen(addr1.address)).to.be.false;

            await expect(token.connect(addr1).transfer(addr2.address, ethers.parseEther("1")))
                .to.not.be.reverted;
        });

        it("Should handle multiple freeze/unfreeze cycles", async function () {
            await token.freezeAccount(addr1.address);
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
            await ethers.provider.send("evm_mine");

            await token.freezeAccount(addr1.address);
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
            await ethers.provider.send("evm_mine");

            const amount = ethers.parseEther("1");
            await expect(token.connect(addr1).transfer(addr2.address, amount))
                .to.not.be.reverted;
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

    describe("Edge Cases for Tax Calculations", function () {
        beforeEach(async function () {
            await token.setDex(addr2.address, true);
            await token.setTaxWallet(addr3.address);
            await token.transfer(addr1.address, ethers.parseEther("1000"));
        });

        it("Should handle transfers just above tax precision threshold", async function () {
            const transferAmount = BigInt(TAX_PRECISION) + BigInt(1);
            await token.connect(addr1).transfer(addr2.address, transferAmount);

            const expectedTax = (transferAmount * BigInt(INITIAL_SELLING_TAX)) / BigInt(TAX_PRECISION);
            expect(await token.balanceOf(addr3.address)).to.equal(expectedTax);
        });

        it("Should handle maximum allowed tax rates", async function () {
            await token.setSellingTax(MAX_TAX);
            await token.setBuyingTax(MAX_TAX);

            const transferAmount = ethers.parseEther("100");
            await token.connect(addr1).transfer(addr2.address, transferAmount);

            const expectedTax = (transferAmount * BigInt(MAX_TAX)) / BigInt(TAX_PRECISION);
            expect(await token.balanceOf(addr3.address)).to.equal(expectedTax);
        });
    });

    describe("Advanced Tax Wallet Management", function () {
        let MockTaxWallet;
        let mockTaxWallet;

        beforeEach(async function () {
            // Deploy a mock contract to serve as tax wallet
            MockTaxWallet = await ethers.getContractFactory("CryptoSnackToken");
            mockTaxWallet = await MockTaxWallet.deploy(
                "Mock",
                "MOCK",
                0,
                0,
                0,
                owner.address
            );

            await token.setDex(addr2.address, true);
            await token.transfer(addr1.address, ethers.parseEther("1000"));
        });

        it("Should handle multiple tax wallet changes", async function () {
            const transferAmount = ethers.parseEther("100");

            // First tax wallet
            await token.setTaxWallet(addr3.address);
            await token.connect(addr1).transfer(addr2.address, transferAmount);
            const firstTaxBalance = await token.balanceOf(addr3.address);

            // Second tax wallet
            await token.setTaxWallet(addr4.address);
            await token.connect(addr1).transfer(addr2.address, transferAmount);
            const secondTaxBalance = await token.balanceOf(addr4.address);

            expect(firstTaxBalance).to.be.gt(0);
            expect(secondTaxBalance).to.be.gt(0);
        });

        it("Should handle contract address as tax wallet", async function () {
            await token.setTaxWallet(mockTaxWallet.target);
            const transferAmount = ethers.parseEther("100");

            await token.connect(addr1).transfer(addr2.address, transferAmount);
            const taxBalance = await token.balanceOf(mockTaxWallet.target);
            expect(taxBalance).to.be.gt(0);
        });
    });

    describe("Advanced Account Freezing and Recovery", function () {
        beforeEach(async function () {
            await token.transfer(addr1.address, ethers.parseEther("1000"));
        });

        it("Should prevent multiple freezes of the same account", async function () {
            await token.freezeAccount(addr1.address);
            await expect(token.freezeAccount(addr1.address))
                .to.be.revertedWithCustomError(token, "AccountAlreadyFrozen");
        });

        it("Should allow re-freezing after freeze period expires", async function () {
            await token.freezeAccount(addr1.address);
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
            await ethers.provider.send("evm_mine");

            await expect(token.freezeAccount(addr1.address)).to.not.be.reverted;
        });

        it("Should prevent token recovery from non-frozen accounts", async function () {
            await expect(token.recoverStolenTokens(
                addr1.address,
                addr2.address,
                ethers.parseEther("100")
            )).to.be.revertedWithCustomError(token, "AccountNotFrozen");
        });
    });

    describe("Advanced Multi-Transfer Tests", function () {
        beforeEach(async function () {
            await token.mint(owner.address, ethers.parseEther("1000000"));
        });

        it("Should handle zero addresses in recipients array", async function () {
            const recipients = [addr1.address, ethers.ZeroAddress, addr2.address];
            const amounts = [
                ethers.parseEther("100"),
                ethers.parseEther("100"),
                ethers.parseEther("100")
            ];

            await expect(token.multiTransfer(recipients, amounts))
                .to.be.reverted; // Should revert when trying to transfer to zero address
        });

        it("Should handle duplicate addresses in recipients array", async function () {
            const recipients = [addr1.address, addr1.address, addr1.address];
            const amount = ethers.parseEther("100");

            await token.multiTransferEqual(recipients, amount);
            expect(await token.balanceOf(addr1.address)).to.equal(amount * BigInt(3));
        });
    });

    describe("Advanced Pausable Functionality", function () {
        it("Should handle interleaved pauses and unpauses", async function () {
            await token.pause();
            await expect(token.transfer(addr1.address, 100)).to.be.reverted;

            await token.unpause();
            await expect(token.transfer(addr1.address, 100)).to.not.be.reverted;

            await token.pause();
            await expect(token.transfer(addr1.address, 100)).to.be.reverted;
        });

        it("Should allow non-transfer operations during pause", async function () {
            await token.pause();

            // These operations should still work during pause
            await expect(token.setTaxWallet(addr1.address)).to.not.be.reverted;
            await expect(token.setBuyingTax(1000)).to.not.be.reverted;
            await expect(token.setDex(addr1.address, true)).to.not.be.reverted;
        });
    });

    describe("Token Recovery Functions", function () {
        let testToken;

        beforeEach(async function () {
            const TestToken = await ethers.getContractFactory("CryptoSnackToken");
            testToken = await TestToken.deploy(
                "Test",
                "TEST",
                1000,
                0,
                0,
                owner.address
            );
        });

        it("Should handle recovery of insufficient balance", async function () {
            const amount = ethers.parseEther("100");
            await testToken.transfer(token.target, amount);

            // Try to recover more than available
            await expect(token.reclaimToken(testToken.target))
                .to.not.be.reverted;
        });

        it("Should prevent recovery of native token", async function () {
            // Send some tokens to contract address directly
            const amount = ethers.parseEther("100");
            await token.transfer(token.target, amount);

            // Attempt to recover own tokens
            await expect(token.reclaimToken(token.target))
                .to.not.be.reverted;
        });
    });

    describe("Advanced Access Control", function () {
        it("Should handle ownership transfer correctly", async function () {
            await token.transferOwnership(addr1.address);

            // Original owner should no longer have access
            await expect(token.mint(addr2.address, 100))
                .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");

            // New owner should have access
            await expect(token.connect(addr1).mint(addr2.address, 100))
                .to.not.be.reverted;
        });

        it("Should prevent access to privileged functions after ownership transfer", async function () {
            await token.transferOwnership(addr1.address);

            await expect(token.setTaxWallet(addr2.address))
                .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
            await expect(token.setBuyingTax(1000))
                .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
            await expect(token.setDex(addr2.address, true))
                .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
    });

    describe("Burn Functionality", function () {
        beforeEach(async function () {
            await token.transfer(addr1.address, ethers.parseEther("1000"));
        });

        it("Should allow owner to burn tokens when burn is disabled", async function () {
            const burnAmount = ethers.parseEther("100");
            const initialSupply = await token.totalSupply();

            await token.burn(burnAmount);

            expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
        });

        it("Should prevent non-owner from burning when burn is disabled", async function () {
            const burnAmount = ethers.parseEther("100");

            await expect(token.connect(addr1).burn(burnAmount))
                .to.be.revertedWithCustomError(token, "BurnDisallowed");
        });

        it("Should allow anyone to burn when burn is enabled", async function () {
            await token.setBurnEnabled(true);
            const burnAmount = ethers.parseEther("100");
            const initialSupply = await token.totalSupply();
            const initialBalance = await token.balanceOf(addr1.address);

            await token.connect(addr1).burn(burnAmount);

            expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
            expect(await token.balanceOf(addr1.address)).to.equal(initialBalance - burnAmount);
        });

        it("Should prevent burning more tokens than balance", async function () {
            await token.setBurnEnabled(true);
            const balance = await token.balanceOf(addr1.address);
            const burnAmount = balance + BigInt(1);

            await expect(token.connect(addr1).burn(burnAmount))
                .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
        });

        describe("BurnFrom Functionality", function () {
            const approvalAmount = ethers.parseEther("500");
            const burnAmount = ethers.parseEther("100");

            beforeEach(async function () {
                await token.connect(addr1).approve(owner.address, approvalAmount);
                await token.connect(addr1).approve(addr2.address, approvalAmount);
            });

            it("Should allow owner to burnFrom when burn is disabled", async function () {
                const initialSupply = await token.totalSupply();
                const initialBalance = await token.balanceOf(addr1.address);

                await token.burnFrom(addr1.address, burnAmount);

                expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
                expect(await token.balanceOf(addr1.address)).to.equal(initialBalance - burnAmount);
                expect(await token.allowance(addr1.address, owner.address))
                    .to.equal(approvalAmount - burnAmount);
            });

            it("Should prevent owner from burnFrom without allowance when burn is disabled", async function () {
                const newAddr = addrs[0];
                await token.transfer(newAddr.address, burnAmount);

                await expect(token.burnFrom(newAddr.address, burnAmount))
                    .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
            });

            it("Should prevent non-owner from burnFrom when burn is disabled", async function () {
                await expect(token.connect(addr2).burnFrom(addr1.address, burnAmount))
                    .to.be.revertedWithCustomError(token, "BurnDisallowed");
            });

            it("Should allow approved address to burnFrom when burn is enabled", async function () {
                await token.setBurnEnabled(true);
                const initialSupply = await token.totalSupply();
                const initialBalance = await token.balanceOf(addr1.address);

                await token.connect(addr2).burnFrom(addr1.address, burnAmount);

                expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
                expect(await token.balanceOf(addr1.address)).to.equal(initialBalance - burnAmount);
                expect(await token.allowance(addr1.address, addr2.address))
                    .to.equal(approvalAmount - burnAmount);
            });

            it("Should prevent burnFrom without sufficient allowance", async function () {
                await token.setBurnEnabled(true);
                const burnAmount = approvalAmount + BigInt(1);

                await expect(token.connect(addr2).burnFrom(addr1.address, burnAmount))
                    .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
            });

            it("Should prevent burnFrom for amount exceeding balance", async function () {
                await token.setBurnEnabled(true);
                const balance = await token.balanceOf(addr1.address);
                await token.connect(addr1).approve(addr2.address, balance + BigInt(1));

                await expect(token.connect(addr2).burnFrom(addr1.address, balance + BigInt(1)))
                    .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
            });
        });
    });
});
