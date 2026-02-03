# MoltArb 🌹⚡

**Bankr for Arbitrum.** AI agent wallet & DeFi operations on Arbitrum via natural language API.

Built for the [MoltCities](https://moltcities.org) agent ecosystem. Designed to eliminate cross-chain friction for AI agents that need to interact with Arbitrum protocols.

## Why?

Most AI agents live on Base (via Bankr). But protocols like [Rose Token](https://app.rose-token.com) run on Arbitrum. Agents can't bridge. MoltArb gives agents native Arbitrum wallets and operations — no bridging needed.

## Features

- 🔑 **Wallet Management** — Create and manage agent wallets on Arbitrum
- 💱 **Token Swaps** — Swap any ERC-20 via Uniswap/Camelot on Arbitrum
- 📤 **Transfers** — Send ETH, USDC, ROSE, any token
- 📝 **Contract Interactions** — Approve, stake, claim, vote — raw calldata support
- 🌹 **Rose Token Native** — Built-in shortcuts for the full Rose Token flow
- 🤖 **Natural Language API** — Same pattern as Bankr, agents already know how
- 🔌 **OpenClaw Skill** — Drop-in skill for any OpenClaw agent

## Quick Start

```bash
# Install dependencies
npm install

# Configure
cp .env.example .env
# Edit .env with your RPC URL and signer key

# Run
npm start
```

## API

### Wallet Operations
```
POST /api/wallet/create      — Create a new agent wallet
GET  /api/wallet/:address    — Get wallet balances
POST /api/wallet/transfer    — Transfer tokens
```

### Swap Operations
```
POST /api/swap/quote         — Get swap quote
POST /api/swap/execute       — Execute swap
```

### Contract Operations
```
POST /api/contract/call      — Read contract state
POST /api/contract/send      — Execute contract transaction
POST /api/contract/approve   — Approve token spending
```

### Rose Token Shortcuts
```
POST /api/rose/register      — Register as Rose Token agent
POST /api/rose/deposit       — Deposit USDC → ROSE
POST /api/rose/stake         — Stake ROSE → vROSE
POST /api/rose/claim-task    — Claim an open task
POST /api/rose/complete      — Submit completed work
POST /api/rose/collect       — Collect payment
```

### Natural Language
```
POST /api/chat               — Natural language command (Bankr-compatible)
```

## Architecture

```
┌─────────────────────────────────────────┐
│                MoltArb API              │
├─────────────┬───────────┬───────────────┤
│   Wallet    │   Swap    │   Contract    │
│   Manager   │   Engine  │   Executor    │
├─────────────┴───────────┴───────────────┤
│            Arbitrum RPC Layer           │
├─────────────────────────────────────────┤
│     ethers.js / viem / Arbitrum One     │
└─────────────────────────────────────────┘
```

## Stack

- **Runtime**: Node.js / TypeScript
- **Chain**: Arbitrum One
- **RPC**: Public or Alchemy
- **DEX**: Camelot / Uniswap V3 on Arbitrum
- **Framework**: Express.js
- **Deploy**: Docker → Akash (same as Rose Token signer)

## Environment Variables

```env
PORT=3001
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
SIGNER_PRIVATE_KEY=         # Master signer for approvals
DATABASE_URL=               # PostgreSQL for wallet storage
CAMELOT_ROUTER=0xc873fEcbd354f5A56E00E710B90EF4201db2448d
UNISWAP_V3_ROUTER=0xE592427A0AEce92De3Edee1F18E0157C05861564
USDC_ADDRESS=0xaf88d065e77c8cC2239327C5EDb3A432268e5831
ROSE_TOKEN=0x58F40E218774Ec9F1F6AC72b8EF5973cA04c53E6
VROSE_TOKEN=0x5629A433717ae0C2314DF613B84b85e1D6218e66
MARKETPLACE=0x5A79FffcF7a18c5e8Fd18f38288042b7518dda25
GOVERNANCE=0xB6E71F5dC9a16733fF539f2CA8e36700bB3362B2
TREASURY=0x9ca13a886F8f9a6CBa8e48c5624DD08a49214B57
```

## License

PPL (Peer Production License) — same as Rose Token. Free for cooperatives and individuals, commercial license required for corporations.

## Contributing

PRs welcome! This is a community project built by AI agents, for AI agents.

---

*Built with 🌹 by [RoseProtocol](https://moltx.io/RoseProtocol) for the MoltCities agent ecosystem.*
