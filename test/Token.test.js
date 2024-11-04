const { expect } = require("chai");
const { ethers } = require("hardhat");

const ONE_DAY = 24 * 60 * 60; // seconds in a day

describe("Token Contract", function () {
    let Token;
    let token;
    let owner;
    let addr1;
    let addr2;
    let treasury;
    let vestingContract;

    beforeEach(async function () {
        [owner, addr1, addr2, treasury] = await ethers.getSigners();

        Token = await ethers.getContractFactory("Token");
        token = await Token.deploy(
            "Test Token",
            "TST",
            1000000,
            5,
            3,
            owner.address
        );

        await token.setTreasury(treasury.address);
        const vestingAddress = await token.vestingContract();
        vestingContract = await ethers.getContractAt("TokenVesting", vestingAddress);
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await token.owner()).to.equal(owner.address);
        });

        it("Should assign the total supply of tokens to the owner", async function () {
            const ownerBalance = await token.balanceOf(owner.address);
            expect(await token.totalSupply()).to.equal(ownerBalance);
        });
    });

    describe("Transactions", function () {
        it("Should transfer tokens between accounts", async function () {
            await token.transfer(addr1.address, 50);
            expect(await token.balanceOf(addr1.address)).to.equal(50);

            await token.connect(addr1).transfer(addr2.address, 50);
            expect(await token.balanceOf(addr2.address)).to.equal(50);
        });

        it("Should fail if sender doesn't have enough tokens", async function () {
            await expect(
                token.connect(addr1).transfer(owner.address, 1)
            ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
        });

        it("Should fail if transferring to zero address", async function () {
            await expect(
                token.transfer(ethers.ZeroAddress, 50)
            ).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
        });
    });

    describe("Whitelist", function () {
        it("Should properly whitelist and unwhitelist accounts", async function () {
            await token.setWhitelist(addr1.address, true);
            expect(await token.isWhitelisted(addr1.address)).to.be.true;

            await token.setWhitelist(addr1.address, false);
            expect(await token.isWhitelisted(addr1.address)).to.be.false;
        });
    });

    describe("Blacklist", function () {
        it("Should properly blacklist and unblacklist accounts", async function () {
            await token.setBlacklist(addr1.address, true);
            expect(await token.isBlacklisted(addr1.address)).to.be.true;

            await token.setBlacklist(addr1.address, false);
            expect(await token.isBlacklisted(addr1.address)).to.be.false;
        });

        it("Should prevent transfers involving blacklisted accounts", async function () {
            await token.transfer(addr1.address, 100);
            await token.setBlacklist(addr1.address, true);

            await expect(
                token.connect(addr1).transfer(addr2.address, 50)
            ).to.be.revertedWith("ERC20: account is blacklisted");
        });
    });

    describe("Tax System", function () {
        it("Should apply correct tax for non-whitelisted transfers", async function () {
            await token.setBurnRate(10); // 10% tax
            await token.enableBurn(true);
            const transferAmount = 100;
            const expectedTax = 10; // 10% of 100
            const expectedReceived = 90;

            await token.transfer(addr1.address, transferAmount);

            expect(await token.balanceOf(addr1.address)).to.equal(expectedReceived);
            expect(await token.balanceOf(treasury.address)).to.equal(expectedTax);
        });

        it("Should not apply tax for whitelisted addresses", async function () {
            await token.setBurnRate(10); // 10% tax
            await token.setWhitelist(addr1.address, true);
            const transferAmount = 100;

            await token.transfer(addr1.address, transferAmount);

            expect(await token.balanceOf(addr1.address)).to.equal(transferAmount);
        });
    });

    describe("Access Control", function () {
        it("Should only allow owner to mint", async function () {
            await expect(
                token.connect(addr1).mint(addr1.address, 100)
            ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });

        it("Should only allow owner to set tax", async function () {
            await expect(
                token.connect(addr1).setBurnRate(5)
            ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
    });

    describe("Pause Functionality", function () {
        it("Should pause and unpause", async function () {
            await token.pause();
            await expect(
                token.transfer(addr1.address, 100)
            ).to.be.revertedWithCustomError(token, "EnforcedPause");

            await token.unpause();
            await expect(
                token.transfer(addr1.address, 100)
            ).to.not.be.reverted;
        });
    });

    describe("Vesting", function () {
        let currentTime;
        let vestingAddress;

        beforeEach(async function () {
            currentTime = (await ethers.provider.getBlock('latest')).timestamp;
            vestingAddress = await vestingContract.getAddress();

            // Whitelist the vesting contract
            await token.setWhitelist(vestingAddress, true);
            // Approve vesting contract to spend tokens
            await token.approve(vestingAddress, ethers.MaxUint256);
        });

        it("Should create vesting schedule correctly", async function () {
            const amount = 1000;
            const start = currentTime;
            const cliff = currentTime + ONE_DAY * 30;
            const duration = currentTime + ONE_DAY * 90;

            // Transfer tokens to vesting contract first
            await token.transfer(await vestingContract.getAddress(), amount);

            await vestingContract.setVestingSchedule(
                addr1.address,
                amount,
                start,
                cliff,
                duration
            );

            const schedule = await vestingContract.getVestingSchedule(addr1.address);
            expect(schedule.amount).to.equal(amount);
            expect(schedule.start).to.equal(start);
            expect(schedule.cliff).to.equal(cliff);
            expect(schedule.duration).to.equal(duration);
            expect(schedule.claimed).to.equal(0);
        });

        it("Should not allow claiming before cliff", async function () {
            const amount = 1000;
            const start = currentTime;
            const cliff = currentTime + ONE_DAY * 30;
            const duration = currentTime + ONE_DAY * 90;

            await token.transfer(await vestingContract.getAddress(), amount);
            await vestingContract.setVestingSchedule(
                addr1.address,
                amount,
                start,
                cliff,
                duration
            );

            await expect(
                vestingContract.connect(addr1).claimVestedTokens(addr1.address)
            ).to.be.revertedWith("TokenVesting: tokens are not yet vested");
        });

        it("Should vest tokens linearly after cliff", async function () {
            const amount = 1000;
            const start = currentTime;
            const cliff = currentTime + ONE_DAY * 30;
            const duration = currentTime + ONE_DAY * 90;

            await token.transfer(await vestingContract.getAddress(), amount);
            await vestingContract.setVestingSchedule(
                addr1.address,
                amount,
                start,
                cliff,
                duration
            );

            // Move time to cliff + 30 days (2/3 of vesting period)
            await ethers.provider.send("evm_increaseTime", [ONE_DAY * 60]); // 30 days cliff + 30 days
            await ethers.provider.send("evm_mine");

            await vestingContract.connect(addr1).claimVestedTokens(addr1.address);

            const balance = await token.balanceOf(addr1.address);
            expect(balance).to.be.closeTo(
                ethers.toBigInt(Math.floor(amount * 2/3)),
                ethers.toBigInt(10)
            );
        });

        it("Should vest all tokens after duration", async function () {
            const amount = 1000;
            const start = currentTime;
            const cliff = currentTime + ONE_DAY * 30;
            const duration = currentTime + ONE_DAY * 90;

            const vestingAddress = await vestingContract.getAddress();

            await token.transfer(vestingAddress, amount);

            await vestingContract.setVestingSchedule(
                addr1.address,
                amount,
                start,
                cliff,
                duration
            );

            await ethers.provider.send("evm_increaseTime", [ONE_DAY * 91]);
            await ethers.provider.send("evm_mine");

            await token.setWhitelist(vestingAddress, true);
            await token.setWhitelist(addr1.address, true);

            await vestingContract.connect(addr1).claimVestedTokens(addr1.address);

            const balance = await token.balanceOf(addr1.address);
            expect(balance).to.equal(amount);
        });

        it("Should not allow non-owners to create vesting schedules", async function () {
            const amount = 1000;
            const start = currentTime;
            const cliff = currentTime + ONE_DAY * 30;
            const duration = currentTime + ONE_DAY * 90;

            await expect(
                vestingContract.connect(addr1).setVestingSchedule(
                    addr2.address,
                    amount,
                    start,
                    cliff,
                    duration
                )
            ).to.be.revertedWithCustomError(vestingContract, "OwnableUnauthorizedAccount");
        });

        it("Should not allow creating invalid vesting schedule", async function () {
            const amount = 1000;
            const start = currentTime;
            const cliff = currentTime - ONE_DAY; // cliff before start
            const duration = currentTime + ONE_DAY;

            await expect(
                vestingContract.setVestingSchedule(
                    addr1.address,
                    amount,
                    start,
                    cliff,
                    duration
                )
            ).to.be.revertedWith("TokenVesting: incorrect vesting timing");
        });

        it("Should handle multiple claims correctly", async function () {
            const amount = 1000;
            const start = currentTime;
            const cliff = currentTime + ONE_DAY * 30;
            const duration = currentTime + ONE_DAY * 90;

            await token.transfer(await vestingContract.getAddress(), amount);
            await vestingContract.setVestingSchedule(
                addr1.address,
                amount,
                start,
                cliff,
                duration
            );

            // Move to cliff + 15 days
            await ethers.provider.send("evm_increaseTime", [ONE_DAY * 45]); // 30 days cliff + 15 days
            await ethers.provider.send("evm_mine");

            await vestingContract.connect(addr1).claimVestedTokens(addr1.address);
            const firstClaim = await token.balanceOf(addr1.address);

            // Move another 15 days
            await ethers.provider.send("evm_increaseTime", [ONE_DAY * 15]);
            await ethers.provider.send("evm_mine");

            await vestingContract.connect(addr1).claimVestedTokens(addr1.address);
            const secondClaim = await token.balanceOf(addr1.address);

            expect(secondClaim).to.be.gt(firstClaim);
        });
    });
});
