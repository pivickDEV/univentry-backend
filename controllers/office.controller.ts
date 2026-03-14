/* eslint-disable */
import { Request, Response } from "express";
import { Office } from "../model/Office"; // Ensure path is correct
import Booking from "../model/booking.model"; // Ensure path is correct

// 1. Get all offices
export const getAllOffices = async (_req: Request, res: Response) => {
  try {
    const offices = await Office.find().sort({ createdAt: -1 });
    return res.status(200).json(offices);
  } catch (error: any) {
    console.error("❌ getAllOffices error:", error.message);
    return res.status(500).json({ message: "Failed to fetch offices" });
  }
};

// 2. Create a new office
export const createOffice = async (req: Request, res: Response) => {
  try {
    const { name, defaultMaxSlots } = req.body;
    const newOffice = new Office({ name, defaultMaxSlots, customLimits: [] });
    await newOffice.save();
    res.status(201).json(newOffice);
  } catch (error) {
    res.status(400).json({ message: "Office name already exists" });
  }
};

// 3. Update office (Handles both name/limit AND date overrides)
export const updateOffice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updatedOffice = await Office.findByIdAndUpdate(id, req.body, {
      new: true,
    });

    if (!updatedOffice)
      return res.status(404).json({ message: "Office not found" });

    res.json(updatedOffice);
  } catch (error) {
    res.status(400).json({ message: "Update failed" });
  }
};

// 4. Delete office
export const deleteOffice = async (req: Request, res: Response) => {
  try {
    await Office.findByIdAndDelete(req.params.id);
    res.json({ message: "Office removed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Delete failed" });
  }
};

// 🔥 FIX 2: Optimized getAvailableSlots for bookingDate
export const getAvailableSlots = async (req: Request, res: Response) => {
  // 🔥 CHANGE 1: Accept bookingDate from frontend query
  const bookingDate = req.query.bookingDate as string;
  const officeName = req.query.office as string;

  if (!bookingDate || !officeName) {
    return res
      .status(400)
      .json({ message: "Booking Date and Office are required" });
  }

  try {
    // 1. Find the office settings
    const officeDoc = await Office.findOne({ name: officeName });
    if (!officeDoc)
      return res.status(404).json({ message: "Office not found" });

    // 2. LOGIC: Check for date-specific override
    // Note: officeDoc.customLimits likely still uses 'date' property, which is fine.
    // We compare it against our incoming 'bookingDate'.
    const override = officeDoc.customLimits.find(
      (cl: any) => cl.date === bookingDate,
    );

    // 3. Determine Max Slots (Override vs Default)
    const maxSlots =
      override !== undefined ? override.limit : officeDoc.defaultMaxSlots;

    // 4. Count current bookings
    // 🔥 CHANGE 2: Use 'bookingDate' to query the Booking Collection
    const currentBookings = await Booking.countDocuments({
      office: officeName,
      bookingDate: bookingDate,
      status: { $nin: ["Rejected", "Cancelled"] }, // Exclude invalid bookings
    });

    res.json({
      current: currentBookings,
      max: maxSlots,
    });
  } catch (error) {
    console.error("Slot Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
