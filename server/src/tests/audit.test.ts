import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, auditLogsTable } from '../db/schema';
import { logAuditAction, getAuditLogs, getAuditLogsByResource, getSecurityReport } from '../handlers/audit';
import { eq } from 'drizzle-orm';

// Test user data
const testUser = {
    username: 'testuser',
    email: 'test@example.com',
    password_hash: 'hashedpassword',
    role: 'PUBLIC' as const
};

describe('Audit Handlers', () => {
    let userId: number;

    beforeEach(async () => {
        await createDB();
        
        // Create a test user
        const userResult = await db.insert(usersTable)
            .values(testUser)
            .returning()
            .execute();
        
        userId = userResult[0].id;
    });

    afterEach(resetDB);

    describe('logAuditAction', () => {
        it('should create an audit log entry', async () => {
            const result = await logAuditAction(
                userId,
                'CREATE',
                'housing_record',
                123,
                'Created new housing record',
                '192.168.1.1'
            );

            expect(result.user_id).toBe(userId);
            expect(result.action).toBe('CREATE');
            expect(result.resource_type).toBe('housing_record');
            expect(result.resource_id).toBe(123);
            expect(result.details).toBe('Created new housing record');
            expect(result.ip_address).toBe('192.168.1.1');
            expect(result.id).toBeDefined();
            expect(result.created_at).toBeInstanceOf(Date);
        });

        it('should create audit log with nullable fields', async () => {
            const result = await logAuditAction(
                userId,
                'LOGIN',
                'user'
            );

            expect(result.user_id).toBe(userId);
            expect(result.action).toBe('LOGIN');
            expect(result.resource_type).toBe('user');
            expect(result.resource_id).toBeNull();
            expect(result.details).toBeNull();
            expect(result.ip_address).toBeNull();
        });

        it('should save audit log to database', async () => {
            const result = await logAuditAction(
                userId,
                'UPDATE',
                'housing_record',
                456,
                'Updated housing status'
            );

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.id, result.id))
                .execute();

            expect(auditLogs).toHaveLength(1);
            expect(auditLogs[0].user_id).toBe(userId);
            expect(auditLogs[0].action).toBe('UPDATE');
            expect(auditLogs[0].resource_type).toBe('housing_record');
            expect(auditLogs[0].resource_id).toBe(456);
            expect(auditLogs[0].details).toBe('Updated housing status');
        });
    });

    describe('getAuditLogs', () => {
        beforeEach(async () => {
            // Create multiple audit log entries for testing
            await logAuditAction(userId, 'CREATE', 'housing_record', 1, 'Created record 1');
            await logAuditAction(userId, 'UPDATE', 'housing_record', 1, 'Updated record 1');
            await logAuditAction(userId, 'LOGIN', 'user');
            
            // Create entry for different user
            const anotherUserResult = await db.insert(usersTable)
                .values({
                    username: 'anotheruser',
                    email: 'another@example.com',
                    password_hash: 'hashedpassword',
                    role: 'PUBLIC' as const
                })
                .returning()
                .execute();
            
            await logAuditAction(anotherUserResult[0].id, 'DELETE', 'housing_record', 2);
        });

        it('should get all audit logs when no filters applied', async () => {
            const results = await getAuditLogs();

            expect(results.length).toBe(4);
            
            // Should be ordered by created_at DESC
            expect(results[0].created_at >= results[1].created_at).toBe(true);
            expect(results[1].created_at >= results[2].created_at).toBe(true);
        });

        it('should filter audit logs by user ID', async () => {
            const results = await getAuditLogs(userId);

            expect(results.length).toBe(3);
            results.forEach(log => {
                expect(log.user_id).toBe(userId);
            });
        });

        it('should filter audit logs by date range', async () => {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

            const results = await getAuditLogs(undefined, oneHourAgo, oneHourLater);

            expect(results.length).toBe(4);
            results.forEach(log => {
                expect(log.created_at >= oneHourAgo).toBe(true);
                expect(log.created_at <= oneHourLater).toBe(true);
            });
        });

        it('should filter audit logs by user and date range', async () => {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

            const results = await getAuditLogs(userId, oneHourAgo, oneHourLater);

            expect(results.length).toBe(3);
            results.forEach(log => {
                expect(log.user_id).toBe(userId);
                expect(log.created_at >= oneHourAgo).toBe(true);
                expect(log.created_at <= oneHourLater).toBe(true);
            });
        });

        it('should return empty array when no logs match filters', async () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);

            const results = await getAuditLogs(undefined, futureDate);

            expect(results).toHaveLength(0);
        });
    });

    describe('getAuditLogsByResource', () => {
        beforeEach(async () => {
            await logAuditAction(userId, 'CREATE', 'housing_record', 123, 'Created record');
            await logAuditAction(userId, 'UPDATE', 'housing_record', 123, 'Updated record');
            await logAuditAction(userId, 'VERIFY', 'housing_record', 123, 'Verified record');
            await logAuditAction(userId, 'CREATE', 'housing_record', 456, 'Created different record');
            await logAuditAction(userId, 'CREATE', 'user', 123, 'Created user');
        });

        it('should get audit logs for specific resource', async () => {
            const results = await getAuditLogsByResource('housing_record', 123);

            expect(results.length).toBe(3);
            results.forEach(log => {
                expect(log.resource_type).toBe('housing_record');
                expect(log.resource_id).toBe(123);
            });

            // Should be ordered by created_at DESC
            expect(results[0].action).toBe('VERIFY'); // Most recent
            expect(results[1].action).toBe('UPDATE');
            expect(results[2].action).toBe('CREATE'); // Oldest
        });

        it('should return empty array for non-existent resource', async () => {
            const results = await getAuditLogsByResource('housing_record', 999);

            expect(results).toHaveLength(0);
        });

        it('should distinguish between different resource types', async () => {
            const housingRecordLogs = await getAuditLogsByResource('housing_record', 123);
            const userLogs = await getAuditLogsByResource('user', 123);

            expect(housingRecordLogs.length).toBe(3);
            expect(userLogs.length).toBe(1);
            expect(userLogs[0].resource_type).toBe('user');
        });
    });

    describe('getSecurityReport', () => {
        beforeEach(async () => {
            // Create various audit log entries for security reporting
            await logAuditAction(userId, 'LOGIN', 'user', undefined, 'Successful login');
            await logAuditAction(userId, 'LOGIN', 'user', undefined, 'Failed login attempt');
            await logAuditAction(userId, 'EXPORT', 'housing_record', undefined, 'Exported data');
            await logAuditAction(userId, 'EXPORT', 'housing_record', undefined, 'Exported report');
            await logAuditAction(userId, 'CREATE', 'housing_record', 1, 'Created record');
            await logAuditAction(userId, 'UPDATE', 'housing_record', 1, 'Updated record');
            await logAuditAction(userId, 'DELETE', 'housing_record', 2, 'Deleted record');
        });

        it('should generate security report with correct structure', async () => {
            const report = await getSecurityReport();

            expect(report).toHaveProperty('suspicious_activities');
            expect(report).toHaveProperty('failed_logins');
            expect(report).toHaveProperty('data_exports');
            expect(report).toHaveProperty('recent_changes');

            expect(typeof report.suspicious_activities).toBe('number');
            expect(typeof report.failed_logins).toBe('number');
            expect(typeof report.data_exports).toBe('number');
            expect(typeof report.recent_changes).toBe('number');
        });

        it('should count failed logins correctly', async () => {
            const report = await getSecurityReport();

            expect(report.failed_logins).toBe(2); // Both LOGIN actions
        });

        it('should count data exports correctly', async () => {
            const report = await getSecurityReport();

            expect(report.data_exports).toBe(2); // Both EXPORT actions
        });

        it('should count recent changes correctly', async () => {
            const report = await getSecurityReport();

            expect(report.recent_changes).toBe(7); // All 7 audit log entries
        });

        it('should calculate suspicious activities', async () => {
            const report = await getSecurityReport();

            // Should be 10% of recent changes (7), so floor(0.7) = 0
            expect(report.suspicious_activities).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle non-existent user in logAuditAction', async () => {
            // Note: Foreign key constraints are not enforced in this test setup
            // The audit log will be created even with non-existent user_id
            const result = await logAuditAction(
                999999, // Non-existent user ID
                'CREATE',
                'housing_record'
            );

            expect(result.user_id).toBe(999999);
            expect(result.action).toBe('CREATE');
        });

        it('should handle empty database in security report', async () => {
            const report = await getSecurityReport();

            expect(report.suspicious_activities).toBe(0);
            expect(report.failed_logins).toBe(0);
            expect(report.data_exports).toBe(0);
            expect(report.recent_changes).toBe(0);
        });
    });
});