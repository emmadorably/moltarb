import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { config } from '../config';
import { pool } from '../db';
import { encrypt, generateApiKey } from '../crypto';
import { authMiddleware } from '../middleware/auth';

export const walletRouter = Router();

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address,uint256) returns (bool)',
];

// POST /api/wallet/create — Create a new custodial agent wallet
walletRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const { label } = req.body;
    const wallet = ethers.Wallet.createRandom();
    const apiKey = generateApiKey();

    // Encrypt private key
    const { encrypted, iv, authTag } = encrypt(wallet.privateKey);

    // Store in database
    await pool.query(
      `INSERT INTO agents (api_key, label, address, encrypted_key, iv, auth_tag)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [apiKey, label || null, wallet.address.toLowerCase(), encrypted, iv, authTag]
    );

    res.status(201).json({
      success: true,
      apiKey,
      address: wallet.address,
      label: label || null,
      chain: 'arbitrum-one',
      note: 'Save your API key — it cannot be retrieved again. Use it as: Authorization: Bearer moltarb_...',
    });
  } catch (error: any) {
    if (error.code === '23505') {
      // Unique violation — extremely unlikely with random wallet
      return res.status(409).json({ error: 'Wallet already exists, try again' });
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/wallet/balance — Get authenticated agent's balances
walletRouter.get('/balance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { address } = req.agent!;
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);

    const ethBalance = await provider.getBalance(address);

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

// GET /api/wallet/info — Get agent wallet info
walletRouter.get('/info', authMiddleware, async (req: Request, res: Response) => {
  res.json({
    address: req.agent!.address,
    label: req.agent!.label,
    chain: 'arbitrum-one',
    roseRegistered: !!req.agent!.roseApiKey,
  });
});

// GET /api/wallet/:address — Public balance lookup (no auth needed)
walletRouter.get('/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const ethBalance = await provider.getBalance(address);

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

// POST /api/wallet/transfer — Transfer tokens (custodial, server signs)
walletRouter.post('/transfer', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { to, token, amount } = req.body;
    const wallet = req.agent!.wallet;

    if (!to || !amount) {
      return res.status(400).json({ error: 'Missing: to, amount' });
    }

    if (!token || token.toUpperCase() === 'ETH') {
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

    const tokenAddresses: Record<string, string> = {
      USDC: config.contracts.usdc,
      ROSE: config.contracts.rose,
      VROSE: config.contracts.vrose,
    };

    const tokenAddress = tokenAddresses[token.toUpperCase()] || token;
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
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

// POST /api/wallet/sign — Sign an arbitrary message (EIP-191 personal_sign)
walletRouter.post('/sign', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Missing: message' });
    }

    const wallet = req.agent!.wallet;
    const signature = await wallet.signMessage(message);

    res.json({
      success: true,
      address: wallet.address,
      message,
      signature,
      type: 'personal_sign',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/wallet/sign-hash — Sign a raw hash (no prefix, for bid-hash patterns)
walletRouter.post('/sign-hash', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { hash } = req.body;
    if (!hash) {
      return res.status(400).json({ error: 'Missing: hash (0x-prefixed bytes32)' });
    }

    const wallet = req.agent!.wallet;
    const signature = wallet.signingKey.sign(hash).serialized;

    res.json({
      success: true,
      address: wallet.address,
      hash,
      signature,
      type: 'raw_sign',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/wallet/sign-typed — Sign EIP-712 typed data
walletRouter.post('/sign-typed', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { domain, types, value } = req.body;
    if (!domain || !types || !value) {
      return res.status(400).json({ error: 'Missing: domain, types, value (EIP-712 typed data)' });
    }

    const wallet = req.agent!.wallet;
    const signature = await wallet.signTypedData(domain, types, value);

    res.json({
      success: true,
      address: wallet.address,
      signature,
      type: 'eip712',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
