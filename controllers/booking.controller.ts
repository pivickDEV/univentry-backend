import dns from "dns";
import { Request, Response } from "express";
import mongoose from "mongoose";
import QRCode from "qrcode";
import { Resend } from "resend";
import Booking from "../model/booking.model";
import { Office } from "../model/Office";
import { sendSMS } from "../services/sms.service";

dns.setDefaultResultOrder("ipv4first");

const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
  throw new Error("RESEND_API_KEY is missing from environment variables.");
}

const resend = new Resend(resendApiKey);

const otpStore: Record<string, string> = {};

// ---------------------------------------------------------
// 1. SEND OTP
// ---------------------------------------------------------
import { sendEmail } from "../services/email.service";

export const sendOTPEmail = async (email: string, otp: string) => {
  const html = `
  <div style="font-family: Arial; padding:20px">
    <h2>UniVentry OTP Verification</h2>
    <p>Your OTP code is:</p>
    <h1 style="letter-spacing:5px">${otp}</h1>
    <p>This code will expire in 5 minutes.</p>
  </div>
  `;

  await sendEmail(email, "UniVentry OTP Code", html);
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

  return res.status(400).json({ error: "Invalid or expired protocol code." });
};

// ---------------------------------------------------------
// 3. GET SLOTS
// ---------------------------------------------------------
export const getSlots = async (req: Request, res: Response) => {
  try {
    const bookingDate =
      typeof req.query.bookingDate === "string"
        ? req.query.bookingDate.trim()
        : typeof req.query.date === "string"
          ? req.query.date.trim()
          : "";

    const officeName =
      typeof req.query.office === "string" ? req.query.office.trim() : "";

    if (!bookingDate || !officeName) {
      return res.status(400).json({
        error: "Date and office parameters are required",
        received: {
          bookingDate: req.query.bookingDate ?? null,
          date: req.query.date ?? null,
          office: req.query.office ?? null,
        },
      });
    }

    const officeDoc = await Office.findOne({ name: officeName });

    if (!officeDoc) {
      return res.status(404).json({ error: "Office not found" });
    }

    const override = officeDoc.customLimits?.find(
      (cl: any) => String(cl.date).trim() === bookingDate,
    );

    const maxSlots =
      override && typeof override.limit === "number"
        ? override.limit
        : officeDoc.defaultMaxSlots;

    const count = await Booking.countDocuments({
      bookingDate,
      office: officeName,
      status: { $nin: ["Rejected", "Cancelled"] },
    });

    return res.status(200).json({
      current: count,
      max: maxSlots,
    });
  } catch (error: any) {
    console.error("❌ Slot Fetch Error:", error);
    return res.status(500).json({
      error: "Internal server error syncing slots.",
      details: error?.message || "Unknown error",
    });
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
      return res.status(400).json({
        success: false,
        error: "Face scan data missing.",
      });
    }

    const officeDoc = await Office.findOne({ name: office });
    if (!officeDoc) {
      return res.status(400).json({
        success: false,
        error: "Office not found.",
      });
    }

    const override = officeDoc.customLimits.find(
      (cl: any) => cl.date === bookingDate,
    );
    const maxSlots =
      override !== undefined ? override.limit : officeDoc.defaultMaxSlots;

    if (maxSlots === 0) {
      return res.status(400).json({
        success: false,
        error: "Office is closed on this date.",
      });
    }

    const count = await Booking.countDocuments({
      bookingDate,
      office,
      status: { $nin: ["Rejected", "Cancelled"] },
    });

    if (count >= maxSlots) {
      return res.status(400).json({
        success: false,
        error: "Capacity Exceeded for this date.",
      });
    }

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
      idType,
      idFront,
      idBack,
      ocrFront,
      ocrBack,
      faceEmbedding: faceEmbedding.map((val: any) => Number(val)),
      status: "Approved",
      timeIn: null,
      transactionTime: null,
      timeOut: null,
      hours: 0,
      actionBy,
    });

    const saved = await newBooking.save();

    const qrCodeDataURL = await QRCode.toDataURL(saved._id.toString(), {
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    res.status(201).json({ success: true, bookingId: saved._id });

    resend.emails
      .send({
        from: process.env.RESEND_FROM_EMAIL as string,
        to: [email],
        subject: "Appointment Approved - Your Secure Access Pass",
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; background-color: #ffffff;">
            <div style="background: #0038A8; padding: 30px; text-align: center;">
              <h1 style="color: #FFD700; margin: 0; letter-spacing: 2px; font-size: 28px; font-weight: 900;">UNIVENTRY</h1>
              <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8;">
                IoT Visitor Management System
              </p>
            </div>

            <div style="padding: 40px; text-align: center; color: #1e293b;">
              <h2 style="color: #0038A8; font-size: 22px; margin-bottom: 10px; font-weight: 800;">
                Hello, ${firstName}!
              </h2>

              <p style="font-size: 15px; color: #475569;">
                Your appointment for <strong>${office}</strong> is
                <span style="color: #10b981; font-weight: bold;">Confirmed</span>.
              </p>

              <div style="margin: 30px 0; padding: 20px; border: 2px dashed #e2e8f0; border-radius: 20px; background-color: #f8fafc; display: inline-block;">
                <img
                  src="${qrCodeDataURL}"
                  alt="QR Code"
                  style="width: 200px; height: 200px; display: block; border-radius: 10px;"
                />

                <p style="margin-top: 15px; font-family: monospace; font-weight: bold; color: #0038A8; font-size: 14px; letter-spacing: 1px;">
                  ID: #${saved._id.toString().slice(-6).toUpperCase()}
                </p>
              </div>

              <p style="font-size: 14px; color: #64748b; margin-bottom: 30px;">
                Present this QR code at the <strong>Campus Gate</strong> scanner.
              </p>

              <div style="margin-top: 30px; padding: 15px; background: #eff6ff; border-radius: 12px; border: 1px solid #dbeafe;">
                <span style="font-size: 10px; font-weight: bold; color: #0038A8; text-transform: uppercase; letter-spacing: 1px;">
                  Valid Date
                </span>
                <br />
                <span style="font-size: 16px; font-weight: 800; color: #1e293b;">
                  ${bookingDate}
                </span>
              </div>
            </div>

            <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 11px; color: #64748b; margin: 0;">
                © ${new Date().getFullYear()} Rizal Technological University Security.
              </p>
            </div>
          </div>
        `,
      })
      .then((result) => {
        if (result.error) {
          console.error("⚠️ Booking QR email failed:", result.error);
        } else {
          console.log("✅ Booking email sent:", result.data);
        }
      })
      .catch((mailErr) => {
        console.error("⚠️ Booking QR email failed:", mailErr);
      });
  } catch (error: any) {
    console.error("❌ Booking Error:", error.message);
    return res.status(500).json({
      error: "Server Error",
      details: error.message,
    });
  }
};

// ---------------------------------------------------------
// 5. SCAN QR (GATE IN/OUT) - AUDIT TRAIL
// ---------------------------------------------------------
export const scanQR = async (req: Request, res: Response): Promise<void> => {
  try {
    const { qrCode, scanType, guardName: bodyGuardName } = req.body;
    const currentUser = (req as any).user;

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
      booking.timeInBy = activeGuard;

      await booking.save();
      console.log(`✅ ENTRY: ${booking.firstName} scanned by ${activeGuard}`);

      res
        .status(200)
        .json({ success: true, message: "Welcome", data: booking });
      return;
    }

    if (scanType === "out") {
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
      booking.timeOutBy = activeGuard;

      const duration =
        Math.abs(now.getTime() - new Date(booking.timeIn).getTime()) / 36e5;
      booking.hours = parseFloat(duration.toFixed(2));

      await booking.save();
      console.log(`✅ EXIT: ${booking.firstName} scanned by ${activeGuard}`);

      res
        .status(200)
        .json({ success: true, message: "Goodbye", data: booking });
      return;
    }

    res.status(400).json({ message: "Invalid scanMode" });
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
    const currentUser = (req as any).user;
    const staffName = currentUser
      ? (currentUser.name || "Staff").toUpperCase()
      : "OFFICE STAFF";

    const booking = await Booking.findById(qrCode);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!booking.timeIn) {
      return res.status(400).json({ message: "Visitor is not on campus yet." });
    }
    if (booking.timeOut) {
      return res.status(400).json({ message: "Visitor has already left." });
    }
    if (booking.transactionTime) {
      return res.status(400).json({ message: "Transaction already recorded." });
    }

    booking.transactionTime = new Date();
    booking.transactionBy = staffName;
    booking.smsSent = false;

    await booking.save();

    console.log(`✅ TRANSACTION: ${booking.firstName} handled by ${staffName}`);

    if (booking.phoneNumber && booking.phoneNumber !== "0000000000") {
      const message = `UniVentry: Hello ${booking.firstName}, your transaction has ended. Please proceed to the exit for the logout process.`;

      console.log(`📨 Triggering background SMS to: ${booking.phoneNumber}`);

      sendSMS(booking.phoneNumber, message).catch((err) =>
        console.error("⚠️ Background SMS Log:", err),
      );
    }

    return res.status(200).json({
      success: true,
      data: booking,
      message: "Transaction Logged.",
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Server Error",
      error: error.message,
    });
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
    const bookings = await Booking.find()
      .select("-idFront -idBack -faceEmbedding")
      .sort({ createdAt: -1 })
      .lean();

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
// 8. DELETE BOOKING
// ---------------------------------------------------------
export const deleteBooking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await Booking.findByIdAndDelete(id);
    return res.status(200).json({ message: "Record deleted permanently." });
  } catch (error) {
    return res.status(500).json({ message: "Server error during deletion." });
  }
};

// ---------------------------------------------------------
// 9. GET VISITOR DETAILS
// ---------------------------------------------------------
export const getVisitorDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ message: "Visitor not found" });
    }

    return res.status(200).json(booking);
  } catch (error: any) {
    console.error("❌ Fetch Visitor Error:", error.message);
    return res.status(500).json({
      message: "Server Error fetching visitor details",
    });
  }
};
