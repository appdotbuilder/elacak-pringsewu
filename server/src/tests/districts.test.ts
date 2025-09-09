import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { districtsTable } from '../db/schema';
import { type CreateDistrictInput } from '../schema';
import { getDistricts, getDistrictById, createDistrict } from '../handlers/districts';
import { eq } from 'drizzle-orm';

// Test input data
const testDistrictInput: CreateDistrictInput = {
  name: 'Test District',
  code: 'TEST001'
};

const secondDistrictInput: CreateDistrictInput = {
  name: 'Another District',
  code: 'TEST002'
};

describe('districts handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createDistrict', () => {
    it('should create a district', async () => {
      const result = await createDistrict(testDistrictInput);

      // Basic field validation
      expect(result.name).toEqual('Test District');
      expect(result.code).toEqual('TEST001');
      expect(result.id).toBeDefined();
      expect(result.id).toBeTypeOf('number');
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save district to database', async () => {
      const result = await createDistrict(testDistrictInput);

      // Verify in database
      const districts = await db.select()
        .from(districtsTable)
        .where(eq(districtsTable.id, result.id))
        .execute();

      expect(districts).toHaveLength(1);
      expect(districts[0].name).toEqual('Test District');
      expect(districts[0].code).toEqual('TEST001');
      expect(districts[0].created_at).toBeInstanceOf(Date);
      expect(districts[0].updated_at).toBeInstanceOf(Date);
    });

    it('should throw error for duplicate code', async () => {
      await createDistrict(testDistrictInput);

      // Try to create another district with same code
      const duplicateInput: CreateDistrictInput = {
        name: 'Different Name',
        code: 'TEST001' // Same code
      };

      expect(createDistrict(duplicateInput))
        .rejects.toThrow(/duplicate key value violates unique constraint/i);
    });

    it('should allow same name with different codes', async () => {
      await createDistrict(testDistrictInput);

      const sameNameInput: CreateDistrictInput = {
        name: 'Test District', // Same name
        code: 'TEST999' // Different code
      };

      const result = await createDistrict(sameNameInput);
      expect(result.name).toEqual('Test District');
      expect(result.code).toEqual('TEST999');
    });
  });

  describe('getDistrictById', () => {
    it('should return district by ID', async () => {
      const created = await createDistrict(testDistrictInput);
      const result = await getDistrictById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('Test District');
      expect(result!.code).toEqual('TEST001');
      expect(result!.created_at).toBeInstanceOf(Date);
      expect(result!.updated_at).toBeInstanceOf(Date);
    });

    it('should return null for non-existent ID', async () => {
      const result = await getDistrictById(999);
      expect(result).toBeNull();
    });

    it('should return correct district when multiple exist', async () => {
      const first = await createDistrict(testDistrictInput);
      const second = await createDistrict(secondDistrictInput);

      const result = await getDistrictById(first.id);
      expect(result!.name).toEqual('Test District');
      expect(result!.code).toEqual('TEST001');

      const result2 = await getDistrictById(second.id);
      expect(result2!.name).toEqual('Another District');
      expect(result2!.code).toEqual('TEST002');
    });
  });

  describe('getDistricts', () => {
    it('should return empty array when no districts exist', async () => {
      const result = await getDistricts();
      expect(result).toEqual([]);
    });

    it('should return single district', async () => {
      await createDistrict(testDistrictInput);
      const result = await getDistricts();

      expect(result).toHaveLength(1);
      expect(result[0].name).toEqual('Test District');
      expect(result[0].code).toEqual('TEST001');
      expect(result[0].created_at).toBeInstanceOf(Date);
      expect(result[0].updated_at).toBeInstanceOf(Date);
    });

    it('should return multiple districts ordered by name', async () => {
      // Create in reverse alphabetical order
      await createDistrict({ name: 'Zebra District', code: 'ZEB001' });
      await createDistrict({ name: 'Apple District', code: 'APP001' });
      await createDistrict({ name: 'Banana District', code: 'BAN001' });

      const result = await getDistricts();

      expect(result).toHaveLength(3);
      expect(result[0].name).toEqual('Apple District');
      expect(result[1].name).toEqual('Banana District');
      expect(result[2].name).toEqual('Zebra District');
    });

    it('should handle special characters in names for ordering', async () => {
      await createDistrict({ name: 'District-Z', code: 'DZ001' });
      await createDistrict({ name: 'District A', code: 'DA001' });
      await createDistrict({ name: 'district b', code: 'DB001' });

      const result = await getDistricts();

      expect(result).toHaveLength(3);
      // Should maintain lexicographical order
      expect(result[0].name).toEqual('District A');
      expect(result[1].name).toEqual('District-Z');
      expect(result[2].name).toEqual('district b');
    });
  });
});