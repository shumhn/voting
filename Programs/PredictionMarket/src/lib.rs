/*
 * Bounty Problem Solver: Decentralised Bounty Platform
 * Copyright (c) 2025 Ayush Srivastava
 *
 * Licensed under the Apache 2.0
 */

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

const COMP_DEF_OFFSET_INITIALIZE_PROBLEM: u32 = comp_def_offset("initialize_problem");
const COMP_DEF_OFFSET_SUBMIT_SOLUTION: u32 = comp_def_offset("submit_solution");
const COMP_DEF_OFFSET_PAY_WINNER: u32 = comp_def_offset("pay_winner");

declare_id!("AMgZmVhB17SVSQAbhTHaZzHPurArHaJ7zJeLdcwKRhE2");

#[account]
pub struct SignerAccount {
    pub bump: u8,
}

// Helper function for callback validation
pub fn validate_callback_ixs(_instructions_sysvar: &AccountInfo, _program_id: &Pubkey) -> Result<()> {
    Ok(())
}

#[program]
pub mod bounty_solver {
    use super::*;

    pub fn init_initialize_problem_comp_def(
        ctx: Context<InitInitializeProblemCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, true, 0, None, None)?;
        Ok(())
    }

    pub fn init_submit_solution_comp_def(ctx: Context<InitSubmitSolutionCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, true, 0, None, None)?;
        Ok(())
    }

    pub fn init_pay_winner_comp_def(
        ctx: Context<InitPayWinnerCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, true, 0, None, None)?;
        Ok(())
    }

    pub fn create_problem(
        ctx: Context<CreateProblem>,
        computation_offset: u64,
        problem_id: u64,
        title: String,
        description: String,
        deadline: i64,
        bounty_amount: u64,
        nonce: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        require!(
            deadline > Clock::get()?.unix_timestamp,
            ErrorCode::InvalidDeadline
        );
        require!(
            !title.is_empty() && title.len() <= 200,
            ErrorCode::InvalidTitle
        );

        let args = vec![Argument::PlaintextU128(nonce)];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![InitializeProblemCallback::callback_ix(&[])],
        )?;

        let problem = &mut ctx.accounts.problem;
        problem.bump = ctx.bumps.problem;
        problem.problem_id = problem_id;
        problem.creator = ctx.accounts.creator.key();
        problem.title = title.clone();
        problem.description = description;
        problem.deadline = deadline;
        problem.bounty_amount = bounty_amount;
        problem.state = ProblemState::Active;
        problem.total_bounty = bounty_amount;
        problem.total_solutions = 0;
        problem.winner = None;
        problem.encrypted_data = [[0; 32]; 2];
        problem.nonce = 0;

        emit!(ProblemPostedEvent {
            problem_id,
            creator: ctx.accounts.creator.key(),
            title,
            deadline,
            bounty_amount,
        });

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "initialize_problem")]
    pub fn initialize_problem_callback(
        ctx: Context<InitializeProblemCallback>,
        output: ComputationOutputs<InitializeProblemOutput>,
    ) -> Result<()> {
        let o = match output {
            ComputationOutputs::Success(InitializeProblemOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        ctx.accounts.problem.encrypted_data = o.ciphertexts;
        ctx.accounts.problem.nonce = o.nonce;

        Ok(())
    }

    pub fn submit_solution(
        ctx: Context<SubmitSolution>,
        computation_offset: u64,
        problem_id: u64,
        amount: u64,
        encrypted_solution: [u8; 32],
        solution_pubkey: [u8; 32],
        solution_nonce: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let problem = &mut ctx.accounts.problem;

        require!(
            problem.state == ProblemState::Active,
            ErrorCode::ProblemNotActive
        );
        require!(
            Clock::get()?.unix_timestamp < problem.deadline,
            ErrorCode::DeadlinePassed
        );
        require!(amount >= 0, ErrorCode::InvalidAmount);

        problem.total_solutions += 1;

        let args = vec![
            Argument::ArcisPubkey(solution_pubkey),
            Argument::PlaintextU128(solution_nonce),
            Argument::EncryptedBool(encrypted_solution),
            Argument::PlaintextU64(amount),
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![SubmitSolutionCallback::callback_ix(&[])],
        )?;

        let solution = &mut ctx.accounts.solution;
        solution.bump = ctx.bumps.solution;
        solution.problem_id = problem_id;
        solution.solver = ctx.accounts.solver.key();
        solution.amount = amount;
        solution.encrypted_solution = encrypted_solution;
        solution.solution_pubkey = solution_pubkey;
        solution.solution_nonce = solution_nonce;
        solution.timestamp = Clock::get()?.unix_timestamp;
        solution.paid = false;
        solution.payout_amount = 0;

        emit!(SolutionSubmittedEvent {
            problem_id,
            solver: ctx.accounts.solver.key(),
            amount,
            timestamp: solution.timestamp,
        });

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "submit_solution")]
    pub fn submit_solution_callback(
        ctx: Context<SubmitSolutionCallback>,
        output: ComputationOutputs<SubmitSolutionOutput>,
    ) -> Result<()> {
        let _o = match output {
            ComputationOutputs::Success(SubmitSolutionOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        let problem = &mut ctx.accounts.problem;

        // Optional: update problem state based on MPC output

        Ok(())
    }

    pub fn close_problem(
        ctx: Context<CloseProblem>,
        _problem_id: u64,
        winner: Pubkey,
    ) -> Result<()> {
        let problem = &mut ctx.accounts.problem;

        require!(
            problem.state == ProblemState::Active,
            ErrorCode::ProblemNotActive
        );
        require!(
            Clock::get()?.unix_timestamp >= problem.deadline,
            ErrorCode::DeadlineNotReached
        );

        problem.winner = Some(winner);
        problem.state = ProblemState::Closed;

        emit!(ProblemClosedEvent {
            problem_id: problem.problem_id,
            winner,
        });

        Ok(())
    }

    pub fn pay_winner(
        ctx: Context<PayWinner>,
        computation_offset: u64,
        _problem_id: u64,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let problem = &ctx.accounts.problem;

        require!(
            problem.state == ProblemState::Closed,
            ErrorCode::ProblemNotClosed
        );
        require!(
            problem.winner.is_some(),
            ErrorCode::NoWinnerSet
        );

        let solution = &mut ctx.accounts.solution;
        require!(!solution.paid, ErrorCode::AlreadyPaid);

        let args = vec![
            Argument::ArcisPubkey(solution.solution_pubkey),
            Argument::PlaintextU128(solution.solution_nonce),
            Argument::EncryptedBool(solution.encrypted_solution),
            Argument::PlaintextU64(solution.amount),
            Argument::PlaintextU64(problem.total_bounty),
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![PayWinnerCallback::callback_ix(&[])],
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "pay_winner")]
    pub fn pay_winner_callback(
        ctx: Context<PayWinnerCallback>,
        output: ComputationOutputs<PayWinnerOutput>,
    ) -> Result<()> {
        let result = match output {
            ComputationOutputs::Success(PayWinnerOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        let solution = &mut ctx.accounts.solution;
        solution.paid = true;
        solution.payout_amount = result.field_0;

        emit!(WinnerPaidEvent {
            problem_id: solution.problem_id,
            solver: solution.solver,
            solution_amount: solution.amount,
            payout_amount: result.field_0,
            is_winner: result.field_1,
        });

        Ok(())
    }
}

#[queue_computation_accounts("initialize_problem", creator)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, problem_id: u64)]
pub struct CreateProblem<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = creator,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_INITIALIZE_MARKET)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        init,
        payer = creator,
        space = 8 + Problem::INIT_SPACE,
        seeds = [b"problem", problem_id.to_le_bytes().as_ref()],
        bump
    )]
    pub problem: Account<'info, Problem>,
}

#[callback_accounts("initialize_problem")]
#[derive(Accounts)]
pub struct InitializeProblemCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_INITIALIZE_PROBLEM)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub problem: Account<'info, Problem>,
}

#[queue_computation_accounts("submit_solution", solver)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, problem_id: u64)]
pub struct SubmitSolution<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = solver,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_SUBMIT_SOLUTION)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        mut,
        seeds = [b"problem", problem_id.to_le_bytes().as_ref()],
        bump = problem.bump
    )]
    pub problem: Account<'info, Problem>,
    #[account(
        init,
        payer = solver,
        space = 8 + Solution::INIT_SPACE,
        seeds = [b"solution", problem_id.to_le_bytes().as_ref(), solver.key().as_ref()],
        bump
    )]
    pub solution: Account<'info, Solution>,
}

#[callback_accounts("submit_solution")]
#[derive(Accounts)]
pub struct SubmitSolutionCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_SUBMIT_SOLUTION)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub problem: Account<'info, Problem>,
}

#[derive(Accounts)]
#[instruction(problem_id: u64)]
pub struct CloseProblem<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"problem", problem_id.to_le_bytes().as_ref()],
        bump = problem.bump,
        constraint = problem.creator == authority.key() @ ErrorCode::UnauthorizedAccess
    )]
    pub problem: Account<'info, Problem>,
}

#[queue_computation_accounts("pay_winner", solver)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, problem_id: u64)]
pub struct PayWinner<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = solver,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_PAY_WINNER)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        seeds = [b"problem", problem_id.to_le_bytes().as_ref()],
        bump = problem.bump
    )]
    pub problem: Account<'info, Problem>,
    #[account(
        mut,
        seeds = [b"solution", problem_id.to_le_bytes().as_ref(), solver.key().as_ref()],
        bump = solution.bump
    )]
    pub solution: Account<'info, Solution>,
}

#[callback_accounts("pay_winner")]
#[derive(Accounts)]
pub struct PayWinnerCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_PAY_WINNER)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub solution: Account<'info, Solution>,
}

#[init_computation_definition_accounts("initialize_problem", payer)]
#[derive(Accounts)]
pub struct InitInitializeProblemCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program. Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("submit_solution", payer)]
#[derive(Accounts)]
pub struct InitSubmitSolutionCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program. Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("pay_winner", payer)]
#[derive(Accounts)]
pub struct InitPayWinnerCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program. Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Problem {
    pub bump: u8,

    pub problem_id: u64,

    pub creator: Pubkey,

    #[max_len(200)]
    pub title: String,

    #[max_len(200)]
    pub description: String,

    pub deadline: i64,

    pub bounty_amount: u64,

    pub state: ProblemState,

    pub total_bounty: u64,

    pub total_solutions: u64,

    pub winner: Option<Pubkey>,

    pub encrypted_data: [[u8; 32]; 2],

    pub nonce: u128,
}

#[account]
#[derive(InitSpace)]
pub struct Solution {
    pub bump: u8,

    pub problem_id: u64,

    pub solver: Pubkey,

    pub amount: u64,

    pub encrypted_solution: [u8; 32],

    pub solution_pubkey: [u8; 32],

    pub solution_nonce: u128,

    pub timestamp: i64,

    pub paid: bool,

    pub payout_amount: u64,
}

#[repr(u8)]
#[derive(InitSpace, AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProblemState {
    Active = 0,

    Closed = 1,
}

#[event]
pub struct ProblemPostedEvent {
    pub problem_id: u64,
    pub creator: Pubkey,
    pub title: String,
    pub deadline: i64,
    pub bounty_amount: u64,
}

#[event]
pub struct SolutionSubmittedEvent {
    pub problem_id: u64,
    pub solver: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct ProblemClosedEvent {
    pub problem_id: u64,
    pub winner: Pubkey,
}

#[event]
pub struct WinnerPaidEvent {
    pub problem_id: u64,
    pub solver: Pubkey,
    pub solution_amount: u64,
    pub payout_amount: u64,
    pub is_winner: bool,
}

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
    #[msg("Problem is not active")]
    ProblemNotActive,
    #[msg("Deadline has passed")]
    DeadlinePassed,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid deadline")]
    InvalidDeadline,
    #[msg("Invalid title")]
    InvalidTitle,
    #[msg("Deadline not reached yet")]
    DeadlineNotReached,
    #[msg("Problem is not closed")]
    ProblemNotClosed,
    #[msg("No winner set")]
    NoWinnerSet,
    #[msg("Already paid")]
    AlreadyPaid,
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
}
