import { db } from '../db';
import { 
  housingRecordsTable,
  districtsTable,
  villagesTable
} from '../db/schema';
import { 
  type DashboardStats, 
  type HousingByDistrict 
} from '../schema';
import { count, eq, sql, and, type SQL } from 'drizzle-orm';

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // Get total houses and status counts
    const housingStats = await db.select({
      total_houses: count(housingRecordsTable.id),
      rtlh_count: sql<number>`sum(case when ${housingRecordsTable.housing_status} = 'RTLH' then 1 else 0 end)`,
      rlh_count: sql<number>`sum(case when ${housingRecordsTable.housing_status} = 'RLH' then 1 else 0 end)`,
      pending_verification: sql<number>`sum(case when ${housingRecordsTable.verification_status} = 'PENDING' then 1 else 0 end)`
    })
    .from(housingRecordsTable)
    .execute();

    // Get districts count
    const districtsCount = await db.select({
      count: count(districtsTable.id)
    })
    .from(districtsTable)
    .execute();

    // Get villages count
    const villagesCount = await db.select({
      count: count(villagesTable.id)
    })
    .from(villagesTable)
    .execute();

    const stats = housingStats[0];
    
    return {
      total_houses: stats.total_houses,
      rtlh_count: Number(stats.rtlh_count),
      rlh_count: Number(stats.rlh_count),
      pending_verification: Number(stats.pending_verification),
      districts_count: districtsCount[0].count,
      villages_count: villagesCount[0].count
    };
  } catch (error) {
    console.error('Dashboard stats fetch failed:', error);
    throw error;
  }
}

export async function getHousingByDistrict(): Promise<HousingByDistrict[]> {
  try {
    const results = await db.select({
      district_id: districtsTable.id,
      district_name: districtsTable.name,
      rtlh_count: sql<number>`sum(case when ${housingRecordsTable.housing_status} = 'RTLH' then 1 else 0 end)`,
      rlh_count: sql<number>`sum(case when ${housingRecordsTable.housing_status} = 'RLH' then 1 else 0 end)`,
      total_count: count(housingRecordsTable.id)
    })
    .from(districtsTable)
    .leftJoin(housingRecordsTable, eq(districtsTable.id, housingRecordsTable.district_id))
    .groupBy(districtsTable.id, districtsTable.name)
    .orderBy(districtsTable.name)
    .execute();

    return results.map(result => ({
      district_id: result.district_id,
      district_name: result.district_name,
      rtlh_count: Number(result.rtlh_count),
      rlh_count: Number(result.rlh_count),
      total_count: result.total_count
    }));
  } catch (error) {
    console.error('Housing by district fetch failed:', error);
    throw error;
  }
}

export async function getHousingByVillage(districtId?: number): Promise<{ village_id: number; village_name: string; rtlh_count: number; rlh_count: number; total_count: number }[]> {
  try {
    if (districtId !== undefined) {
      const results = await db.select({
        village_id: villagesTable.id,
        village_name: villagesTable.name,
        rtlh_count: sql<number>`sum(case when ${housingRecordsTable.housing_status} = 'RTLH' then 1 else 0 end)`,
        rlh_count: sql<number>`sum(case when ${housingRecordsTable.housing_status} = 'RLH' then 1 else 0 end)`,
        total_count: count(housingRecordsTable.id)
      })
      .from(villagesTable)
      .leftJoin(housingRecordsTable, eq(villagesTable.id, housingRecordsTable.village_id))
      .where(eq(villagesTable.district_id, districtId))
      .groupBy(villagesTable.id, villagesTable.name)
      .orderBy(villagesTable.name)
      .execute();

      return results.map(result => ({
        village_id: result.village_id,
        village_name: result.village_name,
        rtlh_count: Number(result.rtlh_count),
        rlh_count: Number(result.rlh_count),
        total_count: result.total_count
      }));
    } else {
      const results = await db.select({
        village_id: villagesTable.id,
        village_name: villagesTable.name,
        rtlh_count: sql<number>`sum(case when ${housingRecordsTable.housing_status} = 'RTLH' then 1 else 0 end)`,
        rlh_count: sql<number>`sum(case when ${housingRecordsTable.housing_status} = 'RLH' then 1 else 0 end)`,
        total_count: count(housingRecordsTable.id)
      })
      .from(villagesTable)
      .leftJoin(housingRecordsTable, eq(villagesTable.id, housingRecordsTable.village_id))
      .groupBy(villagesTable.id, villagesTable.name)
      .orderBy(villagesTable.name)
      .execute();

      return results.map(result => ({
        village_id: result.village_id,
        village_name: result.village_name,
        rtlh_count: Number(result.rtlh_count),
        rlh_count: Number(result.rlh_count),
        total_count: result.total_count
      }));
    }
  } catch (error) {
    console.error('Housing by village fetch failed:', error);
    throw error;
  }
}

export async function getVerificationStats(): Promise<{ pending: number; verified: number; rejected: number }> {
  try {
    const results = await db.select({
      pending: sql<number>`sum(case when ${housingRecordsTable.verification_status} = 'PENDING' then 1 else 0 end)`,
      verified: sql<number>`sum(case when ${housingRecordsTable.verification_status} = 'VERIFIED' then 1 else 0 end)`,
      rejected: sql<number>`sum(case when ${housingRecordsTable.verification_status} = 'REJECTED' then 1 else 0 end)`
    })
    .from(housingRecordsTable)
    .execute();

    const stats = results[0];
    
    return {
      pending: Number(stats.pending),
      verified: Number(stats.verified),
      rejected: Number(stats.rejected)
    };
  } catch (error) {
    console.error('Verification stats fetch failed:', error);
    throw error;
  }
}

export async function getEligibilityDistribution(): Promise<{ category: string; count: number; percentage: number }[]> {
  try {
    // Get counts per category
    const results = await db.select({
      category: housingRecordsTable.eligibility_category,
      count: count(housingRecordsTable.id)
    })
    .from(housingRecordsTable)
    .groupBy(housingRecordsTable.eligibility_category)
    .execute();

    // Get total count for percentage calculation
    const totalResult = await db.select({
      total: count(housingRecordsTable.id)
    })
    .from(housingRecordsTable)
    .execute();

    const total = totalResult[0].total;

    return results.map(result => ({
      category: result.category,
      count: result.count,
      percentage: total > 0 ? Math.round((result.count / total) * 100) : 0
    }));
  } catch (error) {
    console.error('Eligibility distribution fetch failed:', error);
    throw error;
  }
}

export async function getMonthlyTrends(year: number): Promise<{ month: number; rtlh_created: number; rlh_created: number; verified_count: number }[]> {
  try {
    const results = await db.select({
      month: sql<number>`extract(month from ${housingRecordsTable.created_at})::integer`,
      rtlh_created: sql<number>`sum(case when ${housingRecordsTable.housing_status} = 'RTLH' then 1 else 0 end)::integer`,
      rlh_created: sql<number>`sum(case when ${housingRecordsTable.housing_status} = 'RLH' then 1 else 0 end)::integer`,
      verified_count: sql<number>`sum(case when ${housingRecordsTable.verification_status} = 'VERIFIED' then 1 else 0 end)::integer`
    })
    .from(housingRecordsTable)
    .where(sql`extract(year from ${housingRecordsTable.created_at}) = ${year}`)
    .groupBy(sql`extract(month from ${housingRecordsTable.created_at})`)
    .orderBy(sql`extract(month from ${housingRecordsTable.created_at})`)
    .execute();

    // Fill in missing months with zero values
    const monthlyData: { month: number; rtlh_created: number; rlh_created: number; verified_count: number }[] = [];
    
    for (let month = 1; month <= 12; month++) {
      const existingData = results.find(r => Number(r.month) === month);
      
      if (existingData) {
        monthlyData.push({
          month,
          rtlh_created: Number(existingData.rtlh_created),
          rlh_created: Number(existingData.rlh_created),
          verified_count: Number(existingData.verified_count)
        });
      } else {
        monthlyData.push({
          month,
          rtlh_created: 0,
          rlh_created: 0,
          verified_count: 0
        });
      }
    }

    return monthlyData;
  } catch (error) {
    console.error('Monthly trends fetch failed:', error);
    throw error;
  }
}