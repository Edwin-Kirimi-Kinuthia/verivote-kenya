import { expect } from "chai";
import { ethers } from "hardhat";
import { VoteRecording } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("VoteRecording", function () {
  let voteRecording: VoteRecording;
  let owner: HardhatEthersSigner;
  let recorder: HardhatEthersSigner;
  let unauthorized: HardhatEthersSigner;

  const VOTE_HASH = ethers.id("vote-data-1");
  const SERIAL_1 = ethers.id("serial-001");
  const SERIAL_2 = ethers.id("serial-002");

  beforeEach(async function () {
    [owner, recorder, unauthorized] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("VoteRecording");
    voteRecording = await factory.deploy(recorder.address);
  });

  describe("Recording votes", function () {
    it("should record a vote", async function () {
      const tx = await voteRecording.connect(recorder).recordVote(VOTE_HASH, SERIAL_1);
      await expect(tx)
        .to.emit(voteRecording, "VoteRecorded")
        .withArgs(SERIAL_1, VOTE_HASH, await getBlockTimestamp(tx));
    });

    it("should retrieve a recorded vote", async function () {
      await voteRecording.connect(recorder).recordVote(VOTE_HASH, SERIAL_1);
      const [voteHash, timestamp, isSuperseded] = await voteRecording.getVote(SERIAL_1);

      expect(voteHash).to.equal(VOTE_HASH);
      expect(timestamp).to.be.gt(0);
      expect(isSuperseded).to.be.false;
    });

    it("should reject duplicate serial number", async function () {
      await voteRecording.connect(recorder).recordVote(VOTE_HASH, SERIAL_1);
      await expect(
        voteRecording.connect(recorder).recordVote(VOTE_HASH, SERIAL_1)
      ).to.be.revertedWith("VoteRecording: serial already used");
    });
  });

  describe("Authorization", function () {
    it("should reject unauthorized recorder", async function () {
      await expect(
        voteRecording.connect(unauthorized).recordVote(VOTE_HASH, SERIAL_1)
      ).to.be.revertedWith("VoteRecording: caller is not recorder");
    });

    it("should allow owner to update recorder", async function () {
      await voteRecording.setRecorder(unauthorized.address);
      await expect(
        voteRecording.connect(unauthorized).recordVote(VOTE_HASH, SERIAL_1)
      ).to.not.be.reverted;
    });
  });

  describe("Superseding votes", function () {
    it("should supersede a vote", async function () {
      const newHash = ethers.id("vote-data-2");
      await voteRecording.connect(recorder).recordVote(VOTE_HASH, SERIAL_1);

      await voteRecording.connect(recorder).supersedeVote(SERIAL_1, SERIAL_2, newHash);

      const [, , isSuperseded] = await voteRecording.getVote(SERIAL_1);
      expect(isSuperseded).to.be.true;

      const [voteHash, timestamp, newIsSuperseded] = await voteRecording.getVote(SERIAL_2);
      expect(voteHash).to.equal(newHash);
      expect(timestamp).to.be.gt(0);
      expect(newIsSuperseded).to.be.false;
    });

    it("should reject superseding non-existent vote", async function () {
      await expect(
        voteRecording.connect(recorder).supersedeVote(SERIAL_1, SERIAL_2, VOTE_HASH)
      ).to.be.revertedWith("VoteRecording: old vote not found");
    });

    it("should reject superseding already-superseded vote", async function () {
      const newHash = ethers.id("vote-data-2");
      const serial3 = ethers.id("serial-003");

      await voteRecording.connect(recorder).recordVote(VOTE_HASH, SERIAL_1);
      await voteRecording.connect(recorder).supersedeVote(SERIAL_1, SERIAL_2, newHash);

      await expect(
        voteRecording.connect(recorder).supersedeVote(SERIAL_1, serial3, newHash)
      ).to.be.revertedWith("VoteRecording: already superseded");
    });
  });

  async function getBlockTimestamp(tx: any): Promise<number> {
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    return block!.timestamp;
  }
});
