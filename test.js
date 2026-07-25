import assert from 'assert'; // Node.js native assertion library
import { InventoryManager } from './app.js';

async function runTests() {
  console.log("--- Starting InventoryManager Unit Tests ---\n");
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Test 1: Successful Reservation and Manual Confirmation
  try {
    const manager = new InventoryManager();
    manager.addItem("LAPTOP-01", "Premium Laptop", 5);

    console.log("Test 1: Reserving 2 laptops...");
    await manager.reserveItem("res_01", "LAPTOP-01", 2);
    
    let status = manager.items.get("LAPTOP-01");
    assert.strictEqual(status.reservedQty, 2, "Reserved qty should be 2 after reservation");

    console.log("Confirming reservation...");
    await manager.itemConfirmation("res_01");
    
    status = manager.items.get("LAPTOP-01");
    assert.strictEqual(status.confirmedQty, 2, "Confirmed qty should be 2 after confirmation");
    assert.strictEqual(status.reservedQty, 0, "Reserved qty should reset to 0 after confirmation");
    
    console.log("✅ Test 1 Passed\n");
  } catch (error) {
    console.error("❌ Test 1 Failed:", error.message);
  }

  // Test 2: Stock Expiration / Reservation Countdown Timeout
  try {
    const manager = new InventoryManager();
    manager.addItem("PHONE-01", "Smart Phone", 2);

    console.log("Test 2: Reserving 1 phone with a short 1-second expiration window...");
    await manager.reserveItem("res_02", "PHONE-01", 1, 1000);

    let status = manager.items.get("PHONE-01");
    assert.strictEqual(status.reservedQty, 1, "Qty should be 1 before expiration");

    console.log("Waiting 1.5 seconds for countdown to fire...");
    await sleep(1500);

    status = manager.items.get("PHONE-01");
    assert.strictEqual(status.reservedQty, 0, "Reserved qty should be 0 after expiration");
    
    console.log("✅ Test 2 Passed\n");
  } catch (error) {
    console.error("❌ Test 2 Failed:", error.message);
  }

  // Test 3: Mutex Concurrency / Over-allocation Prevention
  try {
    const manager = new InventoryManager();
    manager.addItem("TABLET-01", "Tablet", 1);

    console.log("Test 3: Triggering concurrent reservations for the same item...");
    
    const req1 = manager.reserveItem("res_03A", "TABLET-01", 1);
    const req2 = manager.reserveItem("res_03B", "TABLET-01", 1);

    const results = await Promise.allSettled([req1, req2]);

    // Explicitly check that req1 won and req2 was blocked by the mutex
    assert.strictEqual(results[0].status, "fulfilled", "First concurrent request should succeed");
    assert.strictEqual(results[1].status, "rejected", "Second concurrent request should be blocked");

    // Confirm the winner so its hold timer doesn't keep the process alive.
    await manager.itemConfirmation("res_03A");

    console.log("✅ Test 3 Passed (Mutex safely blocked concurrent double-booking)");
  } catch (error) {
    console.error("❌ Test 3 Failed:", error.message);
  }

  // Test 4: High-Concurrency Flash Sale Scenario (stock=1, 500 simultaneous requests)
  try {
    const manager = new InventoryManager();
    manager.addItem("FLASHSALE-01", "Limited Edition Item", 1);

    console.log("Test 4: Firing 500 simultaneous reservation requests for 1 item in stock...");
    const requests = Array.from({ length: 500 }, (_, i) =>
      manager.reserveItem(`res_flash_${i}`, "FLASHSALE-01", 1)
    );

    const results = await Promise.allSettled(requests);
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    assert.strictEqual(succeeded, 1, `Expected exactly 1 success, got ${succeeded}`);
    assert.strictEqual(failed, 499, `Expected exactly 499 failures, got ${failed}`);

    // Confirm the winning reservation so its hold timer doesn't keep the process alive.
    const winnerIndex = results.findIndex((r) => r.status === "fulfilled");
    await manager.itemConfirmation(`res_flash_${winnerIndex}`);

    console.log(`✅ Test 4 Passed (${succeeded} succeeded, ${failed} failed — no overselling)`);
  } catch (error) {
    console.error("❌ Test 4 Failed:", error.message);
  }

  console.log("\n--- Tests Finished ---");
}

runTests();
