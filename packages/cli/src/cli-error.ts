export class CliError extends Error {
  readonly code: string;
  readonly httpStatus: number | null;
  readonly requestId: string | null;
  constructor(
    code: string,
    message: string,
    httpStatus: number | null = null,
    requestId: string | null = null
  ) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.requestId = requestId;
  }
}
