import dotenv from "dotenv";
const Stream = require("node-rtsp-stream");
dotenv.config();

let cam1Stream: any = null;
let cam2Stream: any = null;

export const initSurveillanceGrid = () => {
  // 🚀 BULLETPROOF FIX: Check if we are running inside Railway
  const isRunningOnRailway =
    !!process.env.RAILWAY_ENVIRONMENT_NAME ||
    !!process.env.RAILWAY_PUBLIC_DOMAIN;

  // Only turn on cameras IF ENABLE_CCTV is true AND we are NOT on Railway
  if (process.env.ENABLE_CCTV === "true" && !isRunningOnRailway) {
    console.log("🛡️ Initializing RTU AI Surveillance Grid (Local Mode)...");

    // MAIN GATE CAMERA (Port 9999)
    if (process.env.CAMERA_1_URL) {
      cam1Stream = new Stream({
        name: process.env.CAMERA_1_NAME || "Main Gate",
        streamUrl: process.env.CAMERA_1_URL,
        wsPort: 9999,
        ffmpegOptions: {
          "-rtsp_transport": "tcp",
          "-stats": "",
          "-r": 30,
          "-q:v": 3,
        },
      });
      console.log(
        "📺 Camera 1 (Main Gate) Broadcasting on ws://localhost:9999",
      );
    }

    // REGISTRAR CAMERA (Port 9998)
    if (process.env.CAMERA_2_URL) {
      cam2Stream = new Stream({
        name: process.env.CAMERA_2_NAME || "Registrar Office",
        streamUrl: process.env.CAMERA_2_URL,
        wsPort: 9998,
        ffmpegOptions: {
          "-stats": "",
          "-r": 30,
          "-q:v": 3,
        },
      });
      console.log(
        "📺 Camera 2 (Registrar) Broadcasting on ws://localhost:9998",
      );
    }
  } else {
    // ☁️ RAILWAY WILL SAFELY PRINT THIS INSTEAD OF CRASHING
    console.log(
      "☁️ Cloud/Railway Mode Active: Hardware CCTV Streams Disabled.",
    );
  }
};
