import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  housingRecordsTable, 
  districtsTable, 
  villagesTable, 
  usersTable 
} from '../db/schema';
import { 
  type CreateHousingRecordInput, 
  type UpdateHousingRecordInput,
  type VerifyHousingRecordInput
} from '../schema';
import {
  getHousingRecords,
  getHousingRecordById,
  createHousingRecord,
  updateHousingRecord,
  verifyHousingRecord,
  deleteHousingRecord,
  getHousingRecordsByDistrict,
  getHousingRecordsByVillage
} from '../handlers/housing_records';
import { eq } from 'drizzle-orm';

// Test data
let testDistrictId: number;
let testVillageId: number;
let testUserId: number;

const testInput: CreateHousingRecordInput = {
  head_of_household: 'John Doe',
  nik: '1234567890123456',
  housing_status: 'RTLH',
  eligibility_category: 'POOR',
  district_id: 0, // Will be set in beforeEach
  village_id: 0, // Will be set in beforeEach
  latitude: -6.123456,
  longitude: 106.123456,
  address: '123 Main Street',
  phone: '081234567890',
  family_members: 4,
  monthly_income: 2500000,
  house_condition_score: 35,
  notes: 'Test notes'
};

describe('housing_records handlers', () => {
  beforeEach(async () => {
    await createDB();

    // Create test district
    const districtResult = await db.insert(districtsTable)
      .values({
        name: 'Test District',
        code: 'TD01'
      })
      .returning()
      .execute();
    testDistrictId = districtResult[0].id;

    // Create test village
    const villageResult = await db.insert(villagesTable)
      .values({
        name: 'Test Village',
        code: 'TV01',
        district_id: testDistrictId
      })
      .returning()
      .execute();
    testVillageId = villageResult[0].id;

    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashed_password',
        role: 'DISTRICT_OPERATOR'
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Update test input with actual IDs
    testInput.district_id = testDistrictId;
    testInput.village_id = testVillageId;
  });

  afterEach(resetDB);

  describe('createHousingRecord', () => {
    it('should create a housing record successfully', async () => {
      const result = await createHousingRecord(testInput, testUserId);

      expect(result.head_of_household).toEqual('John Doe');
      expect(result.nik).toEqual('1234567890123456');
      expect(result.housing_status).toEqual('RTLH');
      expect(result.eligibility_category).toEqual('POOR');
      expect(result.verification_status).toEqual('PENDING');
      expect(result.district_id).toEqual(testDistrictId);
      expect(result.village_id).toEqual(testVillageId);
      expect(result.latitude).toEqual(-6.123456);
      expect(result.longitude).toEqual(106.123456);
      expect(result.address).toEqual('123 Main Street');
      expect(result.phone).toEqual('081234567890');
      expect(result.family_members).toEqual(4);
      expect(result.monthly_income).toEqual(2500000);
      expect(result.house_condition_score).toEqual(35);
      expect(result.notes).toEqual('Test notes');
      expect(result.created_by).toEqual(testUserId);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save housing record to database with numeric conversions', async () => {
      const result = await createHousingRecord(testInput, testUserId);

      const records = await db.select()
        .from(housingRecordsTable)
        .where(eq(housingRecordsTable.id, result.id))
        .execute();

      expect(records).toHaveLength(1);
      const record = records[0];
      expect(record.head_of_household).toEqual('John Doe');
      expect(record.nik).toEqual('1234567890123456');
      expect(parseFloat(record.latitude!)).toEqual(-6.123456);
      expect(parseFloat(record.longitude!)).toEqual(106.123456);
      expect(parseFloat(record.monthly_income!)).toEqual(2500000);
    });

    it('should reject duplicate NIK', async () => {
      await createHousingRecord(testInput, testUserId);

      await expect(createHousingRecord(testInput, testUserId))
        .rejects.toThrow(/NIK already exists/i);
    });

    it('should reject invalid district', async () => {
      const invalidInput = { ...testInput, district_id: 99999 };

      await expect(createHousingRecord(invalidInput, testUserId))
        .rejects.toThrow(/District not found/i);
    });

    it('should reject village not in district', async () => {
      // Create another district
      const anotherDistrict = await db.insert(districtsTable)
        .values({
          name: 'Another District',
          code: 'AD01'
        })
        .returning()
        .execute();

      const invalidInput = { 
        ...testInput, 
        district_id: anotherDistrict[0].id,
        village_id: testVillageId // This village belongs to testDistrictId
      };

      await expect(createHousingRecord(invalidInput, testUserId))
        .rejects.toThrow(/Village not found or does not belong to the specified district/i);
    });
  });

  describe('getHousingRecordById', () => {
    it('should retrieve housing record by ID', async () => {
      const created = await createHousingRecord(testInput, testUserId);

      const result = await getHousingRecordById(created.id);

      expect(result).toBeDefined();
      expect(result!.id).toEqual(created.id);
      expect(result!.head_of_household).toEqual('John Doe');
      expect(result!.nik).toEqual('1234567890123456');
      expect(typeof result!.latitude).toBe('number');
      expect(typeof result!.longitude).toBe('number');
      expect(typeof result!.monthly_income).toBe('number');
    });

    it('should return null for non-existent ID', async () => {
      const result = await getHousingRecordById(99999);
      expect(result).toBeNull();
    });
  });

  describe('getHousingRecords', () => {
    it('should retrieve all housing records', async () => {
      await createHousingRecord(testInput, testUserId);
      
      const input2 = { ...testInput, nik: '1234567890123457', head_of_household: 'Jane Doe' };
      await createHousingRecord(input2, testUserId);

      const results = await getHousingRecords();

      expect(results).toHaveLength(2);
      expect(results[0].head_of_household).toEqual('John Doe');
      expect(results[1].head_of_household).toEqual('Jane Doe');
      expect(typeof results[0].monthly_income).toBe('number');
      expect(typeof results[1].monthly_income).toBe('number');
    });

    it('should return empty array when no records exist', async () => {
      const results = await getHousingRecords();
      expect(results).toHaveLength(0);
    });
  });

  describe('updateHousingRecord', () => {
    it('should update housing record successfully', async () => {
      const created = await createHousingRecord(testInput, testUserId);

      const updateInput: UpdateHousingRecordInput = {
        id: created.id,
        head_of_household: 'John Smith',
        family_members: 5,
        monthly_income: 3000000
      };

      const result = await updateHousingRecord(updateInput, testUserId);

      expect(result.head_of_household).toEqual('John Smith');
      expect(result.family_members).toEqual(5);
      expect(result.monthly_income).toEqual(3000000);
      expect(result.verification_status).toEqual('PENDING'); // Reset due to significant change
    });

    it('should reset verification status for significant changes', async () => {
      const created = await createHousingRecord(testInput, testUserId);
      
      // First verify the record
      await verifyHousingRecord({
        id: created.id,
        verification_status: 'VERIFIED'
      }, testUserId);

      // Update significant field
      const updateInput: UpdateHousingRecordInput = {
        id: created.id,
        housing_status: 'RLH'
      };

      const result = await updateHousingRecord(updateInput, testUserId);

      expect(result.housing_status).toEqual('RLH');
      expect(result.verification_status).toEqual('PENDING');
      expect(result.verified_by).toBeNull();
      expect(result.verified_at).toBeNull();
    });

    it('should reject update for non-existent record', async () => {
      const updateInput: UpdateHousingRecordInput = {
        id: 99999,
        head_of_household: 'John Smith'
      };

      await expect(updateHousingRecord(updateInput, testUserId))
        .rejects.toThrow(/Housing record not found/i);
    });
  });

  describe('verifyHousingRecord', () => {
    it('should verify housing record successfully', async () => {
      const created = await createHousingRecord(testInput, testUserId);

      const verifyInput: VerifyHousingRecordInput = {
        id: created.id,
        verification_status: 'VERIFIED',
        notes: 'Verification complete'
      };

      const result = await verifyHousingRecord(verifyInput, testUserId);

      expect(result.verification_status).toEqual('VERIFIED');
      expect(result.verified_by).toEqual(testUserId);
      expect(result.verified_at).toBeInstanceOf(Date);
      expect(result.notes).toEqual('Verification complete');
    });

    it('should reject housing record', async () => {
      const created = await createHousingRecord(testInput, testUserId);

      const verifyInput: VerifyHousingRecordInput = {
        id: created.id,
        verification_status: 'REJECTED',
        notes: 'Invalid documentation'
      };

      const result = await verifyHousingRecord(verifyInput, testUserId);

      expect(result.verification_status).toEqual('REJECTED');
      expect(result.notes).toEqual('Invalid documentation');
    });

    it('should reject verification for non-existent record', async () => {
      const verifyInput: VerifyHousingRecordInput = {
        id: 99999,
        verification_status: 'VERIFIED'
      };

      await expect(verifyHousingRecord(verifyInput, testUserId))
        .rejects.toThrow(/Housing record not found/i);
    });
  });

  describe('deleteHousingRecord', () => {
    it('should delete housing record successfully', async () => {
      const created = await createHousingRecord(testInput, testUserId);

      const result = await deleteHousingRecord(created.id, testUserId);

      expect(result).toBe(true);

      // Verify record is deleted
      const records = await db.select()
        .from(housingRecordsTable)
        .where(eq(housingRecordsTable.id, created.id))
        .execute();

      expect(records).toHaveLength(0);
    });

    it('should reject deletion for non-existent record', async () => {
      await expect(deleteHousingRecord(99999, testUserId))
        .rejects.toThrow(/Housing record not found/i);
    });
  });

  describe('getHousingRecordsByDistrict', () => {
    it('should retrieve housing records by district', async () => {
      await createHousingRecord(testInput, testUserId);

      // Create another district and village
      const district2 = await db.insert(districtsTable)
        .values({ name: 'District 2', code: 'D2' })
        .returning()
        .execute();

      const village2 = await db.insert(villagesTable)
        .values({ 
          name: 'Village 2', 
          code: 'V2',
          district_id: district2[0].id
        })
        .returning()
        .execute();

      const input2 = {
        ...testInput,
        nik: '1234567890123457',
        district_id: district2[0].id,
        village_id: village2[0].id
      };
      await createHousingRecord(input2, testUserId);

      const results = await getHousingRecordsByDistrict(testDistrictId);

      expect(results).toHaveLength(1);
      expect(results[0].district_id).toEqual(testDistrictId);
      expect(typeof results[0].monthly_income).toBe('number');
    });
  });

  describe('getHousingRecordsByVillage', () => {
    it('should retrieve housing records by village', async () => {
      await createHousingRecord(testInput, testUserId);

      // Create another village in same district
      const village2 = await db.insert(villagesTable)
        .values({
          name: 'Village 2',
          code: 'V2',
          district_id: testDistrictId
        })
        .returning()
        .execute();

      const input2 = {
        ...testInput,
        nik: '1234567890123457',
        village_id: village2[0].id
      };
      await createHousingRecord(input2, testUserId);

      const results = await getHousingRecordsByVillage(testVillageId);

      expect(results).toHaveLength(1);
      expect(results[0].village_id).toEqual(testVillageId);
      expect(typeof results[0].monthly_income).toBe('number');
    });
  });
});