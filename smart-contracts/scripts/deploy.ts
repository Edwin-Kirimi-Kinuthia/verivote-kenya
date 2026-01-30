import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy SoulBoundToken
  const SBT = await ethers.getContractFactory("SoulBoundToken");
  const sbt = await SBT.deploy();
  await sbt.waitForDeployment();
  const sbtAddress = await sbt.getAddress();
  console.log("SoulBoundToken deployed to:", sbtAddress);

  // Deploy VoteRecording (deployer is the initial recorder)
  const VoteRecording = await ethers.getContractFactory("VoteRecording");
  const voteRecording = await VoteRecording.deploy(deployer.address);
  await voteRecording.waitForDeployment();
  const voteAddress = await voteRecording.getAddress();
  console.log("VoteRecording deployed to:", voteAddress);

  // Save deployment addresses
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deployment = {
    network: "localhost",
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      SoulBoundToken: sbtAddress,
      VoteRecording: voteAddress,
    },
  };

  fs.writeFileSync(
    path.join(deploymentsDir, "localhost.json"),
    JSON.stringify(deployment, null, 2)
  );

  console.log("Deployment addresses saved to deployments/localhost.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
