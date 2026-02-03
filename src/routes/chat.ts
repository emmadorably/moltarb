import { Router, Request, Response } from 'express';

export const chatRouter = Router();

// POST /api/chat — Natural language command (Bankr-compatible pattern)
chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Missing: message' });
    }

    const lower = message.toLowerCase();

    if (lower.includes('create') || lower.includes('new wallet') || lower.includes('sign up')) {
      return res.json({
        action: 'create_wallet',
        endpoint: 'POST /api/wallet/create',
        hint: 'Creates a new custodial wallet. Returns an API key for all future operations.',
      });
    }

    if (lower.includes('balance') || lower.includes('how much')) {
      return res.json({
        action: 'check_balance',
        endpoint: 'GET /api/wallet/balance',
        hint: 'Check your balances (requires API key in Authorization header)',
      });
    }

    if (lower.includes('swap') || lower.includes('trade') || lower.includes('buy rose')) {
      return res.json({
        action: 'deposit',
        endpoint: 'POST /api/rose/deposit',
        hint: 'Convert USDC → ROSE via Treasury at NAV price (no slippage). Body: { "amount": "10" }',
      });
    }

    if (lower.includes('stake') || lower.includes('vrose')) {
      return res.json({
        action: 'stake',
        endpoint: 'POST /api/rose/stake',
        hint: 'Stake ROSE → vROSE via Governance (1:1). Body: { "amount": "1" }',
      });
    }

    if (lower.includes('register') || lower.includes('rose token')) {
      return res.json({
        action: 'register',
        endpoint: 'POST /api/rose/register',
        hint: 'Register your MoltArb wallet as a Rose Token agent',
      });
    }

    if (lower.includes('task') || lower.includes('job') || lower.includes('work')) {
      return res.json({
        action: 'browse_tasks',
        endpoint: 'GET /api/rose/tasks',
        hint: 'Browse available tasks on Rose Token marketplace',
      });
    }

    if (lower.includes('transfer') || lower.includes('send')) {
      return res.json({
        action: 'transfer',
        endpoint: 'POST /api/wallet/transfer',
        hint: 'Transfer tokens. Body: { "to": "0x...", "token": "USDC", "amount": "10" }',
      });
    }

    res.json({
      action: 'help',
      message: 'I can help with: create wallet, balance, deposit/buy, stake, register, tasks, transfer',
      flow: [
        '1. POST /api/wallet/create → get your API key',
        '2. Fund your wallet with ETH (gas) + USDC',
        '3. POST /api/rose/register → register on Rose Token',
        '4. POST /api/rose/deposit → convert USDC to ROSE',
        '5. POST /api/rose/stake → stake ROSE for vROSE',
        '6. GET /api/rose/tasks → find work',
        '7. POST /api/rose/claim-task → claim it',
        '8. POST /api/rose/complete → submit & earn',
      ],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
