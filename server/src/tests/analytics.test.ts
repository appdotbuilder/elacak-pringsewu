import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  districtsTable, 
  villagesTable, 
  usersTable, 
  housingRecordsTable 
} from '../db/schema';
import {
  getDashboardStats,
  getHousingByDistrict,
  getHousingByVillage,
  getVerificationStats,
  getEligibilityDistribution,
  getMonthlyTrends
} from '../handlers/analytics';

// Test data setup
const testDistrict = {
  name: 'Test District',
  code: 'TD001'
};

const testVillage = {
  name: 'Test Village',
  code: 'TV001',
  district_id: 1
};

const testUser = {
  username: 'testuser',
  email: 'test@example.com',
  password_hash: 'hashed_password',
  role: 'VILLAGE_OPERATOR' as const,
  is_active: true
};

const testHousingRecords = [
  {
    head_of_household: 'John Doe',
    nik: '1234567890123456',
    housing_status: 'RTLH' as const,
    eligibility_category: 'POOR' as const,
    verification_status: 'PENDING' as const,
    district_id: 1,
    village_id: 1,
    address: '123 Main St',
    family_members: 4,
    created_by: 1
  },
  {
    head_of_household: 'Jane Smith',
    nik: '1234567890123457',
    housing_status: 'RLH' as const,
    eligibility_category: 'VERY_POOR' as const,
    verification_status: 'VERIFIED' as const,
    district_id: 1,
    village_id: 1,
    address: '456 Oak Ave',
    family_members: 3,
    created_by: 1
  },
  {
    head_of_household: 'Bob Johnson',
    nik: '1234567890123458',
    housing_status: 'RTLH' as const,
    eligibility_category: 'MODERATE' as const,
    verification_status: 'REJECTED' as const,
    district_id: 1,
    village_id: 1,
    address: '789 Pine St',
    family_members: 5,
    created_by: 1
  }
];

describe('Analytics Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test data
  async function createTestData() {
    // Create district
    const district = await db.insert(districtsTable)
      .values(testDistrict)
      .returning()
      .execute();

    // Create village
    await db.insert(villagesTable)
      .values(testVillage)
      .returning()
      .execute();

    // Create user
    await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    // Create housing records
    await db.insert(housingRecordsTable)
      .values(testHousingRecords)
      .returning()
      .execute();

    return district[0];
  }

  describe('getDashboardStats', () => {
    it('should return correct dashboard statistics', async () => {
      await createTestData();

      const stats = await getDashboardStats();

      expect(stats.total_houses).toEqual(3);
      expect(stats.rtlh_count).toEqual(2);
      expect(stats.rlh_count).toEqual(1);
      expect(stats.pending_verification).toEqual(1);
      expect(stats.districts_count).toEqual(1);
      expect(stats.villages_count).toEqual(1);
      
      // Verify types
      expect(typeof stats.total_houses).toBe('number');
      expect(typeof stats.rtlh_count).toBe('number');
      expect(typeof stats.rlh_count).toBe('number');
      expect(typeof stats.pending_verification).toBe('number');
      expect(typeof stats.districts_count).toBe('number');
      expect(typeof stats.villages_count).toBe('number');
    });

    it('should return zero counts for empty database', async () => {
      const stats = await getDashboardStats();

      expect(stats.total_houses).toEqual(0);
      expect(stats.rtlh_count).toEqual(0);
      expect(stats.rlh_count).toEqual(0);
      expect(stats.pending_verification).toEqual(0);
      expect(stats.districts_count).toEqual(0);
      expect(stats.villages_count).toEqual(0);
    });
  });

  describe('getHousingByDistrict', () => {
    it('should return housing statistics grouped by district', async () => {
      await createTestData();

      const results = await getHousingByDistrict();

      expect(results).toHaveLength(1);
      expect(results[0].district_id).toEqual(1);
      expect(results[0].district_name).toEqual('Test District');
      expect(results[0].rtlh_count).toEqual(2);
      expect(results[0].rlh_count).toEqual(1);
      expect(results[0].total_count).toEqual(3);
      
      // Verify types
      expect(typeof results[0].rtlh_count).toBe('number');
      expect(typeof results[0].rlh_count).toBe('number');
    });

    it('should include districts with no housing records', async () => {
      // Create district without housing records
      await db.insert(districtsTable)
        .values(testDistrict)
        .returning()
        .execute();

      const results = await getHousingByDistrict();

      expect(results).toHaveLength(1);
      expect(results[0].district_name).toEqual('Test District');
      expect(results[0].rtlh_count).toEqual(0);
      expect(results[0].rlh_count).toEqual(0);
      expect(results[0].total_count).toEqual(0);
    });
  });

  describe('getHousingByVillage', () => {
    it('should return housing statistics grouped by village', async () => {
      await createTestData();

      const results = await getHousingByVillage();

      expect(results).toHaveLength(1);
      expect(results[0].village_id).toEqual(1);
      expect(results[0].village_name).toEqual('Test Village');
      expect(results[0].rtlh_count).toEqual(2);
      expect(results[0].rlh_count).toEqual(1);
      expect(results[0].total_count).toEqual(3);
      
      // Verify types
      expect(typeof results[0].rtlh_count).toBe('number');
      expect(typeof results[0].rlh_count).toBe('number');
    });

    it('should filter by district when districtId provided', async () => {
      await createTestData();

      // Create second district and village
      const district2 = await db.insert(districtsTable)
        .values({ name: 'District 2', code: 'D002' })
        .returning()
        .execute();

      await db.insert(villagesTable)
        .values({ 
          name: 'Village 2', 
          code: 'V002', 
          district_id: district2[0].id 
        })
        .returning()
        .execute();

      const results = await getHousingByVillage(1);

      expect(results).toHaveLength(1);
      expect(results[0].village_name).toEqual('Test Village');
    });
  });

  describe('getVerificationStats', () => {
    it('should return correct verification statistics', async () => {
      await createTestData();

      const stats = await getVerificationStats();

      expect(stats.pending).toEqual(1);
      expect(stats.verified).toEqual(1);
      expect(stats.rejected).toEqual(1);
      
      // Verify types
      expect(typeof stats.pending).toBe('number');
      expect(typeof stats.verified).toBe('number');
      expect(typeof stats.rejected).toBe('number');
    });

    it('should return zero counts for empty database', async () => {
      const stats = await getVerificationStats();

      expect(stats.pending).toEqual(0);
      expect(stats.verified).toEqual(0);
      expect(stats.rejected).toEqual(0);
    });
  });

  describe('getEligibilityDistribution', () => {
    it('should return eligibility category distribution with percentages', async () => {
      await createTestData();

      const distribution = await getEligibilityDistribution();

      expect(distribution).toHaveLength(3);
      
      // Find each category
      const poorCategory = distribution.find(d => d.category === 'POOR');
      const veryPoorCategory = distribution.find(d => d.category === 'VERY_POOR');
      const moderateCategory = distribution.find(d => d.category === 'MODERATE');

      expect(poorCategory).toBeDefined();
      expect(poorCategory!.count).toEqual(1);
      expect(poorCategory!.percentage).toEqual(33); // 1/3 * 100, rounded

      expect(veryPoorCategory).toBeDefined();
      expect(veryPoorCategory!.count).toEqual(1);
      expect(veryPoorCategory!.percentage).toEqual(33);

      expect(moderateCategory).toBeDefined();
      expect(moderateCategory!.count).toEqual(1);
      expect(moderateCategory!.percentage).toEqual(33);

      // Verify types
      distribution.forEach(d => {
        expect(typeof d.count).toBe('number');
        expect(typeof d.percentage).toBe('number');
      });
    });

    it('should return empty array for no records', async () => {
      const distribution = await getEligibilityDistribution();

      expect(distribution).toHaveLength(0);
    });
  });

  describe('getMonthlyTrends', () => {
    it('should return monthly trends for given year', async () => {
      await createTestData();

      const currentYear = new Date().getFullYear();
      const trends = await getMonthlyTrends(currentYear);

      expect(trends).toHaveLength(12);
      
      // Check that all months 1-12 are present
      for (let month = 1; month <= 12; month++) {
        const monthData = trends.find(t => t.month === month);
        expect(monthData).toBeDefined();
        
        // Verify types
        expect(typeof monthData!.rtlh_created).toBe('number');
        expect(typeof monthData!.rlh_created).toBe('number');
        expect(typeof monthData!.verified_count).toBe('number');
      }

      // Check that at least one month has data (the current month)
      const currentMonth = new Date().getMonth() + 1;
      const currentMonthData = trends.find(t => t.month === currentMonth);
      expect(currentMonthData).toBeDefined();
      
      // Sum all data across months should equal our test data
      const totalRtlh = trends.reduce((sum, t) => sum + t.rtlh_created, 0);
      const totalRlh = trends.reduce((sum, t) => sum + t.rlh_created, 0);
      const totalVerified = trends.reduce((sum, t) => sum + t.verified_count, 0);
      
      expect(totalRtlh).toEqual(2);
      expect(totalRlh).toEqual(1);
      expect(totalVerified).toEqual(1);
    });

    it('should return all zeros for year with no records', async () => {
      const trends = await getMonthlyTrends(2020);

      expect(trends).toHaveLength(12);
      
      trends.forEach(trend => {
        expect(trend.rtlh_created).toEqual(0);
        expect(trend.rlh_created).toEqual(0);
        expect(trend.verified_count).toEqual(0);
      });
    });
  });
});