import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { config } from '../config';
import { authMiddleware } from '../middleware/auth';

export const bridgeRouter = Router();

const CHAIN_CONFIG: Record<string, { chainId: number; rpc: string; name: string }> = {
  arbitrum: { chainId: 42161, rpc: config.rpcUrl, name: 'Arbitrum One' },
  base: { chainId: 8453, rpc: config.baseRpcUrl || 'https://mainnet.base.org', name: 'Base' },
};

const RELAY_API = 'https://api.relay.link';

// POST /api/bridge/quote — Get a bridge quote via Relay.link
bridgeRouter.post('/quote', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { from, to, amount, currency } = req.body;
    const wallet = req.agent!.wallet;

    if (!from || !to || !amount) {
      return res.status(400).json({
        error: 'Missing: from, to, amount',
        example: { from: 'base', to: 'arbitrum', amount: '0.01', currency: 'eth' },
        chains: Object.keys(CHAIN_CONFIG),
      });
    }

    const fromChain = CHAIN_CONFIG[from.toLowerCase()];
    const toChain = CHAIN_CONFIG[to.toLowerCase()];

    if (!fromChain) return res.status(400).json({ error: `Unknown chain: ${from}. Use: ${Object.keys(CHAIN_CONFIG).join(', ')}` });
    if (!toChain) return res.status(400).json({ error: `Unknown chain: ${to}. Use: ${Object.keys(CHAIN_CONFIG).join(', ')}` });

    const token = (currency || 'eth').toLowerCase();
    const isETH = token === 'eth' || token === 'weth';

    // USDC addresses per chain
    const usdcAddresses: Record<number, string> = {
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arb USDC
      8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // Base USDC
    };

    // Build Relay quote request (v2 API: originCurrency + destinationCurrency + tradeType)
    const originCurrency = isETH ? 'eth' : usdcAddresses[fromChain.chainId];
    const destinationCurrency = isETH ? 'eth' : usdcAddresses[toChain.chainId];

    const quoteBody: any = {
      user: wallet.address,
      originChainId: fromChain.chainId,
      destinationChainId: toChain.chainId,
      amount: isETH
        ? ethers.parseEther(amount.toString()).toString()
        : ethers.parseUnits(amount.toString(), 6).toString(), // USDC = 6 decimals
      originCurrency,
      destinationCurrency,
      tradeType: 'EXACT_INPUT',
    };

    const quoteRes = await fetch(`${RELAY_API}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quoteBody),
    });

    const quote = await quoteRes.json() as any;

    if (quote.message || quote.error) {
      return res.status(400).json({
        error: 'Bridge quote failed',
        details: quote.message || quote.error,
        request: quoteBody,
      });
    }

    res.json({
      success: true,
      from: fromChain.name,
      to: toChain.name,
      amount,
      currency: isETH ? 'ETH' : 'USDC',
      quote,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/bridge/execute — Execute a bridge (get quote + sign + send)
bridgeRouter.post('/execute', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { from, to, amount, currency } = req.body;
    const wallet = req.agent!.wallet;

    if (!from || !to || !amount) {
      return res.status(400).json({
        error: 'Missing: from, to, amount',
        example: { from: 'base', to: 'arbitrum', amount: '0.01', currency: 'eth' },
      });
    }

    const fromChain = CHAIN_CONFIG[from.toLowerCase()];
    const toChain = CHAIN_CONFIG[to.toLowerCase()];

    if (!fromChain) return res.status(400).json({ error: `Unknown chain: ${from}` });
    if (!toChain) return res.status(400).json({ error: `Unknown chain: ${to}` });

    const token = (currency || 'eth').toLowerCase();
    const isETH = token === 'eth' || token === 'weth';

    // Get quote from Relay (v2 API)
    const usdcAddresses: Record<number, string> = {
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    };

    const originCurrency = isETH ? 'eth' : (usdcAddresses[fromChain.chainId] || 'eth');
    const destinationCurrency = isETH ? 'eth' : (usdcAddresses[toChain.chainId] || 'eth');

    const quoteBody: any = {
      user: wallet.address,
      originChainId: fromChain.chainId,
      destinationChainId: toChain.chainId,
      amount: isETH
        ? ethers.parseEther(amount.toString()).toString()
        : ethers.parseUnits(amount.toString(), 6).toString(),
      originCurrency,
      destinationCurrency,
      tradeType: 'EXACT_INPUT',
    };

    const quoteRes = await fetch(`${RELAY_API}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quoteBody),
    });

    const quote = await quoteRes.json() as any;

    if (quote.message || quote.error) {
      return res.status(400).json({
        error: 'Bridge quote failed',
        details: quote.message || quote.error,
      });
    }

    // Extract transaction steps from quote
    const steps = quote.steps || [];
    const results = [];

    for (const step of steps) {
      const items = step.items || [];
      for (const item of items) {
        const txData = item.data;
        if (!txData) continue;

        // Connect wallet to the source chain RPC
        const provider = new ethers.JsonRpcProvider(fromChain.rpc);
        const connectedWallet = wallet.connect(provider);

        const tx: any = {
          to: txData.to,
          data: txData.data,
          chainId: fromChain.chainId,
        };

        if (txData.value) tx.value = BigInt(txData.value);
        if (txData.gasLimit) tx.gasLimit = BigInt(txData.gasLimit);

        const sent = await connectedWallet.sendTransaction(tx);
        const receipt = await sent.wait();

        results.push({
          step: step.id || 'bridge',
          txHash: receipt?.hash,
          chainId: fromChain.chainId,
          chain: fromChain.name,
        });
      }
    }

    res.json({
      success: true,
      from: fromChain.name,
      to: toChain.name,
      amount,
      currency: isETH ? 'ETH' : 'USDC',
      results,
      note: `Bridge initiated. Funds should arrive on ${toChain.name} within ~30 seconds.`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
