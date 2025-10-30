/**
 * Bounty Problem Solver: Decentralised Bounty Platform
 * Copyright (c) 2025 Ayush Srivastava
 *
 * Licensed under the Apache 2.0
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { BountySolver } from "../target/types/bounty_solver";
import { randomBytes } from "crypto";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getArciumProgAddress,
  uploadCircuit,
  buildFinalizeCompDefTx,
  RescueCipher,
  deserializeLE,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  x25519,
  getComputationAccAddress,
  getArciumAccountBaseSeed,
  getClusterAccAddress,
  getMXEPublicKey,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";
import { expect } from "chai";


const IDL = JSON.parse(
  fs.readFileSync("target/idl/prediction_market.json", "utf8")
);

describe("Prediction Market", () => {
  const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();
  const user3 = Keypair.generate();


  const connection = new anchor.web3.Connection(
    "http://127.0.0.1:8899",
    "confirmed"
  );
  const wallet = new anchor.Wallet(owner);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);


  const program = new anchor.Program<BountySolver>(IDL as anchor.Idl, provider);


  let clusterAccount: PublicKey;


  const loadClusterAccount = (): PublicKey => {
    try {
      const clusterData = JSON.parse(
        fs.readFileSync("artifacts/cluster_acc_0.json", "utf8")
      );
      return new PublicKey(clusterData.pubkey);
    } catch (error) {
      console.log("Could not load cluster account from artifacts:", error);

      return getClusterAccAddress(0);
    }
  };

  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(
    eventName: E,
    timeoutMs = 60000
  ): Promise<Event[E]> => {
    let listenerId: number;
    let timeoutId: NodeJS.Timeout;
    const event = await new Promise<Event[E]>((res, rej) => {
      listenerId = program.addEventListener(eventName as any, (event) => {
        if (timeoutId) clearTimeout(timeoutId);
        res(event);
      });
      timeoutId = setTimeout(() => {
        program.removeEventListener(listenerId);
        rej(new Error(`Event ${String(eventName)} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    await program.removeEventListener(listenerId);
    return event;
  };

  before(async () => {

    try {
      clusterAccount = loadClusterAccount();
      console.log("Using cluster account:", clusterAccount.toBase58());


      const accountInfo = await provider.connection.getAccountInfo(clusterAccount);
      if (!accountInfo) {
        throw new Error(`Cluster account ${clusterAccount.toBase58()} not found`);
      }
    } catch (error) {
      console.log("Error loading cluster account:", error);
      throw new Error("Please ensure Arcium localnet is running and cluster account is properly initialized");
    }



    console.log("Test account addresses for localnet:");
    console.log("User1:", user1.publicKey.toBase58());
    console.log("User2:", user2.publicKey.toBase58());
    console.log("User3:", user3.publicKey.toBase58());
    console.log("Owner:", owner.publicKey.toBase58());


    const airdropAmount = 10 * anchor.web3.LAMPORTS_PER_SOL;

    try {
      await Promise.all([
        provider.connection.requestAirdrop(user1.publicKey, airdropAmount),
        provider.connection.requestAirdrop(user2.publicKey, airdropAmount),
        provider.connection.requestAirdrop(user3.publicKey, airdropAmount),
      ]);


      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.log("Airdrop failed (this is expected on some localnet configurations):", error.message);
    }


    const balances = await Promise.all([
      provider.connection.getBalance(user1.publicKey),
      provider.connection.getBalance(user2.publicKey),
      provider.connection.getBalance(user3.publicKey),
      provider.connection.getBalance(owner.publicKey),
    ]);

    console.log("Account balances:");
    console.log("User1:", balances[0] / anchor.web3.LAMPORTS_PER_SOL, "SOL");
    console.log("User2:", balances[1] / anchor.web3.LAMPORTS_PER_SOL, "SOL");
    console.log("User3:", balances[2] / anchor.web3.LAMPORTS_PER_SOL, "SOL");
    console.log("Owner:", balances[3] / anchor.web3.LAMPORTS_PER_SOL, "SOL");
  });

  it("Should initialize all computation definitions", async () => {
    console.log("Checking and initializing computation definitions...");

    const results = await Promise.all([
      initInitializeMarketCompDef(program as any, owner, false).then((sig) => {
        console.log("Initialize Market CompDef:", sig);
        return sig;
      }),
      initPlaceBetCompDef(program as any, owner, false).then((sig) => {
        console.log("Place Bet CompDef:", sig);
        return sig;
      }),
      initDistributeRewardsCompDef(program as any, owner, false).then((sig) => {
        console.log("Distribute Rewards CompDef:", sig);
        return sig;
      }),
    ]);

    console.log("All computation definitions ready:", results);
    await new Promise((res) => setTimeout(res, 2000));
  });

  it("Should create a prediction market", async () => {
    console.log("Owner address:", owner.publicKey.toBase58());


    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    console.log("MXE x25519 pubkey is", mxePublicKey);
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    const marketId = BigInt(Math.floor(Math.random() * 1000000));
    const nonce = randomBytes(16);
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const marketIdBuffer = Buffer.alloc(8);
    marketIdBuffer.writeBigUInt64LE(marketId);

    const marketPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketIdBuffer],
      program.programId
    )[0];

    console.log(`Market ID: ${marketId}, PDA: ${marketPDA.toBase58()}`);


    const problemPostedEventPromise = awaitEvent("problemPostedEvent");

    const question = "Will Bitcoin reach $100,000 by end of 2024?";
    const description = "This market resolves to YES if Bitcoin (BTC) trades at or above $100,000 on any major exchange by December 31, 2024.";
    const resolutionDeadline = Math.floor(Date.now() / 1000) + 86400 * 30;
    const minStakeAmount = 1000;

    console.log("Creating prediction market...");

    const createMarketSig = await program.methods
      .createProblem(
        computationOffset,
        new anchor.BN(marketId.toString()),
        question,
        description,
        new anchor.BN(resolutionDeadline),
        new anchor.BN(minStakeAmount),
        new anchor.BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        creator: owner.publicKey,
        computationAccount: getComputationAccAddress(
          program.programId,
          computationOffset
        ),
        clusterAccount: clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("initialize_market")).readUInt32LE()
        ),
        problem: marketPDA,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });

    console.log("Create market TX Signature:", createMarketSig);

    console.log("Waiting for initialize market computation finalization...");
    const finalizeInitSig = await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Initialize market computation finalized. Signature:", finalizeInitSig);

    const problemPostedEvent = await problemPostedEventPromise;
    console.log("Received ProblemPostedEvent:", problemPostedEvent);


    const problemAccount = await program.account.problem.fetch(marketPDA);
    expect(problemAccount.problemId.toString()).to.equal(marketId.toString());
    expect(problemAccount.creator.toBase58()).to.equal(owner.publicKey.toBase58());
    expect(problemAccount.title).to.equal(question);
    expect(problemAccount.state).to.deep.equal({ active: {} });

    console.log("Market created successfully!");
  });

  it("Should allow users to place bets on the market", async () => {

    const marketId = BigInt(1);
    const marketIdBuffer = Buffer.alloc(8);
    marketIdBuffer.writeBigUInt64LE(marketId);

    const marketPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketIdBuffer],
      program.programId
    )[0];


    try {
      await program.account.problem.fetch(marketPDA);
    } catch (e) {

      await createTestMarket(marketId);
    }


    await new Promise(resolve => setTimeout(resolve, 1000));
    const currentMarketState = await program.account.problem.fetch(marketPDA);
    console.log("Market state before betting:", {
      state: currentMarketState.state,
      deadline: currentMarketState.deadline.toString(),
      currentTime: Math.floor(Date.now() / 1000).toString()
    });


    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);


    console.log("User1 placing a YES bet...");

    const user1BetAmount = 5000;
    const user1Prediction = true;
    const user1Nonce = randomBytes(16);
    const user1EncryptedPrediction = cipher.encrypt([BigInt(user1Prediction ? 1 : 0)], user1Nonce);

    console.log("Encrypted prediction length:", user1EncryptedPrediction[0].length);
    console.log("Encrypted prediction:", Array.from(user1EncryptedPrediction[0]));
    console.log("Public key length:", publicKey.length);
    console.log("Public key:", Array.from(publicKey));

    const user1ComputationOffset = new anchor.BN(randomBytes(8), "hex");

    const user1BetPDA = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bet"),
        marketIdBuffer,
        user1.publicKey.toBuffer(),
      ],
      program.programId
    )[0];

    const solutionSubmittedEventPromise = awaitEvent("solutionSubmittedEvent");

    const placeBetSig = await program.methods
      .submitSolution(
        user1ComputationOffset,
        new anchor.BN(marketId.toString()),
        new anchor.BN(user1BetAmount),
        Array.from(user1EncryptedPrediction[0]),
        Array.from(publicKey),
        new anchor.BN(deserializeLE(user1Nonce).toString())
      )
      .accountsPartial({
        solver: user1.publicKey,
        computationAccount: getComputationAccAddress(
          program.programId,
          user1ComputationOffset
        ),
        clusterAccount: clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("place_bet")).readUInt32LE()
        ),
        problem: marketPDA,
        solution: user1BetPDA,
      })
      .signers([user1])
      .rpc({ commitment: "confirmed" });

    console.log("Place bet TX Signature:", placeBetSig);

    console.log("Waiting for place bet computation finalization...");
    const finalizeBetSig = await awaitComputationFinalization(
      provider,
      user1ComputationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Place bet computation finalized. Signature:", finalizeBetSig);

    const solutionSubmittedEvent = await solutionSubmittedEventPromise;
    console.log("Received SolutionSubmittedEvent:", solutionSubmittedEvent);


    const solutionAccount = await program.account.solution.fetch(user1BetPDA);
    expect(solutionAccount.problemId.toString()).to.equal(marketId.toString());
    expect(solutionAccount.solver.toBase58()).to.equal(user1.publicKey.toBase58());
    expect(solutionAccount.amount.toNumber()).to.equal(user1BetAmount);
    expect(solutionAccount.paid).to.be.false;


    const problemAccount = await program.account.problem.fetch(marketPDA);
    expect(problemAccount.totalSolutions.toNumber()).to.equal(user1BetAmount);

    console.log("Bet placed successfully!");
  });

  it("Should resolve market after deadline", async () => {
    const marketId = BigInt(2);
    const marketIdBuffer = Buffer.alloc(8);
    marketIdBuffer.writeBigUInt64LE(marketId);

    const marketPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketIdBuffer],
      program.programId
    )[0];


    await createTestMarket(marketId, Math.floor(Date.now() / 1000) + 1);


    await new Promise(resolve => setTimeout(resolve, 2000));


    console.log("Resolving market...");

    const outcome = true;
    const problemClosedEventPromise = awaitEvent("problemClosedEvent");

    const resolveMarketSig = await program.methods
      .closeProblem(
        new anchor.BN(marketId.toString()),
        owner.publicKey  // winner address instead of boolean outcome
      )
      .accountsPartial({
        authority: owner.publicKey,
        problem: marketPDA,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });

    console.log("Resolve market TX Signature:", resolveMarketSig);

    const problemClosedEvent = await problemClosedEventPromise;
    console.log("Received ProblemClosedEvent:", problemClosedEvent);


    const problemAccount = await program.account.problem.fetch(marketPDA);
    expect(problemAccount.state).to.deep.equal({ resolved: {} });
    expect(problemAccount.winner).to.not.be.null;

    console.log("Market resolved successfully!");
  });


  async function createTestMarket(marketId: bigint, resolutionDeadline?: number) {
    const privateKey = x25519.utils.randomSecretKey();
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    const nonce = randomBytes(16);
    const computationOffset = new anchor.BN(randomBytes(8));

    const marketIdBuffer = Buffer.alloc(8);
    marketIdBuffer.writeBigUInt64LE(marketId);

    const marketPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketIdBuffer],
      program.programId
    )[0];

    const question = `Test market ${marketId}`;
    const description = "Test market description";
    const deadline = resolutionDeadline || Math.floor(Date.now() / 1000) + 86400 * 30;
    const minStakeAmount = 1000;

    await program.methods
      .createProblem(
        computationOffset,
        new anchor.BN(marketId.toString()),
        question,
        description,
        new anchor.BN(deadline),
        new anchor.BN(minStakeAmount),
        new anchor.BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        creator: owner.publicKey,
        computationAccount: getComputationAccAddress(
          program.programId,
          computationOffset
        ),
        clusterAccount: clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("initialize_market")).readUInt32LE()
        ),
        problem: marketPDA,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );
  }


  async function initInitializeMarketCompDef(
    program: Program<BountySolver>,
    owner: Keypair,
    uploadRawCircuit: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
    const offset = getCompDefAccOffset("initialize_market");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Initialize Market CompDef PDA:", compDefPDA.toBase58());

    try {
      const accountInfo = await provider.connection.getAccountInfo(compDefPDA);
      if (accountInfo) {
        console.log("Initialize Market CompDef already exists and is initialized.");
        return "Already Initialized";
      }
    } catch (e) {
      console.log("Error checking Initialize Market CompDef:", e);
    }

    console.log("Initialize Market CompDef not found, creating new one...");

    try {
      const sig = await program.methods
        .initInitializeProblemCompDef()
        .accounts({
          compDefAccount: compDefPDA,
          payer: owner.publicKey,
          mxeAccount: getMXEAccAddress(program.programId),
        })
        .rpc({ commitment: "confirmed" });

      console.log("Initialize Market CompDef created with signature:", sig);

      if (uploadRawCircuit) {
        const rawCircuit = fs.readFileSync("build/initialize_market.arcis");
        await uploadCircuit(
          provider as anchor.AnchorProvider,
          "initialize_market",
          program.programId,
          rawCircuit,
          true
        );
      } else {
        console.log("Finalizing Initialize Market CompDef...");
        const finalizeTx = await buildFinalizeCompDefTx(
          provider,
          Buffer.from(offset).readUInt32LE(),
          program.programId
        );
        const latestBlockhash = await provider.connection.getLatestBlockhash();
        finalizeTx.recentBlockhash = latestBlockhash.blockhash;
        finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
        finalizeTx.sign(owner);
        await provider.sendAndConfirm(finalizeTx, [owner], { commitment: "confirmed" });
        console.log("Initialize Market CompDef finalized.");
      }
      return sig;
    } catch (error) {
      console.log("Error initializing Initialize Market CompDef:", error);
      if (error.message && error.message.includes("already in use")) {
        console.log("CompDef account already exists but may need finalization");
        return "Already Initialized";
      }
      throw error;
    }
  }

  async function initPlaceBetCompDef(
    program: Program<BountySolver>,
    owner: Keypair,
    uploadRawCircuit: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
    const offset = getCompDefAccOffset("place_bet");
    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Place Bet CompDef PDA:", compDefPDA.toBase58());

    try {
      const accountInfo = await provider.connection.getAccountInfo(compDefPDA);
      if (accountInfo) {
        console.log("Place Bet CompDef already exists and is initialized.");
        return "Already Initialized";
      }
    } catch (e) {
      console.log("Error checking Place Bet CompDef:", e);
    }

    console.log("Place Bet CompDef not found, creating new one...");

    try {
      const sig = await program.methods
        .initSubmitSolutionCompDef()
        .accounts({
          compDefAccount: compDefPDA,
          payer: owner.publicKey,
          mxeAccount: getMXEAccAddress(program.programId),
        })
        .rpc({ commitment: "confirmed" });

      console.log("Place Bet CompDef created with signature:", sig);

      if (!uploadRawCircuit) {
        console.log("Finalizing Place Bet CompDef...");
        const finalizeTx = await buildFinalizeCompDefTx(
          provider,
          Buffer.from(offset).readUInt32LE(),
          program.programId
        );
        const latestBlockhash = await provider.connection.getLatestBlockhash();
        finalizeTx.recentBlockhash = latestBlockhash.blockhash;
        finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
        finalizeTx.sign(owner);
        await provider.sendAndConfirm(finalizeTx, [owner], { commitment: "confirmed" });
        console.log("Place Bet CompDef finalized.");
      }
      return sig;
    } catch (error) {
      console.log("Error initializing Place Bet CompDef:", error);
      if (error.message && error.message.includes("already in use")) {
        console.log("CompDef account already exists but may need finalization");
        return "Already Initialized";
      }
      throw error;
    }
  }

  async function initDistributeRewardsCompDef(
    program: Program<BountySolver>,
    owner: Keypair,
    uploadRawCircuit: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
    const offset = getCompDefAccOffset("distribute_rewards");
    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Distribute Rewards CompDef PDA:", compDefPDA.toBase58());

    try {
      const accountInfo = await provider.connection.getAccountInfo(compDefPDA);
      if (accountInfo) {
        console.log("Distribute Rewards CompDef already exists and is initialized.");
        return "Already Initialized";
      }
    } catch (e) {
      console.log("Error checking Distribute Rewards CompDef:", e);
    }

    console.log("Distribute Rewards CompDef not found, creating new one...");

    try {
      const sig = await program.methods
        .initPayWinnerCompDef()
        .accounts({
          compDefAccount: compDefPDA,
          payer: owner.publicKey,
          mxeAccount: getMXEAccAddress(program.programId),
        })
        .rpc({ commitment: "confirmed" });

      console.log("Distribute Rewards CompDef created with signature:", sig);

      if (!uploadRawCircuit) {
        console.log("Finalizing Distribute Rewards CompDef...");
        const finalizeTx = await buildFinalizeCompDefTx(
          provider,
          Buffer.from(offset).readUInt32LE(),
          program.programId
        );
        const latestBlockhash = await provider.connection.getLatestBlockhash();
        finalizeTx.recentBlockhash = latestBlockhash.blockhash;
        finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
        finalizeTx.sign(owner);
        await provider.sendAndConfirm(finalizeTx, [owner], { commitment: "confirmed" });
        console.log("Distribute Rewards CompDef finalized.");
      }
      return sig;
    } catch (error) {
      console.log("Error initializing Distribute Rewards CompDef:", error);
      if (error.message && error.message.includes("already in use")) {
        console.log("CompDef account already exists but may need finalization");
        return "Already Initialized";
      }
      throw error;
    }
  }
});

async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 10,
  retryDelayMs: number = 500
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error) {
      console.log(`Attempt ${attempt} failed to fetch MXE public key:`, error);
    }

    if (attempt < maxRetries) {
      console.log(`Retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(`Failed to fetch MXE public key after ${maxRetries} attempts`);
}

function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(file.toString())));
}
