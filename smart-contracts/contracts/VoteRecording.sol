// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VoteRecording
 * @notice Records vote hashes on-chain for verifiability.
 *         Only an authorized recorder address can write votes.
 */
contract VoteRecording is Ownable {
    struct VoteRecord {
        bytes32 voteHash;
        uint256 timestamp;
        bool isSuperseded;
    }

    address public recorder;

    // serialNumber → VoteRecord
    mapping(bytes32 => VoteRecord) private _votes;

    event VoteRecorded(bytes32 indexed serialNumber, bytes32 voteHash, uint256 timestamp);
    event VoteSuperseded(bytes32 indexed oldSerial, bytes32 indexed newSerial);
    event RecorderUpdated(address indexed oldRecorder, address indexed newRecorder);

    modifier onlyRecorder() {
        require(msg.sender == recorder, "VoteRecording: caller is not recorder");
        _;
    }

    constructor(address _recorder) Ownable(msg.sender) {
        require(_recorder != address(0), "VoteRecording: zero recorder address");
        recorder = _recorder;
    }

    /**
     * @notice Update the authorized recorder address.
     */
    function setRecorder(address _recorder) external onlyOwner {
        require(_recorder != address(0), "VoteRecording: zero recorder address");
        emit RecorderUpdated(recorder, _recorder);
        recorder = _recorder;
    }

    /**
     * @notice Record a vote hash on-chain.
     */
    function recordVote(bytes32 voteHash, bytes32 serialNumber) external onlyRecorder {
        require(voteHash != bytes32(0), "VoteRecording: empty vote hash");
        require(serialNumber != bytes32(0), "VoteRecording: empty serial number");
        require(_votes[serialNumber].timestamp == 0, "VoteRecording: serial already used");

        _votes[serialNumber] = VoteRecord({
            voteHash: voteHash,
            timestamp: block.timestamp,
            isSuperseded: false
        });

        emit VoteRecorded(serialNumber, voteHash, block.timestamp);
    }

    /**
     * @notice Supersede a previous vote (revote).
     */
    function supersedeVote(
        bytes32 oldSerial,
        bytes32 newSerial,
        bytes32 newHash
    ) external onlyRecorder {
        require(_votes[oldSerial].timestamp != 0, "VoteRecording: old vote not found");
        require(!_votes[oldSerial].isSuperseded, "VoteRecording: already superseded");
        require(_votes[newSerial].timestamp == 0, "VoteRecording: new serial already used");
        require(newHash != bytes32(0), "VoteRecording: empty vote hash");

        _votes[oldSerial].isSuperseded = true;

        _votes[newSerial] = VoteRecord({
            voteHash: newHash,
            timestamp: block.timestamp,
            isSuperseded: false
        });

        emit VoteSuperseded(oldSerial, newSerial);
        emit VoteRecorded(newSerial, newHash, block.timestamp);
    }

    /**
     * @notice Get a vote record by serial number.
     */
    function getVote(bytes32 serialNumber) external view returns (bytes32 voteHash, uint256 timestamp, bool isSuperseded) {
        VoteRecord memory record = _votes[serialNumber];
        return (record.voteHash, record.timestamp, record.isSuperseded);
    }
}
