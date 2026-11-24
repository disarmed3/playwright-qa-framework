// Shared by the probe scripts: each probe prints exactly one JSON line to stdout.

export interface ErrorSummary {
  name: string;
  code: unknown;
  message: string;
}

export function describeError(error: unknown): ErrorSummary {
  if (error instanceof Error) {
    return {
      name: error.name,
      code: (error as { code?: unknown }).code ?? null,
      message: error.message,
    };
  }
  return { name: 'unknown', code: null, message: String(error) };
}

export function emit(result: object): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
