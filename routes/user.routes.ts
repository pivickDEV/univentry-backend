/* eslint-disable */
import express, { Request, Response } from "express";
import {
  changePassword,
  deleteUser,
  updateEmail,
  updateOffice,
  updateProfile,
} from "../controllers/user.controller";
import { authorize, protect } from "../middlewares/auth.middleware";
import User from "../model/user"; // Make sure this matches your actual filename (e.g., user.model or user)

const router = express.Router();

// ==========================================================
// 1. GET ALL USERS
// ==========================================================
/**
 * @route   GET /api/users
 * @desc    Get all staff members for the management list
 * @access  Private (Admin Only)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    // Sort by newest first and hide passwords for security
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (err) {
    console.error("Fetch Users Error:", err);
    res.status(500).json({ message: "Failed to retrieve user list" });
  }
});

// ==========================================================
// 2. UPDATE EMAIL & OFFICE (From Controller)
// ==========================================================
router.patch("/:id/email", updateEmail);
router.patch("/:id/office", updateOffice);

// ==========================================================
// 3. UPDATE ROLE
// ==========================================================
/**
 * @route   PATCH /api/users/:id/role
 * @desc    Update a staff member's role
 * @access  Private (Admin Only)
 */
router.patch("/:id/role", async (req: Request, res: Response) => {
  const { role } = req.body;
  const { id } = req.params;

  // Validate that the role is allowed based on your model enum
  const validRoles = ["admin", "guard", "office", "super-admin"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: "Invalid role assignment" });
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true, runValidators: true },
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: `Role updated to ${role} successfully`,
      user: updatedUser,
    });
  } catch (err) {
    console.error("Update Role Error:", err);
    res.status(500).json({ message: "Server error during role update" });
  }
});

router.delete("/:id", protect, authorize("admin", "super-admin"), deleteUser);

router.put("/update-profile", async (req, res) => {
  try {
    const { userId, name, email } = req.body;

    // Use findByIdAndUpdate to ensure we are targeting the specific user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, email },
      { new: true },
    ).select("-password");

    if (!updatedUser)
      return res.status(404).json({ message: "User not found" });

    res.status(200).json({
      message: "Update successful",
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        office: updatedUser.office, // Keep the office info
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/update-profile", updateProfile);
router.put("/change-password", changePassword);

export default router;
