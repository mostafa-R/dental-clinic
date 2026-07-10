import { Router } from "express";
import {
  createPlan,
  deletePlan,
  getPlan,
  getPlans,
  updatePlan,
} from "../controllers/plan.controller.js";
import { authorizeSite, protectSite } from "../middleware/siteAuth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

const router = Router();

router.use(protectSite);

const planSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  price: z.number().min(0, "Price must be positive"),
  interval: z.enum(["month", "year"]).optional(),
  modules: z.array(z.string()).optional(),
  limits: z
    .object({
      maxBranches: z.number().min(0).optional(),
      maxDoctors: z.number().min(0).optional(),
      maxPatients: z.number().min(0).optional(),
      storage: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
  support: z.string().optional(),
  features: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

router.get("/", authorizeSite("super_admin", "admin", "support"), getPlans);
router.get("/:id", authorizeSite("super_admin", "admin", "support"), getPlan);
router.post("/", authorizeSite("super_admin"), validate(planSchema), createPlan);
router.put("/:id", authorizeSite("super_admin"), validate(planSchema), updatePlan);
router.delete("/:id", authorizeSite("super_admin"), deletePlan);

export default router;
