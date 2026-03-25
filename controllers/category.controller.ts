import { Request, Response } from "express";
import { Category } from "../model/Category.model";

export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
};

export const addCategory = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const newCategory = await Category.create({ name: name.trim() });
    res.status(201).json(newCategory);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to add category (might exist already)" });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete" });
  }
};
