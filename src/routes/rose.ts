import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { config } from '../config';

export const roseRouter = Router();

const ROSE_SIGNER_URL = 'https://signer.rose-token.com';

// POST /api/rose/register — Register as Rose Token agent
roseRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { privateKey } = req.body;
    if (!privateKey) return res.status(400).json({ error: 'Missing privateKey' });

    const wallet = new ethers.Wallet(privateKey);
    const address = wallet.address.toLowerCase();
    const message = `register-agent:${address}`;
    const signature = await wallet.signMessage(message);

    const response = await fetch(`${ROSE_SIGNER_URL}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: address, signature }),
    });

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/deposit — Deposit USDC → ROSE via Treasury
roseRouter.post('/deposit', async (req: Request, res: Response) => {
  try {
    const { privateKey, apiKey, amount } = req.body;
    if (!privateKey || !apiKey || !amount) {
      return res.status(400).json({ error: 'Missing: privateKey, apiKey, amount' });
    }

    // Step 1: Get deposit calldata from signer
    const response = await fetch(`${ROSE_SIGNER_URL}/api/agent/vault/deposit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount }),
    });
    const data = await response.json();

    if (!data.success) return res.json(data);

    // Step 2: Execute approvals + deposit on-chain
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const results = [];

    for (const tx of data.transactions || []) {
      const sent = await wallet.sendTransaction({
        to: tx.to,
        data: tx.calldata,
      });
      const receipt = await sent.wait();
      results.push({ step: tx.description, txHash: receipt?.hash });
    }

    res.json({ success: true, results, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/stake — Stake ROSE → vROSE via Governance
roseRouter.post('/stake', async (req: Request, res: Response) => {
  try {
    const { privateKey, apiKey, amount } = req.body;
    if (!privateKey || !apiKey || !amount) {
      return res.status(400).json({ error: 'Missing: privateKey, apiKey, amount' });
    }

    const response = await fetch(`${ROSE_SIGNER_URL}/api/agent/governance/deposit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount }),
    });
    const data = await response.json();

    if (!data.success) return res.json(data);

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const results = [];

    for (const tx of data.transactions || []) {
      const sent = await wallet.sendTransaction({ to: tx.to, data: tx.calldata });
      const receipt = await sent.wait();
      results.push({ step: tx.description, txHash: receipt?.hash });
    }

    res.json({ success: true, results, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/claim-task — Claim an open task
roseRouter.post('/claim-task', async (req: Request, res: Response) => {
  try {
    const { privateKey, apiKey, taskId } = req.body;
    if (!privateKey || !apiKey || !taskId) {
      return res.status(400).json({ error: 'Missing: privateKey, apiKey, taskId' });
    }

    const response = await fetch(`${ROSE_SIGNER_URL}/api/agent/marketplace/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();

    if (!data.success) return res.json(data);

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const tx = await wallet.sendTransaction({
      to: data.transaction.to,
      data: data.transaction.calldata,
    });
    const receipt = await tx.wait();

    res.json({
      success: true,
      txHash: receipt?.hash,
      taskId,
      claimed: true,
      ...data,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/rose/tasks — Browse available tasks
roseRouter.get('/tasks', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(`${ROSE_SIGNER_URL}/api/agent/tasks`, { headers });
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rose/complete — Submit completed work
roseRouter.post('/complete', async (req: Request, res: Response) => {
  try {
    const { privateKey, apiKey, taskId, prUrl } = req.body;
    if (!privateKey || !apiKey || !taskId) {
      return res.status(400).json({ error: 'Missing: privateKey, apiKey, taskId' });
    }

    const response = await fetch(`${ROSE_SIGNER_URL}/api/agent/marketplace/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prUrl: prUrl || '' }),
    });
    const data = await response.json();

    if (!data.success) return res.json(data);

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const tx = await wallet.sendTransaction({
      to: data.transaction.to,
      data: data.transaction.calldata,
    });
    const receipt = await tx.wait();

    res.json({ success: true, txHash: receipt?.hash, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
