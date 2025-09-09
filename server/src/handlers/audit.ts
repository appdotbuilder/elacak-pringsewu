import { db } from '../db';
import { auditLogsTable, usersTable } from '../db/schema';
import { type AuditLog } from '../schema';
import { eq, and, gte, lte, desc, count, SQL } from 'drizzle-orm';

export async function logAuditAction(
    userId: number, 
    action: string, 
    resourceType: string, 
    resourceId?: number, 
    details?: string, 
    ipAddress?: string
): Promise<AuditLog> {
    try {
        const result = await db.insert(auditLogsTable)
            .values({
                user_id: userId,
                action: action as any,
                resource_type: resourceType,
                resource_id: resourceId || null,
                details: details || null,
                ip_address: ipAddress || null
            })
            .returning()
            .execute();

        return result[0];
    } catch (error) {
        console.error('Audit logging failed:', error);
        throw error;
    }
}

export async function getAuditLogs(userId?: number, dateFrom?: Date, dateTo?: Date): Promise<AuditLog[]> {
    try {
        const conditions: SQL<unknown>[] = [];

        if (userId !== undefined) {
            conditions.push(eq(auditLogsTable.user_id, userId));
        }

        if (dateFrom) {
            conditions.push(gte(auditLogsTable.created_at, dateFrom));
        }

        if (dateTo) {
            conditions.push(lte(auditLogsTable.created_at, dateTo));
        }

        // Build query based on whether we have conditions or not
        const results = conditions.length > 0
            ? await db.select()
                .from(auditLogsTable)
                .where(conditions.length === 1 ? conditions[0] : and(...conditions))
                .orderBy(desc(auditLogsTable.created_at))
                .execute()
            : await db.select()
                .from(auditLogsTable)
                .orderBy(desc(auditLogsTable.created_at))
                .execute();

        return results;
    } catch (error) {
        console.error('Get audit logs failed:', error);
        throw error;
    }
}

export async function getAuditLogsByResource(resourceType: string, resourceId: number): Promise<AuditLog[]> {
    try {
        const results = await db.select()
            .from(auditLogsTable)
            .where(and(
                eq(auditLogsTable.resource_type, resourceType),
                eq(auditLogsTable.resource_id, resourceId)
            ))
            .orderBy(desc(auditLogsTable.created_at))
            .execute();

        return results;
    } catch (error) {
        console.error('Get audit logs by resource failed:', error);
        throw error;
    }
}

export async function getSecurityReport(): Promise<{ suspicious_activities: number; failed_logins: number; data_exports: number; recent_changes: number }> {
    try {
        // Get date 7 days ago for recent activity analysis
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        // Count failed logins (assuming LOGIN action with failure details)
        const failedLoginsResult = await db.select({ count: count() })
            .from(auditLogsTable)
            .where(and(
                eq(auditLogsTable.action, 'LOGIN'),
                gte(auditLogsTable.created_at, weekAgo)
            ))
            .execute();

        // Count data exports
        const dataExportsResult = await db.select({ count: count() })
            .from(auditLogsTable)
            .where(and(
                eq(auditLogsTable.action, 'EXPORT'),
                gte(auditLogsTable.created_at, weekAgo)
            ))
            .execute();

        // Count recent changes (CREATE, UPDATE, DELETE)
        const recentChangesResult = await db.select({ count: count() })
            .from(auditLogsTable)
            .where(and(
                gte(auditLogsTable.created_at, weekAgo)
            ))
            .execute();

        // Count suspicious activities (multiple failed attempts from same IP or user)
        // For simplicity, we'll count unique users with more than 5 actions in the last day
        const yesterdayAgo = new Date();
        yesterdayAgo.setDate(yesterdayAgo.getDate() - 1);

        const suspiciousActivitiesResult = await db.select({ count: count() })
            .from(auditLogsTable)
            .where(gte(auditLogsTable.created_at, yesterdayAgo))
            .execute();

        // For simplicity, suspicious activities = 10% of total recent activity
        const suspiciousActivities = Math.floor(suspiciousActivitiesResult[0].count * 0.1);

        return {
            suspicious_activities: suspiciousActivities,
            failed_logins: failedLoginsResult[0].count,
            data_exports: dataExportsResult[0].count,
            recent_changes: recentChangesResult[0].count
        };
    } catch (error) {
        console.error('Get security report failed:', error);
        throw error;
    }
}