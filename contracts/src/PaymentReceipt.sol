// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

/// @title  PaymentReceipt
/// @notice Records every completed deal IncomeClaw's Operator agent settles
///         on-chain. Emits a `PaymentReceived` event the dashboard's revenue
///         counter consumes (see IncomeClaw-Roadmap.md §6).
/// @dev    Hackathon scope: anyone can call `recordPayment`. Production
///         would gate by Operator iNFT ownership via the AgentNFT contract.
contract PaymentReceipt {
    struct Receipt {
        uint256 agentTokenId;
        address payer;
        uint256 amount;
        uint64 timestamp;
        string dealRef;
    }

    /// @notice Receipt by id. id 0 is unused so `getReceipt(0)` returns an
    ///         empty struct rather than a real entry.
    mapping(uint256 => Receipt) public receipts;

    /// @notice Next id `recordPayment` will assign. Starts at 1.
    uint256 public nextReceiptId = 1;

    /// @notice Sum of every `amount` ever recorded. Read by the dashboard's
    ///         revenue counter via a single view call (cheap on a Galileo RPC).
    uint256 public totalRevenue;

    /// @notice Emitted on every successful `recordPayment` call. The
    ///         `dealRef` is left non-indexed so the full string survives in
    ///         the event payload — indexed strings are only stored as keccak.
    event PaymentReceived(
        uint256 indexed receiptId,
        uint256 indexed agentTokenId,
        address indexed payer,
        uint256 amount,
        string dealRef,
        uint64 timestamp
    );

    error AmountIsZero();
    error PayerIsZero();
    error DealRefEmpty();

    /// @notice Record a completed payment.
    /// @param  agentTokenId  iNFT id of the Operator agent that settled the deal.
    /// @param  payer         Account that paid (mock: a fixed demo address).
    /// @param  amount        Amount, in 0G wei. Must be > 0.
    /// @param  dealRef       Free-form deal reference, e.g. "ACME-2026-01". Must be non-empty.
    /// @return receiptId     The id assigned to this receipt.
    function recordPayment(uint256 agentTokenId, address payer, uint256 amount, string calldata dealRef)
        external
        returns (uint256 receiptId)
    {
        if (amount == 0) revert AmountIsZero();
        if (payer == address(0)) revert PayerIsZero();
        if (bytes(dealRef).length == 0) revert DealRefEmpty();

        receiptId = nextReceiptId++;
        uint64 ts = uint64(block.timestamp);

        receipts[receiptId] = Receipt({
            agentTokenId: agentTokenId,
            payer: payer,
            amount: amount,
            timestamp: ts,
            dealRef: dealRef
        });

        totalRevenue += amount;

        emit PaymentReceived(receiptId, agentTokenId, payer, amount, dealRef, ts);
    }

    /// @notice Read a receipt by id. Returns the zero struct for unknown ids.
    function getReceipt(uint256 receiptId) external view returns (Receipt memory) {
        return receipts[receiptId];
    }
}
