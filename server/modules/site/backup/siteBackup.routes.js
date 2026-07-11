import { Router } from "express";
import { protectSite } from "../../../middleware/siteAuth.js";
import { authorizeSite } from "../../../middleware/siteAuth.js";
import { getBackups, getBackup, triggerManualBackup } from "./siteBackup.controller.js";

const router = Router();

router.use(protectSite);

router.get("/", authorizeSite("super_admin", "admin"), getBackups);
router.get("/:id", authorizeSite("super_admin", "admin"), getBackup);
router.post("/", authorizeSite("super_admin"), triggerManualBackup);

export default router;
