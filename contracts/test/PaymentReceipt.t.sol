// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PaymentReceipt} from "../src/PaymentReceipt.sol";

contract PaymentReceiptTest is Test {
    PaymentReceipt internal pr;

    address internal constant PAYER_A = address(0xA11CE);
    address internal constant PAYER_B = address(0xB0B);

    event PaymentReceived(
        uint256 indexed receiptId,
        uint256 indexed agentTokenId,
        address indexed payer,
        uint256 amount,
        string dealRef,
        uint64 timestamp
    );

    function setUp() public {
        pr = new PaymentReceipt();
    }

    // ─── Happy path ──────────────────────────────────────────────────────

    function test_initialState_isZeroed() public view {
        assertEq(pr.totalRevenue(), 0, "revenue starts at 0");
        assertEq(pr.nextReceiptId(), 1, "ids start at 1");
        PaymentReceipt.Receipt memory empty = pr.getReceipt(0);
        assertEq(empty.amount, 0, "id 0 returns empty struct");
    }

    function test_recordPayment_returnsIncrementingIds() public {
        uint256 id1 = pr.recordPayment(42, PAYER_A, 1 ether, "ACME-2026-01");
        uint256 id2 = pr.recordPayment(43, PAYER_B, 2 ether, "ACME-2026-02");
        assertEq(id1, 1, "first receipt id is 1");
        assertEq(id2, 2, "second receipt id is 2");
        assertEq(pr.nextReceiptId(), 3, "nextReceiptId advances");
    }

    function test_recordPayment_updatesTotalRevenue() public {
        pr.recordPayment(1, PAYER_A, 5 ether, "deal-1");
        assertEq(pr.totalRevenue(), 5 ether);
        pr.recordPayment(1, PAYER_A, 3 ether, "deal-2");
        assertEq(pr.totalRevenue(), 8 ether, "totalRevenue accumulates");
    }

    function test_recordPayment_storesReceiptFields() public {
        vm.warp(1_700_000_000);
        uint256 id = pr.recordPayment(7, PAYER_A, 12345, "ACME-2026-01");
        PaymentReceipt.Receipt memory r = pr.getReceipt(id);
        assertEq(r.agentTokenId, 7);
        assertEq(r.payer, PAYER_A);
        assertEq(r.amount, 12345);
        assertEq(r.timestamp, 1_700_000_000);
        assertEq(r.dealRef, "ACME-2026-01");
    }

    function test_recordPayment_publicMappingAccessor() public {
        pr.recordPayment(9, PAYER_B, 1, "x");
        // Solidity auto-generates a getter for the struct mapping that returns
        // each field positionally — verify the dashboard can rely on it.
        (uint256 agentTokenId, address payer, uint256 amount, uint64 timestamp, string memory dealRef) =
            pr.receipts(1);
        assertEq(agentTokenId, 9);
        assertEq(payer, PAYER_B);
        assertEq(amount, 1);
        assertGt(timestamp, 0);
        assertEq(dealRef, "x");
    }

    // ─── Event emission ──────────────────────────────────────────────────

    function test_recordPayment_emitsEventWithAllParams() public {
        vm.warp(1_700_000_500);
        vm.expectEmit(true, true, true, true, address(pr));
        emit PaymentReceived(1, 99, PAYER_A, 4242, "deal-emit", 1_700_000_500);
        pr.recordPayment(99, PAYER_A, 4242, "deal-emit");
    }

    // ─── Reverts ─────────────────────────────────────────────────────────

    function test_recordPayment_revertsOnZeroAmount() public {
        vm.expectRevert(PaymentReceipt.AmountIsZero.selector);
        pr.recordPayment(1, PAYER_A, 0, "deal");
    }

    function test_recordPayment_revertsOnZeroPayer() public {
        vm.expectRevert(PaymentReceipt.PayerIsZero.selector);
        pr.recordPayment(1, address(0), 1, "deal");
    }

    function test_recordPayment_revertsOnEmptyDealRef() public {
        vm.expectRevert(PaymentReceipt.DealRefEmpty.selector);
        pr.recordPayment(1, PAYER_A, 1, "");
    }

    // ─── Multi-caller / multi-receipt ────────────────────────────────────

    function test_recordPayment_acceptsMultipleCallers() public {
        vm.prank(PAYER_A);
        pr.recordPayment(1, PAYER_A, 1, "a");
        vm.prank(PAYER_B);
        pr.recordPayment(2, PAYER_B, 2, "b");
        assertEq(pr.totalRevenue(), 3);
        assertEq(pr.nextReceiptId(), 3);
    }

    // ─── Fuzz ────────────────────────────────────────────────────────────

    function testFuzz_recordPayment_arbitraryNonZeroAmount(uint128 amount) public {
        vm.assume(amount > 0);
        uint256 id = pr.recordPayment(1, PAYER_A, amount, "fuzz");
        PaymentReceipt.Receipt memory r = pr.getReceipt(id);
        assertEq(r.amount, amount);
        assertEq(pr.totalRevenue(), amount);
    }

    function testFuzz_recordPayment_dealRefRoundTrips(string calldata dealRef) public {
        vm.assume(bytes(dealRef).length > 0);
        vm.assume(bytes(dealRef).length <= 256); // keep storage cost bounded for fuzz speed
        uint256 id = pr.recordPayment(1, PAYER_A, 1, dealRef);
        assertEq(pr.getReceipt(id).dealRef, dealRef);
    }

    function testFuzz_totalRevenue_isSumOfAmounts(uint64 a, uint64 b, uint64 c) public {
        vm.assume(a > 0 && b > 0 && c > 0);
        pr.recordPayment(1, PAYER_A, a, "a");
        pr.recordPayment(1, PAYER_A, b, "b");
        pr.recordPayment(1, PAYER_A, c, "c");
        assertEq(pr.totalRevenue(), uint256(a) + uint256(b) + uint256(c));
    }

    // ─── Gas snapshot ────────────────────────────────────────────────────

    function test_gasSnapshot_recordPayment() public {
        // Warm storage with one prior write so totalRevenue isn't a 0→nonzero SSTORE.
        pr.recordPayment(1, PAYER_A, 1, "warmup");
        uint256 gasBefore = gasleft();
        pr.recordPayment(2, PAYER_B, 1 ether, "ACME-2026-01");
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("gas: recordPayment (warm)", gasUsed);
        // Looser ceiling than necessary — protects against accidental future
        // bloat (e.g. someone adding an unbounded loop) without flaking on
        // small compiler-version drift.
        assertLt(gasUsed, 200_000, "recordPayment should stay well under 200k gas");
    }
}
