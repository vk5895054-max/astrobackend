const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { PROFILES } = require("../scripts/seedAiJyotishis");
const {
  PERSONA_TEMPLATE,
  buildSystemPrompt,
  buildKundliContext,
  detectSafetyCrisis,
  SUPPORT_MESSAGE,
} = require("../services/aiJyotishiPrompt");
const billing = require("../services/aiJyotishiBilling");
const { getResponseLanguageInstruction } = require("../services/aiLanguageService");
const { AI_JYOTISHI_PRESETS } = require("../controllers/walletController");

const fakeDeps = (initialBalance) => {
  const transactions = [];
  const wallet = { user: "u1", balance: initialBalance };
  const WalletModel = {
    findOneAndUpdate: async (filter, update) => {
      if (filter.balance && wallet.balance < filter.balance.$gte) return null;
      if (update.$inc?.balance) wallet.balance += update.$inc.balance;
      return { ...wallet };
    },
  };
  const TxnModel = {
    create: async (doc) => {
      transactions.push(doc);
      return doc;
    },
    findOne: () => ({
      lean: async () =>
        transactions.find((txn) => txn.reason === "ai_jyotishi_refund") || null,
    }),
  };
  return { WalletModel, TxnModel, wallet, transactions };
};

test("seed contains exactly six distinct AI Jyotishis with correct prices", () => {
  assert.equal(PROFILES.length, 6);
  assert.deepEqual(
    PROFILES.map((profile) => profile.name),
    [
      "Pandit Devanand",
      "Mata Savitri",
      "Acharya Rohit",
      "Jyotishi Neha",
      "Tarot Kabir",
      "Ank Guru Meera",
    ],
  );
  assert.deepEqual(
    PROFILES.map((profile) => profile.pricePerMin),
    [15, 18, 20, 17, 17, 16],
  );
  assert.deepEqual(
    PROFILES.map((profile) => profile.age),
    [68, 55, 35, 28, 32, 45],
  );
  assert.equal(new Set(PROFILES.map((profile) => profile.photo)).size, 6);
  assert.ok(PROFILES.every((profile) => Array.isArray(profile.categories) && profile.categories.length));
});

test("persona prompt keeps the full mandatory safety contract", () => {
  const prompt = buildSystemPrompt(PROFILES[0]);
  assert.match(prompt, /Tum Pandit Devanand ho/);
  assert.match(prompt, /Andaz: shaant aur buzurg andaz/);
  for (const line of PERSONA_TEMPLATE.split("\n")) {
    if (!line.includes("{")) assert.ok(prompt.includes(line), `missing: ${line}`);
  }
  assert.match(prompt, /Tele-MANAS 14416/);
  assert.doesNotMatch(prompt, /\{naam\}|\{expertise\}|\{style\}/);
});

test("crisis detection stops the chat before any billing", () => {
  assert.ok(detectSafetyCrisis("main apni jaan dena chahta hoon"));
  assert.ok(detectSafetyCrisis("I want to kill myself"));
  assert.ok(detectSafetyCrisis("ਮੈਂ ਆਤਮਹੱਤਿਆ ਕਰਨਾ ਚਾਹੁੰਦਾ ਹਾਂ"));
  assert.ok(!detectSafetyCrisis("Mera career kaisa rahega?"));
  assert.match(SUPPORT_MESSAGE, /14416/);
});

test("kundli context never invents a Lagna when birth time is missing", () => {
  const context = buildKundliContext({
    summary: {
      name: "Riya",
      dob: "1998-04-12",
      timeOfBirthProvided: false,
      place: "Delhi",
      ascendantAvailable: false,
      lagna: null,
      rashi: "Taurus",
      precision: "date-only-estimate",
    },
    planets: { Moon: { rashi: "Taurus", degreeInSign: 12.4, retrograde: false } },
  });
  assert.match(context, /Lagna: unavailable/);
  assert.doesNotMatch(context, /Lagna: Aries/);
  assert.match(context, /Chandra rashi: Taurus/);
  assert.match(context, /Moon: Taurus 12°/);
});

test("Punjabi is served by the shared language service", () => {
  assert.match(getResponseLanguageInstruction("pa-IN"), /Punjabi using Gurmukhi/);
  assert.match(getResponseLanguageInstruction("hi-IN"), /Hindi using Devanagari/);
  assert.match(getResponseLanguageInstruction("en-IN"), /Hinglish/);
});

test("balance status warns one minute before the wallet runs out", () => {
  assert.deepEqual(billing.statusForBalance(30, 15), {
    canStart: true,
    lowBalance: false,
    minutesRemaining: 2,
  });
  assert.deepEqual(billing.statusForBalance(15, 15), {
    canStart: true,
    lowBalance: true,
    minutesRemaining: 1,
  });
  assert.equal(billing.statusForBalance(14, 15).canStart, false);
});

test("each successful reply bills exactly one minute and writes a ledger row", async () => {
  const deps = fakeDeps(45);
  const charge = await billing.chargeMinute({
    userId: "u1",
    pricePerMin: 15,
    sessionId: "s1",
    chargeKey: "s1:1",
    deps,
  });
  assert.equal(charge.charged, 15);
  assert.equal(charge.balance, 30);
  assert.equal(charge.lowBalance, false);
  assert.equal(deps.wallet.balance, 30);
  assert.equal(deps.transactions.length, 1);
  assert.equal(deps.transactions[0].reason, "ai_jyotishi_charge");
});

test("insufficient balance rejects the message before an AI call", async () => {
  const deps = fakeDeps(10);
  await assert.rejects(
    () =>
      billing.chargeMinute({
        userId: "u1",
        pricePerMin: 15,
        sessionId: "s1",
        chargeKey: "s1:1",
        deps,
      }),
    (error) => error.code === "INSUFFICIENT_BALANCE" && error.statusCode === 402,
  );
  assert.equal(deps.wallet.balance, 10);
  assert.equal(deps.transactions.length, 0);
});

test("refund is idempotent for one charge key", async () => {
  const deps = fakeDeps(30);
  const first = await billing.refundMinute({
    userId: "u1",
    amount: 15,
    sessionId: "s1",
    chargeKey: "s1:1",
    deps,
  });
  assert.equal(first.duplicate, false);
  assert.equal(deps.wallet.balance, 45);
  deps.TxnModel.findOne = () => ({ lean: async () => ({ amount: 15 }) });
  const second = await billing.refundMinute({
    userId: "u1",
    amount: 15,
    sessionId: "s1",
    chargeKey: "s1:1",
    deps,
  });
  assert.equal(second.duplicate, true);
  assert.equal(deps.wallet.balance, 45);
});

test("AI jyotishi recharge presets are exactly 50/100/200/500", () => {
  assert.deepEqual(AI_JYOTISHI_PRESETS, [50, 100, 200, 500]);
});

test("checkout signature is verified against the server secret only", () => {
  const {
    verifyPaymentSignature,
  } = require("../services/razorpay");
  const previous = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_SECRET = "test_secret";
  try {
    const expected = crypto
      .createHmac("sha256", "test_secret")
      .update("order_1|pay_1")
      .digest("hex");
    assert.equal(
      verifyPaymentSignature({
        orderId: "order_1",
        paymentId: "pay_1",
        signature: expected,
      }),
      true,
    );
    assert.equal(
      verifyPaymentSignature({
        orderId: "order_1",
        paymentId: "pay_1",
        signature: "0".repeat(64),
      }),
      false,
    );
    assert.equal(
      verifyPaymentSignature({
        orderId: "order_2",
        paymentId: "pay_1",
        signature: expected,
      }),
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previous;
  }
});

test("webhook HMAC is checked over the exact raw bytes", () => {
  const {
    verifyWebhookSignature,
  } = require("../services/razorpay");
  const previous = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret";
  try {
    const raw = Buffer.from('{ "event": "payment.captured", "amount": 5000 }');
    const signature = crypto
      .createHmac("sha256", "webhook_secret")
      .update(raw)
      .digest("hex");
    assert.equal(verifyWebhookSignature(raw, signature), true);
    // Re-serialized JSON has different bytes, even though the object is the
    // same — the webhook must never be accepted on a parsed body.
    assert.equal(
      verifyWebhookSignature(
        Buffer.from(JSON.stringify(JSON.parse(raw.toString()))),
        signature,
      ),
      false,
    );
    assert.equal(verifyWebhookSignature(raw, "bad"), false);
  } finally {
    if (previous === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previous;
  }
});

test("rejects a non-preset AI recharge before creating a Razorpay order", async () => {
  const {
    createRechargeOrder,
  } = require("../controllers/walletController");
  const res = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
  };
  await createRechargeOrder(
    { body: { amount: 75, aiJyotishi: true }, user: { _id: "u1" } },
    res,
    () => {
      throw new Error("next() should not be called for a validation error");
    },
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.payload.message, /50, 100, 200, 500/);
});
