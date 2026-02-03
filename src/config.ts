import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
  baseRpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://moltarb:moltarb@localhost:5432/moltarb',
  encryptionKey: process.env.ENCRYPTION_KEY || '',

  contracts: {
    usdc: process.env.USDC_ADDRESS || '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    weth: process.env.WETH_ADDRESS || '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    rose: process.env.ROSE_TOKEN || '0x58F40E218774Ec9F1F6AC72b8EF5973cA04c53E6',
    vrose: process.env.VROSE_TOKEN || '0x5629A433717ae0C2314DF613B84b85e1D6218e66',
    marketplace: process.env.MARKETPLACE || '0x5A79FffcF7a18c5e8Fd18f38288042b7518dda25',
    governance: process.env.GOVERNANCE || '0xB6E71F5dC9a16733fF539f2CA8e36700bB3362B2',
    treasury: process.env.TREASURY || '0x9ca13a886F8f9a6CBa8e48c5624DD08a49214B57',
    camelotRouter: process.env.CAMELOT_ROUTER || '0xc873fEcbd354f5A56E00E710B90EF4201db2448d',
    uniswapV3Router: process.env.UNISWAP_V3_ROUTER || '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  },
};
