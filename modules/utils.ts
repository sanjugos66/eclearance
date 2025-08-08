export class SafeExitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeExitError';
  }
}