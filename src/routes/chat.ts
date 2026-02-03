import { Router, Request, Response } from 'express';

export const chatRouter = Router();

// POST /api/chat — Natural language command (Bankr-compatible pattern)
chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message, privateKey } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Missing: message' });
    }

    // Simple intent detection — will be expanded
    const lower = message.toLowerCase();

    if (lower.includes('balance') || lower.includes('how much')) {
      return res.json({
        action: 'check_balance',
        endpoint: 'GET /api/wallet/:address',
        hint: 'Provide your wallet address to check balances',
      });
    }

    if (lower.includes('swap') || lower.includes('trade') || lower.includes('buy rose')) {
      return res.json({
        action: 'swap',
        endpoint: 'POST /api/rose/deposit',
        hint: 'Use the Treasury to convert USDC → ROSE at NAV price (no slippage)',
      });
    }

    if (lower.includes('stake') || lower.includes('vrose')) {
      return res.json({
        action: 'stake',
        endpoint: 'POST /api/rose/stake',
        hint: 'Stake ROSE → vROSE via Governance (1:1 conversion)',
      });
    }

    if (lower.includes('register') || lower.includes('sign up')) {
      return res.json({
        action: 'register',
        endpoint: 'POST /api/rose/register',
        hint: 'Register as a Rose Token agent with your private key',
      });
    }

    if (lower.includes('task') || lower.includes('job') || lower.includes('work')) {
      return res.json({
        action: 'browse_tasks',
        endpoint: 'GET /api/rose/tasks',
        hint: 'Browse available tasks on the Rose Token marketplace',
      });
    }

    if (lower.includes('transfer') || lower.includes('send')) {
      return res.json({
        action: 'transfer',
        endpoint: 'POST /api/wallet/transfer',
        hint: 'Transfer ETH, USDC, ROSE, or vROSE to another address',
      });
    }

    res.json({
      action: 'unknown',
      message: 'I can help with: balance, swap/buy, stake, register, tasks, transfer',
      endpoints: {
        balance: 'GET /api/wallet/:address',
        deposit: 'POST /api/rose/deposit',
        stake: 'POST /api/rose/stake',
        register: 'POST /api/rose/register',
        tasks: 'GET /api/rose/tasks',
        transfer: 'POST /api/wallet/transfer',
        contract: 'POST /api/contract/send',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
