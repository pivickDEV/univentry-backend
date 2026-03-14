/* eslint-disable */
import { Request, Response } from "express";
import Booking from "../model/booking.model";

export const getAuditTrail = async (req: Request, res: Response) => {
  try {
    // 🔥 THE FIX: .select() excludes the heavy images/vectors so this loads instantly
    // .lean() converts Mongoose documents to plain JSON objects for faster processing
    const bookings = await Booking.find()
      .select("-idFront -idBack -faceEmbedding")
      .sort({ createdAt: -1 })
      .lean();

    const auditLogs = bookings.map((log: any) => {
      // Duration Logic
      let calculatedHours = 0;
      if (log.timeIn && log.timeOut) {
        const start = new Date(log.timeIn).getTime();
        const end = new Date(log.timeOut).getTime();
        calculatedHours = (end - start) / (1000 * 60 * 60);
      } else if (log.timeIn && !log.timeOut) {
        const start = new Date(log.timeIn).getTime();
        calculatedHours = (Date.now() - start) / (1000 * 60 * 60);
      }

      return {
        ...log, // Keep all other fields (_id, firstName, office, etc.)

        // 🔥 FIX: Check bookingDate first, fallback to old 'date', fallback to today
        bookingDate:
          log.bookingDate || log.date || new Date().toISOString().split("T")[0],

        hours: calculatedHours,
        actionBy: log.actionBy || "SYSTEM",

        // These fields are explicitly removed by .select() above to save memory,
        // but we ensure they are cleanly undefined in the payload
        idFront: undefined,
        idBack: undefined,
        faceEmbedding: undefined,
      };
    });

    res.status(200).json(auditLogs);
  } catch (error) {
    console.error("Audit Controller Error:", error);
    res.status(500).json({ message: "Server error fetching audit logs" });
  }
};

export const deleteAuditLog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await Booking.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Log not found" });
    }

    res.status(200).json({ message: "Audit log removed permanently" });
  } catch (error) {
    res.status(500).json({ message: "Server error during deletion" });
  }
};
