import express from "express";
import {
  createBooking,
  deleteBooking,
  getAllBookings,
  getSlots,
  getVisitorDetails,
  scanQR,
  scanTransaction,
  sendOTP,
  verifyOTP,
} from "../controllers/booking.controller";
import { protect } from "../middlewares/auth.middleware";

const router = express.Router();

// Public Routes
router.get("/slots", getSlots);
router.post("/", createBooking);
router.get("/", getAllBookings);

// 🚀 2. ADD THESE TWO EXACT LINES AT THE TOP OF YOUR ROUTES:
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);

// 🔥 2. ADD THIS ROUTE (Required for Transaction Scan Preview)
router.get("/:id", getVisitorDetails);
// Add this line at the bottom of your routes:
router.delete("/:id", deleteBooking);

// 🚀 SCANNERS
router.post("/scan", protect, scanQR);
router.post("/scan/transaction", protect, scanTransaction);

export default router;
