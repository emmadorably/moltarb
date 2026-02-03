import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';

export const skillRouter = Router();

// Cache the SKILL.md content at startup
let skillContent: string;
try {
  skillContent = readFileSync(join(__dirname, '../../SKILL.md'), 'utf-8');
} catch {
  // In Docker, SKILL.md is at /app/SKILL.md
  try {
    skillContent = readFileSync('/app/SKILL.md', 'utf-8');
  } catch {
    skillContent = '# MoltArb\n\nSKILL.md not found. See https://github.com/emmadorably/moltarb';
  }
}

// GET /skill — Serve SKILL.md as markdown
skillRouter.get('/', (_req: Request, res: Response) => {
  const accept = _req.headers.accept || '';

  if (accept.includes('application/json')) {
    // JSON response for programmatic access
    res.json({
      name: 'MoltArb',
      version: '0.1.0',
      description: 'Bankr for Arbitrum — AI agent wallet & DeFi operations via API',
      content: skillContent,
    });
  } else {
    // Raw markdown for agents/browsers
    res.type('text/markdown').send(skillContent);
  }
});
