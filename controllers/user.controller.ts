// ... existing imports ...
import bcrypt from "bcrypt"; // or "bcrypt" depending on what you installed
import { Request, Response } from "express";
import User from "../model/user"; // Ensure your User model is imported
import { sendEmail } from "../services/email.service"; // Adjust path to your Brevo service

export const updateEmail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { email: email },
      { new: true }, // Returns the updated document
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ message: "Email updated successfully.", user });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email is already in use." });
    }
    res.status(500).json({ message: "Server error updating email." });
  }
};

// 🔥 2. UPDATE OFFICE
export const updateOffice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { office } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { office: office },
      { new: true },
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ message: "Office updated successfully.", user });
  } catch (error) {
    res.status(500).json({ message: "Server error updating office." });
  }
};

// --- TEMPORARY MEMORY STORE FOR CAPSTONE ---
// In a massive production app, this goes into Redis or MongoDB.
// For your defense, in-memory is blazing fast and works perfectly.
const resetOtpStore: Record<string, { otp: string; expires: number }> = {};
const verifiedResetSessions = new Set<string>();

// ---------------------------------------------------------
// 1. FORGOT PASSWORD (SEND OTP VIA BREVO)
// ---------------------------------------------------------
export const forgotPassword = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    // 1. Check if user actually exists in the database
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res
        .status(404)
        .json({ message: "No authorized account found with this email." });
    }

    // 2. Generate 6-Digit Code (Valid for 15 mins)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    resetOtpStore[user.email] = {
      otp,
      expires: Date.now() + 15 * 60 * 1000,
    };

    // 3. Send Beautiful RTU Email via Brevo
    const htmlContent = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; background-color: #ffffff;">
        <div style="background: #001233; padding: 30px; text-align: center; border-bottom: 4px solid #FFD700;">
          <h1 style="color: #FFD700; margin: 0; letter-spacing: 2px; font-size: 28px; font-weight: 900;">UNIVENTRY</h1>
          <p style="color: #60a5fa; margin: 5px 0 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Security Command Node</p>
        </div>
        <div style="padding: 40px; text-align: center; color: #1e293b;">
          <h2 style="color: #0038A8; font-size: 22px; margin-bottom: 10px; font-weight: 800;">Access Recovery Protocol</h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">
            A request was made to override the security credentials for <strong>${user.email}</strong>. 
            Use the authorization code below to proceed.
          </p>
          <div style="margin: 30px auto; padding: 20px; background-color: #f8fafc; border: 2px dashed #0038A8; border-radius: 15px; display: inline-block;">
            <p style="margin: 0; font-family: monospace; font-weight: 900; color: #0038A8; font-size: 32px; letter-spacing: 8px;">${otp}</p>
          </div>
          <p style="font-size: 12px; color: #ef4444; font-weight: bold; text-transform: uppercase; tracking-widest;">
            ⚠️ This code expires in 15 minutes.
          </p>
          <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
            If you did not initiate this request, please ignore this email. Your account remains secure.
          </p>
        </div>
        <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 10px; color: #64748b; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
            &copy; ${new Date().getFullYear()} Rizal Technological University.
          </p>
        </div>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: "Action Required: UniVentry Password Reset",
      htmlContent,
    });

    return res
      .status(200)
      .json({ success: true, message: "Beacon transmitted." });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ---------------------------------------------------------
// 2. VERIFY OTP
// ---------------------------------------------------------
export const verifyResetOTP = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { email, otp } = req.body;
    const userEmail = email.toLowerCase();

    const record = resetOtpStore[userEmail];

    if (!record) {
      return res
        .status(400)
        .json({ message: "No active recovery session found." });
    }

    if (Date.now() > record.expires) {
      delete resetOtpStore[userEmail];
      return res
        .status(400)
        .json({ message: "Recovery code has expired. Request a new one." });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ message: "Invalid authorization code." });
    }

    // OTP is correct! Delete it from store and mark session as verified
    delete resetOtpStore[userEmail];
    verifiedResetSessions.add(userEmail);

    return res.status(200).json({ success: true, message: "Signal Verified." });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ---------------------------------------------------------
// 3. RESET PASSWORD (ENCRYPT NEW KEY)
// ---------------------------------------------------------
export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { email, newPassword } = req.body;
    const userEmail = email.toLowerCase();

    // 1. Security Check: Did they actually verify the OTP?
    if (!verifiedResetSessions.has(userEmail)) {
      return res
        .status(403)
        .json({ message: "Unauthorized. You must verify the OTP first." });
    }

    // 2. Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 3. Update the database
    await User.findOneAndUpdate(
      { email: userEmail },
      { password: hashedPassword },
    );

    // 4. Clear the verified session
    verifiedResetSessions.delete(userEmail);

    return res
      .status(200)
      .json({ success: true, message: "Security key encrypted successfully." });
  } catch (error) {
    console.error("Reset Password Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};
