import { db } from '../db';
import { 
  housingRecordsTable, 
  districtsTable, 
  villagesTable, 
  usersTable 
} from '../db/schema';
import { 
  type HousingRecord, 
  type CreateHousingRecordInput, 
  type UpdateHousingRecordInput,
  type VerifyHousingRecordInput 
} from '../schema';
import { eq, and } from 'drizzle-orm';

export async function getHousingRecords(): Promise<HousingRecord[]> {
  try {
    const results = await db.select()
      .from(housingRecordsTable)
      .execute();

    return results.map(record => ({
      ...record,
      latitude: record.latitude ? parseFloat(record.latitude) : null,
      longitude: record.longitude ? parseFloat(record.longitude) : null,
      monthly_income: record.monthly_income ? parseFloat(record.monthly_income) : null
    }));
  } catch (error) {
    console.error('Failed to fetch housing records:', error);
    throw error;
  }
}

export async function getHousingRecordById(id: number): Promise<HousingRecord | null> {
  try {
    const results = await db.select()
      .from(housingRecordsTable)
      .where(eq(housingRecordsTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const record = results[0];
    return {
      ...record,
      latitude: record.latitude ? parseFloat(record.latitude) : null,
      longitude: record.longitude ? parseFloat(record.longitude) : null,
      monthly_income: record.monthly_income ? parseFloat(record.monthly_income) : null
    };
  } catch (error) {
    console.error('Failed to fetch housing record by ID:', error);
    throw error;
  }
}

export async function createHousingRecord(input: CreateHousingRecordInput, createdBy: number): Promise<HousingRecord> {
  try {
    // Verify district exists
    const districtExists = await db.select()
      .from(districtsTable)
      .where(eq(districtsTable.id, input.district_id))
      .execute();

    if (districtExists.length === 0) {
      throw new Error('District not found');
    }

    // Verify village exists and belongs to the district
    const villageExists = await db.select()
      .from(villagesTable)
      .where(and(
        eq(villagesTable.id, input.village_id),
        eq(villagesTable.district_id, input.district_id)
      ))
      .execute();

    if (villageExists.length === 0) {
      throw new Error('Village not found or does not belong to the specified district');
    }

    // Check NIK uniqueness
    const existingNik = await db.select()
      .from(housingRecordsTable)
      .where(eq(housingRecordsTable.nik, input.nik))
      .execute();

    if (existingNik.length > 0) {
      throw new Error('NIK already exists');
    }

    // Insert the housing record
    const results = await db.insert(housingRecordsTable)
      .values({
        head_of_household: input.head_of_household,
        nik: input.nik,
        housing_status: input.housing_status,
        eligibility_category: input.eligibility_category,
        district_id: input.district_id,
        village_id: input.village_id,
        latitude: input.latitude?.toString(),
        longitude: input.longitude?.toString(),
        address: input.address,
        phone: input.phone || null,
        family_members: input.family_members,
        monthly_income: input.monthly_income?.toString(),
        house_condition_score: input.house_condition_score || null,
        notes: input.notes || null,
        created_by: createdBy
      })
      .returning()
      .execute();

    const record = results[0];
    return {
      ...record,
      latitude: record.latitude ? parseFloat(record.latitude) : null,
      longitude: record.longitude ? parseFloat(record.longitude) : null,
      monthly_income: record.monthly_income ? parseFloat(record.monthly_income) : null
    };
  } catch (error) {
    console.error('Housing record creation failed:', error);
    throw error;
  }
}

export async function updateHousingRecord(input: UpdateHousingRecordInput, updatedBy: number): Promise<HousingRecord> {
  try {
    // Check if record exists
    const existingRecord = await db.select()
      .from(housingRecordsTable)
      .where(eq(housingRecordsTable.id, input.id))
      .execute();

    if (existingRecord.length === 0) {
      throw new Error('Housing record not found');
    }

    // If district_id or village_id is being updated, validate them
    if (input.district_id && input.village_id) {
      const villageExists = await db.select()
        .from(villagesTable)
        .where(and(
          eq(villagesTable.id, input.village_id),
          eq(villagesTable.district_id, input.district_id)
        ))
        .execute();

      if (villageExists.length === 0) {
        throw new Error('Village not found or does not belong to the specified district');
      }
    } else if (input.district_id) {
      const districtExists = await db.select()
        .from(districtsTable)
        .where(eq(districtsTable.id, input.district_id))
        .execute();

      if (districtExists.length === 0) {
        throw new Error('District not found');
      }
    } else if (input.village_id) {
      const villageExists = await db.select()
        .from(villagesTable)
        .where(eq(villagesTable.id, input.village_id))
        .execute();

      if (villageExists.length === 0) {
        throw new Error('Village not found');
      }
    }

    // Build update values
    const updateValues: any = {
      updated_at: new Date()
    };

    if (input.head_of_household !== undefined) updateValues.head_of_household = input.head_of_household;
    if (input.housing_status !== undefined) updateValues.housing_status = input.housing_status;
    if (input.eligibility_category !== undefined) updateValues.eligibility_category = input.eligibility_category;
    if (input.district_id !== undefined) updateValues.district_id = input.district_id;
    if (input.village_id !== undefined) updateValues.village_id = input.village_id;
    if (input.latitude !== undefined) updateValues.latitude = input.latitude?.toString();
    if (input.longitude !== undefined) updateValues.longitude = input.longitude?.toString();
    if (input.address !== undefined) updateValues.address = input.address;
    if (input.phone !== undefined) updateValues.phone = input.phone;
    if (input.family_members !== undefined) updateValues.family_members = input.family_members;
    if (input.monthly_income !== undefined) updateValues.monthly_income = input.monthly_income?.toString();
    if (input.house_condition_score !== undefined) updateValues.house_condition_score = input.house_condition_score;
    if (input.notes !== undefined) updateValues.notes = input.notes;

    // Reset verification status if significant data changed
    const significantFields = ['head_of_household', 'housing_status', 'eligibility_category', 'address', 'family_members'];
    const hasSignificantChanges = significantFields.some(field => input[field as keyof typeof input] !== undefined);
    
    if (hasSignificantChanges) {
      updateValues.verification_status = 'PENDING';
      updateValues.verified_by = null;
      updateValues.verified_at = null;
    }

    // Update the record
    const results = await db.update(housingRecordsTable)
      .set(updateValues)
      .where(eq(housingRecordsTable.id, input.id))
      .returning()
      .execute();

    const record = results[0];
    return {
      ...record,
      latitude: record.latitude ? parseFloat(record.latitude) : null,
      longitude: record.longitude ? parseFloat(record.longitude) : null,
      monthly_income: record.monthly_income ? parseFloat(record.monthly_income) : null
    };
  } catch (error) {
    console.error('Housing record update failed:', error);
    throw error;
  }
}

export async function verifyHousingRecord(input: VerifyHousingRecordInput, verifiedBy: number): Promise<HousingRecord> {
  try {
    // Check if record exists
    const existingRecord = await db.select()
      .from(housingRecordsTable)
      .where(eq(housingRecordsTable.id, input.id))
      .execute();

    if (existingRecord.length === 0) {
      throw new Error('Housing record not found');
    }

    // Update verification status
    const results = await db.update(housingRecordsTable)
      .set({
        verification_status: input.verification_status,
        verified_by: verifiedBy,
        verified_at: new Date(),
        notes: input.notes || existingRecord[0].notes,
        updated_at: new Date()
      })
      .where(eq(housingRecordsTable.id, input.id))
      .returning()
      .execute();

    const record = results[0];
    return {
      ...record,
      latitude: record.latitude ? parseFloat(record.latitude) : null,
      longitude: record.longitude ? parseFloat(record.longitude) : null,
      monthly_income: record.monthly_income ? parseFloat(record.monthly_income) : null
    };
  } catch (error) {
    console.error('Housing record verification failed:', error);
    throw error;
  }
}

export async function deleteHousingRecord(id: number, deletedBy: number): Promise<boolean> {
  try {
    // Check if record exists
    const existingRecord = await db.select()
      .from(housingRecordsTable)
      .where(eq(housingRecordsTable.id, id))
      .execute();

    if (existingRecord.length === 0) {
      throw new Error('Housing record not found');
    }

    // Hard delete the record
    await db.delete(housingRecordsTable)
      .where(eq(housingRecordsTable.id, id))
      .execute();

    return true;
  } catch (error) {
    console.error('Housing record deletion failed:', error);
    throw error;
  }
}

export async function getHousingRecordsByDistrict(districtId: number): Promise<HousingRecord[]> {
  try {
    const results = await db.select()
      .from(housingRecordsTable)
      .where(eq(housingRecordsTable.district_id, districtId))
      .execute();

    return results.map(record => ({
      ...record,
      latitude: record.latitude ? parseFloat(record.latitude) : null,
      longitude: record.longitude ? parseFloat(record.longitude) : null,
      monthly_income: record.monthly_income ? parseFloat(record.monthly_income) : null
    }));
  } catch (error) {
    console.error('Failed to fetch housing records by district:', error);
    throw error;
  }
}

export async function getHousingRecordsByVillage(villageId: number): Promise<HousingRecord[]> {
  try {
    const results = await db.select()
      .from(housingRecordsTable)
      .where(eq(housingRecordsTable.village_id, villageId))
      .execute();

    return results.map(record => ({
      ...record,
      latitude: record.latitude ? parseFloat(record.latitude) : null,
      longitude: record.longitude ? parseFloat(record.longitude) : null,
      monthly_income: record.monthly_income ? parseFloat(record.monthly_income) : null
    }));
  } catch (error) {
    console.error('Failed to fetch housing records by village:', error);
    throw error;
  }
}