const mongoose = require("mongoose");

const aiJyotishiMessageSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: "AiJyotishiSession", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    text: { type: String, required: true, maxlength: 8000 },
    // Present on system support messages (self-harm intervention, low balance).
    kind: { type: String, default: "chat" },
  },
  { timestamps: true }
);

aiJyotishiMessageSchema.index({ session: 1, createdAt: 1 });

module.exports = mongoose.model("AiJyotishiMessage", aiJyotishiMessageSchema);
