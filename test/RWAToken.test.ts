import { expect } from "chai";
import { ethers } from "hardhat";
import { ADMIN_DELAY } from "./helpers/deployStack";

describe("RWAToken", function () {
  async function deployToken(cap = 0n) {
    const [admin, user, other] = await ethers.getSigners();
    const kycRegistry = await ethers.deployContract("MockKYCRegistry");
    const token = await ethers.deployContract("RWAToken", [
      "RWA",
      "RWA",
      cap,
      admin.address,
      await kycRegistry.getAddress(),
      ADMIN_DELAY,
    ]);
    return { admin, user, other, kycRegistry, token };
  }

  it("enforces supply cap", async function () {
    const { admin, user, token } = await deployToken(ethers.parseEther("100"));
    await token.connect(admin).mint(user.address, ethers.parseEther("100"));
    await expect(
      token.connect(admin).mint(user.address, 1n)
    ).to.be.revertedWithCustomError(token, "CapExceeded");
  });

  it("allows burn", async function () {
    const { admin, user, token } = await deployToken();
    await token.connect(admin).mint(user.address, ethers.parseEther("10"));
    await token.connect(user).burn(ethers.parseEther("3"));
    expect(await token.balanceOf(user.address)).to.equal(ethers.parseEther("7"));
  });

  it("blocks transfers while paused", async function () {
    const { admin, user, other, kycRegistry, token } = await deployToken();
    await kycRegistry.setAllowed(user.address, true);
    await kycRegistry.setAllowed(other.address, true);
    await token.connect(admin).mint(user.address, ethers.parseEther("10"));
    await token.connect(admin).pause();
    await expect(
      token.connect(user).transfer(other.address, 1n)
    ).to.be.revertedWith("Pausable: paused");
    await token.connect(admin).unpause();
    await token.connect(user).transfer(other.address, 1n);
  });

  it("blocks transfers when KYC gating is enabled", async function () {
    const { admin, user, other, kycRegistry, token } = await deployToken();
    await token.connect(admin).mint(user.address, ethers.parseEther("10"));
    await token.connect(admin).setKycTransfersEnabled(true);
    await kycRegistry.setAllowed(other.address, true);

    await expect(
      token.connect(user).transfer(other.address, 1n)
    ).to.be.revertedWithCustomError(token, "NotKycAllowed");

    await kycRegistry.setAllowed(user.address, true);
    await token.connect(user).transfer(other.address, 1n);
  });

  it("blocks transfers to non-KYC recipients when gating is enabled", async function () {
    const { admin, user, other, kycRegistry, token } = await deployToken();
    await token.connect(admin).mint(user.address, ethers.parseEther("10"));
    await token.connect(admin).setKycTransfersEnabled(true);
    await kycRegistry.setAllowed(user.address, true);

    // sender allowed, recipient not → must hit the `to` branch
    await expect(
      token.connect(user).transfer(other.address, 1n)
    ).to.be.revertedWithCustomError(token, "NotKycAllowed");
  });

  it("reports cap and updates the KYC registry", async function () {
    const { admin, user, kycRegistry, token } = await deployToken(
      ethers.parseEther("500")
    );
    expect(await token.cap()).to.equal(ethers.parseEther("500"));

    const newRegistry = await ethers.deployContract("MockKYCRegistry");
    await expect(
      token.connect(admin).setKycRegistry(await newRegistry.getAddress())
    )
      .to.emit(token, "KycRegistryUpdated")
      .withArgs(await kycRegistry.getAddress(), await newRegistry.getAddress());
    expect(await token.kycRegistry()).to.equal(await newRegistry.getAddress());

    // setting registry to zero disables gating even when the flag is on
    await token.connect(admin).setKycRegistry(ethers.ZeroAddress);
    await token.connect(admin).setKycTransfersEnabled(true);
    await token.connect(admin).mint(user.address, 1n);

    await expect(
      token.connect(user).setKycRegistry(ethers.ZeroAddress)
    ).to.be.reverted;
  });

  it("supports two-step admin transfer", async function () {
    const { admin, other, token } = await deployToken();
    await token.beginDefaultAdminTransfer(other.address);
    await ethers.provider.send("evm_increaseTime", [1]);
    await ethers.provider.send("evm_mine", []);
    await token.connect(other).acceptDefaultAdminTransfer();
    expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), other.address)).to.be
      .true;
  });
});
