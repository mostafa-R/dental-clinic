import { Router } from "express";
import { authorizeSite, protectSite, requireBranchAccess, requireTenantAccess } from "../../../middleware/siteAuth.js";
import { validate } from "../../../middleware/validate.js";
import { createBranchSchema, updateBranchSchema } from "../../users/branch.validator.js";
import {
  createBranch,
  deleteBranch,
  getBranch,
  getBranches,
  updateBranch,
} from "./siteBranch.controller.js";

const router = Router();

router.use(protectSite);

// List branches - optional tenant filter
router.get("/", authorizeSite("super_admin", "admin", "support"), getBranches);

// Get single branch - validates branch exists
router.get("/:id", authorizeSite("super_admin", "admin", "support"), requireBranchAccess, getBranch);

// Create branch - validates tenant exists
router.post(
  "/",
  authorizeSite("super_admin", "admin"),
  requireTenantAccess,
  validate(createBranchSchema),
  createBranch,
);

// Update branch - validates branch exists and belongs to tenant (if specified)
router.put(
  "/:id",
  authorizeSite("super_admin", "admin"),
  requireBranchAccess,
  validate(updateBranchSchema),
  updateBranch,
);

// Delete branch - validates branch exists
router.delete("/:id", authorizeSite("super_admin"), requireBranchAccess, deleteBranch);

export default router;
