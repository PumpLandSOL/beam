// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The validator set a BeamReceiver already holds; BeamVRF verifies randomness against the same signers.
interface IBeamValidators {
    function powerOf(address validator) external view returns (uint256);
    function totalPower() external view returns (uint256);
}

/// @notice Implement this to receive randomness pushed by BeamVRF.fulfil.
interface IBeamVRFConsumer {
    function onBeamRandomness(uint64 requestId, bytes32 randomness) external;
}

/// @title BeamVRF: verifiable randomness from the BEAM validator set on Robinhood Chain
/// @notice A request (POST /api/vrf) names a seed. The first round after it fixes roundHash, and every validator signs
///         alpha = keccak256(abi.encodePacked(bytes7("BEAMvrf"), chainId, requestId, seed, roundHash)) (EIP-191).
///         randomness = keccak256(sig_1 ‖ sig_2 ‖ …), signatures ordered by increasing signer address. This contract
///         recovers every signature, requires more than two thirds of BeamReceiver's voting power, and recomputes the
///         value, so a relayer can deliver randomness but cannot choose it.
contract BeamVRF {
    IBeamValidators public immutable beam;
    mapping(uint64 => bytes32) public randomnessOf;   // requestId => verified randomness (0 until fulfilled)
    mapping(uint64 => bytes32) public seedOf;         // requestId => seed it was fulfilled for

    event Fulfilled(uint64 indexed requestId, bytes32 seed, bytes32 roundHash, bytes32 randomness, uint256 power, address consumer);

    constructor(address receiver) { beam = IBeamValidators(receiver); }

    function alpha(uint64 requestId, bytes32 seed, bytes32 roundHash) public view returns (bytes32) {
        return keccak256(abi.encodePacked(bytes7("BEAMvrf"), block.chainid, requestId, seed, roundHash));
    }

    /// @return randomness the verified value; reverts unless signers hold more than 2/3 of power
    function verify(uint64 requestId, bytes32 seed, bytes32 roundHash, bytes[] calldata sigs) public view returns (bytes32 randomness) { (randomness, ) = _verify(requestId, seed, roundHash, sigs); }

    function _verify(uint64 requestId, bytes32 seed, bytes32 roundHash, bytes[] calldata sigs) internal view returns (bytes32, uint256) {
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", alpha(requestId, seed, roundHash)));
        uint256 power; address prev; bytes memory all;
        for (uint256 i = 0; i < sigs.length; i++) {
            address s = _recover(digest, sigs[i]);
            require(s > prev, "order"); prev = s;
            power += beam.powerOf(s);
            all = bytes.concat(all, sigs[i]);
        }
        require(power * 3 > beam.totalPower() * 2, "quorum");
        return (keccak256(all), power);
    }

    /// @notice Store verified randomness for a request and optionally push it to a consumer contract.
    function fulfil(uint64 requestId, bytes32 seed, bytes32 roundHash, bytes[] calldata sigs, address consumer) external returns (bytes32 randomness) {
        require(randomnessOf[requestId] == bytes32(0), "fulfilled");
        uint256 power; (randomness, power) = _verify(requestId, seed, roundHash, sigs);
        randomnessOf[requestId] = randomness; seedOf[requestId] = seed;
        emit Fulfilled(requestId, seed, roundHash, randomness, power, consumer);
        if (consumer != address(0)) IBeamVRFConsumer(consumer).onBeamRandomness(requestId, randomness);
    }

    function _recover(bytes32 h, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "sig");
        bytes32 r = bytes32(sig[0:32]); bytes32 s = bytes32(sig[32:64]); uint8 v = uint8(sig[64]);
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "s");
        address a = ecrecover(h, v, r, s); require(a != address(0), "ecrecover"); return a;
    }
}

/// @notice Example consumer: a raffle that draws a winner from BEAM randomness.
contract BeamRaffleExample is IBeamVRFConsumer {
    address public immutable vrf; address[] public entrants; address public winner; uint64 public requestId;
    constructor(address beamVRF) { vrf = beamVRF; }
    function enter() external { require(winner == address(0), "drawn"); entrants.push(msg.sender); }
    /// @param id the request id returned by POST /api/vrf, committed before the draw round closes
    function commit(uint64 id) external { require(requestId == 0, "committed"); requestId = id; }
    function onBeamRandomness(uint64 id, bytes32 randomness) external {
        require(msg.sender == vrf && id == requestId && winner == address(0) && entrants.length > 0, "bad");
        winner = entrants[uint256(randomness) % entrants.length];
    }
}
