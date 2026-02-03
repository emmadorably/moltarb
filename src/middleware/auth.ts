import { Request, Response, NextFunction } from 'express';
import { pool, AgentRow } from '../db';
import { decrypt } from '../crypto';
import { ethers } from 'ethers';
import { config } from '../config';

// Extend Express Request to include agent info
declare global {
  namespace Express {
    interface Request {
      agent?: {
        id: number;
        apiKey: string;
        label: string | null;
        address: string;
        roseApiKey: string | null;
        wallet: ethers.Wallet;
      };
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing API key. Use Authorization: Bearer moltarb_...' });
    }

    const apiKey = authHeader.slice(7);
    if (!apiKey.startsWith('moltarb_')) {
      return res.status(401).json({ error: 'Invalid API key format' });
    }

    const result = await pool.query<AgentRow>(
      'SELECT * FROM agents WHERE api_key = $1',
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const agent = result.rows[0];
    const privateKey = decrypt(agent.encrypted_key, agent.iv, agent.auth_tag);
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    req.agent = {
      id: agent.id,
      apiKey: agent.api_key,
      label: agent.label,
      address: agent.address,
      roseApiKey: agent.rose_api_key,
      wallet,
    };

    next();
  } catch (error: any) {
    console.error('[Auth] Error:', error.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
