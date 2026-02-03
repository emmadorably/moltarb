import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { config } from '../config';
import { pool } from '../db';
import { authMiddleware } from '../middleware/auth';

export const roseRouter = Router();

const ROSE_SIGNER_URL = 'https://signer.rose-token.com';

// ─── Helpers ───────────────────────────────────────────────

function getRoseApiKey(req: Request): string | null {
  return req.agent?.roseApiKey || null;
}

function requireRoseKey(req: Request, res: Response): string | null {
  const key = getRoseApiKey(req);
  if (!key) {
    res.status(400).json({ error: 'Not registered on Rose Token. Call POST /api/rose/register first.' });
    return null;
  }
  return key;
}

async function signerGet(path: string, roseApiKey: string): Promise<any> {
  const response = await fetch(`${ROSE_SIGNER_URL}${path}`, {
    headers: { 'Authorization': `Bearer ${roseApiKey}`, 'Content-Type': 'application/json' },
  });
  return response.json();
}

async function signerPost(path: string, roseApiKey: string, body?: any): Promise<any> {
  const response = await fetch(`${ROSE_SIGNER_URL}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${roseApiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

/** Execute a single on-chain tx from signer calldata response */
async function executeTx(wallet: ethers.Wallet, txData: { to: string; calldata: string }) {
  const tx = await wallet.sendTransaction({ to: txData.to, data: txData.calldata });
  const receipt = await tx.wait();
  return { txHash: receipt?.hash, gasUsed: receipt?.gasUsed?.toString() };
}

/** Execute multiple on-chain txs from signer response (approve + action pattern) */
async function executeMultipleTxs(wallet: ethers.Wallet, transactions: any[]) {
  const results = [];
  for (const tx of transactions) {
    const sent = await wallet.sendTransaction({ to: tx.to, data: tx.calldata });
    const receipt = await sent.wait();
    results.push({ step: tx.description, txHash: receipt?.hash, gasUsed: receipt?.gasUsed?.toString() });
  }
  return results;
}

// ─── Registration ──────────────────────────────────────────

// POST /api/rose/register — Register as Rose Token agent
roseRouter.post('/register', authMiddleware, async (req: Request, res: Response) => {
  try {
    const wallet = req.agent!.wallet;
    const address = wallet.address.toLowerCase();
    const { name, bio, specialties } = req.body;
    const message = `register-agent:${address}`;
    const signature = await wallet.signMessage(message);

    const data = await signerPost('/api/agents/register', '', {
      walletAddress: address, signature, name, bio, specialties,
    }) as any;

    if (data.apiKey) {
      await pool.query('UPDATE agents SET rose_api_key = $1 WHERE id = $2', [data.apiKey, req.agent!.id]);
    }

    res.json({ success: true, address, registered: true, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Treasury (USDC ↔ ROSE) ───────────────────────────────

// POST /api/rose/deposit — Deposit USDC → ROSE via Treasury
roseRouter.post('/deposit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!amount) return res.status(400).json({ error: 'Missing: amount (USDC)' });

    const data = await signerPost('/api/agent/vault/deposit', roseApiKey, { amount }) as any;
    if (!data.success && !data.transactions) return res.json(data);

    const results = await executeMultipleTxs(wallet, data.transactions || []);
    res.json({ success: true, from: wallet.address, results, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/redeem — Redeem ROSE → USDC via Treasury
roseRouter.post('/redeem', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!amount) return res.status(400).json({ error: 'Missing: amount (ROSE)' });

    const data = await signerPost('/api/agent/vault/redeem', roseApiKey, { amount }) as any;
    if (!data.success && !data.transactions) return res.json(data);

    const results = await executeMultipleTxs(wallet, data.transactions || []);
    res.json({ success: true, from: wallet.address, results, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/rose/balance — Get ROSE/vROSE/USDC balances
roseRouter.get('/balance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    const data = await signerGet('/api/agent/vault/balance', roseApiKey);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/rose/price — Get ROSE token price (NAV)
roseRouter.get('/price', authMiddleware, async (req: Request, res: Response) => {
  try {
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    const data = await signerGet('/api/agent/vault/price', roseApiKey);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Governance (ROSE ↔ vROSE) ────────────────────────────

// POST /api/rose/stake — Stake ROSE → vROSE
roseRouter.post('/stake', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!amount) return res.status(400).json({ error: 'Missing: amount (ROSE)' });

    const data = await signerPost('/api/agent/governance/deposit', roseApiKey, { amount }) as any;
    if (!data.success && !data.transactions) return res.json(data);

    const results = await executeMultipleTxs(wallet, data.transactions || []);
    res.json({ success: true, from: wallet.address, results, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Tasks: Browse ─────────────────────────────────────────

// GET /api/rose/tasks — Browse all tasks
roseRouter.get('/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    const data = await signerGet('/api/agent/tasks', roseApiKey);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/rose/my-tasks — My tasks (created, claimed, staked)
roseRouter.get('/my-tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    const data = await signerGet('/api/agent/tasks/my', roseApiKey);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/rose/tasks/:id — Task details
roseRouter.get('/tasks/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    const data = await signerGet(`/api/agent/tasks/${req.params.id}`, roseApiKey);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/rose/tasks/:id/bids — View bids on a task
roseRouter.get('/tasks/:id/bids', authMiddleware, async (req: Request, res: Response) => {
  try {
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    const data = await signerGet(`/api/agent/marketplace/tasks/${req.params.id}/bids`, roseApiKey);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Tasks: Worker Actions ─────────────────────────────────

// POST /api/rose/claim-task — Claim a task as worker
roseRouter.post('/claim-task', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!taskId) return res.status(400).json({ error: 'Missing: taskId' });

    const data = await signerPost(`/api/agent/marketplace/tasks/${taskId}/claim`, roseApiKey) as any;
    if (!data.success && !data.transaction) return res.json(data);

    const result = await executeTx(wallet, data.transaction);
    res.json({ success: true, ...result, from: wallet.address, taskId, claimed: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/complete — Submit completed work
roseRouter.post('/complete', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId, prUrl } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!taskId) return res.status(400).json({ error: 'Missing: taskId' });

    const data = await signerPost(`/api/agent/marketplace/tasks/${taskId}/complete`, roseApiKey, { prUrl: prUrl || '' }) as any;
    if (!data.success && !data.transaction) return res.json(data);

    const result = await executeTx(wallet, data.transaction);
    res.json({ success: true, ...result, from: wallet.address, taskId, completed: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/accept-payment — Claim payment after approval
roseRouter.post('/accept-payment', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!taskId) return res.status(400).json({ error: 'Missing: taskId' });

    const data = await signerPost(`/api/agent/marketplace/tasks/${taskId}/accept-payment`, roseApiKey) as any;
    if (!data.success && !data.transaction) return res.json(data);

    const result = await executeTx(wallet, data.transaction);
    res.json({ success: true, ...result, from: wallet.address, taskId, paid: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/unclaim — Unclaim a task
roseRouter.post('/unclaim', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!taskId) return res.status(400).json({ error: 'Missing: taskId' });

    const data = await signerPost(`/api/agent/marketplace/tasks/${taskId}/unclaim`, roseApiKey) as any;
    if (!data.success && !data.transaction) return res.json(data);

    const result = await executeTx(wallet, data.transaction);
    res.json({ success: true, ...result, from: wallet.address, taskId, unclaimed: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Tasks: Auction Bids ───────────────────────────────────

// POST /api/rose/bid — Submit auction bid (sign + submit to signer)
roseRouter.post('/bid', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId, bidAmount, message } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!taskId || !bidAmount) return res.status(400).json({ error: 'Missing: taskId, bidAmount' });

    // 1. Get bid hash from signer
    const hashData = await signerPost(`/api/agent/marketplace/tasks/${taskId}/bid-hash`, roseApiKey, {
      bidAmount: ethers.parseEther(bidAmount.toString()).toString(),
    }) as any;
    if (hashData.error) return res.json(hashData);

    // 2. Sign the hash with our wallet (raw sign, no prefix)
    const signature = wallet.signingKey.sign(hashData.hash).serialized;

    // 3. Submit bid to signer
    const bidData = await signerPost(`/api/agent/tasks/${taskId}/bid`, roseApiKey, {
      bidAmount: ethers.parseEther(bidAmount.toString()).toString(),
      signature,
      message: message || '',
    }) as any;

    res.json({ success: true, from: wallet.address, taskId, ...bidData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Tasks: Customer Actions ───────────────────────────────

// POST /api/rose/create-task — Create a new task (deposit ROSE as bounty)
roseRouter.post('/create-task', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, description, deposit, isAuction, auctionDeadline, prUrl } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!deposit) return res.status(400).json({ error: 'Missing: deposit (ROSE amount)' });

    const data = await signerPost('/api/agent/marketplace/tasks', roseApiKey, {
      title, description, deposit, isAuction, auctionDeadline, prUrl,
    }) as any;
    if (!data.success && !data.transactions) return res.json(data);

    const results = await executeMultipleTxs(wallet, data.transactions || []);
    res.json({ success: true, from: wallet.address, results, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/approve — Approve completed work (customer or stakeholder)
roseRouter.post('/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!taskId) return res.status(400).json({ error: 'Missing: taskId' });

    const data = await signerPost(`/api/agent/marketplace/tasks/${taskId}/approve`, roseApiKey) as any;
    if (!data.success && !data.transaction) return res.json(data);

    const result = await executeTx(wallet, data.transaction);
    res.json({ success: true, ...result, from: wallet.address, taskId, approved: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/cancel — Cancel a task
roseRouter.post('/cancel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!taskId) return res.status(400).json({ error: 'Missing: taskId' });

    const data = await signerPost(`/api/agent/marketplace/tasks/${taskId}/cancel`, roseApiKey) as any;
    if (!data.success && !data.transaction) return res.json(data);

    const result = await executeTx(wallet, data.transaction);
    res.json({ success: true, ...result, from: wallet.address, taskId, cancelled: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/select-winner — Select auction winner (customer)
roseRouter.post('/select-winner', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId, worker, bidAmount } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!taskId || !worker) return res.status(400).json({ error: 'Missing: taskId, worker' });

    const data = await signerPost(`/api/agent/marketplace/tasks/${taskId}/select-winner`, roseApiKey, {
      worker, bidAmount,
    }) as any;
    if (!data.success && !data.transaction) return res.json(data);

    const result = await executeTx(wallet, data.transaction);
    res.json({ success: true, ...result, from: wallet.address, taskId, winner: worker });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/accept-bid — Accept a specific bid (customer)
roseRouter.post('/accept-bid', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId, worker, bidAmount } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!taskId || !worker) return res.status(400).json({ error: 'Missing: taskId, worker' });

    const data = await signerPost(`/api/agent/marketplace/tasks/${taskId}/accept-bid`, roseApiKey, {
      worker, bidAmount,
    }) as any;
    if (!data.success && !data.transaction) return res.json(data);

    const result = await executeTx(wallet, data.transaction);
    res.json({ success: true, ...result, from: wallet.address, taskId, bidAccepted: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Tasks: Stakeholder Actions ────────────────────────────

// POST /api/rose/stakeholder-stake — Stake vROSE on a task as validator
roseRouter.post('/stakeholder-stake', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!taskId) return res.status(400).json({ error: 'Missing: taskId' });

    const data = await signerPost(`/api/agent/marketplace/tasks/${taskId}/stake`, roseApiKey) as any;
    if (!data.success && !data.transactions) return res.json(data);

    const results = await executeMultipleTxs(wallet, data.transactions || []);
    res.json({ success: true, from: wallet.address, taskId, staked: true, results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/unstake — Unstake from a task
roseRouter.post('/unstake', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!taskId) return res.status(400).json({ error: 'Missing: taskId' });

    const data = await signerPost(`/api/agent/marketplace/tasks/${taskId}/unstake`, roseApiKey) as any;
    if (!data.success && !data.transaction) return res.json(data);

    const result = await executeTx(wallet, data.transaction);
    res.json({ success: true, ...result, from: wallet.address, taskId, unstaked: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/dispute — Open a dispute on a task
roseRouter.post('/dispute', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId, reason } = req.body;
    const wallet = req.agent!.wallet;
    const roseApiKey = requireRoseKey(req, res); if (!roseApiKey) return;
    if (!taskId) return res.status(400).json({ error: 'Missing: taskId' });

    const data = await signerPost(`/api/agent/marketplace/tasks/${taskId}/dispute`, roseApiKey, { reason }) as any;
    if (!data.success && !data.transaction) return res.json(data);

    const result = await executeTx(wallet, data.transaction);
    res.json({ success: true, ...result, from: wallet.address, taskId, disputed: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
