// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BeamReceiver: verifies BEAM price packets on Robinhood Chain
/// @notice A packet is a set of prices signed by the BEAM validator set. Anyone can relay one; the contract
///         recovers every signature, sums the signers' voting power, and stores the prices only if signers
///         hold more than two thirds of total power. Consumers read prices with getPrice / getPriceNoOlderThan.
contract BeamReceiver {
    struct Price { int256 price; uint64 ts; uint64 tunnelId; uint64 seq; }

    address public owner;
    address[] public validators;
    mapping(address => uint256) public powerOf;
    uint256 public totalPower;
    mapping(uint64 => uint64) public lastSeq;           // tunnelId => last relayed sequence
    mapping(bytes32 => Price) internal prices;          // signal id (e.g. "CS:BTC-USD") => latest price, 1e8 fixed point

    event Relayed(uint64 indexed tunnelId, uint64 seq, uint64 ts, uint256 signals, uint256 power, address relayer);
    event ValidatorSetUpdated(uint256 count, uint256 totalPower);

    constructor(address[] memory vals, uint256[] memory powers) { owner = msg.sender; _setValidators(vals, powers); }

    function setValidators(address[] calldata vals, uint256[] calldata powers) external { require(msg.sender == owner, "owner"); _setValidators(vals, powers); }
    function transferOwnership(address to) external { require(msg.sender == owner, "owner"); owner = to; }

    function _setValidators(address[] memory vals, uint256[] memory powers) internal {
        require(vals.length == powers.length && vals.length > 0, "set");
        for (uint256 i = 0; i < validators.length; i++) powerOf[validators[i]] = 0;
        delete validators; totalPower = 0;
        for (uint256 i = 0; i < vals.length; i++) { require(powerOf[vals[i]] == 0 && powers[i] > 0, "dup"); powerOf[vals[i]] = powers[i]; validators.push(vals[i]); totalPower += powers[i]; }
        emit ValidatorSetUpdated(vals.length, totalPower);
    }

    function packetHash(uint64 tunnelId, uint64 seq, uint64 ts, bytes32[] calldata ids, int256[] calldata px) public view returns (bytes32) {
        return keccak256(abi.encodePacked(bytes6("BEAMv1"), block.chainid, address(this), tunnelId, seq, ts, ids, px));
    }

    /// @param sigs 65-byte signatures, ordered by strictly increasing signer address (prevents double counting)
    function relay(uint64 tunnelId, uint64 seq, uint64 ts, bytes32[] calldata ids, int256[] calldata px, bytes[] calldata sigs) external {
        require(ids.length == px.length && ids.length > 0, "len");
        require(seq > lastSeq[tunnelId], "stale seq");
        require(ts <= block.timestamp + 300, "future");
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", packetHash(tunnelId, seq, ts, ids, px)));
        uint256 power; address prev;
        for (uint256 i = 0; i < sigs.length; i++) {
            address s = _recover(digest, sigs[i]);
            require(s > prev, "order"); prev = s;
            power += powerOf[s];
        }
        require(power * 3 > totalPower * 2, "quorum");
        lastSeq[tunnelId] = seq;
        for (uint256 i = 0; i < ids.length; i++) if (ts >= prices[ids[i]].ts) prices[ids[i]] = Price(px[i], ts, tunnelId, seq);
        emit Relayed(tunnelId, seq, ts, ids.length, power, msg.sender);
    }

    function getPrice(bytes32 id) external view returns (int256 price, uint64 ts) { Price memory p = prices[id]; require(p.ts != 0, "no price"); return (p.price, p.ts); }
    function getPriceNoOlderThan(bytes32 id, uint256 maxAge) external view returns (int256 price, uint64 ts) {
        Price memory p = prices[id]; require(p.ts != 0, "no price"); require(block.timestamp - p.ts <= maxAge, "stale"); return (p.price, p.ts);
    }
    function decimals() external pure returns (uint8) { return 8; }
    function validatorCount() external view returns (uint256) { return validators.length; }

    function _recover(bytes32 h, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "sig");
        bytes32 r = bytes32(sig[0:32]); bytes32 s = bytes32(sig[32:64]); uint8 v = uint8(sig[64]);
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "s");
        address a = ecrecover(h, v, r, s); require(a != address(0), "ecrecover"); return a;
    }
}
