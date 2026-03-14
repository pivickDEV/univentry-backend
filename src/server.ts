import cors from "cors";
import "dotenv/config";
import express from "express";
import { PORT } from "../config/env";
import { sendOTP, verifyOTP } from "../controllers/booking.controller";
import startOverstayMonitor from "../jobs/overstayMonitor";
import { connectDB } from "../lib/db";
import auditRoutes from "../routes/audit.routes";
import authRoutes from "../routes/auth";
import bookingRoutes from "../routes/booking.routes";
import cctvLogRoutes from "../routes/cctvlog.routes";
import faceRecognitionRoutes from "../routes/faceRecognition.routes";
import officeRoutes from "../routes/office.routes";
import streamRoutes from "../routes/stream.routes";
import userRoutes from "../routes/user.routes";
import { initSurveillanceGrid } from "../services/rstp.service";

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://univentry-frontend.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.use((req, _res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/", (_req, res) => {
  res.send("UniVentry Backend Running");
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/offices", officeRoutes);
app.use("/api/audit-trail", auditRoutes);
app.use("/api/cctv-logs", cctvLogRoutes);
app.use("/api/stream", streamRoutes);
app.use("/api", faceRecognitionRoutes);

app.post("/api/send-otp", sendOTP);
app.post("/api/verify-otp", verifyOTP);

startOverstayMonitor();

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📁 Office Registry: /api/offices`);
      console.log(`📊 Slot System: /api/offices/slots`);
      initSurveillanceGrid();
    });
  } catch (err) {
    console.error("Failed to start system:", err);
  }
};

startServer();
