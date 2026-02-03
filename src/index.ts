import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { walletRouter } from './routes/wallet';
import { swapRouter } from './routes/swap';
import { contractRouter } from './routes/contract';
import { roseRouter } from './routes/rose';
import { chatRouter } from './routes/chat';
import { healthRouter } from './routes/health';
import { skillRouter } from './routes/skill';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/health', healthRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/swap', swapRouter);
app.use('/api/contract', contractRouter);
app.use('/api/rose', roseRouter);
app.use('/api/chat', chatRouter);
app.use('/skill', skillRouter);
app.use('/api/skill', skillRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[MoltArb] Error:', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(config.port, () => {
  console.log(`🌹⚡ MoltArb running on port ${config.port}`);
  console.log(`   Chain: Arbitrum One`);
  console.log(`   RPC: ${config.rpcUrl}`);
  console.log(`   Rose Token contracts loaded`);
});

export default app;
