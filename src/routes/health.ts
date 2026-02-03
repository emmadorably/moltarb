import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { config } from '../config';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const blockNumber = await provider.getBlockNumber();

    res.json({
      status: 'ok',
      chain: 'arbitrum-one',
      blockNumber,
      version: '0.1.0',
      contracts: {
        rose: config.contracts.rose,
        marketplace: config.contracts.marketplace,
        treasury: config.contracts.treasury,
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: 'RPC connection failed',
    });
  }
});
