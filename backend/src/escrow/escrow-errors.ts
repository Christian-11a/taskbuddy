import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';

/**
 * The refusals the money functions in migration 0028 raise, as typed
 * exceptions. The SQL uses custom SQLSTATEs (BACKEND_SCHEMA.md §29.2):
 *
 *   TB402  insufficient funds       detail: {"needed": n, "available": n}
 *   TB404  nothing to act on
 *   TB409  conflicts with the row's current state
 *
 * Typed, rather than every failure being a BadRequestException, because some
 * callers must tell a *refusal* from a *fault*. The card-at-hire webhook is
 * the one that matters: a refusal (the client spent the money elsewhere, the
 * job was hired by someone else) is answered 2xx and the payment stays in the
 * wallet; a fault (the database was unreachable) must be a non-2xx so Stripe
 * retries. Treating both the same would either drop a paid hire on a blip or
 * make Stripe retry a refusal for three days.
 */

/** The client (or provider) cannot cover what is being committed. */
export class InsufficientBalanceError extends BadRequestException {
  constructor(
    readonly needed: number,
    readonly available: number,
    hint = 'Add funds to your wallet before hiring.',
  ) {
    super({
      message: `Insufficient wallet balance: ${peso(needed)} needed, ${peso(available)} available. ${hint}`,
      code: 'insufficient_funds',
      needed,
      available,
    });
  }
}

/** The escrow is not in a state this move can be made from. */
export class EscrowConflictError extends ConflictException {}

interface SqlError {
  message: string;
  code?: string;
  details?: string | null;
}

/**
 * Maps an error from one of the money RPCs to the exception it means. Anything
 * without one of our SQLSTATEs is a fault, reported as it always was.
 */
export function moneyError(error: SqlError): HttpException {
  switch (error.code) {
    case 'TB402': {
      const { needed, available } = parseDetail(error.details);
      return new InsufficientBalanceError(needed, available);
    }
    case 'TB409':
      return new EscrowConflictError(error.message);
    case 'TB404':
      return new NotFoundException(error.message);
    default:
      return new BadRequestException(error.message);
  }
}

/** True for the errors that are the business saying no, rather than something breaking. */
export function isMoneyRefusal(err: unknown): boolean {
  return (
    err instanceof InsufficientBalanceError ||
    err instanceof EscrowConflictError
  );
}

function parseDetail(details: string | null | undefined): {
  needed: number;
  available: number;
} {
  try {
    const parsed = JSON.parse(details ?? '{}') as {
      needed?: unknown;
      available?: unknown;
    };
    return {
      needed: Number(parsed.needed ?? 0),
      available: Number(parsed.available ?? 0),
    };
  } catch {
    return { needed: 0, available: 0 };
  }
}

export function peso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
