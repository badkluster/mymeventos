import { Router } from 'express';
import promotionsRoutes from './promotions.routes';
import templatesRoutes from './templates.routes';
import audiencesRoutes from './audiences.routes';
import marketingSettingsRoutes from './marketing-settings.routes';
import campaignsRoutes from './campaigns.routes';
import dashboardRoutes from './dashboard.routes';
import internalRoutes from './internal.routes';

const router = Router();
router.use('/promotions', promotionsRoutes);
router.use('/templates', templatesRoutes);
router.use('/audiences', audiencesRoutes);
router.use('/settings', marketingSettingsRoutes);
router.use('/campaigns', campaignsRoutes);
// dashboardRoutes/internalRoutes define their own full sub-paths (/dashboard,
// /process, /webhooks/:provider) — mounted at the router root, not auth-gated
// as a block, since /process and /webhooks are secret/signature-protected instead.
router.use(dashboardRoutes);
router.use(internalRoutes);

export default router;
