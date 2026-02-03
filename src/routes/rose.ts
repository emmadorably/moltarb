import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { config } from '../config';
import { pool } from '../db';
import { authMiddleware } from '../middleware/auth';

export const roseRouter = Router();

const ROSE_SIGNER_URL = 'https://signer.rose-token.com';

// POST /api/rose/register — Register as Rose Token agent (custodial)
roseRouter.post('/register', authMiddleware, async (req: Request, res: Response) => {
  try {
    const wallet = req.agent!.wallet;
    const address = wallet.address.toLowerCase();
    const message = `register-agent:${address}`;
    const signature = await wallet.signMessage(message);

    const response = await fetch(`${ROSE_SIGNER_URL}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: address, signature }),
    });

    const data = await response.json() as any;

    // Store Rose Token API key if registration succeeded
    if (data.apiKey) {
      await pool.query(
        'UPDATE agents SET rose_api_key = $1 WHERE id = $2',
        [data.apiKey, req.agent!.id]
      );
    }

    res.json({
      success: true,
      address,
      roseAgentId: data.agentId,
      registered: true,
      ...data,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to get Rose Token API key
function getRoseApiKey(req: Request): string | null {
  return req.agent?.roseApiKey || null;
}

// POST /api/rose/deposit — Deposit USDC → ROSE via Treasury (custodial)
roseRouter.post('/deposit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = getRoseApiKey(req);

    if (!amount) return res.status(400).json({ error: 'Missing: amount' });
    if (!roseApiKey) return res.status(400).json({ error: 'Not registered on Rose Token. Call POST /api/rose/register first.' });

    const response = await fetch(`${ROSE_SIGNER_URL}/api/agent/vault/deposit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${roseApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount }),
    });
    const data = await response.json() as any;

    if (!data.success) return res.json(data);

    const results = [];
    for (const tx of data.transactions || []) {
      const sent = await wallet.sendTransaction({ to: tx.to, data: tx.calldata });
      const receipt = await sent.wait();
      results.push({ step: tx.description, txHash: receipt?.hash });
    }

    res.json({ success: true, from: wallet.address, results, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/stake — Stake ROSE → vROSE via Governance (custodial)
roseRouter.post('/stake', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = getRoseApiKey(req);

    if (!amount) return res.status(400).json({ error: 'Missing: amount' });
    if (!roseApiKey) return res.status(400).json({ error: 'Not registered on Rose Token. Call POST /api/rose/register first.' });

    const response = await fetch(`${ROSE_SIGNER_URL}/api/agent/governance/deposit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${roseApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount }),
    });
    const data = await response.json() as any;

    if (!data.success) return res.json(data);

    const results = [];
    for (const tx of data.transactions || []) {
      const sent = await wallet.sendTransaction({ to: tx.to, data: tx.calldata });
      const receipt = await sent.wait();
      results.push({ step: tx.description, txHash: receipt?.hash });
    }

    res.json({ success: true, from: wallet.address, results, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/claim-task — Claim a task (custodial)
roseRouter.post('/claim-task', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = getRoseApiKey(req);

    if (!taskId) return res.status(400).json({ error: 'Missing: taskId' });
    if (!roseApiKey) return res.status(400).json({ error: 'Not registered on Rose Token. Call POST /api/rose/register first.' });

    const response = await fetch(`${ROSE_SIGNER_URL}/api/agent/marketplace/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${roseApiKey}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json() as any;

    if (!data.success) return res.json(data);

    const tx = await wallet.sendTransaction({
      to: data.transaction.to,
      data: data.transaction.calldata,
    });
    const receipt = await tx.wait();

    res.json({ success: true, txHash: receipt?.hash, from: wallet.address, taskId, claimed: true, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/rose/tasks — Browse tasks (no auth needed)
roseRouter.get('/tasks', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // If agent is authed with moltarb key, use their stored Rose API key
    if (apiKey?.startsWith('moltarb_')) {
      const result = await pool.query('SELECT rose_api_key FROM agents WHERE api_key = $1', [apiKey]);
      if (result.rows[0]?.rose_api_key) {
        headers['Authorization'] = `Bearer ${result.rows[0].rose_api_key}`;
      }
    } else if (apiKey?.startsWith('rose_agent_')) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${ROSE_SIGNER_URL}/api/agent/tasks`, { headers });
    const data = await response.json() as any;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/complete — Submit completed work (custodial)
roseRouter.post('/complete', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId, prUrl } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = getRoseApiKey(req);

    if (!taskId) return res.status(400).json({ error: 'Missing: taskId' });
    if (!roseApiKey) return res.status(400).json({ error: 'Not registered on Rose Token. Call POST /api/rose/register first.' });

    const response = await fetch(`${ROSE_SIGNER_URL}/api/agent/marketplace/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${roseApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prUrl: prUrl || '' }),
    });
    const data = await response.json() as any;

    if (!data.success) return res.json(data);

    const tx = await wallet.sendTransaction({
      to: data.transaction.to,
      data: data.transaction.calldata,
    });
    const receipt = await tx.wait();

    res.json({ success: true, txHash: receipt?.hash, from: wallet.address, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
