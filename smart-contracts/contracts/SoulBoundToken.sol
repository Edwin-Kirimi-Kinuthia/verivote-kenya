// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SoulBoundToken
 * @notice Non-transferable ERC721 token representing voter identity.
 *         Each voter receives exactly one SBT tied to their national ID hash.
 */
contract SoulBoundToken is ERC721, Ownable {
    uint256 private _nextTokenId;

    // nationalIdHash → tokenId (0 means not minted)
    mapping(uint256 => uint256) private _idHashToToken;
    // tokenId → nationalIdHash
    mapping(uint256 => uint256) private _tokenToIdHash;
    // address → has active token
    mapping(address => bool) private _hasActiveToken;

    event SBTMinted(address indexed to, uint256 indexed tokenId);
    event SBTRevoked(address indexed from, uint256 indexed tokenId);

    constructor() ERC721("VeriVote Voter ID", "VVID") Ownable(msg.sender) {
        _nextTokenId = 1;
    }

    /**
     * @notice Mint an SBT to a voter. One per national ID hash.
     */
    function mint(address to, uint256 nationalIdHash) external onlyOwner returns (uint256) {
        require(to != address(0), "SBT: mint to zero address");
        require(_idHashToToken[nationalIdHash] == 0, "SBT: already minted for this ID");
        require(!_hasActiveToken[to], "SBT: address already has token");

        uint256 tokenId = _nextTokenId++;
        _idHashToToken[nationalIdHash] = tokenId;
        _tokenToIdHash[tokenId] = nationalIdHash;
        _hasActiveToken[to] = true;

        _mint(to, tokenId);

        emit SBTMinted(to, tokenId);
        return tokenId;
    }

    /**
     * @notice Revoke an SBT (admin use for voter suspension).
     */
    function revoke(uint256 tokenId) external onlyOwner {
        address owner = ownerOf(tokenId);
        uint256 idHash = _tokenToIdHash[tokenId];

        _hasActiveToken[owner] = false;
        delete _idHashToToken[idHash];
        delete _tokenToIdHash[tokenId];

        _burn(tokenId);

        emit SBTRevoked(owner, tokenId);
    }

    /**
     * @notice Check if an address holds an active SBT.
     */
    function hasToken(address voter) external view returns (bool) {
        return _hasActiveToken[voter];
    }

    // --- Block all transfers ---

    function transferFrom(address, address, uint256) public pure override {
        revert("SBT: non-transferable");
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert("SBT: non-transferable");
    }

    function approve(address, uint256) public pure override {
        revert("SBT: non-transferable");
    }

    function setApprovalForAll(address, bool) public pure override {
        revert("SBT: non-transferable");
    }
}
