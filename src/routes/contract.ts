import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { config } from '../config';

export const contractRouter = Router();

// POST /api/contract/call — Read contract state (no gas needed)
contractRouter.post('/call', async (req: Request, res: Response) => {
  try {
    const { to, data, abi, method, args } = req.body;
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);

    if (data) {
      // Raw calldata
      const result = await provider.call({ to, data });
      return res.json({ success: true, result });
    }

    if (abi && method) {
      // ABI-based call
      const contract = new ethers.Contract(to, abi, provider);
      const result = await contract[method](...(args || []));
      return res.json({ success: true, result: result.toString() });
    }

    res.status(400).json({ error: 'Provide either {data} for raw call or {abi, method, args}' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/contract/send — Execute contract transaction
contractRouter.post('/send', async (req: Request, res: Response) => {
  try {
    const { privateKey, to, data, value, abi, method, args } = req.body;

    if (!privateKey || !to) {
      return res.status(400).json({ error: 'Missing required fields: privateKey, to' });
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    let tx;
    if (data) {
      // Raw calldata
      tx = await wallet.sendTransaction({
        to,
        data,
        value: value ? ethers.parseEther(value.toString()) : 0n,
      });
    } else if (abi && method) {
      // ABI-based
      const contract = new ethers.Contract(to, abi, wallet);
      tx = await contract[method](...(args || []));
    } else {
      return res.status(400).json({ error: 'Provide {data} or {abi, method, args}' });
    }

    const receipt = await tx.wait();
    res.json({
      success: true,
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber,
      gasUsed: receipt?.gasUsed.toString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/contract/approve — Approve token spending
contractRouter.post('/approve', async (req: Request, res: Response) => {
  try {
    const { privateKey, token, spender, amount } = req.body;

    if (!privateKey || !token || !spender) {
      return res.status(400).json({ error: 'Missing: privateKey, token, spender' });
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

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
      token,
      spender,
      amount: amount === 'unlimited' ? 'unlimited' : amount,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
