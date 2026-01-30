import { expect } from "chai";
import { ethers } from "hardhat";
import { SoulBoundToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("SoulBoundToken", function () {
  let sbt: SoulBoundToken;
  let owner: HardhatEthersSigner;
  let voter1: HardhatEthersSigner;
  let voter2: HardhatEthersSigner;

  const ID_HASH_1 = 12345n;
  const ID_HASH_2 = 67890n;

  beforeEach(async function () {
    [owner, voter1, voter2] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("SoulBoundToken");
    sbt = await factory.deploy();
  });

  describe("Minting", function () {
    it("should mint an SBT to a voter", async function () {
      const tx = await sbt.mint(voter1.address, ID_HASH_1);
      await expect(tx)
        .to.emit(sbt, "SBTMinted")
        .withArgs(voter1.address, 1);

      expect(await sbt.hasToken(voter1.address)).to.be.true;
      expect(await sbt.ownerOf(1)).to.equal(voter1.address);
    });

    it("should prevent double-minting for same national ID hash", async function () {
      await sbt.mint(voter1.address, ID_HASH_1);
      await expect(sbt.mint(voter2.address, ID_HASH_1))
        .to.be.revertedWith("SBT: already minted for this ID");
    });

    it("should prevent minting second token to same address", async function () {
      await sbt.mint(voter1.address, ID_HASH_1);
      await expect(sbt.mint(voter1.address, ID_HASH_2))
        .to.be.revertedWith("SBT: address already has token");
    });

    it("should reject mint from non-owner", async function () {
      await expect(sbt.connect(voter1).mint(voter1.address, ID_HASH_1))
        .to.be.revertedWithCustomError(sbt, "OwnableUnauthorizedAccount");
    });
  });

  describe("Non-transferable", function () {
    beforeEach(async function () {
      await sbt.mint(voter1.address, ID_HASH_1);
    });

    it("should revert transferFrom", async function () {
      await expect(sbt.transferFrom(voter1.address, voter2.address, 1))
        .to.be.revertedWith("SBT: non-transferable");
    });

    it("should revert safeTransferFrom", async function () {
      await expect(
        sbt["safeTransferFrom(address,address,uint256,bytes)"](
          voter1.address, voter2.address, 1, "0x"
        )
      ).to.be.revertedWith("SBT: non-transferable");
    });

    it("should revert approve", async function () {
      await expect(sbt.approve(voter2.address, 1))
        .to.be.revertedWith("SBT: non-transferable");
    });

    it("should revert setApprovalForAll", async function () {
      await expect(sbt.setApprovalForAll(voter2.address, true))
        .to.be.revertedWith("SBT: non-transferable");
    });
  });

  describe("Revocation", function () {
    it("should revoke an SBT", async function () {
      await sbt.mint(voter1.address, ID_HASH_1);

      const tx = await sbt.revoke(1);
      await expect(tx)
        .to.emit(sbt, "SBTRevoked")
        .withArgs(voter1.address, 1);

      expect(await sbt.hasToken(voter1.address)).to.be.false;
    });

    it("should reject revoke from non-owner", async function () {
      await sbt.mint(voter1.address, ID_HASH_1);
      await expect(sbt.connect(voter1).revoke(1))
        .to.be.revertedWithCustomError(sbt, "OwnableUnauthorizedAccount");
    });
  });
});
