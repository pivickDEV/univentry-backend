/* eslint-disable */
import { Request, Response } from "express";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import QRCode from "qrcode";
import Booking from "../model/booking.model";
import { Office } from "../model/Office";
import { sendSMS } from "../services/sms.service"; // Uncomment if you have this

import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

// ---------------------------------------------------------
// CONFIGURATION & SETUP
// ---------------------------------------------------------
const otpStore: Record<string, string> = {};

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error("❌ Missing EMAIL_USER or EMAIL_PASS in environment variables");
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
});

transporter.verify((error, success) => {
  if (error) {
    console.error("❌ SMTP Verify Error:", error);
  } else {
    console.log("✅ SMTP server is ready");
  }
});

// ---------------------------------------------------------
// 1. SEND OTP
// ---------------------------------------------------------
export const sendOTP = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = otp;

  try {
    await transporter.sendMail({
      from: `"UniVentry System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verification Protocol: Your Access Code",
      text: `Your security verification code is: ${otp}.`,
    });

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error: any) {
    console.error("❌ Mailer Error:", error.message);

    return res.status(200).json({
      success: true,
      message: "OTP generated but email sending failed",
      otp,
    });
  }
};

// ---------------------------------------------------------
// 2. VERIFY OTP
// ---------------------------------------------------------
export const verifyOTP = (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (otpStore[email] && otpStore[email] === otp) {
    delete otpStore[email];
    return res.status(200).json({ success: true });
  }
  res.status(400).json({ error: "Invalid or expired protocol code." });
};

// ---------------------------------------------------------
// 3. GET SLOTS
// ---------------------------------------------------------
export const getSlots = async (req: Request, res: Response) => {
  try {
    const { bookingDate, office: officeName } = req.query;
    const queryDate = (bookingDate as string) || (req.query.date as string);

    if (!queryDate || !officeName)
      return res
        .status(400)
        .json({ error: "Date and Office parameters are required" });

    const officeDoc = await Office.findOne({ name: officeName as string });
    if (!officeDoc) return res.status(404).json({ error: "Office not found" });

    const override = officeDoc.customLimits.find(
      (cl: any) => cl.date === queryDate,
    );
    const maxSlots =
      override !== undefined ? override.limit : officeDoc.defaultMaxSlots;

    const count = await Booking.countDocuments({
      bookingDate: queryDate,
      office: officeName as string,
      status: { $nin: ["Rejected", "Cancelled"] },
    });

    res.status(200).json({ current: count, max: maxSlots });
  } catch (error: any) {
    console.error("❌ Slot Fetch Error:", error.message);
    res.status(500).json({ error: "Internal server error syncing slots." });
  }
};

// ---------------------------------------------------------
// 4. CREATE BOOKING
// ---------------------------------------------------------
export const createBooking = async (req: Request, res: Response) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      category,
      office,
      purpose,
      bookingDate,
      faceEmbedding,
      idCategory,
      idType,
      idFront,
      idBack,
      ocrFront,
      ocrBack,
      actionBy,
    } = req.body;

    // A. Validation
    if (
      !firstName?.trim() ||
      !lastName?.trim() ||
      !email?.trim() ||
      !office?.trim() ||
      !bookingDate?.trim() ||
      !idFront ||
      !idBack
    ) {
      return res.status(400).json({
        success: false,
        error: "Required identification data is missing.",
      });
    }

    if (!Array.isArray(faceEmbedding) || faceEmbedding.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Face scan data missing." });
    }

    // B. Capacity Check
    const officeDoc = await Office.findOne({ name: office });
    if (!officeDoc)
      return res
        .status(400)
        .json({ success: false, error: "Office not found." });

    const override = officeDoc.customLimits.find(
      (cl: any) => cl.date === bookingDate,
    );
    const maxSlots =
      override !== undefined ? override.limit : officeDoc.defaultMaxSlots;

    if (maxSlots === 0)
      return res
        .status(400)
        .json({ success: false, error: "Office is closed on this date." });

    const count = await Booking.countDocuments({
      bookingDate,
      office,
      status: { $nin: ["Rejected", "Cancelled"] },
    });
    if (count >= maxSlots)
      return res
        .status(400)
        .json({ success: false, error: "Capacity Exceeded for this date." });

    // C. Save to DB
    const newBooking = new Booking({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phoneNumber: phoneNumber || "",
      category: category || "",
      office: office.trim(),
      purpose: purpose.trim(),
      bookingDate: bookingDate.trim(),
      idCategory,
      idType, // 🔥 idType is now guaranteed by the frontend update
      idFront,
      idBack,
      ocrFront,
      ocrBack,
      faceEmbedding: faceEmbedding.map((val: any) => Number(val)),

      // Audit Fields
      status: "Approved",
      timeIn: null,
      transactionTime: null,
      timeOut: null,
      hours: 0,
      actionBy,
    });

    const saved = await newBooking.save();

    // D. Generate QR
    const qrCodeDataURL = await QRCode.toDataURL(saved._id.toString(), {
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    // E. Send Beautiful Email (YOUR DESIGN)
    const mailOptions = {
      from: `"UniVentry Security" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "✅ Appointment Approved - Your Secure Access Pass",
      html: `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; background-color: #ffffff;">
      <div style="background: #0038A8; padding: 30px; text-align: center;">
        <h1 style="color: #FFD700; margin: 0; letter-spacing: 2px; font-size: 28px; font-weight: 900;">UNIVENTRY</h1>
        <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8;">IoT Visitor Management System</p>
      </div>
      <div style="padding: 40px; text-align: center; color: #1e293b;">
        <h2 style="color: #0038A8; font-size: 22px; margin-bottom: 10px; font-weight: 800;">Hello, ${firstName}!</h2>
        <p style="font-size: 15px; color: #475569;">Your appointment for <strong>${office}</strong> is <span style="color: #10b981; font-weight: bold;">Confirmed</span>.</p>
        <div style="margin: 30px 0; padding: 20px; border: 2px dashed #e2e8f0; border-radius: 20px; background-color: #f8fafc; display: inline-block;">
          <img src="cid:qrcode" alt="QR Code" style="width: 200px; height: 200px; display: block; border-radius: 10px;" />
          <p style="margin-top: 15px; font-family: monospace; font-weight: bold; color: #0038A8; font-size: 14px; letter-spacing: 1px;">ID: #${saved._id.toString().slice(-6).toUpperCase()}</p>
        </div>
        <p style="font-size: 14px; color: #64748b; margin-bottom: 30px;">Present this QR code at the <strong>Campus Gate</strong> scanner.</p>
        <div style="margin-top: 30px; padding: 15px; background: #eff6ff; border-radius: 12px; border: 1px solid #dbeafe;">
            <span style="font-size: 10px; font-weight: bold; color: #0038A8; text-transform: uppercase; letter-spacing: 1px;">Valid Date</span><br>
            <span style="font-size: 16px; font-weight: 800; color: #1e293b;">${bookingDate}</span>
        </div>
      </div>
      <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 11px; color: #64748b; margin: 0;">&copy; ${new Date().getFullYear()} Rizal Technological University Security.</p>
      </div>
    </div>
  `,
      attachments: [
        {
          filename: "access-pass.png",
          content: qrCodeDataURL.split("base64,")[1],
          encoding: "base64",
          cid: "qrcode",
        },
        {
          filename: `RTU-Pass-${saved._id.toString().slice(-4)}.png`,
          content: qrCodeDataURL.split("base64,")[1],
          encoding: "base64",
        },
      ],
    };

    // 🔥 FIX: Send Success Response to Frontend IMMEDIATELY
    res.status(201).json({ success: true, bookingId: saved._id });

    // 🔥 FIX: Attempt to send email in the background without `await`
    transporter.sendMail(mailOptions).catch((mailErr) => {
      console.error("⚠️ Background Mailer Timeout (Ignored):", mailErr.message);
    });
  } catch (error: any) {
    console.error("❌ Booking Error:", error.message);
    res.status(500).json({ error: "Server Error", details: error.message });
  }
};

// ---------------------------------------------------------
// 5. SCAN QR (GATE IN/OUT) - AUDIT TRAIL
// ---------------------------------------------------------
export const scanQR = async (req: Request, res: Response): Promise<void> => {
  try {
    const { qrCode, scanType, guardName: bodyGuardName } = req.body;

    // 🔒 SECURITY: Identify Guard
    const currentUser = (req as any).user;

    // Priority: Token User -> Manual Body Name -> Fallback
    const activeGuard = currentUser
      ? (currentUser.name || "Unknown Guard").toUpperCase()
      : (bodyGuardName || "GATE SCANNER").toUpperCase();

    if (!qrCode || !scanType) {
      res.status(400).json({ message: "Missing Data" });
      return;
    }

    const cleanId = qrCode.trim();
    if (!mongoose.Types.ObjectId.isValid(cleanId)) {
      res.status(400).json({ message: "Invalid QR Code." });
      return;
    }

    const booking = await Booking.findById(cleanId);
    if (!booking) {
      res.status(404).json({ message: "Pass not found." });
      return;
    }

    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Manila",
    });
    if (booking.bookingDate !== today) {
      res.status(400).json({
        message: `Access Denied: Date Mismatch (${booking.bookingDate})`,
      });
      return;
    }

    const now = new Date();

    // --- LOGIC SWITCH ---
    if (scanType === "in") {
      if (booking.status === "On Campus") {
        res.status(400).json({ message: "Already Inside!" });
        return;
      }
      if (booking.status === "Completed") {
        res.status(400).json({ message: "Pass Used/Expired." });
        return;
      }

      booking.status = "On Campus";
      booking.timeIn = now;
      booking.timeInBy = activeGuard; // 🔥 RECORD ENTRY GUARD

      await booking.save();
      console.log(`✅ ENTRY: ${booking.firstName} scanned by ${activeGuard}`);
      res
        .status(200)
        .json({ success: true, message: "Welcome", data: booking });
    } else if (scanType === "out") {
      if (!booking.timeIn) {
        res.status(400).json({ message: "Never Entered Campus!" });
        return;
      }
      if (booking.status === "Completed") {
        res.status(400).json({ message: "Already Exited!" });
        return;
      }

      booking.status = "Completed";
      booking.timeOut = now;
      booking.timeOutBy = activeGuard; // 🔥 RECORD EXIT GUARD

      // Calculate Hours
      const duration =
        Math.abs(now.getTime() - new Date(booking.timeIn).getTime()) / 36e5;
      booking.hours = parseFloat(duration.toFixed(2));

      await booking.save();
      console.log(`✅ EXIT: ${booking.firstName} scanned by ${activeGuard}`);
      res
        .status(200)
        .json({ success: true, message: "Goodbye", data: booking });
    } else {
      res.status(400).json({ message: "Invalid scanMode" });
    }
  } catch (error) {
    console.error("Scan Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ---------------------------------------------------------
// 6. SCAN TRANSACTION (OFFICE) - AUDIT TRAIL
// ---------------------------------------------------------
export const scanTransaction = async (req: Request, res: Response) => {
  const { qrCode } = req.body;

  try {
    // 1. Identify Staff
    const currentUser = (req as any).user;
    const staffName = currentUser
      ? (currentUser.name || "Staff").toUpperCase()
      : "OFFICE STAFF";

    const booking = await Booking.findById(qrCode);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Validations
    if (!booking.timeIn)
      return res.status(400).json({ message: "Visitor is not on campus yet." });
    if (booking.timeOut)
      return res.status(400).json({ message: "Visitor has already left." });
    if (booking.transactionTime)
      return res.status(400).json({ message: "Transaction already recorded." });

    // 2. Update Database
    booking.transactionTime = new Date();
    booking.transactionBy = staffName;

    // 🔥 LOGIC: Set smsSent to false.
    // This tells the Cron Job (OverstayMonitor): "Watch this person. If they are still here in 30 mins, warn them."
    booking.smsSent = false;

    await booking.save();

    console.log(`✅ TRANSACTION: ${booking.firstName} handled by ${staffName}`);

    // 3. Send SMS (Non-Blocking)
    // Logic Change: We do NOT await here. This ensures the Scanner UI is instant.
    if (booking.phoneNumber && booking.phoneNumber !== "0000000000") {
      const message = `UniVentry: Hello ${booking.firstName}, your transaction has ended. Please proceed to the exit for the logout process.`;

      console.log(`📨 Triggering background SMS to: ${booking.phoneNumber}`);

      // Fire and forget - handles SMS in background
      sendSMS(booking.phoneNumber, message).catch((err) =>
        console.error("⚠️ Background SMS Log:", err),
      );
    }

    res.status(200).json({
      success: true,
      data: booking,
      message: `Transaction Logged.`,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ---------------------------------------------------------
// 7. GET ALL BOOKINGS
// ---------------------------------------------------------
export const getAllBookings = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // 🔥 THE FIX: Exclude heavy Base64 images so the table loads instantly
    const bookings = await Booking.find()
      .select("-idFront -idBack -faceEmbedding")
      .sort({ createdAt: -1 })
      .lean();

    // Map through and calculate the hours just like the audit trail needs
    const auditLogs = bookings.map((log: any) => {
      let calculatedHours = 0;
      if (log.timeIn && log.timeOut) {
        calculatedHours =
          (new Date(log.timeOut).getTime() - new Date(log.timeIn).getTime()) /
          36e5;
      } else if (log.timeIn && !log.timeOut) {
        calculatedHours = (Date.now() - new Date(log.timeIn).getTime()) / 36e5;
      }

      return {
        ...log,
        bookingDate:
          log.bookingDate || log.date || new Date().toISOString().split("T")[0],
        hours: calculatedHours,
        actionBy: log.actionBy || "SYSTEM",
      };
    });

    res.status(200).json(auditLogs);
  } catch (error) {
    console.error("Fetch Bookings Error:", error);
    res.status(500).json({ message: "Failed to fetch booking history" });
  }
};

// ---------------------------------------------------------
// 8. DELETE BOOKING (For the Danger Zone)
// ---------------------------------------------------------
export const deleteBooking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await Booking.findByIdAndDelete(id);
    res.status(200).json({ message: "Record deleted permanently." });
  } catch (error) {
    res.status(500).json({ message: "Server error during deletion." });
  }
};

// ---------------------------------------------------------
// 8. GET VISITOR DETAILS
// ---------------------------------------------------------
export const getVisitorDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: "Visitor not found" });
    res.status(200).json(booking);
  } catch (error) {
    res.status(500).json({ message: "Server Error fetching visitor details" });
  }
};
