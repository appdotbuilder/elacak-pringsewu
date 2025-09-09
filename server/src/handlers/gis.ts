import { db } from '../db';
import { housingRecordsTable, districtsTable, villagesTable } from '../db/schema';
import { type HousingRecord } from '../schema';
import { eq, and, isNotNull, SQL } from 'drizzle-orm';

export async function getHousingMapData(
    districtId?: number, 
    villageId?: number, 
    housingStatus?: 'RTLH' | 'RLH'
): Promise<{ id: number; latitude: number; longitude: number; housing_status: string; head_of_household: string; address: string }[]> {
    try {
        // Build conditions array
        const conditions: SQL<unknown>[] = [
            isNotNull(housingRecordsTable.latitude),
            isNotNull(housingRecordsTable.longitude)
        ];

        if (districtId !== undefined) {
            conditions.push(eq(housingRecordsTable.district_id, districtId));
        }

        if (villageId !== undefined) {
            conditions.push(eq(housingRecordsTable.village_id, villageId));
        }

        if (housingStatus !== undefined) {
            conditions.push(eq(housingRecordsTable.housing_status, housingStatus));
        }

        // Build and execute query with all conditions
        const results = await db.select({
            id: housingRecordsTable.id,
            latitude: housingRecordsTable.latitude,
            longitude: housingRecordsTable.longitude,
            housing_status: housingRecordsTable.housing_status,
            head_of_household: housingRecordsTable.head_of_household,
            address: housingRecordsTable.address
        })
        .from(housingRecordsTable)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
        .execute();

        // Convert numeric fields to numbers
        return results.map(record => ({
            id: record.id,
            latitude: parseFloat(record.latitude!), // We know it's not null due to filter
            longitude: parseFloat(record.longitude!),
            housing_status: record.housing_status,
            head_of_household: record.head_of_household,
            address: record.address
        }));
    } catch (error) {
        console.error('Failed to fetch housing map data:', error);
        throw error;
    }
}

export async function getDistrictBoundaries(): Promise<{ district_id: number; district_name: string; boundary_geojson: string }[]> {
    try {
        // For now, return mock data as the schema doesn't include boundary_geojson field
        // In a real implementation, this would be added to the districts table
        const districts = await db.select({
            id: districtsTable.id,
            name: districtsTable.name
        }).from(districtsTable).execute();

        // Generate mock GeoJSON boundaries based on district data
        return districts.map(district => ({
            district_id: district.id,
            district_name: district.name,
            boundary_geojson: JSON.stringify({
                type: "Polygon",
                coordinates: [[
                    [105.25 + district.id * 0.1, -5.40 - district.id * 0.1],
                    [105.30 + district.id * 0.1, -5.40 - district.id * 0.1],
                    [105.30 + district.id * 0.1, -5.45 - district.id * 0.1],
                    [105.25 + district.id * 0.1, -5.45 - district.id * 0.1],
                    [105.25 + district.id * 0.1, -5.40 - district.id * 0.1]
                ]]
            })
        }));
    } catch (error) {
        console.error('Failed to fetch district boundaries:', error);
        throw error;
    }
}

export async function getVillageBoundaries(districtId?: number): Promise<{ village_id: number; village_name: string; district_id: number; boundary_geojson: string }[]> {
    try {
        // Build base query
        const baseQuery = db.select({
            id: villagesTable.id,
            name: villagesTable.name,
            district_id: villagesTable.district_id
        }).from(villagesTable);

        // Apply district filter if provided and execute query
        const villages = districtId !== undefined
            ? await baseQuery.where(eq(villagesTable.district_id, districtId)).execute()
            : await baseQuery.execute();

        // Generate mock GeoJSON boundaries based on village data
        return villages.map(village => ({
            village_id: village.id,
            village_name: village.name,
            district_id: village.district_id,
            boundary_geojson: JSON.stringify({
                type: "Polygon",
                coordinates: [[
                    [105.25 + village.id * 0.01, -5.40 - village.id * 0.01],
                    [105.27 + village.id * 0.01, -5.40 - village.id * 0.01],
                    [105.27 + village.id * 0.01, -5.42 - village.id * 0.01],
                    [105.25 + village.id * 0.01, -5.42 - village.id * 0.01],
                    [105.25 + village.id * 0.01, -5.40 - village.id * 0.01]
                ]]
            })
        }));
    } catch (error) {
        console.error('Failed to fetch village boundaries:', error);
        throw error;
    }
}

export async function updateHousingCoordinates(housingRecordId: number, latitude: number, longitude: number, updatedBy: number): Promise<HousingRecord> {
    try {
        // First verify the housing record exists
        const existingRecord = await db.select()
            .from(housingRecordsTable)
            .where(eq(housingRecordsTable.id, housingRecordId))
            .execute();

        if (existingRecord.length === 0) {
            throw new Error(`Housing record with ID ${housingRecordId} not found`);
        }

        // Update coordinates
        const result = await db.update(housingRecordsTable)
            .set({
                latitude: latitude.toString(),
                longitude: longitude.toString(),
                updated_at: new Date()
            })
            .where(eq(housingRecordsTable.id, housingRecordId))
            .returning()
            .execute();

        // Convert numeric fields back to numbers
        const updatedRecord = result[0];
        return {
            ...updatedRecord,
            latitude: updatedRecord.latitude ? parseFloat(updatedRecord.latitude) : null,
            longitude: updatedRecord.longitude ? parseFloat(updatedRecord.longitude) : null,
            monthly_income: updatedRecord.monthly_income ? parseFloat(updatedRecord.monthly_income) : null
        };
    } catch (error) {
        console.error('Failed to update housing coordinates:', error);
        throw error;
    }
}

export async function getHeatmapData(): Promise<{ latitude: number; longitude: number; intensity: number }[]> {
    try {
        // Get all housing records with coordinates
        const records = await db.select({
            latitude: housingRecordsTable.latitude,
            longitude: housingRecordsTable.longitude,
            housing_status: housingRecordsTable.housing_status
        })
        .from(housingRecordsTable)
        .where(and(
            isNotNull(housingRecordsTable.latitude),
            isNotNull(housingRecordsTable.longitude)
        ))
        .execute();

        // Simple clustering logic - group by rounded coordinates
        const clusters = new Map<string, { latitude: number; longitude: number; count: number }>();

        records.forEach(record => {
            const lat = parseFloat(record.latitude!);
            const lng = parseFloat(record.longitude!);
            
            // Round to 3 decimal places for clustering (roughly 100m precision)
            const roundedLat = Math.round(lat * 1000) / 1000;
            const roundedLng = Math.round(lng * 1000) / 1000;
            const key = `${roundedLat},${roundedLng}`;

            const existing = clusters.get(key);
            if (existing) {
                existing.count += 1;
            } else {
                clusters.set(key, {
                    latitude: roundedLat,
                    longitude: roundedLng,
                    count: 1
                });
            }
        });

        // Convert to heatmap format
        return Array.from(clusters.values()).map(cluster => ({
            latitude: cluster.latitude,
            longitude: cluster.longitude,
            intensity: cluster.count
        }));
    } catch (error) {
        console.error('Failed to generate heatmap data:', error);
        throw error;
    }
}