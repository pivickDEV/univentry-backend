/* eslint-disable */
import bcrypt from "bcrypt";
import { Request, Response } from "express";
import User from "../model/user"; // Ensure your User model path is correct
import { sendEmail } from "../services/email.service"; // Ensure your Brevo service path is correct

// --- TEMPORARY MEMORY STORE FOR CAPSTONE ---
const resetOtpStore: Record<string, { otp: string; expires: number }> = {};
const verifiedResetSessions = new Set<string>();

// =========================================================
// 1. CREATE USER (SIGNUP) - WITH BREVO EMAIL & SECURITY
// =========================================================

export const createUser = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, email, password, role } = req.body;

    const creatorRole = (req as any).user?.role;

    if (role === "super-admin" && creatorRole !== "super-admin") {
      return res.status(403).json({
        message:
          "Access Denied: Only Super Admins can create Super Admin accounts.",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
    });

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden;">
        <div style="background: #0038A8; padding: 30px; text-align: center;">
          <h1 style="color: #FFD700; margin: 0; letter-spacing: 2px; font-size: 28px; font-weight: 900;">UNIVENTRY</h1>
          <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8;">System Access Granted</p>
        </div>
        <div style="padding: 40px; text-align: left; color: #1e293b;">
          <h2 style="color: #0038A8; font-size: 22px; margin-bottom: 10px; font-weight: 800;">Hello, ${name}!</h2>
          <p style="font-size: 15px; color: #475569;">An administrator has successfully provisioned your account for the UniVentry System.</p>
          
          <div style="margin: 30px 0; padding: 20px; border: 1px solid #e2e8f0; border-radius: 15px; background-color: #f8fafc;">
            <p style="margin: 0 0 10px 0; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Your Credentials</p>
            <p style="margin: 5px 0;"><strong>Role Clearance:</strong> <span style="color: #0038A8; background: #eff6ff; padding: 2px 8px; border-radius: 4px;">${role.toUpperCase()}</span></p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <span style="font-family: monospace; background: #e2e8f0; padding: 2px 6px;">${password}</span></p>
          </div>
          
          <p style="font-size: 14px; color: #dc2626; font-weight: bold;">⚠️ Security Notice: Please log in immediately and change your password.</p>
        </div>
      </div>
    `;

    // 🔥 FIX: Added 'await' and strict error logging so we know exactly why Brevo isn't sending it.
    try {
      console.log(`[BREVO] Attempting to send credentials to ${email}...`);
      await sendEmail({
        to: email,
        subject: "🔑 Your UniVentry System Credentials",
        htmlContent: emailHtml,
      });
      console.log(`[BREVO] Success! Email delivered to ${email}`);
    } catch (mailErr: any) {
      console.error(
        "⚠️ Brevo Email Failed to Send! Reason:",
        mailErr.response?.body || mailErr.message || mailErr,
      );
    }

    return res.status(201).json({
      success: true,
      message: "Personnel registered successfully.",
      user: newUser,
    });
  } catch (error: any) {
    console.error("Create User Error:", error);
    return res
      .status(500)
      .json({ message: "Server error during registration." });
  }
};

// =========================================================
// 2. DELETE USER - WITH SUPER ADMIN SECURITY LOCK
// =========================================================
export const deleteUser = async (req: Request, res: Response): Promise<any> => {
  try {
    const targetUser = await User.findById(req.params.id);
    const requesterRole = (req as any).user?.role;

    if (!targetUser) return res.status(404).json({ message: "User not found" });

    // 🔒 SECURITY CHECK: Admins cannot delete Super Admins
    if (targetUser.role === "super-admin" && requesterRole !== "super-admin") {
      return res.status(403).json({
        message: "Clearance Denied: Cannot purge a Super Admin account.",
      });
    }

    await User.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: "User deleted successfully." });
  } catch (error) {
    console.error("Delete User Error:", error);
    return res.status(500).json({ message: "Failed to delete user." });
  }
};

// =========================================================
// 3. UPDATE USER PROFILE & EMAIL (SECURITY LOCKED)
// =========================================================
export const updateProfile = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { userId, name, email } = req.body;
    const requesterRole = (req as any).user?.role;
    const targetUser = await User.findById(userId);

    if (!targetUser)
      return res.status(404).json({ message: "User not found." });

    // 🔒 SECURITY CHECK: Only Super Admins can edit Super Admin emails/profiles
    if (targetUser.role === "super-admin" && requesterRole !== "super-admin") {
      return res.status(403).json({
        message: "Clearance Denied: Cannot modify a Super Admin profile.",
      });
    }

    // Check if another user already has this email
    const emailExists = await User.findOne({ email, _id: { $ne: userId } });
    if (emailExists) {
      return res
        .status(400)
        .json({ message: "This email is already in use by another account." });
    }

    const nameParts = name.split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ");

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, firstName, lastName, email },
      { new: true },
    ).select("-password");

    return res
      .status(200)
      .json({ message: "Profile updated successfully.", user: updatedUser });
  } catch (error) {
    console.error("Update Profile Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// =========================================================
// 4. UPDATE EMAIL ONLY (RESTORED & SECURED)
// =========================================================
export const updateEmail = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    const requesterRole = (req as any).user?.role;

    const targetUser = await User.findById(id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    // 🔒 SECURITY CHECK: Admins cannot change a Super Admin's email
    if (targetUser.role === "super-admin" && requesterRole !== "super-admin") {
      return res.status(403).json({
        message: "Clearance Denied: Cannot modify a Super Admin account.",
      });
    }

    targetUser.email = email;
    await targetUser.save(); // Using save to trigger mongoose validations (like unique constraints)

    return res
      .status(200)
      .json({ message: "Email updated successfully.", user: targetUser });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email is already in use." });
    }
    return res.status(500).json({ message: "Server error updating email." });
  }
};

// =========================================================
// 5. UPDATE USER ROLE (SECURITY LOCKED)
// =========================================================
export const updateUserRole = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const targetUser = await User.findById(req.params.id);
    const { role: newRole } = req.body;
    const requesterRole = (req as any).user?.role;

    if (!targetUser) return res.status(404).json({ message: "User not found" });

    // 🔒 SECURITY CHECK: Admins cannot edit an existing Super Admin
    if (targetUser.role === "super-admin" && requesterRole !== "super-admin") {
      return res.status(403).json({
        message: "Clearance Denied: Cannot modify a Super Admin account.",
      });
    }

    // 🔒 SECURITY CHECK: Admins cannot promote someone TO Super Admin
    if (newRole === "super-admin" && requesterRole !== "super-admin") {
      return res.status(403).json({
        message:
          "Clearance Denied: Only Super Admins can grant developer privileges.",
      });
    }

    targetUser.role = newRole;
    await targetUser.save();

    return res
      .status(200)
      .json({ message: "Clearance level updated.", user: targetUser });
  } catch (error) {
    console.error("Update Role Error:", error);
    return res.status(500).json({ message: "Failed to update role." });
  }
};

// =========================================================
// 6. UPDATE OFFICE (FOR OFFICE STAFF)
// =========================================================
export const updateOffice = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { id } = req.params;
    const { office } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { office: office },
      { new: true },
    );
    if (!user) return res.status(404).json({ message: "User not found." });

    return res
      .status(200)
      .json({ message: "Office updated successfully.", user });
  } catch (error) {
    return res.status(500).json({ message: "Server error updating office." });
  }
};

// =========================================================
// 7. CHANGE PASSWORD (DOUBLE-HASH FIX)
// =========================================================
export const changePassword = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { userId, currentPassword, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid current passcode." });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await User.findByIdAndUpdate(userId, { password: hashedPassword });

    return res
      .status(200)
      .json({ message: "Security key overridden successfully." });
  } catch (error) {
    console.error("Change Password Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// =========================================================
// 8. FORGOT PASSWORD (SEND OTP VIA BREVO)
// =========================================================
export const forgotPassword = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res
        .status(404)
        .json({ message: "No authorized account found with this email." });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    resetOtpStore[user.email] = { otp, expires: Date.now() + 15 * 60 * 1000 };

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

// =========================================================
// 9. VERIFY OTP
// =========================================================
export const verifyResetOTP = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { email, otp } = req.body;
    const userEmail = email.toLowerCase();
    const record = resetOtpStore[userEmail];

    if (!record)
      return res
        .status(400)
        .json({ message: "No active recovery session found." });
    if (Date.now() > record.expires) {
      delete resetOtpStore[userEmail];
      return res.status(400).json({ message: "Recovery code has expired." });
    }
    if (record.otp !== otp)
      return res.status(400).json({ message: "Invalid authorization code." });

    delete resetOtpStore[userEmail];
    verifiedResetSessions.add(userEmail);

    return res.status(200).json({ success: true, message: "Signal Verified." });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// =========================================================
// 10. RESET PASSWORD
// =========================================================
export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { email, newPassword } = req.body;
    const userEmail = email.toLowerCase();

    if (!verifiedResetSessions.has(userEmail)) {
      return res
        .status(403)
        .json({ message: "Unauthorized. Verify OTP first." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await User.findOneAndUpdate(
      { email: userEmail },
      { password: hashedPassword },
    );
    verifiedResetSessions.delete(userEmail);

    return res
      .status(200)
      .json({ success: true, message: "Security key encrypted successfully." });
  } catch (error) {
    console.error("Reset Password Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// =========================================================
// 11. GET ALL USERS
// =========================================================
export const getAllUsers = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const users = await User.find().select("-password");
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
