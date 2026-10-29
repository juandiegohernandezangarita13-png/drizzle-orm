import { describe, expect, test } from 'vitest';
import {
	CheckConstraintError,
	DatabaseError,
	DataError,
	DrizzleError,
	ForeignKeyConstraintError,
	is,
	isCheckConstraintError,
	isDatabaseError,
	isDataError,
	isDrizzleError,
	isForeignKeyConstraintError,
	isNotNullConstraintError,
	isUniqueConstraintError,
	NotNullConstraintError,
	UniqueConstraintError,
	wrapDatabaseError,
} from '~/index.ts';

describe('Error Handling and Wrapping (Issue #376)', () => {
	test('instantiation and property preservation', () => {
		const rawCause = new Error('raw driver message');
		const err = new UniqueConstraintError({
			message: 'duplicate key value violates unique constraint',
			code: '23505',
			detail: 'Key (email)=(test@example.com) already exists.',
			table: 'users',
			column: 'email',
			constraint: 'users_email_unique',
			cause: rawCause,
		});

		expect(err.name).toBe('UniqueConstraintError');
		expect(err.message).toBe('duplicate key value violates unique constraint');
		expect(err.code).toBe('23505');
		expect(err.detail).toBe('Key (email)=(test@example.com) already exists.');
		expect(err.table).toBe('users');
		expect(err.column).toBe('email');
		expect(err.constraint).toBe('users_email_unique');
		expect(err.cause).toBe(rawCause);
		expect(err instanceof DatabaseError).toBe(true);
		expect(err instanceof DrizzleError).toBe(true);
		expect(err instanceof Error).toBe(true);
	});

	test('entityKind integration with Drizzle is() helper', () => {
		const uniqueErr = new UniqueConstraintError({ message: 'unique' });
		const fkErr = new ForeignKeyConstraintError({ message: 'fk' });
		const notNullErr = new NotNullConstraintError({ message: 'not null' });
		const checkErr = new CheckConstraintError({ message: 'check' });
		const dataErr = new DataError({ message: 'data' });
		const genericDbErr = new DatabaseError({ message: 'db' });

		expect(is(uniqueErr, UniqueConstraintError)).toBe(true);
		expect(is(uniqueErr, DatabaseError)).toBe(true);
		expect(is(uniqueErr, DrizzleError)).toBe(true);
		expect(is(uniqueErr, ForeignKeyConstraintError)).toBe(false);

		expect(is(fkErr, ForeignKeyConstraintError)).toBe(true);
		expect(is(notNullErr, NotNullConstraintError)).toBe(true);
		expect(is(checkErr, CheckConstraintError)).toBe(true);
		expect(is(dataErr, DataError)).toBe(true);
		expect(is(genericDbErr, DatabaseError)).toBe(true);
	});

	test('type guards', () => {
		const uniqueErr = new UniqueConstraintError({ message: 'unique' });
		expect(isDrizzleError(uniqueErr)).toBe(true);
		expect(isDatabaseError(uniqueErr)).toBe(true);
		expect(isUniqueConstraintError(uniqueErr)).toBe(true);
		expect(isForeignKeyConstraintError(uniqueErr)).toBe(false);
		expect(isNotNullConstraintError(uniqueErr)).toBe(false);
		expect(isCheckConstraintError(uniqueErr)).toBe(false);
		expect(isDataError(uniqueErr)).toBe(false);
	});

	test('wrapDatabaseError maps PostgreSQL errors correctly', () => {
		// Unique constraint violation (23505)
		const pgUnique = {
			code: '23505',
			message: 'duplicate key value violates unique constraint "users_email_key"',
			detail: 'Key (email)=(john@example.com) already exists.',
			table: 'users',
			constraint: 'users_email_key',
		};
		const wrappedUnique = wrapDatabaseError(pgUnique);
		expect(wrappedUnique).toBeInstanceOf(UniqueConstraintError);
		expect((wrappedUnique as UniqueConstraintError).code).toBe('23505');
		expect((wrappedUnique as UniqueConstraintError).constraint).toBe('users_email_key');

		// Foreign key violation (23503)
		const pgFk = {
			code: '23503',
			message: 'insert or update on table "posts" violates foreign key constraint',
			table: 'posts',
			constraint: 'posts_author_id_fkey',
		};
		const wrappedFk = wrapDatabaseError(pgFk);
		expect(wrappedFk).toBeInstanceOf(ForeignKeyConstraintError);

		// Not null violation (23502)
		const pgNotNull = {
			code: '23502',
			message: 'null value in column "name" of relation "users" violates not-null constraint',
			table: 'users',
			column: 'name',
		};
		const wrappedNotNull = wrapDatabaseError(pgNotNull);
		expect(wrappedNotNull).toBeInstanceOf(NotNullConstraintError);

		// Check violation (23514)
		const pgCheck = {
			code: '23514',
			message: 'new row for relation "products" violates check constraint "price_positive"',
			constraint: 'price_positive',
		};
		const wrappedCheck = wrapDatabaseError(pgCheck);
		expect(wrappedCheck).toBeInstanceOf(CheckConstraintError);

		// Data error (22P02)
		const pgData = {
			code: '22P02',
			message: 'invalid input syntax for type uuid: "not-a-uuid"',
		};
		const wrappedData = wrapDatabaseError(pgData);
		expect(wrappedData).toBeInstanceOf(DataError);
	});

	test('wrapDatabaseError maps MySQL errors correctly', () => {
		// Duplicate entry (1062)
		const mysqlUnique = {
			code: 'ER_DUP_ENTRY',
			errno: 1062,
			message: "Duplicate entry 'test@example.com' for key 'users.email'",
		};
		const wrappedUnique = wrapDatabaseError(mysqlUnique);
		expect(wrappedUnique).toBeInstanceOf(UniqueConstraintError);

		// Foreign key (1452)
		const mysqlFk = {
			code: 'ER_NO_REFERENCED_ROW_2',
			errno: 1452,
			message: 'Cannot add or update a child row: a foreign key constraint fails',
		};
		expect(wrapDatabaseError(mysqlFk)).toBeInstanceOf(ForeignKeyConstraintError);

		// Not null (1048)
		const mysqlNotNull = {
			code: 'ER_BAD_NULL_ERROR',
			errno: 1048,
			message: "Column 'username' cannot be null",
		};
		expect(wrapDatabaseError(mysqlNotNull)).toBeInstanceOf(NotNullConstraintError);
	});

	test('wrapDatabaseError maps SQLite errors correctly', () => {
		// SQLite UNIQUE
		const sqliteUnique = new Error('UNIQUE constraint failed: users.email');
		const wrappedUnique = wrapDatabaseError(sqliteUnique);
		expect(wrappedUnique).toBeInstanceOf(UniqueConstraintError);

		// SQLite FOREIGN KEY
		const sqliteFk = new Error('FOREIGN KEY constraint failed');
		expect(wrapDatabaseError(sqliteFk)).toBeInstanceOf(ForeignKeyConstraintError);

		// SQLite NOT NULL
		const sqliteNotNull = new Error('NOT NULL constraint failed: users.name');
		expect(wrapDatabaseError(sqliteNotNull)).toBeInstanceOf(NotNullConstraintError);
	});

	test('idempotency: already wrapped DrizzleError is returned unchanged', () => {
		const existing = new UniqueConstraintError({ message: 'already wrapped' });
		expect(wrapDatabaseError(existing)).toBe(existing);
	});
});
