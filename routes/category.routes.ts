import express from "express";
import {
  addCategory,
  deleteCategory,
  getCategories,
} from "../controllers/category.controller";
import { protect } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/", getCategories);
router.post("/", protect, addCategory);
router.delete("/:id", protect, deleteCategory);

export default router;
