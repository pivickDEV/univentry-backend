/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import jwt from "jsonwebtoken";
import {
  forgotPassword,
  resetPassword,
  verifyResetOTP,
} from "../controllers/user.controller";
import User from "../model/user";

const router = express.Router();

// ----------------------
// LOGIN ENDPOINT
// ----------------------
router.post("/login", async (req: express.Request, res: express.Response) => {
  const { email, password } = req.body;

  console.log("-----------------------------------------");
  console.log("🔐 LOGIN ATTEMPT:", email);

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log("❌ User not found");
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isPasswordValid = await (user as any).comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("Server Misconfiguration: JWT_SECRET missing");
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    console.log(`✅ Login Successful: ${user.name} [${user.role}]`);

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        office: user.office, // ✨ ADDED: Ensure frontend gets the office on login
      },
    });
  } catch (err: any) {
    console.error("🔥 LOGIN ERROR:", err.message);
    return res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ----------------------
// SIGNUP ENDPOINT
// ----------------------
const handleSignup = async (req: express.Request, res: express.Response) => {
  // ✨ FIX: Destructure 'office' from req.body
  const { name, email, password, role, office } = req.body;

  console.log("-----------------------------------------");
  console.log("📝 SIGNUP ATTEMPT:", email, "Role:", role, "Office:", office);

  try {
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email is already registered." });
    }

    // ✨ FIX: Include 'office' in the new User object
    // Note: We only save office if the role is 'office' or 'admin'
    const newUser = new User({
      name,
      email,
      password,
      role,
      office: role === "super-admin" || role === "guard" ? "System" : office,
    });

    await newUser.save();
    console.log("✅ User Successfully Created:", newUser.name);

    return res.status(201).json({
      message: "User registered successfully!",
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        office: newUser.office, // ✨ Return the office back to frontend
      },
    });
  } catch (err: any) {
    console.error("🔥 SIGNUP ERROR:", err.message);
    return res.status(500).json({
      message: "Server error during registration.",
      error: err.message,
    });
  }
};

router.post("/signup", handleSignup);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOTP);
router.post("/reset-password", resetPassword);

export default router;
