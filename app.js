class KeyedMutex {
  constructor() {
    this.locks = new Map();
  }

  async acquire(key) {
    if (!this.locks.has(key)) {
      this.locks.set(key, Promise.resolve());
    }
    
    let currentLock = this.locks.get(key);
    let release;
    
    const nextLock = new Promise((resolve) => {
      release = resolve;
    });
    
    this.locks.set(key, currentLock.then(() => nextLock));
    
    await currentLock;
    return () => {
      release();
      if (this.locks.get(key) === nextLock) {
        this.locks.delete(key);
      }
    };
  }
}

class InventoryManager {
  constructor() {
    this.items = new Map();
    this.reservations = new Map();
    this.skuMutex = new KeyedMutex(); 
  }

  addItem(sku, name, totalStock) {
    this.items.set(sku, {
      name,
      totalStock,
      reservedQty: 0,
      confirmedQty: 0
    });
  }

  _checkStock(sku, requestedQty) {
    const item = this.items.get(sku);
    if (!item) return false;
    const availableStock = item.totalStock - (item.reservedQty + item.confirmedQty);
    return availableStock >= requestedQty;
  }

  reservationCountdown(reservationId, holdTimeMs) {
    return setTimeout(async () => {
      try {
        await this.itemCancellation(reservationId);
        console.log(`[Timer] Reservation ${reservationId} automatically expired.`);
      } catch (err) {
        console.error(`[Timer] Error during automatic expiration of reservation ${reservationId}:`, err.message);
      }
    }, holdTimeMs);
  }

  async itemAvailability(sku, requestedQty) {
    const release = await this.skuMutex.acquire(sku);
    try {
      return this._checkStock(sku, requestedQty);
    } finally {
      release();
    }
  }

  async reserveItem(reservationId, sku, quantity, holdTimeMs = 120000) {
    const release = await this.skuMutex.acquire(sku);
    try {
      if (!this._checkStock(sku, quantity)) {
        throw new Error(`Item ${sku} is not available in the requested quantity.`);
      }

      const item = this.items.get(sku);
      item.reservedQty += quantity;

      const timeoutId = this.reservationCountdown(reservationId, holdTimeMs);

      this.reservations.set(reservationId, {
        sku,
        quantity,
        timeoutId
      });

      return true;
    } finally {
      release();
    }
  }

  async itemConfirmation(reservationId) {
    const res = this.reservations.get(reservationId);
    if (!res) throw new Error("Reservation not found or already expired.");

    const release = await this.skuMutex.acquire(res.sku);
    try {
      const activeRes = this.reservations.get(reservationId);
      if (!activeRes) throw new Error("Reservation expired during processing.");

      clearTimeout(activeRes.timeoutId);

      const item = this.items.get(activeRes.sku);
      item.reservedQty -= activeRes.quantity;
      item.confirmedQty += activeRes.quantity;

      this.reservations.delete(reservationId);
      return true;
    } finally {
      release();
    }
  }

  async itemCancellation(reservationId) {
    const res = this.reservations.get(reservationId);
    if (!res) throw new Error("Reservation not found or already expired.");

    const release = await this.skuMutex.acquire(res.sku);
    try {
      const activeRes = this.reservations.get(reservationId);
      if (!activeRes) return false; // Already handled

      clearTimeout(activeRes.timeoutId);

      const item = this.items.get(activeRes.sku);
      item.reservedQty -= activeRes.quantity;

      this.reservations.delete(reservationId);
      return true;
    } finally {
      release();
    }
  }
}

export { InventoryManager };
