# RemitLend

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Frontend: Next.js](https://img.shields.io/badge/Frontend-Next.js-black?logo=next.js)](https://nextjs.org/)
[![Backend: Express](https://img.shields.io/badge/Backend-Express.js-white?logo=express)](https://expressjs.com/)
[![Smart Contracts: Soroban](https://img.shields.io/badge/Smart_Contracts-Soroban-orange)](https://soroban.stellar.org/)

RemitLend treats remittance history as credit history. Migrant workers prove their financial reliability through monthly cross-border transfers, allowing them to receive fair loans without predatory fees. In return, lenders earn transparent yield powered by the Stellar network.

## 🚀 Vision & Core Features

Migrant workers often lack traditional credit history in host countries, forcing them towards high-interest payday loans. RemitLend bridges this gap by turning consistent remittance records into an on-chain reliability score, unlocking access to affordable capital.

### For Borrowers
- **Credit Building**: Convert your existing remittance history into an actionable credit score.
- **Fair Rates**: Access loans with transparent, non-predatory interest rates.
- **Self-Custody**: Maintain full control of your assets using Stellar wallets.

### For Lenders
- **Transparent Yield**: Earn interest by providing liquidity to audited borrowing pools.
- **Risk Assessment**: Make informed decisions based on verifiable, on-chain remittance proofs (Remittance NFTs).

## 🏗 Project Structure

The repository is organized as a monorepo containing three core packages:

- **`backend/`**: Node.js/Express server providing API support, score generation, and metadata management.
- **`frontend/`**: Next.js web application providing the UI for both borrowers and lenders.
- **`contracts/`**: Soroban (Rust) smart contracts covering the lending pools, loan management, and NFT collateral logic.

*For a detailed look at how these components interact, see our [Architecture Diagram](ARCHITECTURE.md).*

## 🛠 Tech Stack

- **Blockchain**: [Stellar](https://stellar.org) (Soroban Smart Contracts)
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript, Jest
- **Wallet Integration**: [Stellar Wallet Kit](https://github.com/stellar/stellar-wallet-kit) (Freighter)

## 🏁 Getting Started

### Prerequisites

Please ensure you have the following installed before getting started:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Docker & Docker Compose](https://www.docker.com/) (Recommended for easy setup)
- [Rust & Cargo](https://rustup.rs/) (Required for compiling Soroban contracts)
- [Soroban CLI](https://soroban.stellar.org/docs/getting-started/setup)

### Environment Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/remitlend.git
   cd remitlend
   ```

2. **Configure the Backend:**
   Navigate into the backend directory and create a `.env` file based on the example provided.
   ```bash
   cd backend
   cp .env.example .env
   ```
   *Ensure the following minimum variables are set in `backend/.env`:*
   ```env
   PORT=3001
   NODE_ENV=development
   ```

### Running Locally

#### Option A: Using Docker (Recommended)
You can spin up both the frontend and backend simultaneously using Docker Compose from the root directory:
```bash
docker compose up --build
```
- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:3001`

#### Option B: Manual Setup

1. **Start the Backend API:**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

2. **Start the Frontend Application:**
   Open a new terminal window:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Compile Smart Contracts:**
   Open a new terminal window:
   ```bash
   cd contracts
   cargo build --target wasm32-unknown-unknown --release
   ```

### Running Tests
To ensure everything is working correctly, you can run the test suites:

**Backend Tests:**
```bash
cd backend
npm test
```

**Contract Tests:**
```bash
cd contracts
cargo test
```

## 🤝 Contributing

We welcome and appreciate all contributions! Whether it's fixing bugs, improving documentation, or proposing new features, your help makes RemitLend better.

Please read our [Contributing Guidelines](CONTRIBUTING.md) to understand our branching strategy, commit conventions, and the Pull Request process.

## 📜 License

This project is licensed under the ISC License. See the `LICENSE` file for details.
