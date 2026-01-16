// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.0;

// /**
//  * @title AggregatorV3Interface
//  * @dev Interface for Chainlink Aggregators to fetch price data.
//  */
// interface AggregatorV3Interface {
//     function decimals() external view returns (uint8);
//     function description() external view returns (string memory);
//     function version() external view returns (uint256);
//     function getRoundData(
//         uint80 _roundId
//     )
//         external
//         view
//         returns (
//             uint80 roundId,
//             int256 answer,
//             uint256 startedAt,
//             uint256 updatedAt,
//             uint80 answeredInRound
//         );
//     function latestRoundData()
//         external
//         view
//         returns (
//             uint80 roundId,
//             int256 answer,
//             uint256 startedAt,
//             uint256 updatedAt,
//             uint80 answeredInRound
//         );
// }

// /**
//  * @title IERC20
//  * @dev Standard Interface for ERC20 Standard Token.
//  */
// interface IERC20 {
//     function totalSupply() external view returns (uint256);
//     function balanceOf(address account) external view returns (uint256);
//     function transfer(
//         address recipient,
//         uint256 amount
//     ) external returns (bool);
//     function allowance(
//         address owner,
//         address spender
//     ) external view returns (uint256);
//     function approve(address spender, uint256 amount) external returns (bool);
//     function transferFrom(
//         address sender,
//         address recipient,
//         uint256 amount
//     ) external returns (bool);
//     event Transfer(address indexed from, address indexed to, uint256 value);
//     event Approval(
//         address indexed owner,
//         address indexed spender,
//         uint256 value
//     );
// }

// /**
//  * @title OsirisOffering
//  * @dev Split contract implementing Thirdweb PaymentSplitter ABI with additional fixed-fee logic for ETH.
//  */
// contract OsirisOffering {
//     // --- Events (Thirdweb ABI & Custom) ---
//     event ERC20PaymentReleased(
//         IERC20 indexed token,
//         address to,
//         uint256 amount
//     );
//     event PayeeAdded(address account, uint256 shares);
//     event PaymentReceived(address from, uint256 amount);
//     event PaymentReleased(address to, uint256 amount);
//     event RoleAdminChanged(
//         bytes32 indexed role,
//         bytes32 indexed previousAdminRole,
//         bytes32 indexed newAdminRole
//     );
//     event RoleGranted(
//         bytes32 indexed role,
//         address indexed account,
//         address indexed sender
//     );
//     event RoleRevoked(
//         bytes32 indexed role,
//         address indexed account,
//         address indexed sender
//     );
//     event Initialized(uint8 version);

//     // --- Config & State ---
//     bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;

//     // Splitter State
//     mapping(address => uint256) private _shares;
//     mapping(address => uint256) private _released;
//     address[] private _payees;
//     uint256 public totalShares;
//     uint256 public totalReleased;

//     // ERC20 State
//     mapping(address => uint256) private _totalReleasedERC20;
//     mapping(address => mapping(address => uint256)) private _releasedERC20;

//     // Custom Osiris State
//     uint256 public fixedFeeUSD;
//     address public platform;
//     uint256 public ethTransactionCount;
//     // erc20TransactionCount removed (no reliable way to track without deposit)

//     AggregatorV3Interface public ethUsdPriceFeed;
//     mapping(address => AggregatorV3Interface) public tokenPriceFeeds;
//     mapping(address => int256) public fallbackPrices;

//     constructor(
//         address[] memory _payees_,
//         uint256[] memory _shares_,
//         address _platform,
//         uint256 _fixedFeeUSD,
//         address _ethUsdPriceFeed
//     ) {
//         require(
//             _payees_.length == _shares_.length,
//             "OsirisOffering: length mismatch"
//         );
//         require(_payees_.length > 0, "OsirisOffering: no payees");
//         require(
//             _platform != address(0),
//             "OsirisOffering: platform is zero address"
//         );

//         platform = _platform;
//         fixedFeeUSD = _fixedFeeUSD;
//         ethUsdPriceFeed = AggregatorV3Interface(_ethUsdPriceFeed);

//         for (uint256 i = 0; i < _payees_.length; i++) {
//             _addPayee(_payees_[i], _shares_[i]);
//         }

//         // Grant admin role to deployer? For demo, platform is admin.
//         emit RoleGranted(DEFAULT_ADMIN_ROLE, msg.sender, msg.sender);
//     }

//     // --- Metadata ---
//     function contractType() external pure returns (bytes32) {
//         return bytes32("OsirisOffering");
//     }

//     function contractVersion() external pure returns (uint8) {
//         return 1;
//     }

//     function contractURI() external pure returns (string memory) {
//         return ""; // Placeholder
//     }

//     // --- Receive & Fallback (ETH Fee Accounting) ---
//     receive() external payable {
//         ethTransactionCount += 1;
//         emit PaymentReceived(msg.sender, msg.value);
//     }

//     fallback() external payable {
//         ethTransactionCount += 1;
//         emit PaymentReceived(msg.sender, msg.value);
//     }

//     // --- Core Splitter Logic ---

//     function totalReleased(IERC20 token) public view returns (uint256) {
//         return _totalReleasedERC20[address(token)];
//     }

//     function shares(address account) public view returns (uint256) {
//         return _shares[account];
//     }

//     function released(address account) public view returns (uint256) {
//         return _released[account];
//     }

//     function released(
//         IERC20 token,
//         address account
//     ) public view returns (uint256) {
//         return _releasedERC20[address(token)][account];
//     }

//     function payee(uint256 index) public view returns (address) {
//         return _payees[index];
//     }

//     function payeeCount() public view returns (uint256) {
//         return _payees.length;
//     }

//     // --- Releasable Calculations ---

//     function releasable(address account) public view returns (uint256) {
//         uint256 totalReceived = address(this).balance + totalReleased;
//         return
//             _pendingPayment(
//                 account,
//                 totalReceived,
//                 _released[account],
//                 true,
//                 address(0)
//             );
//     }

//     function releasable(
//         IERC20 token,
//         address account
//     ) public view returns (uint256) {
//         // Limitation: ERC20 totalReceived only knows current balance + previously released.
//         // It does not know historical inflow count for fixed fee math.
//         uint256 totalReceived = token.balanceOf(address(this)) +
//             _totalReleasedERC20[address(token)];
//         return
//             _pendingPayment(
//                 account,
//                 totalReceived,
//                 _releasedERC20[address(token)][account],
//                 false,
//                 address(token)
//             );
//     }

//     // --- Release & Distribute ---

//     function release(address payable account) public {
//         require(
//             _shares[account] > 0 || account == platform,
//             "OsirisOffering: no shares"
//         );
//         uint256 payment = releasable(account);
//         require(payment > 0, "OsirisOffering: nothing to release");

//         _released[account] += payment;
//         totalReleased += payment;

//         (bool success, ) = account.call{value: payment}("");
//         require(success, "Transfer failed");
//         emit PaymentReleased(account, payment);
//     }

//     function release(IERC20 token, address account) public {
//         require(
//             _shares[account] > 0 || account == platform,
//             "OsirisOffering: no shares"
//         );
//         uint256 payment = releasable(token, account);
//         require(payment > 0, "OsirisOffering: nothing to release");

//         _releasedERC20[address(token)][account] += payment;
//         _totalReleasedERC20[address(token)] += payment;

//         require(token.transfer(account, payment), "Transfer failed");
//         emit ERC20PaymentReleased(token, account, payment);
//     }

//     function distribute() public {
//         uint256 count = _payees.length;
//         for (uint256 i = 0; i < count; i++) {
//             release(payable(_payees[i]));
//         }
//         // Also release for platform if they have fees but no shares?
//         if (_shares[platform] == 0) {
//             uint256 platformPayment = releasable(payable(platform));
//             if (platformPayment > 0) {
//                 release(payable(platform));
//             }
//         }
//     }

//     function distribute(IERC20 token) public {
//         uint256 count = _payees.length;
//         for (uint256 i = 0; i < count; i++) {
//             release(token, _payees[i]);
//         }
//         if (_shares[platform] == 0) {
//             uint256 platformPayment = releasable(token, platform);
//             if (platformPayment > 0) {
//                 release(token, platform);
//             }
//         }
//     }

//     // --- Internal Payment Logic (The Osiris "Special Calculation") ---

//     function _pendingPayment(
//         address account,
//         uint256 totalReceived,
//         uint256 alreadyReleased,
//         bool isETH,
//         address token
//     ) private view returns (uint256) {
//         // 1. Calculate Fixed Fees
//         uint256 totalFixedFeesAsset = 0;

//         // Fee Logic: Only for ETH where we track txCount via fallback/receive
//         if (isETH && ethTransactionCount > 0 && fixedFeeUSD > 0) {
//             (int256 price, uint8 priceDecimals) = _getAssetPrice(
//                 true,
//                 address(0)
//             );
//             if (price > 0) {
//                 // Fee Calculation: (txCount * fixedFeeUSD * 10^18) / (price * 10^(8 - 8)?)
//                 // Assuming Price is 8 decimals (standard Chainlink).
//                 // Fee is 8 decimals.
//                 // (Fee * 10^18) / Price.
//                 uint256 numerator = ethTransactionCount * fixedFeeUSD * 1e18;
//                 uint256 denominator = uint256(price);

//                 // Adjust for non-standard price decimals if needed
//                 if (priceDecimals != 8) {
//                     if (priceDecimals < 8)
//                         denominator = denominator * (10 ** (8 - priceDecimals));
//                     else
//                         denominator = denominator / (10 ** (priceDecimals - 8));
//                 }

//                 totalFixedFeesAsset = numerator / denominator;
//             }
//         }

//         // Cap fees
//         if (totalFixedFeesAsset > totalReceived) {
//             totalFixedFeesAsset = totalReceived;
//         }

//         uint256 distributable = totalReceived - totalFixedFeesAsset;
//         uint256 payment = (distributable * _shares[account]) / totalShares;

//         if (account == platform) {
//             payment += totalFixedFeesAsset;
//         }

//         if (payment > alreadyReleased) {
//             return payment - alreadyReleased;
//         } else {
//             return 0;
//         }
//     }

//     function _getAssetPrice(
//         bool isETH,
//         address token
//     ) private view returns (int256, uint8) {
//         AggregatorV3Interface feed = isETH
//             ? ethUsdPriceFeed
//             : tokenPriceFeeds[token];
//         if (address(feed) != address(0)) {
//             try feed.latestRoundData() returns (
//                 uint80,
//                 int256 price,
//                 uint256,
//                 uint256,
//                 uint80
//             ) {
//                 if (price > 0) return (price, feed.decimals());
//             } catch {}
//         }
//         int256 fallbackPrice = fallbackPrices[isETH ? address(0) : token];
//         if (fallbackPrice > 0) return (fallbackPrice, 8);
//         return (0, 0);
//     }

//     function _addPayee(address account, uint256 shares_) private {
//         require(account != address(0), "OsirisOffering: zero addr");
//         require(shares_ > 0, "OsirisOffering: 0 shares");
//         require(_shares[account] == 0, "OsirisOffering: existing payee");
//         _payees.push(account);
//         _shares[account] = shares_;
//         totalShares += shares_;
//         emit PayeeAdded(account, shares_);
//     }

//     // --- AccessControl Stubs (Minimal for ABI match) ---
//     function hasRole(
//         bytes32 role,
//         address account
//     ) external view returns (bool) {
//         return true; // Simplified: Everyone allowed for demo call? Or just platform.
//     }
//     function getRoleMemberCount(bytes32 role) external view returns (uint256) {
//         return 0;
//     }
//     function getRoleMember(
//         bytes32 role,
//         uint256 index
//     ) external view returns (address) {
//         return address(0);
//     }
//     function getRoleAdmin(bytes32 role) external view returns (bytes32) {
//         return DEFAULT_ADMIN_ROLE;
//     }
//     function grantRole(bytes32 role, address account) external {}
//     function revokeRole(bytes32 role, address account) external {}
//     function renounceRole(bytes32 role, address account) external {}

//     // --- Configuration (Platform Only) ---
//     function setTokenPriceFeed(address token, address feed) external {
//         require(msg.sender == platform, "Only platform");
//         tokenPriceFeeds[token] = AggregatorV3Interface(feed);
//     }
//     function setFallbackPrice(address asset, int256 price) external {
//         require(msg.sender == platform, "Only platform");
//         fallbackPrices[asset] = price;
//     }
// }
