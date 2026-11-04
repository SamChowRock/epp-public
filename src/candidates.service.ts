import { AcceptCandidateSchema, CreateCandidateSchema } from './candidate-contract.js';
import { PrismaCandidateStore } from './prisma-candidate.store.js';
import { ApplicationState } from './application-state.js';

export class InvalidCandidateError extends Error {}
export class CandidateNotFoundError extends Error {}
export class CandidateConflictError extends Error {}
export class OperationConflictError extends Error {}

export class CandidatesService {
  constructor(private readonly store: PrismaCandidateStore, private readonly state: ApplicationState) {}

  async create(revisionId: string, input: unknown) {
    const parsed = CreateCandidateSchema.safeParse(input);
    if (!parsed.success) throw new InvalidCandidateError('Invalid candidate content');
    const result = await this.state.track(() => this.store.create(revisionId, parsed.data));
    if (result === undefined) throw new CandidateNotFoundError('Revision not found');
    if (result === 'occupied') throw new CandidateConflictError('Candidate number is already occupied');
    return result;
  }
  async list(revisionId: string) {
    const items = await this.state.track(() => this.store.list(revisionId));
    if (items === undefined) throw new CandidateNotFoundError('Revision not found');
    return { revisionId, items };
  }
  async accept(id: string, input: unknown) {
    const parsed = AcceptCandidateSchema.safeParse(input);
    if (!parsed.success) throw new InvalidCandidateError('Invalid operation identity');
    const result = await this.state.track(() => this.store.accept(id, parsed.data.operationId));
    if (result === 'operation-conflict') throw new OperationConflictError('Operation identity was already used for another request');
    if (result === undefined) throw new CandidateNotFoundError('Candidate not found');
    if (result === 'conflict') throw new CandidateConflictError('Candidate is no longer pending');
    return result;
  }
  async discard(id: string) {
    const result = await this.state.track(() => this.store.discard(id));
    if (result === undefined) throw new CandidateNotFoundError('Candidate not found');
    if (result === 'conflict') throw new CandidateConflictError('Candidate is no longer pending');
    return result;
  }
}
