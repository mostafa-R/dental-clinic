import { Router } from "express";
import { authorizeSite, protectSite } from "../../../middleware/siteAuth.js";
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

router.get("/", authorizeSite("super_admin", "admin", "support"), getBranches);

router.get("/:id", authorizeSite("super_admin", "admin", "support"), getBranch);

router.post(
  "/",
  authorizeSite("super_admin", "admin"),
  validate(createBranchSchema),
  createBranch,
);

router.put(
  "/:id",
  authorizeSite("super_admin", "admin"),
  validate(updateBranchSchema),
  updateBranch,
);

router.delete("/:id", authorizeSite("super_admin"), deleteBranch);

export default router;
