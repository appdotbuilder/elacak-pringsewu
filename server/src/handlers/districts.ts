import { db } from '../db';
import { districtsTable } from '../db/schema';
import { type District, type CreateDistrictInput } from '../schema';
import { eq, asc } from 'drizzle-orm';

export async function getDistricts(): Promise<District[]> {
  try {
    const results = await db.select()
      .from(districtsTable)
      .orderBy(asc(districtsTable.name))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch districts:', error);
    throw error;
  }
}

export async function getDistrictById(id: number): Promise<District | null> {
  try {
    const results = await db.select()
      .from(districtsTable)
      .where(eq(districtsTable.id, id))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to fetch district by ID:', error);
    throw error;
  }
}

export async function createDistrict(input: CreateDistrictInput): Promise<District> {
  try {
    const result = await db.insert(districtsTable)
      .values({
        name: input.name,
        code: input.code
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('District creation failed:', error);
    throw error;
  }
}