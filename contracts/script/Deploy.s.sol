// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PaymentReceipt} from "../src/PaymentReceipt.sol";

/// @notice Deploys PaymentReceipt to 0G Galileo and records the address +
///         tx hash + block in deployments/0g-testnet.json.
///
/// Run:
///   forge script script/Deploy.s.sol \
///     --rpc-url $RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast
contract Deploy is Script {
    /// @dev Path is relative to the contracts/ root (where foundry runs).
    string internal constant DEPLOYMENTS_PATH = "../deployments/0g-testnet.json";

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        PaymentReceipt pr = new PaymentReceipt();
        vm.stopBroadcast();

        address addr = address(pr);
        console2.log("PaymentReceipt deployed at:", addr);
        console2.log("Block number:               ", block.number);

        _writeDeploymentRecord(addr);
    }

    /// @dev Updates only the `paymentReceipt` block in the deployments file
    ///      using forge-std's stdJson helpers. Keeps the other fields intact.
    function _writeDeploymentRecord(address addr) internal {
        string memory existing = vm.readFile(DEPLOYMENTS_PATH);

        // Build the payment-receipt block as a fresh JSON object via vm.serializeX
        // (deterministic ordering on the same key root).
        string memory key = "paymentReceipt";
        vm.serializeAddress(key, "address", addr);
        vm.serializeString(key, "deployedBy", "incomeclaw");
        vm.serializeString(key, "phase", "incomeclaw-A4");
        vm.serializeString(
            key,
            "explorerUrl",
            string.concat("https://chainscan-galileo.0g.ai/address/", vm.toString(addr))
        );
        vm.serializeUint(key, "block", block.number);
        vm.serializeUint(key, "deployedAt", block.timestamp);
        // verifiedUrl + deployTxHash are filled in post-broadcast by the operator
        // (forge does not surface its own tx hash to the script context cleanly).
        vm.serializeString(key, "verifiedUrl", "");
        string memory paymentReceiptJson = vm.serializeString(key, "deployTxHash", "");

        // Splice it back into the parent doc at $.contracts.paymentReceipt.
        string memory updated = vm.serializeString("root", "raw", existing);
        // Use stdJson write to update only that path on disk:
        vm.writeJson(paymentReceiptJson, DEPLOYMENTS_PATH, ".contracts.paymentReceipt");

        // Silence unused-var warning; `updated` is documentary only.
        updated;
    }
}
