import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { RECLAIM_WINDOW_SECONDS } from "../client.config";
import { deployStack, ADMIN_DELAY } from "./helpers/deployStack";
import {
  hasTestnetKycRegistry,
  KYC_REGISTRY_ADDRESS_TESTNET,
} from "./helpers/registry";

const NINETY_DAYS = RECLAIM_WINDOW_SECONDS;

describe("DividendDistributor", function () {
  describe("createEpoch", function () {
    it("takes a snapshot and pulls the payment pool", async function () {
      const { operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const holder = holders[0];
      await rwaToken.mint(holder.address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holder.address, true);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);

      await expect(distributor.connect(operator).createEpoch(totalPool))
        .to.emit(distributor, "EpochCreated")
        .withArgs(0, 1, totalPool, ethers.parseEther("100"), NINETY_DAYS);

      const epoch = await distributor.epochs(0);
      expect(epoch.snapshotId).to.equal(1);
      expect(epoch.totalPool).to.equal(totalPool);
      expect(epoch.supplyAt).to.equal(ethers.parseEther("100"));

      expect(
        await paymentToken.balanceOf(await distributor.getAddress())
      ).to.equal(totalPool);
    });

    it("reverts when caller lacks OPERATOR_ROLE", async function () {
      const { holders, paymentToken, distributor } = await deployStack();
      const totalPool = ethers.parseEther("100");

      await paymentToken.mint(holders[0].address, totalPool);
      await paymentToken
        .connect(holders[0])
        .approve(await distributor.getAddress(), totalPool);

      await expect(
        distributor.connect(holders[0]).createEpoch(totalPool)
      ).to.be.reverted;
    });
  });

  describe("distribution", function () {
    it("pays KYC-eligible holders pro-rata", async function () {
      const { operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const alice = holders[0];
      const bob = holders[1];
      await rwaToken.mint(alice.address, ethers.parseEther("300"));
      await rwaToken.mint(bob.address, ethers.parseEther("700"));
      await kycRegistry.setAllowed(alice.address, true);
      await kycRegistry.setAllowed(bob.address, true);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      await distributor
        .connect(operator)
        .distribute(0, [alice.address, bob.address]);

      expect(await paymentToken.balanceOf(alice.address)).to.equal(
        ethers.parseEther("300")
      );
      expect(await paymentToken.balanceOf(bob.address)).to.equal(
        ethers.parseEther("700")
      );

      const epoch = await distributor.epochs(0);
      expect(epoch.distributed).to.equal(totalPool);
      expect(epoch.escrowedTotal).to.equal(0);
    });

    it("escrows ineligible holders and emits Escrowed", async function () {
      const { operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const ineligible = holders[0];
      await rwaToken.mint(ineligible.address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(ineligible.address, false);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      await expect(
        distributor.connect(operator).distribute(0, [ineligible.address])
      )
        .to.emit(distributor, "Escrowed")
        .withArgs(0, ineligible.address, ethers.parseEther("1000"));

      expect(await paymentToken.balanceOf(ineligible.address)).to.equal(0);
      expect(await distributor.escrow(0, ineligible.address)).to.equal(
        ethers.parseEther("1000")
      );

      const epoch = await distributor.epochs(0);
      expect(epoch.escrowedTotal).to.equal(ethers.parseEther("1000"));
      expect(epoch.distributed).to.equal(0);
    });

    it("emits Skipped for zero-balance recipients", async function () {
      const { operator, holders, paymentToken, rwaToken, distributor } =
        await deployStack();

      const holder = holders[0];
      await rwaToken.mint(holder.address, ethers.parseEther("100"));

      const totalPool = ethers.parseEther("500");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      const stranger = holders[5];
      await expect(
        distributor.connect(operator).distribute(0, [stranger.address])
      )
        .to.emit(distributor, "Skipped")
        .withArgs(0, stranger.address, "zero balance");
    });

    it("prevents double-claim via distribute then claim", async function () {
      const { operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const holder = holders[0];
      await rwaToken.mint(holder.address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holder.address, true);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      await distributor.connect(operator).distribute(0, [holder.address]);
      await expect(distributor.connect(holder).claim(0)).to.be.revertedWithCustomError(
        distributor,
        "AlreadyClaimed"
      );
    });

    it("skips already-claimed holders in batch distribute (no double pay, no DoS)", async function () {
      const { operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const holder = holders[0];
      const other = holders[1];
      await rwaToken.mint(holder.address, ethers.parseEther("100"));
      await rwaToken.mint(other.address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holder.address, true);
      await kycRegistry.setAllowed(other.address, true);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      // Holder front-runs the batch with a self-claim.
      await distributor.connect(holder).claim(0);
      const balanceAfterClaim = await paymentToken.balanceOf(holder.address);

      // Batch still succeeds: front-runner is skipped, rest are paid.
      await expect(
        distributor.connect(operator).distribute(0, [holder.address, other.address])
      )
        .to.emit(distributor, "Skipped")
        .withArgs(0, holder.address, "already claimed");

      expect(await paymentToken.balanceOf(holder.address)).to.equal(
        balanceAfterClaim
      );
      expect(await paymentToken.balanceOf(other.address)).to.equal(
        ethers.parseEther("500")
      );
    });

    it("skips duplicate addresses within one batch without double paying", async function () {
      const { operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const holder = holders[0];
      await rwaToken.mint(holder.address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holder.address, true);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      await expect(
        distributor
          .connect(operator)
          .distribute(0, [holder.address, holder.address])
      )
        .to.emit(distributor, "Skipped")
        .withArgs(0, holder.address, "already claimed");

      expect(await paymentToken.balanceOf(holder.address)).to.equal(totalPool);
    });
  });

  describe("escrow lifecycle", function () {
    it("allows claimEscrow after KYC becomes eligible", async function () {
      const { operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const holder = holders[0];
      await rwaToken.mint(holder.address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holder.address, false);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);
      await distributor.connect(operator).distribute(0, [holder.address]);

      await kycRegistry.setAllowed(holder.address, true);

      await expect(distributor.connect(holder).claimEscrow(0))
        .to.emit(distributor, "EscrowClaimed")
        .withArgs(0, holder.address, ethers.parseEther("1000"));

      expect(await paymentToken.balanceOf(holder.address)).to.equal(
        ethers.parseEther("1000")
      );
      expect(await distributor.escrow(0, holder.address)).to.equal(0);
    });

    it("reverts claimEscrow when still ineligible", async function () {
      const { operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const holder = holders[0];
      await rwaToken.mint(holder.address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holder.address, false);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);
      await distributor.connect(operator).distribute(0, [holder.address]);

      await expect(
        distributor.connect(holder).claimEscrow(0)
      ).to.be.revertedWithCustomError(distributor, "NotKycAllowed");
    });

    it("reverts claimEscrow after reclaim window expires", async function () {
      const { operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const holder = holders[0];
      await rwaToken.mint(holder.address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holder.address, false);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);
      await distributor.connect(operator).distribute(0, [holder.address]);

      await kycRegistry.setAllowed(holder.address, true);
      await time.increase(NINETY_DAYS + 1n);

      await expect(
        distributor.connect(holder).claimEscrow(0)
      ).to.be.revertedWithCustomError(distributor, "EscrowClaimWindowExpired");
    });
  });

  describe("reclaim", function () {
    it("reverts before reclaim window elapses", async function () {
      const { owner, operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const holder = holders[0];
      await rwaToken.mint(holder.address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holder.address, false);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);
      await distributor.connect(operator).distribute(0, [holder.address]);

      await expect(
        distributor.connect(owner).reclaim(0, owner.address)
      ).to.be.revertedWithCustomError(distributor, "ReclaimWindowActive");
    });

    it("transfers unclaimed escrow to the given treasury after window", async function () {
      const { owner, operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const holder = holders[0];
      await rwaToken.mint(holder.address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holder.address, false);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);
      await distributor.connect(operator).distribute(0, [holder.address]);

      await time.increase(NINETY_DAYS + 1n);

      const treasury = holders[5];
      const treasuryBalanceBefore = await paymentToken.balanceOf(treasury.address);
      await expect(distributor.connect(owner).reclaim(0, treasury.address))
        .to.emit(distributor, "Reclaimed")
        .withArgs(0, treasury.address, ethers.parseEther("1000"));

      const treasuryBalanceAfter = await paymentToken.balanceOf(treasury.address);
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(
        ethers.parseEther("1000")
      );

      // Epoch is closed: settlement and escrow claims revert.
      await expect(
        distributor.connect(holder).claimEscrow(0)
      ).to.be.revertedWithCustomError(distributor, "EpochReclaimed");
      await expect(
        distributor.connect(operator).distribute(0, [holder.address])
      ).to.be.revertedWithCustomError(distributor, "EpochReclaimed");
      await expect(
        distributor.connect(owner).reclaim(0, treasury.address)
      ).to.be.revertedWithCustomError(distributor, "EpochReclaimed");
    });

    it("reverts reclaim to the zero address", async function () {
      const { owner, distributor } = await deployStack();
      await expect(
        distributor.connect(owner).reclaim(0, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(distributor, "ZeroAddress");
    });

    it("reverts reclaim for an invalid epoch", async function () {
      const { owner, distributor } = await deployStack();
      await expect(
        distributor.connect(owner).reclaim(42, owner.address)
      ).to.be.revertedWithCustomError(distributor, "InvalidEpoch");
    });
  });

  describe("math invariant", function () {
    it("distributed plus escrowed equals total pool after full settlement", async function () {
      const { operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const recipients = holders.slice(0, 5);
      const balances = [
        ethers.parseEther("100"),
        ethers.parseEther("200"),
        ethers.parseEther("300"),
        ethers.parseEther("250"),
        ethers.parseEther("150"),
      ];

      for (let i = 0; i < recipients.length; i++) {
        await rwaToken.mint(recipients[i].address, balances[i]);
        await kycRegistry.setAllowed(
          recipients[i].address,
          i % 2 === 0
        );
      }

      const totalPool = ethers.parseEther("10000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      const addresses = recipients.map((s) => s.address);
      await distributor.connect(operator).distribute(0, addresses);

      const epoch = await distributor.epochs(0);
      expect(epoch.distributed + epoch.escrowedTotal).to.equal(totalPool);
    });
  });

  describe("admin", function () {
    it("updates reclaim window", async function () {
      const { owner, distributor } = await deployStack();
      const newWindow = 30n * 24n * 60n * 60n;

      await expect(distributor.connect(owner).setReclaimWindow(newWindow))
        .to.emit(distributor, "ReclaimWindowUpdated")
        .withArgs(NINETY_DAYS, newWindow);

      expect(await distributor.reclaimWindow()).to.equal(newWindow);
    });

    it("reverts setReclaimWindow(0)", async function () {
      const { owner, distributor } = await deployStack();
      await expect(
        distributor.connect(owner).setReclaimWindow(0)
      ).to.be.revertedWithCustomError(distributor, "ZeroWindow");
    });

    it("window changes do not affect already-created epochs", async function () {
      const { owner, operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const holder = holders[0];
      await rwaToken.mint(holder.address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holder.address, false);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);
      await distributor.connect(operator).distribute(0, [holder.address]);

      // Admin shortens the global window to 1 second AFTER the epoch exists.
      await distributor.connect(owner).setReclaimWindow(1);
      await time.increase(2);

      // Epoch 0 keeps its original 90-day window: reclaim is still blocked
      // and the escrowed holder can still claim once KYC'd.
      await expect(
        distributor.connect(owner).reclaim(0, owner.address)
      ).to.be.revertedWithCustomError(distributor, "ReclaimWindowActive");

      await kycRegistry.setAllowed(holder.address, true);
      await expect(distributor.connect(holder).claimEscrow(0))
        .to.emit(distributor, "EscrowClaimed")
        .withArgs(0, holder.address, totalPool);

      const epoch = await distributor.epochs(0);
      expect(epoch.reclaimWindow).to.equal(NINETY_DAYS);
    });

    it("new epochs use the updated window", async function () {
      const { owner, operator, holders, paymentToken, rwaToken, distributor } =
        await deployStack();

      await rwaToken.mint(holders[0].address, ethers.parseEther("100"));
      const newWindow = 7n * 24n * 60n * 60n;
      await distributor.connect(owner).setReclaimWindow(newWindow);

      const totalPool = ethers.parseEther("100");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      const epoch = await distributor.epochs(0);
      expect(epoch.reclaimWindow).to.equal(newWindow);
    });

    it("reverts distribute for non-operator", async function () {
      const { operator, holders, paymentToken, rwaToken, distributor } =
        await deployStack();

      const totalPool = ethers.parseEther("100");
      await rwaToken.mint(holders[0].address, ethers.parseEther("100"));
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      await expect(
        distributor.connect(holders[0]).distribute(0, [holders[0].address])
      ).to.be.reverted;
    });
  });

  describe("deployment validation", function () {
    it("reverts on zero addresses or zero window", async function () {
      const { owner, operator, rwaToken, paymentToken, kycRegistry, distributor } =
        await deployStack();
      const rwa = await rwaToken.getAddress();
      const pay = await paymentToken.getAddress();
      const kyc = await kycRegistry.getAddress();
      const factory = await ethers.getContractFactory("DividendDistributor");
      const args = [
        rwa,
        pay,
        kyc,
        NINETY_DAYS,
        owner.address,
        operator.address,
        ADMIN_DELAY,
      ] as const;

      await expect(
        ethers.deployContract("DividendDistributor", [
          ethers.ZeroAddress,
          pay,
          kyc,
          NINETY_DAYS,
          owner.address,
          operator.address,
          ADMIN_DELAY,
        ])
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
      await expect(
        ethers.deployContract("DividendDistributor", [
          rwa,
          ethers.ZeroAddress,
          kyc,
          NINETY_DAYS,
          owner.address,
          operator.address,
          ADMIN_DELAY,
        ])
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
      await expect(
        ethers.deployContract("DividendDistributor", [
          rwa,
          pay,
          ethers.ZeroAddress,
          NINETY_DAYS,
          owner.address,
          operator.address,
          ADMIN_DELAY,
        ])
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
      await expect(
        ethers.deployContract("DividendDistributor", [
          rwa,
          pay,
          kyc,
          0,
          owner.address,
          operator.address,
          ADMIN_DELAY,
        ])
      ).to.be.revertedWithCustomError(factory, "ZeroWindow");
      void args;
      void distributor;
    });

    it("reverts createEpoch with zero pool and invalid epoch interactions", async function () {
      const { operator, holders, paymentToken, distributor } = await deployStack();

      await expect(
        distributor.connect(operator).createEpoch(0)
      ).to.be.revertedWithCustomError(distributor, "ZeroAmount");

      // Zero token supply at snapshot.
      await paymentToken.mint(operator.address, 1n);
      await paymentToken.connect(operator).approve(await distributor.getAddress(), 1n);
      await expect(
        distributor.connect(operator).createEpoch(1n)
      ).to.be.revertedWithCustomError(distributor, "ZeroSupply");

      expect(await distributor.epochCount()).to.equal(0);

      await expect(
        distributor.connect(operator).distribute(7, [holders[0].address])
      ).to.be.revertedWithCustomError(distributor, "InvalidEpoch");
      await expect(
        distributor.connect(holders[0]).claim(7)
      ).to.be.revertedWithCustomError(distributor, "InvalidEpoch");
      await expect(
        distributor.connect(holders[0]).claimEscrow(7)
      ).to.be.revertedWithCustomError(distributor, "InvalidEpoch");
      await expect(
        distributor.entitlement(7, holders[0].address)
      ).to.be.revertedWithCustomError(distributor, "InvalidEpoch");
    });

    it("entitlement reports 0 once an account is settled", async function () {
      const { operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      const holder = holders[0];
      await rwaToken.mint(holder.address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holder.address, true);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      expect(await distributor.entitlement(0, holder.address)).to.equal(totalPool);
      await distributor.connect(holder).claim(0);
      expect(await distributor.entitlement(0, holder.address)).to.equal(0);
    });

    it("reverts claimEscrow with no escrow balance", async function () {
      const { operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      await rwaToken.mint(holders[0].address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holders[0].address, true);

      const totalPool = ethers.parseEther("100");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      await expect(
        distributor.connect(holders[1]).claimEscrow(0)
      ).to.be.revertedWithCustomError(distributor, "NoEscrowBalance");
    });
  });

  describe("testnet registry integration", function () {
    before(function () {
      if (process.env.RUN_FORK_TESTS_TESTNET !== "1") {
        this.skip();
      }
      if (!hasTestnetKycRegistry()) {
        this.skip();
      }
    });

    it("calls isAllowed on the live testnet KYC registry during settlement", async function () {
      const testnetRegistry = KYC_REGISTRY_ADDRESS_TESTNET!;
      const [owner, operator, holder] = await ethers.getSigners();

      const paymentToken = await ethers.deployContract("MockStableCoin");
      const rwaToken = await ethers.deployContract("RWAToken", [
        "RWA REIT",
        "RREIT",
        0,
        owner.address,
        testnetRegistry,
        ADMIN_DELAY,
      ]);
      const distributor = await ethers.deployContract("DividendDistributor", [
        await rwaToken.getAddress(),
        await paymentToken.getAddress(),
        testnetRegistry,
        NINETY_DAYS,
        owner.address,
        operator.address,
        ADMIN_DELAY,
      ]);

      const snapshotRole = await rwaToken.SNAPSHOT_ROLE();
      await rwaToken.grantRole(snapshotRole, await distributor.getAddress());

      const minterRole = await rwaToken.MINTER_ROLE();
      await rwaToken.grantRole(minterRole, owner.address);

      await rwaToken.mint(holder.address, ethers.parseEther("100"));

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      const kycRegistry = await ethers.getContractAt(
        "IKYCRegistry",
        testnetRegistry
      );
      const isAllowed = await kycRegistry.isAllowed(holder.address);

      await distributor.connect(operator).distribute(0, [holder.address]);

      const epoch = await distributor.epochs(0);
      if (isAllowed) {
        expect(epoch.distributed).to.equal(ethers.parseEther("1000"));
        expect(epoch.escrowedTotal).to.equal(0);
      } else {
        expect(epoch.distributed).to.equal(0);
        expect(epoch.escrowedTotal).to.equal(ethers.parseEther("1000"));
      }
      expect(epoch.distributed + epoch.escrowedTotal).to.equal(totalPool);
    });
  });

  describe("pause and rescue", function () {
    it("blocks distribute and claim while paused", async function () {
      const { owner, operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      await rwaToken.mint(holders[0].address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holders[0].address, true);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      await distributor.connect(owner).pause();

      await expect(
        distributor.connect(operator).distribute(0, [holders[0].address])
      ).to.be.revertedWith("Pausable: paused");
      await expect(distributor.connect(holders[0]).claim(0)).to.be.revertedWith(
        "Pausable: paused"
      );

      await distributor.connect(owner).unpause();
      await distributor.connect(holders[0]).claim(0);
    });

    it("blocks reclaim while paused (cannot freeze escrow then sweep)", async function () {
      const { owner, operator, holders, kycRegistry, paymentToken, rwaToken, distributor } =
        await deployStack();

      await rwaToken.mint(holders[0].address, ethers.parseEther("100"));
      await kycRegistry.setAllowed(holders[0].address, false);

      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool);
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);
      await distributor.connect(operator).distribute(0, [holders[0].address]);

      await distributor.connect(owner).pause();
      await time.increase(NINETY_DAYS + 1n);

      await expect(
        distributor.connect(owner).reclaim(0, owner.address)
      ).to.be.revertedWith("Pausable: paused");

      await distributor.connect(owner).unpause();
      await distributor.connect(owner).reclaim(0, owner.address);
    });

    it("rescueToken sweeps stray dividend tokens but not accounted balance", async function () {
      const { owner, operator, holders, paymentToken, rwaToken, distributor } =
        await deployStack();

      await rwaToken.mint(holders[0].address, ethers.parseEther("100"));
      const totalPool = ethers.parseEther("1000");
      await paymentToken.mint(operator.address, totalPool + ethers.parseEther("5"));
      await paymentToken
        .connect(operator)
        .approve(await distributor.getAddress(), totalPool);
      await distributor.connect(operator).createEpoch(totalPool);

      // Simulate stray transfer of 5 tokens.
      await paymentToken
        .connect(operator)
        .transfer(await distributor.getAddress(), ethers.parseEther("5"));

      await expect(
        distributor
          .connect(owner)
          .rescueToken(
            await paymentToken.getAddress(),
            ethers.parseEther("1000"),
            owner.address
          )
      ).to.be.revertedWithCustomError(distributor, "InsufficientRescuableBalance");

      await distributor
        .connect(owner)
        .rescueToken(
          await paymentToken.getAddress(),
          ethers.parseEther("5"),
          owner.address
        );
    });

    it("updates kyc registry address", async function () {
      const { owner, kycRegistry, distributor } = await deployStack();
      const newRegistry = await ethers.deployContract("MockKYCRegistry");
      const newAddr = await newRegistry.getAddress();
      const oldAddr = await kycRegistry.getAddress();

      await expect(distributor.connect(owner).setKycRegistry(newAddr))
        .to.emit(distributor, "KycRegistryUpdated")
        .withArgs(oldAddr, newAddr);
    });
  });
});
