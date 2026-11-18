const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const stub = (relativePath, exports) => {
  const filename = require.resolve(path.join(__dirname, "..", relativePath));
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
    children: [],
    paths: [],
  };
};

let usage;
let wallet;
const transactions = [];

stub("models/readingFreeUsage.js", {
  findOneAndUpdate: async (filter, update) => {
    if (update.$setOnInsert) return usage;
    const inc = update.$inc || {};
    if (inc.faceUsed !== undefined || inc.palmUsed !== undefined) {
      const field = inc.faceUsed !== undefined ? "faceUsed" : "palmUsed";
      const limitField = field === "faceUsed" ? "faceLimit" : "palmLimit";
      if (filter.$expr && usage[field] >= usage[limitField]) return null;
      if (!filter.$expr && usage[field] <= 0) return null;
      usage[field] += inc[field];
      return usage;
    }
    return usage;
  },
});

stub("models/wallet.js", {
  findOneAndUpdate: async (filter, update) => {
    if (update.$setOnInsert) return wallet;
    const amount = update.$inc?.balance || 0;
    if (amount < 0 && wallet.balance < Math.abs(amount)) return null;
    wallet.balance += amount;
    return wallet;
  },
});

stub("models/walletTransaction.js", {
  create: async (doc) => {
    transactions.push(doc);
    return doc;
  },
});

const billing = require("../services/readingBillingService");

const reset = () => {
  usage = { faceUsed: 0, palmUsed: 0, faceLimit: 1, palmLimit: 1 };
  wallet = { balance: 100 };
  transactions.length = 0;
};

test("basic reading is free until the per-feature quota runs out", async () => {
  reset();
  const status = await billing.getStatus("user-1", "face");
  assert.equal(status.freeRemaining, 1);
  assert.equal(status.basicPrice, 20);
  assert.equal(status.detailedPrice, 50);

  const gate = await billing.ensureBillable("user-1", "face", "basic");
  assert.equal(gate.isFree, true);
  assert.equal(gate.ok, true);

  const charged = await billing.consume("user-1", "face", "basic", gate);
  assert.equal(charged.isFree, true);
  assert.equal(charged.charged, 0);
  assert.equal(usage.faceUsed, 1);
  assert.equal(transactions.length, 0);
});

test("paid reading debits the wallet and is refunded when analysis fails", async () => {
  reset();
  usage.faceUsed = 1;

  const gate = await billing.ensureBillable("user-1", "face", "detailed");
  assert.equal(gate.isFree, false);
  assert.equal(gate.price, 50);

  const consumption = await billing.consume("user-1", "face", "detailed", gate);
  assert.equal(consumption.charged, 50);
  assert.equal(wallet.balance, 50);
  assert.equal(transactions[0].reason, "face_reading_charge");
  assert.equal(transactions[0].meta.feature, "face");

  const refund = await billing.refund("user-1", "face", consumption);
  assert.equal(refund.refunded, 50);
  assert.equal(wallet.balance, 100);
  assert.equal(transactions[1].reason, "refund");
});

test("detailed reading is blocked when the wallet cannot cover it", async () => {
  reset();
  wallet.balance = 10;
  const gate = await billing.ensureBillable("user-1", "palm", "detailed");
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, "insufficient_balance");
  assert.equal(gate.price, 50);
  assert.equal(gate.freeRemaining, 1);
  assert.equal(wallet.balance, 10);
});

test("free reading refund puts the quota back", async () => {
  reset();
  const gate = await billing.ensureBillable("user-1", "palm", "basic");
  const consumption = await billing.consume("user-1", "palm", "basic", gate);
  assert.equal(usage.palmUsed, 1);

  await billing.refund("user-1", "palm", consumption);
  assert.equal(usage.palmUsed, 0);
});
