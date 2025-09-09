import { db } from '../db';
import { 
  housingRecordsTable, 
  districtsTable, 
  villagesTable, 
  backlogsTable, 
  usersTable,
  auditLogsTable 
} from '../db/schema';
import { type ExportReportInput, type HousingRecord } from '../schema';
import { eq, and, gte, lte, sql, desc, count } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

// Types for report data
interface HousingReportData {
  id: number;
  head_of_household: string;
  nik: string;
  housing_status: string;
  eligibility_category: string;
  verification_status: string;
  district_name: string;
  village_name: string;
  address: string;
  family_members: number;
  monthly_income: number | null;
  created_at: Date;
}

interface BacklogReportData {
  district_name: string;
  village_name: string;
  backlog_type: string;
  family_count: number;
  year: number;
  month: number;
}

interface ComplianceReportData {
  total_housing_records: number;
  rtlh_count: number;
  rlh_count: number;
  verified_count: number;
  pending_verification: number;
  rejected_count: number;
  districts_with_data: number;
  villages_with_data: number;
}

export async function generateReport(input: ExportReportInput, userId: number): Promise<{ fileUrl: string; filename: string }> {
  try {
    // Build conditions array for filtering
    const conditions: SQL<unknown>[] = [];

    if (input.district_id) {
      conditions.push(eq(housingRecordsTable.district_id, input.district_id));
    }

    if (input.village_id) {
      conditions.push(eq(housingRecordsTable.village_id, input.village_id));
    }

    if (input.housing_status) {
      conditions.push(eq(housingRecordsTable.housing_status, input.housing_status));
    }

    if (input.date_from) {
      conditions.push(gte(housingRecordsTable.created_at, input.date_from));
    }

    if (input.date_to) {
      conditions.push(lte(housingRecordsTable.created_at, input.date_to));
    }

    // Build the complete query with all clauses
    const baseQuery = db.select({
      id: housingRecordsTable.id,
      head_of_household: housingRecordsTable.head_of_household,
      nik: housingRecordsTable.nik,
      housing_status: housingRecordsTable.housing_status,
      eligibility_category: housingRecordsTable.eligibility_category,
      verification_status: housingRecordsTable.verification_status,
      district_name: districtsTable.name,
      village_name: villagesTable.name,
      address: housingRecordsTable.address,
      family_members: housingRecordsTable.family_members,
      monthly_income: housingRecordsTable.monthly_income,
      created_at: housingRecordsTable.created_at
    })
    .from(housingRecordsTable)
    .innerJoin(districtsTable, eq(housingRecordsTable.district_id, districtsTable.id))
    .innerJoin(villagesTable, eq(housingRecordsTable.village_id, villagesTable.id));

    // Apply conditions and ordering in one go
    const results = conditions.length > 0
      ? await baseQuery
          .where(and(...conditions))
          .orderBy(desc(housingRecordsTable.created_at))
          .execute()
      : await baseQuery
          .orderBy(desc(housingRecordsTable.created_at))
          .execute();

    // Convert numeric fields
    const reportData: HousingReportData[] = results.map(result => ({
      ...result,
      monthly_income: result.monthly_income ? parseFloat(result.monthly_income) : null
    }));

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filterSuffix = input.district_id ? `_district_${input.district_id}` : '';
    const filename = `housing_report_${timestamp}${filterSuffix}.${input.format.toLowerCase()}`;

    // Log the export action
    await db.insert(auditLogsTable).values({
      user_id: userId,
      action: 'EXPORT',
      resource_type: 'housing_report',
      details: `Generated ${input.format} report with ${reportData.length} records`
    }).execute();

    return {
      fileUrl: `/reports/${filename}`,
      filename: filename
    };
  } catch (error) {
    console.error('Report generation failed:', error);
    throw error;
  }
}

export async function generateHousingReport(districtId?: number, villageId?: number): Promise<{ fileUrl: string; filename: string }> {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [];

    if (districtId) {
      conditions.push(eq(housingRecordsTable.district_id, districtId));
    }

    if (villageId) {
      conditions.push(eq(housingRecordsTable.village_id, villageId));
    }

    // Build the complete query
    const baseQuery = db.select({
      id: housingRecordsTable.id,
      head_of_household: housingRecordsTable.head_of_household,
      nik: housingRecordsTable.nik,
      housing_status: housingRecordsTable.housing_status,
      eligibility_category: housingRecordsTable.eligibility_category,
      verification_status: housingRecordsTable.verification_status,
      district_name: districtsTable.name,
      village_name: villagesTable.name,
      address: housingRecordsTable.address,
      family_members: housingRecordsTable.family_members,
      monthly_income: housingRecordsTable.monthly_income,
      house_condition_score: housingRecordsTable.house_condition_score,
      verified_by_name: usersTable.username,
      verified_at: housingRecordsTable.verified_at,
      created_at: housingRecordsTable.created_at
    })
    .from(housingRecordsTable)
    .innerJoin(districtsTable, eq(housingRecordsTable.district_id, districtsTable.id))
    .innerJoin(villagesTable, eq(housingRecordsTable.village_id, villagesTable.id))
    .leftJoin(usersTable, eq(housingRecordsTable.verified_by, usersTable.id));

    // Execute query with or without conditions
    const results = conditions.length > 0
      ? await baseQuery
          .where(and(...conditions))
          .orderBy(housingRecordsTable.district_id, housingRecordsTable.village_id, desc(housingRecordsTable.created_at))
          .execute()
      : await baseQuery
          .orderBy(housingRecordsTable.district_id, housingRecordsTable.village_id, desc(housingRecordsTable.created_at))
          .execute();

    // Convert numeric fields
    const reportData = results.map(result => ({
      ...result,
      monthly_income: result.monthly_income ? parseFloat(result.monthly_income) : null
    }));

    const timestamp = new Date().toISOString().split('T')[0];
    const locationSuffix = districtId ? `_district_${districtId}` : villageId ? `_village_${villageId}` : '';
    const filename = `housing_detailed_report_${timestamp}${locationSuffix}.pdf`;

    return {
      fileUrl: `/reports/${filename}`,
      filename: filename
    };
  } catch (error) {
    console.error('Housing report generation failed:', error);
    throw error;
  }
}

export async function generateBacklogReport(year: number, month?: number): Promise<{ fileUrl: string; filename: string }> {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [eq(backlogsTable.year, year)];

    if (month) {
      conditions.push(eq(backlogsTable.month, month));
    }

    // Build and execute the query
    const backlogData = await db.select({
      district_name: districtsTable.name,
      village_name: villagesTable.name,
      backlog_type: backlogsTable.backlog_type,
      family_count: backlogsTable.family_count,
      year: backlogsTable.year,
      month: backlogsTable.month
    })
    .from(backlogsTable)
    .innerJoin(districtsTable, eq(backlogsTable.district_id, districtsTable.id))
    .innerJoin(villagesTable, eq(backlogsTable.village_id, villagesTable.id))
    .where(and(...conditions))
    .orderBy(districtsTable.name, villagesTable.name, backlogsTable.backlog_type)
    .execute();

    // Get summary statistics
    const summary = await db.select({
      total_families: sql<number>`sum(${backlogsTable.family_count})`,
      no_house_families: sql<number>`sum(case when ${backlogsTable.backlog_type} = 'NO_HOUSE' then ${backlogsTable.family_count} else 0 end)`,
      uninhabitable_families: sql<number>`sum(case when ${backlogsTable.backlog_type} = 'UNINHABITABLE_HOUSE' then ${backlogsTable.family_count} else 0 end)`,
      affected_districts: sql<number>`count(distinct ${backlogsTable.district_id})`,
      affected_villages: sql<number>`count(distinct ${backlogsTable.village_id})`
    })
    .from(backlogsTable)
    .where(and(...conditions))
    .execute();

    const timestamp = new Date().toISOString().split('T')[0];
    const monthSuffix = month ? `_${month.toString().padStart(2, '0')}` : '';
    const filename = `backlog_report_${year}${monthSuffix}_${timestamp}.pdf`;

    return {
      fileUrl: `/reports/${filename}`,
      filename: filename
    };
  } catch (error) {
    console.error('Backlog report generation failed:', error);
    throw error;
  }
}

export async function generateComplianceReport(): Promise<{ fileUrl: string; filename: string }> {
  try {
    // Get comprehensive statistics for compliance reporting
    const totalHousingRecords = await db.select({ count: count() })
      .from(housingRecordsTable)
      .execute();

    const statusCounts = await db.select({
      housing_status: housingRecordsTable.housing_status,
      count: count()
    })
    .from(housingRecordsTable)
    .groupBy(housingRecordsTable.housing_status)
    .execute();

    const verificationCounts = await db.select({
      verification_status: housingRecordsTable.verification_status,
      count: count()
    })
    .from(housingRecordsTable)
    .groupBy(housingRecordsTable.verification_status)
    .execute();

    const districtCount = await db.select({ count: sql<number>`count(distinct ${housingRecordsTable.district_id})` })
      .from(housingRecordsTable)
      .execute();

    const villageCount = await db.select({ count: sql<number>`count(distinct ${housingRecordsTable.village_id})` })
      .from(housingRecordsTable)
      .execute();

    // Process data for structured report
    const complianceData: ComplianceReportData = {
      total_housing_records: totalHousingRecords[0]?.count || 0,
      rtlh_count: statusCounts.find(s => s.housing_status === 'RTLH')?.count || 0,
      rlh_count: statusCounts.find(s => s.housing_status === 'RLH')?.count || 0,
      verified_count: verificationCounts.find(v => v.verification_status === 'VERIFIED')?.count || 0,
      pending_verification: verificationCounts.find(v => v.verification_status === 'PENDING')?.count || 0,
      rejected_count: verificationCounts.find(v => v.verification_status === 'REJECTED')?.count || 0,
      districts_with_data: districtCount[0]?.count || 0,
      villages_with_data: villageCount[0]?.count || 0
    };

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `compliance_report_${timestamp}.pdf`;

    return {
      fileUrl: `/reports/${filename}`,
      filename: filename
    };
  } catch (error) {
    console.error('Compliance report generation failed:', error);
    throw error;
  }
}

export async function scheduleAutomatedReports(userId: number): Promise<boolean> {
  try {
    // Log the scheduling action
    await db.insert(auditLogsTable).values({
      user_id: userId,
      action: 'CREATE',
      resource_type: 'automated_reports',
      details: 'Scheduled automated report generation'
    }).execute();

    // In a real implementation, this would:
    // 1. Create cron job entries in a jobs table
    // 2. Set up background task scheduler
    // 3. Configure email delivery settings
    // 4. Define report frequency and recipients
    
    return true;
  } catch (error) {
    console.error('Report scheduling failed:', error);
    throw error;
  }
}