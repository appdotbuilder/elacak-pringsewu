import { db } from '../db';
import { backlogsTable, districtsTable, villagesTable } from '../db/schema';
import { type Backlog, type CreateBacklogInput } from '../schema';
import { eq, and, gte, lte, or, SQL } from 'drizzle-orm';

export async function getBacklogs(): Promise<Backlog[]> {
  try {
    const results = await db.select()
      .from(backlogsTable)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get backlogs:', error);
    throw error;
  }
}

export async function getBacklogById(id: number): Promise<Backlog | null> {
  try {
    const results = await db.select()
      .from(backlogsTable)
      .where(eq(backlogsTable.id, id))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to get backlog by ID:', error);
    throw error;
  }
}

export async function createBacklog(input: CreateBacklogInput, createdBy: number): Promise<Backlog> {
  try {
    // Validate that district and village exist
    const districtExists = await db.select()
      .from(districtsTable)
      .where(eq(districtsTable.id, input.district_id))
      .execute();

    if (districtExists.length === 0) {
      throw new Error(`District with ID ${input.district_id} does not exist`);
    }

    const villageExists = await db.select()
      .from(villagesTable)
      .where(and(
        eq(villagesTable.id, input.village_id),
        eq(villagesTable.district_id, input.district_id)
      ))
      .execute();

    if (villageExists.length === 0) {
      throw new Error(`Village with ID ${input.village_id} does not exist in district ${input.district_id}`);
    }

    // Check for unique constraint violation
    const existingBacklog = await db.select()
      .from(backlogsTable)
      .where(and(
        eq(backlogsTable.district_id, input.district_id),
        eq(backlogsTable.village_id, input.village_id),
        eq(backlogsTable.backlog_type, input.backlog_type),
        eq(backlogsTable.year, input.year),
        eq(backlogsTable.month, input.month)
      ))
      .execute();

    if (existingBacklog.length > 0) {
      throw new Error('A backlog entry already exists for this district, village, type, year, and month combination');
    }

    const results = await db.insert(backlogsTable)
      .values({
        district_id: input.district_id,
        village_id: input.village_id,
        backlog_type: input.backlog_type,
        family_count: input.family_count,
        year: input.year,
        month: input.month,
        created_by: createdBy
      })
      .returning()
      .execute();

    return results[0];
  } catch (error) {
    console.error('Failed to create backlog:', error);
    throw error;
  }
}

export async function updateBacklog(id: number, familyCount: number, updatedBy: number): Promise<Backlog> {
  try {
    // Check if backlog exists
    const existingBacklog = await db.select()
      .from(backlogsTable)
      .where(eq(backlogsTable.id, id))
      .execute();

    if (existingBacklog.length === 0) {
      throw new Error(`Backlog with ID ${id} does not exist`);
    }

    const results = await db.update(backlogsTable)
      .set({
        family_count: familyCount,
        updated_at: new Date()
      })
      .where(eq(backlogsTable.id, id))
      .returning()
      .execute();

    return results[0];
  } catch (error) {
    console.error('Failed to update backlog:', error);
    throw error;
  }
}

export async function getBacklogsByDistrict(districtId: number): Promise<Backlog[]> {
  try {
    const results = await db.select()
      .from(backlogsTable)
      .where(eq(backlogsTable.district_id, districtId))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get backlogs by district:', error);
    throw error;
  }
}

export async function getBacklogsByDateRange(startYear: number, startMonth: number, endYear: number, endMonth: number): Promise<Backlog[]> {
  try {
    let results: Backlog[];

    // Handle date range filtering
    if (startYear === endYear) {
      // Same year - filter by month range
      results = await db.select()
        .from(backlogsTable)
        .where(
          and(
            eq(backlogsTable.year, startYear),
            gte(backlogsTable.month, startMonth),
            lte(backlogsTable.month, endMonth)
          )
        )
        .execute();
    } else {
      // Different years - use OR conditions for start/end years
      results = await db.select()
        .from(backlogsTable)
        .where(
          or(
            and(
              eq(backlogsTable.year, startYear),
              gte(backlogsTable.month, startMonth)
            ),
            and(
              eq(backlogsTable.year, endYear),
              lte(backlogsTable.month, endMonth)
            ),
            and(
              gte(backlogsTable.year, startYear + 1),
              lte(backlogsTable.year, endYear - 1)
            )
          )!
        )
        .execute();
    }

    return results;
  } catch (error) {
    console.error('Failed to get backlogs by date range:', error);
    throw error;
  }
}