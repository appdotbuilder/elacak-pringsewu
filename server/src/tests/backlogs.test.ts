import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { backlogsTable, districtsTable, villagesTable, usersTable } from '../db/schema';
import { type CreateBacklogInput } from '../schema';
import { 
  getBacklogs, 
  getBacklogById, 
  createBacklog, 
  updateBacklog, 
  getBacklogsByDistrict, 
  getBacklogsByDateRange 
} from '../handlers/backlogs';
import { eq } from 'drizzle-orm';

// Test input data
const testInput: CreateBacklogInput = {
  district_id: 1,
  village_id: 1,
  backlog_type: 'NO_HOUSE',
  family_count: 25,
  year: 2024,
  month: 6
};

describe('backlogs handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create prerequisites
  async function createPrerequisites() {
    // Create district
    const district = await db.insert(districtsTable)
      .values({
        name: 'Test District',
        code: 'TD001'
      })
      .returning()
      .execute();

    // Create village
    const village = await db.insert(villagesTable)
      .values({
        name: 'Test Village',
        code: 'TV001',
        district_id: district[0].id
      })
      .returning()
      .execute();

    // Create user
    const user = await db.insert(usersTable)
      .values({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashed_password',
        role: 'DISTRICT_OPERATOR',
        district_id: district[0].id
      })
      .returning()
      .execute();

    return { district: district[0], village: village[0], user: user[0] };
  }

  describe('getBacklogs', () => {
    it('should return empty array when no backlogs exist', async () => {
      const result = await getBacklogs();
      expect(result).toEqual([]);
    });

    it('should return all backlogs', async () => {
      const { district, village, user } = await createPrerequisites();

      // Create test backlog
      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id
      }, user.id);

      const result = await getBacklogs();
      expect(result).toHaveLength(1);
      expect(result[0].district_id).toEqual(district.id);
      expect(result[0].village_id).toEqual(village.id);
      expect(result[0].backlog_type).toEqual('NO_HOUSE');
      expect(result[0].family_count).toEqual(25);
      expect(result[0].year).toEqual(2024);
      expect(result[0].month).toEqual(6);
    });
  });

  describe('getBacklogById', () => {
    it('should return null when backlog does not exist', async () => {
      const result = await getBacklogById(999);
      expect(result).toBeNull();
    });

    it('should return backlog when it exists', async () => {
      const { district, village, user } = await createPrerequisites();

      const backlog = await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id
      }, user.id);

      const result = await getBacklogById(backlog.id);
      expect(result).not.toBeNull();
      expect(result!.id).toEqual(backlog.id);
      expect(result!.district_id).toEqual(district.id);
      expect(result!.village_id).toEqual(village.id);
      expect(result!.backlog_type).toEqual('NO_HOUSE');
      expect(result!.family_count).toEqual(25);
    });
  });

  describe('createBacklog', () => {
    it('should create a backlog successfully', async () => {
      const { district, village, user } = await createPrerequisites();

      const result = await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id
      }, user.id);

      expect(result.id).toBeDefined();
      expect(result.district_id).toEqual(district.id);
      expect(result.village_id).toEqual(village.id);
      expect(result.backlog_type).toEqual('NO_HOUSE');
      expect(result.family_count).toEqual(25);
      expect(result.year).toEqual(2024);
      expect(result.month).toEqual(6);
      expect(result.created_by).toEqual(user.id);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save backlog to database', async () => {
      const { district, village, user } = await createPrerequisites();

      const result = await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id
      }, user.id);

      const savedBacklog = await db.select()
        .from(backlogsTable)
        .where(eq(backlogsTable.id, result.id))
        .execute();

      expect(savedBacklog).toHaveLength(1);
      expect(savedBacklog[0].district_id).toEqual(district.id);
      expect(savedBacklog[0].village_id).toEqual(village.id);
      expect(savedBacklog[0].family_count).toEqual(25);
    });

    it('should throw error when district does not exist', async () => {
      await expect(createBacklog(testInput, 1))
        .rejects.toThrow(/district.*does not exist/i);
    });

    it('should throw error when village does not exist in district', async () => {
      const { district, user } = await createPrerequisites();

      await expect(createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: 999
      }, user.id))
        .rejects.toThrow(/village.*does not exist/i);
    });

    it('should throw error when duplicate entry exists', async () => {
      const { district, village, user } = await createPrerequisites();

      // Create first backlog
      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id
      }, user.id);

      // Try to create duplicate
      await expect(createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id
      }, user.id))
        .rejects.toThrow(/already exists/i);
    });

    it('should allow different backlog types for same location/date', async () => {
      const { district, village, user } = await createPrerequisites();

      // Create first backlog
      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id,
        backlog_type: 'NO_HOUSE'
      }, user.id);

      // Create second backlog with different type
      const result = await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id,
        backlog_type: 'UNINHABITABLE_HOUSE'
      }, user.id);

      expect(result.backlog_type).toEqual('UNINHABITABLE_HOUSE');
    });
  });

  describe('updateBacklog', () => {
    it('should update backlog family count', async () => {
      const { district, village, user } = await createPrerequisites();

      const backlog = await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id
      }, user.id);

      const result = await updateBacklog(backlog.id, 50, user.id);

      expect(result.id).toEqual(backlog.id);
      expect(result.family_count).toEqual(50);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.updated_at > backlog.updated_at).toBe(true);
    });

    it('should throw error when backlog does not exist', async () => {
      await expect(updateBacklog(999, 50, 1))
        .rejects.toThrow(/does not exist/i);
    });
  });

  describe('getBacklogsByDistrict', () => {
    it('should return empty array when no backlogs exist for district', async () => {
      const result = await getBacklogsByDistrict(1);
      expect(result).toEqual([]);
    });

    it('should return backlogs for specific district', async () => {
      const { district, village, user } = await createPrerequisites();

      // Create additional district and village
      const district2 = await db.insert(districtsTable)
        .values({
          name: 'Test District 2',
          code: 'TD002'
        })
        .returning()
        .execute();

      const village2 = await db.insert(villagesTable)
        .values({
          name: 'Test Village 2',
          code: 'TV002',
          district_id: district2[0].id
        })
        .returning()
        .execute();

      // Create backlogs in different districts
      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id
      }, user.id);

      await createBacklog({
        ...testInput,
        district_id: district2[0].id,
        village_id: village2[0].id
      }, user.id);

      const result = await getBacklogsByDistrict(district.id);
      expect(result).toHaveLength(1);
      expect(result[0].district_id).toEqual(district.id);
    });
  });

  describe('getBacklogsByDateRange', () => {
    it('should return empty array when no backlogs in range', async () => {
      const result = await getBacklogsByDateRange(2023, 1, 2023, 12);
      expect(result).toEqual([]);
    });

    it('should return backlogs within same year range', async () => {
      const { district, village, user } = await createPrerequisites();

      // Create backlogs for different months
      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id,
        year: 2024,
        month: 3
      }, user.id);

      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id,
        year: 2024,
        month: 6,
        backlog_type: 'UNINHABITABLE_HOUSE'
      }, user.id);

      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id,
        year: 2024,
        month: 9,
        family_count: 30
      }, user.id);

      const result = await getBacklogsByDateRange(2024, 4, 2024, 8);
      expect(result).toHaveLength(1);
      expect(result[0].month).toEqual(6);
    });

    it('should return backlogs across multiple years', async () => {
      const { district, village, user } = await createPrerequisites();

      // Create backlogs across different years
      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id,
        year: 2023,
        month: 11
      }, user.id);

      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id,
        year: 2024,
        month: 2,
        backlog_type: 'UNINHABITABLE_HOUSE'
      }, user.id);

      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id,
        year: 2024,
        month: 10,
        family_count: 40
      }, user.id);

      const result = await getBacklogsByDateRange(2023, 10, 2024, 5);
      expect(result).toHaveLength(2);
      
      const years = result.map(r => r.year);
      expect(years).toContain(2023);
      expect(years).toContain(2024);
    });

    it('should include all months when filtering across years', async () => {
      const { district, village, user } = await createPrerequisites();

      // Create backlogs for full year span
      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id,
        year: 2023,
        month: 12
      }, user.id);

      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id,
        year: 2024,
        month: 6,
        backlog_type: 'UNINHABITABLE_HOUSE'
      }, user.id);

      await createBacklog({
        ...testInput,
        district_id: district.id,
        village_id: village.id,
        year: 2025,
        month: 1,
        family_count: 35
      }, user.id);

      const result = await getBacklogsByDateRange(2023, 11, 2025, 3);
      expect(result).toHaveLength(3);
    });
  });
});