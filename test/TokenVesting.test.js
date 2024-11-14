const {expect} = require("chai");
const {ethers} = require("hardhat");
const {time} = require("@nomicfoundation/hardhat-network-helpers");

describe("CryptoSnackVesting", function() {
    let Token;
    let token;
    let Vesting;
    let vesting;
    let owner;
    let beneficiary;
    let addr2;

    const INITIAL_SUPPLY = 1000000;
    const VESTING_AMOUNT = ethers.parseEther("1000");
    const SELLING_TAX = 500; // 5%
    const BUYING_TAX = 500; // 5%

    beforeEach(async function() {
        // Get signers
        [owner, beneficiary, addr2] = await ethers.getSigners();

        // Deploy CryptoSnackToken
        Token = await ethers.getContractFactory("CryptoSnackToken");
        token = await Token.deploy(
            "CryptoSnack Token",
            "SNACK",
            INITIAL_SUPPLY,
            SELLING_TAX,
            BUYING_TAX,
            owner.address
        );

        // Deploy vesting contract
        Vesting = await ethers.getContractFactory("CryptoSnackVesting");
        vesting = await Vesting.deploy(await token.getAddress());

        // Disable taxes for testing purposes
        await token.setTaxEnabled(false);

        // Transfer tokens to vesting contract
        await token.transfer(await vesting.getAddress(), VESTING_AMOUNT * BigInt(2));
    });

    describe("Deployment", function() {
        it("Should set the right token", async function() {
            expect(await vesting.getToken()).to.equal(await token.getAddress());
        });

        it("Should set the right owner", async function() {
            expect(await vesting.owner()).to.equal(owner.address);
        });

        it("Should have correct token balance", async function() {
            expect(await token.balanceOf(await vesting.getAddress())).to.equal(VESTING_AMOUNT * BigInt(2));
        });
    });

    describe("Creating vesting schedule", function() {
        it("Should create vesting schedule correctly", async function() {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600; // 1 hour from now
            const cliffDuration = 7200; // 2 hours
            const vestingDuration = 14400; // 4 hours

            await vesting.createVestingSchedule(
                beneficiary.address,
                VESTING_AMOUNT,
                startTime,
                cliffDuration,
                vestingDuration,
                true
            );

            const schedule = await vesting.getVestingSchedule(beneficiary.address);
            expect(schedule.totalAmount).to.equal(VESTING_AMOUNT);
            expect(schedule.startTime).to.equal(startTime);
            expect(schedule.cliff).to.equal(startTime + cliffDuration);
            expect(schedule.duration).to.equal(vestingDuration);
            expect(schedule.revocable).to.equal(true);
            expect(schedule.revoked).to.equal(false);
        });

        it("Should revert when beneficiary is zero address", async function() {
            const currentTime = await time.latest();
            await expect(vesting.createVestingSchedule(
                ethers.ZeroAddress,
                VESTING_AMOUNT,
                currentTime + 3600,
                7200,
                14400,
                true
            )).to.be.revertedWithCustomError(vesting, "InvalidBeneficiary");
        });

        it("Should revert when amount is zero", async function() {
            const currentTime = await time.latest();
            await expect(vesting.createVestingSchedule(
                beneficiary.address,
                0,
                currentTime + 3600,
                7200,
                14400,
                true
            )).to.be.revertedWithCustomError(vesting, "InvalidVestingParameters");
        });

        it("Should revert when start time is in the past", async function() {
            const currentTime = await time.latest();
            await expect(vesting.createVestingSchedule(
                beneficiary.address,
                VESTING_AMOUNT,
                currentTime - 3600,
                7200,
                14400,
                true
            )).to.be.revertedWithCustomError(vesting, "InvalidVestingParameters");
        });

        it("Should revert when cliff duration is longer than vesting duration", async function() {
            const currentTime = await time.latest();
            await expect(vesting.createVestingSchedule(
                beneficiary.address,
                VESTING_AMOUNT,
                currentTime + 3600,
                14400,
                7200, // shorter than cliff
                true
            )).to.be.revertedWithCustomError(vesting, "InvalidVestingParameters");
        });

        it("Should revert when creating duplicate schedule for same beneficiary", async function() {
            const currentTime = await time.latest();
            await vesting.createVestingSchedule(
                beneficiary.address,
                VESTING_AMOUNT,
                currentTime + 3600,
                7200,
                14400,
                true
            );

            await expect(vesting.createVestingSchedule(
                beneficiary.address,
                VESTING_AMOUNT,
                currentTime + 3600,
                7200,
                14400,
                true
            )).to.be.revertedWithCustomError(vesting, "VestingAlreadyExists");
        });
    });

    describe("Token Release", function() {
        describe("Basic release functionality", function() {
            beforeEach(async function() {
                const currentTime = await time.latest();
                const startTime = currentTime + 3600;
                await vesting.createVestingSchedule(
                    beneficiary.address,
                    VESTING_AMOUNT,
                    startTime,
                    7200, // 2 hour cliff
                    14400, // 4 hour vesting
                    true
                );
            });

            it("Should not release tokens before cliff", async function() {
                await expect(vesting.connect(beneficiary).release())
                    .to.be.revertedWithCustomError(vesting, "NothingToRelease");
            });

            it("Should release tokens after cliff", async function() {
                await time.increase(10800); // 3 hours (past cliff)

                await vesting.connect(beneficiary).release();

                const schedule = await vesting.getVestingSchedule(beneficiary.address);
                expect(schedule.releasedAmount).to.be.gt(0);
                expect(await token.balanceOf(beneficiary.address)).to.be.gt(0);
            });

            it("Should fail release if beneficiary gets blacklisted", async function() {
                await time.increase(10800); // 3 hours (past cliff)
                await token.setBlacklist(beneficiary.address, true);

                await expect(vesting.connect(beneficiary).release())
                    .to.be.revertedWithCustomError(token, "BlacklistedAccount");
            });
        });

        describe("Full vesting completion", function() {
            it("Should release full amount after vesting duration", async function() {
                const currentTime = await time.latest();
                const startTime = currentTime + 3600;

                // Create schedule for addr2 instead of beneficiary
                await vesting.createVestingSchedule(
                    addr2.address,
                    VESTING_AMOUNT,
                    startTime,
                    7200,
                    14400,
                    true
                );

                await time.increase(20000); // Past vesting duration
                await vesting.connect(addr2).release();

                const schedule = await vesting.getVestingSchedule(addr2.address);
                expect(schedule.releasedAmount).to.equal(VESTING_AMOUNT);
            });
        });

        it("Should revert release for non-existent schedule", async function() {
            // No need to create any schedule for this test
            await expect(vesting.connect(addr2).release())
                .to.be.revertedWithCustomError(vesting, "NoVestingSchedule");
        });
    });

    describe("Revocation", function() {
        beforeEach(async function() {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;
            await vesting.createVestingSchedule(
                beneficiary.address,
                VESTING_AMOUNT,
                startTime,
                7200,
                14400,
                true
            );
        });

        it("Should revoke vesting schedule and transfer tokens correctly", async function() {
            await time.increase(10800); // 3 hours

            const ownerBalanceBefore = await token.balanceOf(owner.address);
            await vesting.revoke(beneficiary.address);

            const schedule = await vesting.getVestingSchedule(beneficiary.address);
            expect(schedule.revoked).to.equal(true);

            // Check that tokens were distributed correctly
            const ownerBalanceAfter = await token.balanceOf(owner.address);
            expect(ownerBalanceAfter).to.be.gt(ownerBalanceBefore);
            expect(await token.balanceOf(beneficiary.address)).to.be.gt(0);
        });

        it("Should not be able to revoke non-revocable schedule", async function() {
            const currentTime = await time.latest();
            await vesting.createVestingSchedule(
                addr2.address,
                VESTING_AMOUNT,
                currentTime + 3600,
                7200,
                14400,
                false // non-revocable
            );

            await expect(vesting.revoke(addr2.address))
                .to.be.revertedWithCustomError(vesting, "NotRevocable");
        });
    });

    describe("Utility Functions", function() {
        it("Should allow owner to reclaim other tokens", async function() {
            const OtherToken = await ethers.getContractFactory("CryptoSnackToken");
            const otherToken = await OtherToken.deploy(
                "Other Token",
                "OTHER",
                INITIAL_SUPPLY,
                SELLING_TAX,
                BUYING_TAX,
                owner.address
            );

            await otherToken.transfer(vesting.getAddress(), VESTING_AMOUNT);
            await vesting.reclaimToken(await otherToken.getAddress());

            expect(await otherToken.balanceOf(owner.address)).to.equal(ethers.parseEther(INITIAL_SUPPLY.toString()));
        });

        it("Should not allow reclaiming vesting token", async function() {
            await expect(vesting.reclaimToken(await token.getAddress()))
                .to.be.revertedWithCustomError(vesting, "TransferFailed");
        });

        it("Should allow owner to reclaim BNB", async function() {
            const amount = ethers.parseEther("1.0");
            await owner.sendTransaction({
                to: vesting.getAddress(),
                value: amount
            });

            const balanceBefore = await ethers.provider.getBalance(owner.address);
            await vesting.reclaimBNB();
            const balanceAfter = await ethers.provider.getBalance(owner.address);

            expect(balanceAfter).to.be.gt(balanceBefore);
        });
    });

    describe("getReleasableAmount", function() {
        it("Should return correct releasable amount at different times", async function() {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;
            await vesting.createVestingSchedule(
                beneficiary.address,
                VESTING_AMOUNT,
                startTime,
                7200,
                14400,
                true
            );

            // Before cliff
            expect(await vesting.getReleasableAmount(beneficiary.address)).to.equal(0);

            // Middle of vesting
            await time.increaseTo(startTime + 10800); // 75% through vesting
            const midAmount = await vesting.getReleasableAmount(beneficiary.address);
            expect(midAmount).to.be.gt(0);
            expect(midAmount).to.be.lt(VESTING_AMOUNT);

            // After vesting
            await time.increaseTo(startTime + 14400);
            expect(await vesting.getReleasableAmount(beneficiary.address)).to.equal(VESTING_AMOUNT);
        });
    });

    describe("Total Allocation Tracking", function() {
        beforeEach(async function() {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;

            // Create first vesting schedule
            await vesting.createVestingSchedule(
                beneficiary.address,
                VESTING_AMOUNT,
                startTime,
                7200, // 2 hour cliff
                14400, // 4 hour vesting
                true
            );
        });

        it("Should track initial allocation correctly", async function() {
            expect(await vesting.getTotalAllocated()).to.equal(VESTING_AMOUNT);
        });

        it("Should update allocation after partial release", async function() {
            await time.increase(10800); // 3 hours (past cliff)

            const totalBefore = await vesting.getTotalAllocated();
            await vesting.connect(beneficiary).release();
            const totalAfter = await vesting.getTotalAllocated();

            expect(totalAfter).to.be.lt(totalBefore);
            expect(totalAfter).to.be.gt(0);
        });

        it("Should update allocation after full vesting completion", async function() {
            await time.increase(20000); // Past full vesting duration

            await vesting.connect(beneficiary).release();
            const totalAfter = await vesting.getTotalAllocated();

            expect(totalAfter).to.equal(0);
        });

        it("Should update allocation correctly after revocation", async function() {
            await time.increase(10800); // 3 hours (past cliff)

            await vesting.revoke(beneficiary.address);
            const totalAfter = await vesting.getTotalAllocated();

            expect(totalAfter).to.equal(0);
        });

        it("Should track multiple schedules correctly", async function() {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;

            // Create second vesting schedule
            await vesting.createVestingSchedule(
                addr2.address,
                VESTING_AMOUNT,
                startTime,
                7200,
                14400,
                true
            );

            expect(await vesting.getTotalAllocated()).to.equal(VESTING_AMOUNT * BigInt(2));

            // Release for first beneficiary
            await time.increase(20000);
            await vesting.connect(beneficiary).release();

            expect(await vesting.getTotalAllocated()).to.equal(VESTING_AMOUNT);

            // Release for second beneficiary
            await vesting.connect(addr2).release();

            expect(await vesting.getTotalAllocated()).to.equal(0);
        });
    });
});
