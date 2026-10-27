// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 { function transferFrom(address, address, uint256) external returns (bool); function transfer(address, uint256) external returns (bool); }

/// @title BeamStaking: stake $BEAM behind a BEAM validator on Robinhood Chain
/// @notice Staked $BEAM is voting power: every token staked to a validator adds one unit of power to the stake-weighted
///         median and to packet quorum. Stakers hold shares of a validator's pool, so a slash reduces every staker in
///         that pool pro rata. Unbonding takes 7 days and stays slashable until it is withdrawn. Slashed $BEAM is burned.
contract BeamStaking {
    IERC20 public immutable token;
    address public owner;                                  // the BEAM network operator key that reports jailed validators
    uint256 public constant UNBOND = 7 days;
    uint256 public constant MAX_SLASH_BPS = 1000;          // at most 10% per slash
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    struct Pool { uint256 stake; uint256 shares; uint256 slashed; uint32 slashes; }
    struct Unbond { address node; uint256 shares; uint64 release; }
    mapping(address => Pool) public pools;                                  // validator node => pool
    mapping(address => mapping(address => uint256)) public sharesOf;        // validator node => staker => shares
    mapping(address => uint256) public unbondShares;                        // validator node => shares waiting in the 7-day queue
    mapping(address => Unbond[]) internal queue;                            // staker => unbonding entries
    uint256 public totalStaked;
    address[] public nodes; mapping(address => bool) internal known;

    event Staked(address indexed node, address indexed staker, uint256 amount, uint256 shares);
    event UnbondStarted(address indexed node, address indexed staker, uint256 amount, uint64 release);
    event Withdrawn(address indexed staker, uint256 amount);
    event Slashed(address indexed node, uint256 bps, uint256 amount, string reason);

    constructor(address _token) { token = IERC20(_token); owner = msg.sender; }
    function transferOwnership(address to) external { require(msg.sender == owner, "owner"); owner = to; }

    // pool value backs both live shares and shares in the unbonding queue, so unbonding stays slashable
    function _value(address node, uint256 sh) internal view returns (uint256) { Pool storage p = pools[node]; uint256 all = p.shares + unbondShares[node]; return all == 0 ? 0 : sh * p.stake / all; }

    function stake(address node, uint256 amount) external {
        require(node != address(0) && amount > 0, "args");
        require(token.transferFrom(msg.sender, address(this), amount), "transfer");
        Pool storage p = pools[node]; uint256 all = p.shares + unbondShares[node];
        uint256 sh = all == 0 || p.stake == 0 ? amount : amount * all / p.stake;
        p.stake += amount; p.shares += sh; sharesOf[node][msg.sender] += sh; totalStaked += amount;
        if (!known[node]) { known[node] = true; nodes.push(node); }
        emit Staked(node, msg.sender, amount, sh);
    }

    function unbond(address node, uint256 amount) external {
        uint256 have = sharesOf[node][msg.sender]; uint256 val = _value(node, have);
        require(amount > 0 && amount <= val, "amount");
        uint256 sh = amount == val ? have : (amount * have + val - 1) / val; if (sh > have) sh = have;
        sharesOf[node][msg.sender] = have - sh; pools[node].shares -= sh; unbondShares[node] += sh;
        uint64 rel = uint64(block.timestamp + UNBOND); queue[msg.sender].push(Unbond(node, sh, rel));
        emit UnbondStarted(node, msg.sender, amount, rel);
    }

    function withdraw() external {
        Unbond[] storage q = queue[msg.sender]; uint256 out;
        for (uint256 i = q.length; i > 0; i--) { Unbond memory u = q[i - 1]; if (u.release > block.timestamp) continue;
            uint256 v = _value(u.node, u.shares); pools[u.node].stake -= v; unbondShares[u.node] -= u.shares; out += v;
            q[i - 1] = q[q.length - 1]; q.pop(); }
        require(out > 0, "nothing ready"); totalStaked -= out;
        require(token.transfer(msg.sender, out), "transfer"); emit Withdrawn(msg.sender, out);
    }

    function slash(address node, uint256 bps, string calldata reason) external {
        require(msg.sender == owner, "owner"); require(bps > 0 && bps <= MAX_SLASH_BPS, "bps");
        Pool storage p = pools[node]; uint256 amt = p.stake * bps / 10000; require(amt > 0, "empty");
        p.stake -= amt; p.slashed += amt; p.slashes++; totalStaked -= amt;
        require(token.transfer(BURN, amt), "burn"); emit Slashed(node, bps, amt, reason);
    }

    // ---------- views ----------
    /// @notice active voting power of a validator: pool value not waiting in the unbonding queue
    function stakeOf(address node) public view returns (uint256) { Pool storage p = pools[node]; uint256 all = p.shares + unbondShares[node]; return all == 0 ? 0 : p.shares * p.stake / all; }
    function stakedBy(address node, address staker) external view returns (uint256) { return _value(node, sharesOf[node][staker]); }
    function nodeCount() external view returns (uint256) { return nodes.length; }
    function unbonding(address staker) external view returns (address[] memory node, uint256[] memory amount, uint64[] memory release) {
        Unbond[] storage q = queue[staker]; node = new address[](q.length); amount = new uint256[](q.length); release = new uint64[](q.length);
        for (uint256 i = 0; i < q.length; i++) { node[i] = q[i].node; amount[i] = _value(q[i].node, q[i].shares); release[i] = q[i].release; }
    }
}
