import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { config } from '../config';

export const swapRouter = Router();

// Known token addresses on Arbitrum
const TOKENS: Record<string, { address: string; decimals: number }> = {
  USDC: { address: config.contracts.usdc, decimals: 6 },
  WETH: { address: config.contracts.weth, decimals: 18 },
  ETH: { address: config.contracts.weth, decimals: 18 },
  ROSE: { address: config.contracts.rose, decimals: 18 },
};

// POST /api/swap/quote — Get a swap quote (placeholder - needs DEX integration)
swapRouter.post('/quote', async (req: Request, res: Response) => {
  try {
    const { tokenIn, tokenOut, amount } = req.body;

    if (!tokenIn || !tokenOut || !amount) {
      return res.status(400).json({ error: 'Missing: tokenIn, tokenOut, amount' });
    }

    // TODO: Integrate with Camelot or Uniswap V3 quoter
    res.json({
      success: true,
      note: 'Swap quotes coming soon — use /api/rose/deposit for USDC→ROSE via Treasury (better rate, no slippage)',
      tokenIn,
      tokenOut,
      amount,
      suggestion: tokenOut.toUpperCase() === 'ROSE'
        ? 'Use POST /api/rose/deposit to convert USDC → ROSE at Treasury NAV price (no slippage)'
        : 'DEX swap integration in progress',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/swap/execute — Execute a swap (placeholder)
swapRouter.post('/execute', async (req: Request, res: Response) => {
  res.status(501).json({
    error: 'Swap execution coming soon',
    alternatives: {
      'USDC→ROSE': 'POST /api/rose/deposit (Treasury, no slippage)',
      'ROSE→vROSE': 'POST /api/rose/stake (Governance, 1:1)',
    },
  });
});
