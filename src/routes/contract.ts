import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { config } from '../config';
import { authMiddleware } from '../middleware/auth';

export const contractRouter = Router();

// POST /api/contract/call — Read contract state (no auth needed, no gas)
contractRouter.post('/call', async (req: Request, res: Response) => {
  try {
    const { to, data, abi, method, args } = req.body;
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);

    if (data) {
      const result = await provider.call({ to, data });
      return res.json({ success: true, result });
    }

    if (abi && method) {
      const contract = new ethers.Contract(to, abi, provider);
      const result = await contract[method](...(args || []));
      return res.json({ success: true, result: result.toString() });
    }

    res.status(400).json({ error: 'Provide either {data} for raw call or {abi, method, args}' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/contract/send — Execute contract transaction (custodial)
contractRouter.post('/send', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { to, data, value, abi, method, args } = req.body;
    const wallet = req.agent!.wallet;

    if (!to) {
      return res.status(400).json({ error: 'Missing: to' });
    }

    let tx;
    if (data) {
      tx = await wallet.sendTransaction({
        to,
        data,
        value: value ? ethers.parseEther(value.toString()) : 0n,
      });
    } else if (abi && method) {
      const contract = new ethers.Contract(to, abi, wallet);
      tx = await contract[method](...(args || []));
    } else {
      return res.status(400).json({ error: 'Provide {data} or {abi, method, args}' });
    }

    const receipt = await tx.wait();
    res.json({
      success: true,
      txHash: receipt?.hash,
      from: wallet.address,
      blockNumber: receipt?.blockNumber,
      gasUsed: receipt?.gasUsed.toString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/contract/approve — Approve token spending (custodial)
contractRouter.post('/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { token, spender, amount } = req.body;
    const wallet = req.agent!.wallet;

    if (!token || !spender) {
      return res.status(400).json({ error: 'Missing: token, spender' });
    }

    const tokenAbi = [
      'function approve(address,uint256) returns (bool)',
      'function decimals() view returns (uint8)',
    ];
    const contract = new ethers.Contract(token, tokenAbi, wallet);
    const decimals = await contract.decimals();

    const approveAmount = amount === 'unlimited'
      ? ethers.MaxUint256
      : ethers.parseUnits(amount.toString(), decimals);

    const tx = await contract.approve(spender, approveAmount);
    const receipt = await tx.wait();

    res.json({
      success: true,
      txHash: receipt?.hash,
      from: wallet.address,
      token,
      spender,
      amount: amount === 'unlimited' ? 'unlimited' : amount,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
