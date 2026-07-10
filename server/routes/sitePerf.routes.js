import { Router } from "express";
import { protectSite } from "../middleware/siteAuth.js";
import { authorizeSite } from "../middleware/siteAuth.js";
import { getPerfStats, resetPerfStats } from "../services/perfMonitor.js";

const router = Router();

router.use(protectSite);

router.get("/", authorizeSite("super_admin", "admin"), (_req, res) => {
  const stats = getPerfStats();
  res.json({ success: true, data: stats });
});

router.post("/reset", authorizeSite("super_admin"), (_req, res) => {
  resetPerfStats();
  res.json({ success: true, data: { message: "Performance stats reset" } });
});

export default router;
