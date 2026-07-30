// src/routes/print.routes.ts
import { Router } from 'express';
import { PrintService } from '../services/print.service';
import { authenticateAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

export const printRouter = Router();

/**
 * GET /api/print/services/:id
 * Fetches Service, parses mapped songs using ChordSheetJS, renders combined layout.
 */
printRouter.get(
  '/services/:id',
  authenticateAdmin, // Or user auth depending on your tenant setup
  asyncHandler(async (req, res) => {
    const service = new PrintService(req.db!, req.tenantId!);
    const htmlStream = await service.renderService(req.params.id);
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlStream);
  })
);

/**
 * GET /api/print/folders/:id
 * Fetches folder contents and renders index list.
 */
printRouter.get(
  '/folders/:id',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const service = new PrintService(req.db!, req.tenantId!);
    const htmlStream = await service.renderFolder(req.params.id);
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlStream);
  })
);

/**
 * GET /api/print/songs/:id
 * Fetches single song, uses ChordSheetJS to format ChordPro -> HTML
 */
printRouter.get(
  '/songs/:id',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const service = new PrintService(req.db!, req.tenantId!);
    const htmlStream = await service.renderSong(req.params.id);
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlStream);
  })
);

/**
 * GET /api/print/templates
 * Lists all registered template IDs, configs, and active state.
 */
printRouter.get(
  '/templates',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const service = new PrintService(req.db!, req.tenantId!);
    const data = await service.getTemplates();
    res.json(data);
  })
);

/**
 * PUT /api/print/settings
 * Updates active template & customized settings payload (e.g. fontSize).
 */
printRouter.put(
  '/settings',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { model, templateId, settings } = req.body;
    
    if (!['service', 'folder', 'song'].includes(model)) {
      return res.status(400).json({ error: 'Invalid print model' });
    }

    const service = new PrintService(req.db!, req.tenantId!);
    const updated = await service.updateSettings(model, templateId, settings);
    
    res.json({ success: true, settings: updated });
  })
);