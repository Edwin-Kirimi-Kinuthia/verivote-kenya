import { ethers, Contract, JsonRpcProvider, Wallet } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface VoteRecord {
  voteHash: string;
  timestamp: number;
  isSuperseded: boolean;
}

export class BlockchainService {
  private provider: JsonRpcProvider | null = null;
  private signer: Wallet | null = null;
  private sbtContract: Contract | null = null;
  private voteContract: Contract | null = null;

  async connect(): Promise<void> {
    const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545';
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not set in environment');
    }

    this.provider = new JsonRpcProvider(rpcUrl);
    this.signer = new Wallet(privateKey, this.provider);

    const sbtAddress = process.env.SBT_CONTRACT_ADDRESS;
    const voteAddress = process.env.VOTE_CONTRACT_ADDRESS;

    if (!sbtAddress || !voteAddress) {
      throw new Error('Contract addresses not set in environment');
    }

    const sbtAbi = this.loadAbi('SoulBoundToken');
    const voteAbi = this.loadAbi('VoteRecording');

    this.sbtContract = new Contract(sbtAddress, sbtAbi, this.signer);
    this.voteContract = new Contract(voteAddress, voteAbi, this.signer);
  }

  private loadAbi(contractName: string): any[] {
    const artifactPath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'smart-contracts',
      'artifacts',
      'contracts',
      `${contractName}.sol`,
      `${contractName}.json`
    );

    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Artifact not found: ${artifactPath}. Run 'npx hardhat compile' in smart-contracts/`);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    return artifact.abi;
  }

  async mintSBT(voterAddress: string, nationalIdHash: string): Promise<{ tokenId: string; txHash: string }> {
    this.ensureConnected();
    const idHash = ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes(nationalIdHash)));
    const tx = await this.sbtContract!.mint(voterAddress, idHash);
    const receipt = await tx.wait();

    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === 'SBTMinted'
    );
    const tokenId = event ? event.args[1].toString() : 'unknown';

    return { tokenId, txHash: receipt.hash };
  }

  async recordVote(voteHash: string, serialNumber: string): Promise<{ txHash: string }> {
    this.ensureConnected();
    const voteHashBytes = ethers.id(voteHash);
    const serialBytes = ethers.id(serialNumber);

    const tx = await this.voteContract!.recordVote(voteHashBytes, serialBytes);
    const receipt = await tx.wait();

    return { txHash: receipt.hash };
  }

  async getVoteRecord(serialNumber: string): Promise<VoteRecord | null> {
    this.ensureConnected();
    const serialBytes = ethers.id(serialNumber);

    const [voteHash, timestamp, isSuperseded] = await this.voteContract!.getVote(serialBytes);

    if (timestamp === 0n) {
      return null;
    }

    return {
      voteHash,
      timestamp: Number(timestamp),
      isSuperseded,
    };
  }

  async supersedeVote(
    oldSerial: string,
    newSerial: string,
    newHash: string
  ): Promise<{ txHash: string }> {
    this.ensureConnected();
    const oldSerialBytes = ethers.id(oldSerial);
    const newSerialBytes = ethers.id(newSerial);
    const newHashBytes = ethers.id(newHash);

    const tx = await this.voteContract!.supersedeVote(oldSerialBytes, newSerialBytes, newHashBytes);
    const receipt = await tx.wait();

    return { txHash: receipt.hash };
  }

  async hasVoterToken(address: string): Promise<boolean> {
    this.ensureConnected();
    return await this.sbtContract!.hasToken(address);
  }

  async isHealthy(): Promise<boolean> {
    try {
      if (!this.provider) return false;
      await this.provider.getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }

  private ensureConnected(): void {
    if (!this.sbtContract || !this.voteContract) {
      throw new Error('BlockchainService not connected. Call connect() first.');
    }
  }
}

export const blockchainService = new BlockchainService();
