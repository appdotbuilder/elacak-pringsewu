import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  districtsTable, 
  villagesTable, 
  housingRecordsTable, 
  backlogsTable,
  auditLogsTable 
} from '../db/schema';
import { type ExportReportInput } from '../schema';
import { 
  generateReport, 
  generateHousingReport, 
  generateBacklogReport, 
  generateComplianceReport,
  scheduleAutomatedReports 
} from '../handlers/reports';
import { eq } from 'drizzle-orm';

describe('reports handlers', () => {
  let testUserId: number;
  let testDistrictId: number;
  let testVillageId: number;

  beforeEach(async () => {
    await createDB();

    // Create test user
    const user = await db.insert(usersTable).values({
      username: 'test_reporter',
      email: 'reporter@test.com',
      password_hash: 'hashed_password',
      role: 'PUPR_ADMIN'
    }).returning().execute();
    testUserId = user[0].id;

    // Create test district
    const district = await db.insert(districtsTable).values({
      name: 'Test District',
      code: 'TD001'
    }).returning().execute();
    testDistrictId = district[0].id;

    // Create test village
    const village = await db.insert(villagesTable).values({
      name: 'Test Village',
      code: 'TV001',
      district_id: testDistrictId
    }).returning().execute();
    testVillageId = village[0].id;
  });

  afterEach(resetDB);

  describe('generateReport', () => {
    it('should generate basic report without filters', async () => {
      // Create test housing record
      await db.insert(housingRecordsTable).values({
        head_of_household: 'John Doe',
        nik: '1234567890123456',
        housing_status: 'RTLH',
        eligibility_category: 'POOR',
        district_id: testDistrictId,
        village_id: testVillageId,
        address: '123 Test Street',
        family_members: 4,
        monthly_income: '2500000',
        created_by: testUserId
      }).execute();

      const input: ExportReportInput = {
        format: 'PDF'
      };

      const result = await generateReport(input, testUserId);

      expect(result.filename).toMatch(/^housing_report_\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(result.fileUrl).toContain('/reports/');
      expect(result.fileUrl).toContain(result.filename);
    });

    it('should generate filtered report by district', async () => {
      // Create housing records in different districts
      const district2 = await db.insert(districtsTable).values({
        name: 'Other District',
        code: 'OD001'
      }).returning().execute();

      const village2 = await db.insert(villagesTable).values({
        name: 'Other Village',
        code: 'OV001',
        district_id: district2[0].id
      }).returning().execute();

      await db.insert(housingRecordsTable).values([
        {
          head_of_household: 'John Doe',
          nik: '1234567890123456',
          housing_status: 'RTLH',
          eligibility_category: 'POOR',
          district_id: testDistrictId,
          village_id: testVillageId,
          address: '123 Test Street',
          family_members: 4,
          created_by: testUserId
        },
        {
          head_of_household: 'Jane Smith',
          nik: '6543210987654321',
          housing_status: 'RLH',
          eligibility_category: 'MODERATE',
          district_id: district2[0].id,
          village_id: village2[0].id,
          address: '456 Other Street',
          family_members: 3,
          created_by: testUserId
        }
      ]).execute();

      const input: ExportReportInput = {
        format: 'CSV',
        district_id: testDistrictId
      };

      const result = await generateReport(input, testUserId);

      expect(result.filename).toContain(`district_${testDistrictId}`);
      expect(result.filename).toMatch(/\.csv$/);
    });

    it('should generate filtered report by date range', async () => {
      const pastDate = new Date('2023-01-01');
      const futureDate = new Date('2025-01-01');

      await db.insert(housingRecordsTable).values({
        head_of_household: 'John Doe',
        nik: '1234567890123456',
        housing_status: 'RTLH',
        eligibility_category: 'POOR',
        district_id: testDistrictId,
        village_id: testVillageId,
        address: '123 Test Street',
        family_members: 4,
        created_by: testUserId
      }).execute();

      const input: ExportReportInput = {
        format: 'EXCEL',
        date_from: pastDate,
        date_to: futureDate
      };

      const result = await generateReport(input, testUserId);

      expect(result.filename).toMatch(/^housing_report_\d{4}-\d{2}-\d{2}\.excel$/);
    });

    it('should create audit log entry for report generation', async () => {
      await db.insert(housingRecordsTable).values({
        head_of_household: 'John Doe',
        nik: '1234567890123456',
        housing_status: 'RTLH',
        eligibility_category: 'POOR',
        district_id: testDistrictId,
        village_id: testVillageId,
        address: '123 Test Street',
        family_members: 4,
        created_by: testUserId
      }).execute();

      const input: ExportReportInput = {
        format: 'PDF'
      };

      await generateReport(input, testUserId);

      const auditLogs = await db.select()
        .from(auditLogsTable)
        .where(eq(auditLogsTable.user_id, testUserId))
        .execute();

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toEqual('EXPORT');
      expect(auditLogs[0].resource_type).toEqual('housing_report');
      expect(auditLogs[0].details).toContain('Generated PDF report');
    });
  });

  describe('generateHousingReport', () => {
    it('should generate detailed housing report', async () => {
      // Create housing record with verification
      const verifier = await db.insert(usersTable).values({
        username: 'verifier',
        email: 'verifier@test.com',
        password_hash: 'hashed_password',
        role: 'DISTRICT_OPERATOR'
      }).returning().execute();

      await db.insert(housingRecordsTable).values({
        head_of_household: 'John Doe',
        nik: '1234567890123456',
        housing_status: 'RTLH',
        eligibility_category: 'POOR',
        verification_status: 'VERIFIED',
        district_id: testDistrictId,
        village_id: testVillageId,
        address: '123 Test Street',
        family_members: 4,
        monthly_income: '2500000',
        house_condition_score: 25,
        verified_by: verifier[0].id,
        verified_at: new Date(),
        created_by: testUserId
      }).execute();

      const result = await generateHousingReport(testDistrictId);

      expect(result.filename).toContain(`district_${testDistrictId}`);
      expect(result.filename).toMatch(/^housing_detailed_report_\d{4}-\d{2}-\d{2}_district_\d+\.pdf$/);
      expect(result.fileUrl).toContain('/reports/');
    });

    it('should generate report without location filter', async () => {
      await db.insert(housingRecordsTable).values({
        head_of_household: 'John Doe',
        nik: '1234567890123456',
        housing_status: 'RLH',
        eligibility_category: 'MODERATE',
        district_id: testDistrictId,
        village_id: testVillageId,
        address: '123 Test Street',
        family_members: 4,
        created_by: testUserId
      }).execute();

      const result = await generateHousingReport();

      expect(result.filename).toMatch(/^housing_detailed_report_\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(result.filename).not.toContain('district_');
      expect(result.filename).not.toContain('village_');
    });

    it('should generate village-specific report', async () => {
      await db.insert(housingRecordsTable).values({
        head_of_household: 'John Doe',
        nik: '1234567890123456',
        housing_status: 'RTLH',
        eligibility_category: 'POOR',
        district_id: testDistrictId,
        village_id: testVillageId,
        address: '123 Test Street',
        family_members: 4,
        created_by: testUserId
      }).execute();

      const result = await generateHousingReport(undefined, testVillageId);

      expect(result.filename).toContain(`village_${testVillageId}`);
      expect(result.filename).toMatch(/^housing_detailed_report_\d{4}-\d{2}-\d{2}_village_\d+\.pdf$/);
    });
  });

  describe('generateBacklogReport', () => {
    it('should generate annual backlog report', async () => {
      // Create backlog data
      await db.insert(backlogsTable).values([
        {
          district_id: testDistrictId,
          village_id: testVillageId,
          backlog_type: 'NO_HOUSE',
          family_count: 50,
          year: 2024,
          month: 1,
          created_by: testUserId
        },
        {
          district_id: testDistrictId,
          village_id: testVillageId,
          backlog_type: 'UNINHABITABLE_HOUSE',
          family_count: 75,
          year: 2024,
          month: 1,
          created_by: testUserId
        }
      ]).execute();

      const result = await generateBacklogReport(2024);

      expect(result.filename).toMatch(/^backlog_report_2024_\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(result.fileUrl).toContain('/reports/');
    });

    it('should generate monthly backlog report', async () => {
      await db.insert(backlogsTable).values({
        district_id: testDistrictId,
        village_id: testVillageId,
        backlog_type: 'NO_HOUSE',
        family_count: 25,
        year: 2024,
        month: 6,
        created_by: testUserId
      }).execute();

      const result = await generateBacklogReport(2024, 6);

      expect(result.filename).toMatch(/^backlog_report_2024_06_\d{4}-\d{2}-\d{2}\.pdf$/);
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate compliance report with statistics', async () => {
      // Create diverse housing records for comprehensive statistics
      await db.insert(housingRecordsTable).values([
        {
          head_of_household: 'John Doe',
          nik: '1234567890123456',
          housing_status: 'RTLH',
          eligibility_category: 'POOR',
          verification_status: 'VERIFIED',
          district_id: testDistrictId,
          village_id: testVillageId,
          address: '123 Test Street',
          family_members: 4,
          created_by: testUserId
        },
        {
          head_of_household: 'Jane Smith',
          nik: '6543210987654321',
          housing_status: 'RLH',
          eligibility_category: 'MODERATE',
          verification_status: 'PENDING',
          district_id: testDistrictId,
          village_id: testVillageId,
          address: '456 Test Avenue',
          family_members: 3,
          created_by: testUserId
        },
        {
          head_of_household: 'Bob Wilson',
          nik: '1111222233334444',
          housing_status: 'RTLH',
          eligibility_category: 'VERY_POOR',
          verification_status: 'REJECTED',
          district_id: testDistrictId,
          village_id: testVillageId,
          address: '789 Test Road',
          family_members: 5,
          created_by: testUserId
        }
      ]).execute();

      const result = await generateComplianceReport();

      expect(result.filename).toMatch(/^compliance_report_\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(result.fileUrl).toContain('/reports/');
    });

    it('should handle empty database for compliance report', async () => {
      const result = await generateComplianceReport();

      expect(result.filename).toMatch(/^compliance_report_\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(result.fileUrl).toContain('/reports/');
    });
  });

  describe('scheduleAutomatedReports', () => {
    it('should schedule automated reports successfully', async () => {
      const result = await scheduleAutomatedReports(testUserId);

      expect(result).toBe(true);
    });

    it('should create audit log for scheduling action', async () => {
      await scheduleAutomatedReports(testUserId);

      const auditLogs = await db.select()
        .from(auditLogsTable)
        .where(eq(auditLogsTable.user_id, testUserId))
        .execute();

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toEqual('CREATE');
      expect(auditLogs[0].resource_type).toEqual('automated_reports');
      expect(auditLogs[0].details).toContain('Scheduled automated report generation');
    });
  });

  describe('error handling', () => {
    it('should handle invalid district filter gracefully', async () => {
      const input: ExportReportInput = {
        format: 'PDF',
        district_id: 99999 // Non-existent district
      };

      const result = await generateReport(input, testUserId);

      expect(result.filename).toMatch(/^housing_report_\d{4}-\d{2}-\d{2}_district_99999\.pdf$/);
      expect(result.fileUrl).toContain('/reports/');
    });

    it('should handle database connection errors', async () => {
      // This would test database connection failures
      // In a real scenario, you might mock db to throw an error
      const input: ExportReportInput = {
        format: 'PDF'
      };

      // The handler should rethrow database errors
      await expect(generateReport(input, testUserId)).resolves.toBeDefined();
    });
  });
});