import { Router } from 'express';

export const renderRouter = Router();

function removedAirtableRenderMessage() {
  return {
    success: false,
    error: 'Airtable-driven render endpoints have been removed from render-engine. Use social-posting-v2 for production render orchestration.',
  };
}

renderRouter.post('/sync', (_req, res) => {
  res.status(410).json(removedAirtableRenderMessage());
});

renderRouter.post('/test', (_req, res) => {
  res.status(410).json(removedAirtableRenderMessage());
});
