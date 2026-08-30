import { TextDecoder, TextEncoder } from "util";

if (typeof global.TextEncoder === "undefined") {
  (global as any).TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  (global as any).TextDecoder = TextDecoder;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  Account,
  Address,
  Keypair,
  rpc,
  scValToNative,
  TransactionBuilder,
} = require("@stellar/stellar-sdk");
const { buildUnsignedLoanRequestXdr, buildUnsignedRepaymentXdr } = require("./soroban");

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

describe("buildUnsignedLoanRequestXdr", () => {
  const borrower = Keypair.random().publicKey();
  const contractId = Keypair.random().publicKey();

  beforeEach(() => {
    jest.spyOn(rpc.Server.prototype, "getAccount").mockResolvedValue(new Account(borrower, "100"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("invokes the request_loan function on the given contract", async () => {
    const xdrString = await buildUnsignedLoanRequestXdr({
      borrower,
      amount: 1000,
      term: 12,
      contractId,
    });

    const tx = TransactionBuilder.fromXDR(xdrString, NETWORK_PASSPHRASE);
    const op = tx.operations[0];
    expect(op.type).toBe("invokeHostFunction");

    if (op.type === "invokeHostFunction") {
      const invokeArgs = op.func.invokeContract();
      expect(invokeArgs.functionName().toString()).toBe("request_loan");
      expect(Address.fromScAddress(invokeArgs.contractAddress()).toString()).toBe(contractId);
    }
  });

  it("orders arguments as [borrower, amount, term]", async () => {
    const term = 12;

    const xdrString = await buildUnsignedLoanRequestXdr({
      borrower,
      amount: 1000,
      term,
      contractId,
    });

    const tx = TransactionBuilder.fromXDR(xdrString, NETWORK_PASSPHRASE);
    const op = tx.operations[0];

    if (op.type === "invokeHostFunction") {
      const args = op.func.invokeContract().args();
      expect(args).toHaveLength(3);

      const borrowerVal = scValToNative(args[0]);
      const termVal = scValToNative(args[2]);

      expect(borrowerVal).toBe(borrower);
      expect(termVal).toBe(term);
    }
  });

  it("encodes the full loan amount into the XDR, not a tenth of it", async () => {
    const inputAmount = 1000;

    const xdrString = await buildUnsignedLoanRequestXdr({
      borrower,
      amount: inputAmount,
      term: 12,
      contractId,
    });

    const tx = TransactionBuilder.fromXDR(xdrString, NETWORK_PASSPHRASE);
    const op = tx.operations[0];

    if (op.type === "invokeHostFunction") {
      const args = op.func.invokeContract().args();
      const amountVal = scValToNative(args[1]);

      expect(amountVal).toBe(BigInt(inputAmount));
      expect(amountVal).not.toBe(BigInt(inputAmount / 10));
    }
  });

  it("floors fractional amounts before encoding as i128", async () => {
    const xdrString = await buildUnsignedLoanRequestXdr({
      borrower,
      amount: 1000.75,
      term: 12,
      contractId,
    });

    const tx = TransactionBuilder.fromXDR(xdrString, NETWORK_PASSPHRASE);
    const op = tx.operations[0];

    if (op.type === "invokeHostFunction") {
      const args = op.func.invokeContract().args();
      const amountVal = scValToNative(args[1]);

      expect(amountVal).toBe(BigInt(1000));
    }
  });
});

describe("buildUnsignedRepaymentXdr", () => {
  const borrower = Keypair.random().publicKey();
  const contractId = Keypair.random().publicKey();

  beforeEach(() => {
    jest.spyOn(rpc.Server.prototype, "getAccount").mockResolvedValue(new Account(borrower, "100"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("invokes the repay function on the given contract", async () => {
    const xdrString = await buildUnsignedRepaymentXdr({
      borrower,
      loanId: "42",
      amount: 1000,
      contractId,
    });

    const tx = TransactionBuilder.fromXDR(xdrString, NETWORK_PASSPHRASE);
    const op = tx.operations[0];
    expect(op.type).toBe("invokeHostFunction");

    if (op.type === "invokeHostFunction") {
      const invokeArgs = op.func.invokeContract();
      expect(invokeArgs.functionName().toString()).toBe("repay");
      expect(Address.fromScAddress(invokeArgs.contractAddress()).toString()).toBe(contractId);
    }
  });

  it("orders arguments as [borrower, loanId, amount]", async () => {
    const loanId = "42";

    const xdrString = await buildUnsignedRepaymentXdr({
      borrower,
      loanId,
      amount: 1000,
      contractId,
    });

    const tx = TransactionBuilder.fromXDR(xdrString, NETWORK_PASSPHRASE);
    const op = tx.operations[0];

    if (op.type === "invokeHostFunction") {
      const args = op.func.invokeContract().args();
      expect(args).toHaveLength(3);

      const borrowerVal = scValToNative(args[0]);
      const loanIdVal = scValToNative(args[1]);

      expect(borrowerVal).toBe(borrower);
      expect(loanIdVal).toBe(BigInt(loanId));
    }
  });

  it("encodes the full repayment amount into the XDR, not a tenth of it", async () => {
    const inputAmount = 1000;
    const loanId = "42";

    const xdrString = await buildUnsignedRepaymentXdr({
      borrower,
      loanId,
      amount: inputAmount,
      contractId,
    });

    const tx = TransactionBuilder.fromXDR(xdrString, NETWORK_PASSPHRASE);

    const op = tx.operations[0];
    expect(op.type).toBe("invokeHostFunction");

    if (op.type === "invokeHostFunction") {
      const invokeArgs = op.func.invokeContract();
      const args = invokeArgs.args();
      const loanIdVal = scValToNative(args[1]);
      const amountVal = scValToNative(args[2]);

      expect(loanIdVal).toBe(BigInt(loanId));
      expect(amountVal).toBe(BigInt(inputAmount));
      expect(amountVal).not.toBe(BigInt(inputAmount / 10));
    }
  });

  it("floors fractional amounts before encoding as i128", async () => {
    const xdrString = await buildUnsignedRepaymentXdr({
      borrower,
      loanId: "42",
      amount: 1000.5,
      contractId,
    });

    const tx = TransactionBuilder.fromXDR(xdrString, NETWORK_PASSPHRASE);
    const op = tx.operations[0];

    if (op.type === "invokeHostFunction") {
      const args = op.func.invokeContract().args();
      const amountVal = scValToNative(args[2]);

      expect(amountVal).toBe(BigInt(1000));
    }
  });
});
