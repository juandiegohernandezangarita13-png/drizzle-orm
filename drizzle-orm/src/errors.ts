import { entityKind } from './entity.ts';

export class DrizzleError extends Error {
	static readonly [entityKind]: string = 'DrizzleError';

	constructor({ message, cause }: { message?: string; cause?: unknown }) {
		super(message);
		this.name = 'DrizzleError';
		this.cause = cause;
	}
}

export class DrizzleQueryError extends Error {
	constructor(
		public query: string,
		public params: any[],
		public override cause?: Error,
	) {
		super(`Failed query: ${query}\nparams: ${params}`);
		Error.captureStackTrace(this, DrizzleQueryError);

		// ES2022+: preserves original error on `.cause`
		if (cause) (this as any).cause = cause;
	}
}

export class TransactionRollbackError extends DrizzleError {
	static override readonly [entityKind]: string = 'TransactionRollbackError';

	constructor() {
		super({ message: 'Rollback' });
	}
}

export interface DatabaseErrorParams {
	message?: string;
	code?: string | number;
	detail?: string;
	schema?: string;
	table?: string;
	column?: string;
	constraint?: string;
	cause?: unknown;
}

export class DatabaseError extends DrizzleError {
	static override readonly [entityKind]: string = 'DatabaseError';

	readonly code?: string | number;
	readonly detail?: string;
	readonly schema?: string;
	readonly table?: string;
	readonly column?: string;
	readonly constraint?: string;

	constructor({
		message,
		code,
		detail,
		schema,
		table,
		column,
		constraint,
		cause,
	}: DatabaseErrorParams) {
		super({ message: message ?? (cause instanceof Error ? cause.message : 'Database error'), cause });
		this.name = this.constructor.name;
		this.code = code;
		this.detail = detail;
		this.schema = schema;
		this.table = table;
		this.column = column;
		this.constraint = constraint;
	}
}

export class UniqueConstraintError extends DatabaseError {
	static override readonly [entityKind]: string = 'UniqueConstraintError';
}

export class ForeignKeyConstraintError extends DatabaseError {
	static override readonly [entityKind]: string = 'ForeignKeyConstraintError';
}

export class NotNullConstraintError extends DatabaseError {
	static override readonly [entityKind]: string = 'NotNullConstraintError';
}

export class CheckConstraintError extends DatabaseError {
	static override readonly [entityKind]: string = 'CheckConstraintError';
}

export class DataError extends DatabaseError {
	static override readonly [entityKind]: string = 'DataError';
}

export interface RawDatabaseError {
	message?: string;
	code?: string | number;
	errno?: string | number;
	detail?: string;
	schema?: string;
	table?: string;
	column?: string;
	constraint?: string;
}

export function wrapDatabaseError(
	error: unknown,
	_queryContext?: { query?: string; params?: any[] },
): DrizzleError {
	if (error instanceof DrizzleError) {
		return error;
	}

	const raw = error as RawDatabaseError | undefined;
	const message = raw?.message ?? (error instanceof Error ? error.message : String(error));
	const code = raw?.code ?? raw?.errno;
	const detail = raw?.detail;
	const schema = raw?.schema;
	const table = raw?.table;
	const column = raw?.column;
	const constraint = raw?.constraint;

	const codeStr = String(code ?? '');

	const isUnique =
		codeStr === '23505' ||
		codeStr === '1062' ||
		codeStr === 'ER_DUP_ENTRY' ||
		codeStr === 'SQLITE_CONSTRAINT_UNIQUE' ||
		codeStr === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
		/UNIQUE constraint failed/i.test(message) ||
		/PRIMARY KEY constraint failed/i.test(message);

	if (isUnique) {
		return new UniqueConstraintError({
			message,
			code,
			detail,
			schema,
			table,
			column,
			constraint,
			cause: error,
		});
	}

	const isForeignKey =
		codeStr === '23503' ||
		codeStr === '1451' ||
		codeStr === '1452' ||
		codeStr === '1216' ||
		codeStr === '1217' ||
		codeStr === 'ER_NO_REFERENCED_ROW_2' ||
		codeStr === 'ER_ROW_IS_REFERENCED_2' ||
		codeStr === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
		/FOREIGN KEY constraint failed/i.test(message);

	if (isForeignKey) {
		return new ForeignKeyConstraintError({
			message,
			code,
			detail,
			schema,
			table,
			column,
			constraint,
			cause: error,
		});
	}

	const isNotNull =
		codeStr === '23502' ||
		codeStr === '1048' ||
		codeStr === '1364' ||
		codeStr === 'ER_BAD_NULL_ERROR' ||
		codeStr === 'SQLITE_CONSTRAINT_NOTNULL' ||
		/NOT NULL constraint failed/i.test(message);

	if (isNotNull) {
		return new NotNullConstraintError({
			message,
			code,
			detail,
			schema,
			table,
			column,
			constraint,
			cause: error,
		});
	}

	const isCheck =
		codeStr === '23514' ||
		codeStr === '3819' ||
		codeStr === 'ER_CHECK_CONSTRAINT_VIOLATED' ||
		codeStr === 'SQLITE_CONSTRAINT_CHECK' ||
		/CHECK constraint failed/i.test(message);

	if (isCheck) {
		return new CheckConstraintError({
			message,
			code,
			detail,
			schema,
			table,
			column,
			constraint,
			cause: error,
		});
	}

	const isData =
		codeStr.startsWith('22') ||
		codeStr === '1264' ||
		codeStr === '1265' ||
		codeStr === '1366' ||
		codeStr === '1406' ||
		/invalid input syntax/i.test(message) ||
		/out of range/i.test(message) ||
		/value too long/i.test(message);

	if (isData) {
		return new DataError({
			message,
			code,
			detail,
			schema,
			table,
			column,
			constraint,
			cause: error,
		});
	}

	return new DatabaseError({
		message,
		code,
		detail,
		schema,
		table,
		column,
		constraint,
		cause: error,
	});
}

export function isDrizzleError(error: unknown): error is DrizzleError {
	return error instanceof DrizzleError || (typeof error === 'object' && error !== null && (error as any)[entityKind] === 'DrizzleError');
}

export function isDatabaseError(error: unknown): error is DatabaseError {
	return error instanceof DatabaseError || (typeof error === 'object' && error !== null && (error as any)[entityKind] === 'DatabaseError');
}

export function isUniqueConstraintError(error: unknown): error is UniqueConstraintError {
	return error instanceof UniqueConstraintError || (typeof error === 'object' && error !== null && (error as any)[entityKind] === 'UniqueConstraintError');
}

export function isForeignKeyConstraintError(error: unknown): error is ForeignKeyConstraintError {
	return error instanceof ForeignKeyConstraintError || (typeof error === 'object' && error !== null && (error as any)[entityKind] === 'ForeignKeyConstraintError');
}

export function isNotNullConstraintError(error: unknown): error is NotNullConstraintError {
	return error instanceof NotNullConstraintError || (typeof error === 'object' && error !== null && (error as any)[entityKind] === 'NotNullConstraintError');
}

export function isCheckConstraintError(error: unknown): error is CheckConstraintError {
	return error instanceof CheckConstraintError || (typeof error === 'object' && error !== null && (error as any)[entityKind] === 'CheckConstraintError');
}

export function isDataError(error: unknown): error is DataError {
	return error instanceof DataError || (typeof error === 'object' && error !== null && (error as any)[entityKind] === 'DataError');
}
