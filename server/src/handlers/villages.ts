import { db } from '../db';
import { villagesTable, districtsTable } from '../db/schema';
import { type Village, type CreateVillageInput } from '../schema';
import { eq } from 'drizzle-orm';

export async function getVillages(): Promise<Village[]> {
  try {
    const result = await db.select()
      .from(villagesTable)
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch villages:', error);
    throw error;
  }
}

export async function getVillagesByDistrict(districtId: number): Promise<Village[]> {
  try {
    const result = await db.select()
      .from(villagesTable)
      .where(eq(villagesTable.district_id, districtId))
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch villages by district:', error);
    throw error;
  }
}

export async function getVillageById(id: number): Promise<Village | null> {
  try {
    const result = await db.select()
      .from(villagesTable)
      .where(eq(villagesTable.id, id))
      .execute();

    return result[0] || null;
  } catch (error) {
    console.error('Failed to fetch village by ID:', error);
    throw error;
  }
}

export async function createVillage(input: CreateVillageInput): Promise<Village> {
  try {
    // Verify district exists
    const district = await db.select()
      .from(districtsTable)
      .where(eq(districtsTable.id, input.district_id))
      .execute();

    if (district.length === 0) {
      throw new Error(`District with ID ${input.district_id} not found`);
    }

    // Insert village record
    const result = await db.insert(villagesTable)
      .values({
        name: input.name,
        code: input.code,
        district_id: input.district_id
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Village creation failed:', error);
    throw error;
  }
}