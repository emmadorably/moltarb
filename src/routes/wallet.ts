import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

export const walletRouter = Router();

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// POST /api/wallet/create — Create a new agent wallet
walletRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const { label } = req.body;
    const wallet = ethers.Wallet.createRandom();

    // TODO: Encrypt and store in database
    res.status(201).json({
      success: true,
      wallet: {
        address: wallet.address,
        privateKey: wallet.privateKey, // In production, encrypt this
        label: label || `agent-${uuidv4().slice(0, 8)}`,
      },
      warning: 'Store your private key securely — it cannot be retrieved again.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/wallet/:address — Get wallet balances
walletRouter.get('/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);

    // Get ETH balance
    const ethBalance = await provider.getBalance(address);

    // Get token balances
    const tokens = [
      { name: 'USDC', address: config.contracts.usdc },
      { name: 'ROSE', address: config.contracts.rose },
      { name: 'vROSE', address: config.contracts.vrose },
    ];

    const balances: Record<string, string> = {
      ETH: ethers.formatEther(ethBalance),
    };

    for (const token of tokens) {
      try {
        const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
        const balance = await contract.balanceOf(address);
        const decimals = await contract.decimals();
        balances[token.name] = ethers.formatUnits(balance, decimals);
      } catch {
        balances[token.name] = '0';
      }
    }

    res.json({ address, chain: 'arbitrum-one', balances });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/wallet/transfer — Transfer tokens
walletRouter.post('/transfer', async (req: Request, res: Response) => {
  try {
    const { privateKey, to, token, amount } = req.body;

    if (!privateKey || !to || !amount) {
      return res.status(400).json({ error: 'Missing required fields: privateKey, to, amount' });
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    if (!token || token.toUpperCase() === 'ETH') {
      // ETH transfer
      const tx = await wallet.sendTransaction({
        to,
        value: ethers.parseEther(amount.toString()),
      });
      const receipt = await tx.wait();
      return res.json({
        success: true,
        txHash: receipt?.hash,
        from: wallet.address,
        to,
        amount,
        token: 'ETH',
      });
    }

    // ERC20 transfer
    const tokenAddresses: Record<string, string> = {
      USDC: config.contracts.usdc,
      ROSE: config.contracts.rose,
      VROSE: config.contracts.vrose,
    };

    const tokenAddress = tokenAddresses[token.toUpperCase()] || token;
    const contract = new ethers.Contract(
      tokenAddress,
      [...ERC20_ABI, 'function transfer(address,uint256) returns (bool)'],
      wallet
    );

    const decimals = await contract.decimals();
    const tx = await contract.transfer(to, ethers.parseUnits(amount.toString(), decimals));
    const receipt = await tx.wait();

    res.json({
      success: true,
      txHash: receipt?.hash,
      from: wallet.address,
      to,
      amount,
      token: token.toUpperCase(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
