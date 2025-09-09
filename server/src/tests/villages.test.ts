import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { villagesTable, districtsTable } from '../db/schema';
import { type CreateVillageInput } from '../schema';
import { getVillages, getVillagesByDistrict, getVillageById, createVillage } from '../handlers/villages';
import { eq } from 'drizzle-orm';

describe('Villages Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createVillage', () => {
    it('should create a village successfully', async () => {
      // Create prerequisite district
      const districtResult = await db.insert(districtsTable)
        .values({
          name: 'Test District',
          code: 'TD001'
        })
        .returning()
        .execute();

      const district = districtResult[0];

      const input: CreateVillageInput = {
        name: 'Test Village',
        code: 'TV001',
        district_id: district.id
      };

      const result = await createVillage(input);

      // Basic field validation
      expect(result.id).toBeDefined();
      expect(result.name).toEqual('Test Village');
      expect(result.code).toEqual('TV001');
      expect(result.district_id).toEqual(district.id);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save village to database', async () => {
      // Create prerequisite district
      const districtResult = await db.insert(districtsTable)
        .values({
          name: 'Test District',
          code: 'TD001'
        })
        .returning()
        .execute();

      const district = districtResult[0];

      const input: CreateVillageInput = {
        name: 'Database Test Village',
        code: 'DTV001',
        district_id: district.id
      };

      const result = await createVillage(input);

      // Verify village was saved to database
      const villages = await db.select()
        .from(villagesTable)
        .where(eq(villagesTable.id, result.id))
        .execute();

      expect(villages).toHaveLength(1);
      expect(villages[0].name).toEqual('Database Test Village');
      expect(villages[0].code).toEqual('DTV001');
      expect(villages[0].district_id).toEqual(district.id);
    });

    it('should throw error when district does not exist', async () => {
      const input: CreateVillageInput = {
        name: 'Test Village',
        code: 'TV001',
        district_id: 999 // Non-existent district
      };

      await expect(createVillage(input)).rejects.toThrow(/District with ID 999 not found/i);
    });

    it('should throw error for duplicate code in same district', async () => {
      // Create prerequisite district
      const districtResult = await db.insert(districtsTable)
        .values({
          name: 'Test District',
          code: 'TD001'
        })
        .returning()
        .execute();

      const district = districtResult[0];

      // Create first village
      await createVillage({
        name: 'First Village',
        code: 'DUPLICATE',
        district_id: district.id
      });

      // Try to create second village with same code in same district
      const duplicateInput: CreateVillageInput = {
        name: 'Second Village',
        code: 'DUPLICATE',
        district_id: district.id
      };

      await expect(createVillage(duplicateInput)).rejects.toThrow();
    });
  });

  describe('getVillages', () => {
    it('should return empty array when no villages exist', async () => {
      const result = await getVillages();
      expect(result).toEqual([]);
    });

    it('should return all villages', async () => {
      // Create prerequisite district
      const districtResult = await db.insert(districtsTable)
        .values({
          name: 'Test District',
          code: 'TD001'
        })
        .returning()
        .execute();

      const district = districtResult[0];

      // Create test villages
      await createVillage({
        name: 'Village 1',
        code: 'V001',
        district_id: district.id
      });

      await createVillage({
        name: 'Village 2',
        code: 'V002',
        district_id: district.id
      });

      const result = await getVillages();

      expect(result).toHaveLength(2);
      expect(result[0].name).toEqual('Village 1');
      expect(result[1].name).toEqual('Village 2');
    });
  });

  describe('getVillagesByDistrict', () => {
    it('should return empty array when district has no villages', async () => {
      // Create district without villages
      const districtResult = await db.insert(districtsTable)
        .values({
          name: 'Empty District',
          code: 'ED001'
        })
        .returning()
        .execute();

      const result = await getVillagesByDistrict(districtResult[0].id);
      expect(result).toEqual([]);
    });

    it('should return villages for specific district only', async () => {
      // Create two districts
      const district1Result = await db.insert(districtsTable)
        .values({
          name: 'District 1',
          code: 'D001'
        })
        .returning()
        .execute();

      const district2Result = await db.insert(districtsTable)
        .values({
          name: 'District 2',
          code: 'D002'
        })
        .returning()
        .execute();

      const district1 = district1Result[0];
      const district2 = district2Result[0];

      // Create villages in different districts
      await createVillage({
        name: 'Village D1-1',
        code: 'VD1_1',
        district_id: district1.id
      });

      await createVillage({
        name: 'Village D1-2',
        code: 'VD1_2',
        district_id: district1.id
      });

      await createVillage({
        name: 'Village D2-1',
        code: 'VD2_1',
        district_id: district2.id
      });

      const result = await getVillagesByDistrict(district1.id);

      expect(result).toHaveLength(2);
      expect(result.every(v => v.district_id === district1.id)).toBe(true);
      expect(result.map(v => v.name)).toEqual(['Village D1-1', 'Village D1-2']);
    });

    it('should return empty array for non-existent district', async () => {
      const result = await getVillagesByDistrict(999);
      expect(result).toEqual([]);
    });
  });

  describe('getVillageById', () => {
    it('should return null when village does not exist', async () => {
      const result = await getVillageById(999);
      expect(result).toBeNull();
    });

    it('should return village when it exists', async () => {
      // Create prerequisite district
      const districtResult = await db.insert(districtsTable)
        .values({
          name: 'Test District',
          code: 'TD001'
        })
        .returning()
        .execute();

      const district = districtResult[0];

      const createdVillage = await createVillage({
        name: 'Specific Village',
        code: 'SV001',
        district_id: district.id
      });

      const result = await getVillageById(createdVillage.id);

      expect(result).not.toBeNull();
      expect(result?.id).toEqual(createdVillage.id);
      expect(result?.name).toEqual('Specific Village');
      expect(result?.code).toEqual('SV001');
      expect(result?.district_id).toEqual(district.id);
    });
  });
});