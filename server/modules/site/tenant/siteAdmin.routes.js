import { Router } from "express";
import { z } from "zod";
import { audit } from "../../../middleware/audit.js";
import { authorizeSite, protectSite } from "../../../middleware/siteAuth.js";
import { validate } from "../../../middleware/validate.js";
import {
  createAdmin,
  deleteAdmin,
  getAdmin,
  getAdmins,
  updateAdmin,
  updateAdminPermissions,
} from "./siteAdmin.controller.js";

const router = Router();

router.use(protectSite);

const adminSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  role: z.enum(["super_admin", "site_admin", "admin", "support"]).optional(),
  permissions: z.array(z.string()).optional(),
});

router.get("/", authorizeSite("super_admin", "admin"), getAdmins);
router.get("/:id", authorizeSite("super_admin", "admin"), getAdmin);
router.post("/", authorizeSite("super_admin"), validate(adminSchema), audit("admin.create", "admin"), createAdmin);
router.put("/:id", authorizeSite("super_admin"), validate(adminSchema), audit("admin.update", "admin"), updateAdmin);
router.delete("/:id", authorizeSite("super_admin"), audit("admin.delete", "admin"), deleteAdmin);
router.put("/:id/permissions", authorizeSite("super_admin"), validate(z.object({ permissions: z.array(z.string()) })), audit("admin.update_permissions", "admin"), updateAdminPermissions);

export default router;
