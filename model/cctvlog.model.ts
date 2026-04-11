/* eslint-disable */
import mongoose from "mongoose";

const cctvLogSchema = new mongoose.Schema({
  visitorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true,
  },
  visitorName: { type: String, required: true },
  cameraName: { type: String, required: true },
  confidence: { type: Number, required: true },
  screenshotBase64: { type: String, default: "" },

  // 🔥 UPDATED ENUM: Added loitering and out of bounds
  status: {
    type: String,
    enum: ["IN", "OUT", "LOITERING", "OUT_OF_BOUNDS"],
    required: true,
    default: "IN",
  },

  date: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model("CCTVLog", cctvLogSchema);
