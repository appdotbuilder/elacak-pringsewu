import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, districtsTable, villagesTable, housingRecordsTable } from '../db/schema';
import { 
    getHousingMapData, 
    getDistrictBoundaries, 
    getVillageBoundaries, 
    updateHousingCoordinates, 
    getHeatmapData 
} from '../handlers/gis';

describe('GIS Handlers', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    // Test data setup helper
    async function createTestData() {
        // Create user
        const user = await db.insert(usersTable)
            .values({
                username: 'testuser',
                email: 'test@example.com',
                password_hash: 'hashed_password',
                role: 'DISTRICT_OPERATOR',
                is_active: true
            })
            .returning()
            .execute();

        // Create districts
        const district1 = await db.insert(districtsTable)
            .values({
                name: 'Central District',
                code: 'CD001'
            })
            .returning()
            .execute();

        const district2 = await db.insert(districtsTable)
            .values({
                name: 'North District',
                code: 'ND002'
            })
            .returning()
            .execute();

        // Create villages
        const village1 = await db.insert(villagesTable)
            .values({
                name: 'Village A',
                code: 'VA001',
                district_id: district1[0].id
            })
            .returning()
            .execute();

        const village2 = await db.insert(villagesTable)
            .values({
                name: 'Village B',
                code: 'VB002',
                district_id: district1[0].id
            })
            .returning()
            .execute();

        const village3 = await db.insert(villagesTable)
            .values({
                name: 'Village C',
                code: 'VC003',
                district_id: district2[0].id
            })
            .returning()
            .execute();

        // Create housing records with coordinates
        const housingWithCoords = await db.insert(housingRecordsTable)
            .values([
                {
                    head_of_household: 'John Doe',
                    nik: '1234567890123456',
                    housing_status: 'RTLH',
                    eligibility_category: 'POOR',
                    district_id: district1[0].id,
                    village_id: village1[0].id,
                    latitude: '-5.4083',
                    longitude: '105.2661',
                    address: '123 Main Street',
                    family_members: 4,
                    created_by: user[0].id
                },
                {
                    head_of_household: 'Jane Smith',
                    nik: '1234567890123457',
                    housing_status: 'RLH',
                    eligibility_category: 'VERY_POOR',
                    district_id: district1[0].id,
                    village_id: village2[0].id,
                    latitude: '-5.4100',
                    longitude: '105.2700',
                    address: '456 Oak Avenue',
                    family_members: 3,
                    created_by: user[0].id
                },
                {
                    head_of_household: 'Bob Johnson',
                    nik: '1234567890123458',
                    housing_status: 'RTLH',
                    eligibility_category: 'MODERATE',
                    district_id: district2[0].id,
                    village_id: village3[0].id,
                    latitude: '-5.4120',
                    longitude: '105.2680',
                    address: '789 Pine Road',
                    family_members: 5,
                    created_by: user[0].id
                }
            ])
            .returning()
            .execute();

        // Create housing record without coordinates
        await db.insert(housingRecordsTable)
            .values({
                head_of_household: 'Alice Brown',
                nik: '1234567890123459',
                housing_status: 'RTLH',
                eligibility_category: 'POOR',
                district_id: district1[0].id,
                village_id: village1[0].id,
                address: '321 Elm Street',
                family_members: 2,
                created_by: user[0].id
            })
            .execute();

        return {
            user: user[0],
            districts: [district1[0], district2[0]],
            villages: [village1[0], village2[0], village3[0]],
            housingRecords: housingWithCoords
        };
    }

    describe('getHousingMapData', () => {
        it('should return all housing records with coordinates', async () => {
            await createTestData();

            const result = await getHousingMapData();

            expect(result).toHaveLength(3);
            result.forEach(record => {
                expect(record.id).toBeDefined();
                expect(typeof record.latitude).toBe('number');
                expect(typeof record.longitude).toBe('number');
                expect(record.housing_status).toMatch(/^(RTLH|RLH)$/);
                expect(record.head_of_household).toBeDefined();
                expect(record.address).toBeDefined();
            });
        });

        it('should filter by district', async () => {
            const testData = await createTestData();

            const result = await getHousingMapData(testData.districts[0].id);

            expect(result).toHaveLength(2);
            result.forEach(record => {
                expect(['John Doe', 'Jane Smith']).toContain(record.head_of_household);
            });
        });

        it('should filter by village', async () => {
            const testData = await createTestData();

            const result = await getHousingMapData(undefined, testData.villages[0].id);

            expect(result).toHaveLength(1);
            expect(result[0].head_of_household).toBe('John Doe');
        });

        it('should filter by housing status', async () => {
            await createTestData();

            const rtlhResult = await getHousingMapData(undefined, undefined, 'RTLH');
            const rlhResult = await getHousingMapData(undefined, undefined, 'RLH');

            expect(rtlhResult).toHaveLength(2);
            expect(rlhResult).toHaveLength(1);
            
            rtlhResult.forEach(record => {
                expect(record.housing_status).toBe('RTLH');
            });
            
            rlhResult.forEach(record => {
                expect(record.housing_status).toBe('RLH');
            });
        });

        it('should combine multiple filters', async () => {
            const testData = await createTestData();

            const result = await getHousingMapData(
                testData.districts[0].id, 
                testData.villages[0].id, 
                'RTLH'
            );

            expect(result).toHaveLength(1);
            expect(result[0].head_of_household).toBe('John Doe');
            expect(result[0].housing_status).toBe('RTLH');
        });

        it('should return empty array when no records match filters', async () => {
            await createTestData();

            const result = await getHousingMapData(999, 999, 'RLH');

            expect(result).toHaveLength(0);
        });
    });

    describe('getDistrictBoundaries', () => {
        it('should return boundaries for all districts', async () => {
            const testData = await createTestData();

            const result = await getDistrictBoundaries();

            expect(result).toHaveLength(2);
            result.forEach(boundary => {
                expect(boundary.district_id).toBeDefined();
                expect(boundary.district_name).toBeDefined();
                expect(boundary.boundary_geojson).toMatch(/^\{"type":"Polygon"/);
                
                // Verify it's valid JSON
                expect(() => JSON.parse(boundary.boundary_geojson)).not.toThrow();
            });

            const districtNames = result.map(b => b.district_name);
            expect(districtNames).toContain('Central District');
            expect(districtNames).toContain('North District');
        });

        it('should return empty array when no districts exist', async () => {
            const result = await getDistrictBoundaries();

            expect(result).toHaveLength(0);
        });
    });

    describe('getVillageBoundaries', () => {
        it('should return boundaries for all villages', async () => {
            await createTestData();

            const result = await getVillageBoundaries();

            expect(result).toHaveLength(3);
            result.forEach(boundary => {
                expect(boundary.village_id).toBeDefined();
                expect(boundary.village_name).toBeDefined();
                expect(boundary.district_id).toBeDefined();
                expect(boundary.boundary_geojson).toMatch(/^\{"type":"Polygon"/);
                
                // Verify it's valid JSON
                expect(() => JSON.parse(boundary.boundary_geojson)).not.toThrow();
            });
        });

        it('should filter villages by district', async () => {
            const testData = await createTestData();

            const result = await getVillageBoundaries(testData.districts[0].id);

            expect(result).toHaveLength(2);
            result.forEach(boundary => {
                expect(boundary.district_id).toBe(testData.districts[0].id);
                expect(['Village A', 'Village B']).toContain(boundary.village_name);
            });
        });

        it('should return empty array for non-existent district', async () => {
            await createTestData();

            const result = await getVillageBoundaries(999);

            expect(result).toHaveLength(0);
        });
    });

    describe('updateHousingCoordinates', () => {
        it('should update coordinates for existing housing record', async () => {
            const testData = await createTestData();
            const housingRecord = testData.housingRecords[0];
            const newLat = -5.5000;
            const newLng = 105.3000;

            const result = await updateHousingCoordinates(
                housingRecord.id,
                newLat,
                newLng,
                testData.user.id
            );

            expect(result.id).toBe(housingRecord.id);
            expect(result.latitude).toBe(newLat);
            expect(result.longitude).toBe(newLng);
            expect(result.updated_at).toBeInstanceOf(Date);
        });

        it('should throw error for non-existent housing record', async () => {
            const testData = await createTestData();

            await expect(updateHousingCoordinates(999, -5.5000, 105.3000, testData.user.id))
                .rejects.toThrow('Housing record with ID 999 not found');
        });

        it('should verify coordinates are updated in database', async () => {
            const testData = await createTestData();
            const housingRecord = testData.housingRecords[0];
            const newLat = -5.6000;
            const newLng = 105.4000;

            await updateHousingCoordinates(
                housingRecord.id,
                newLat,
                newLng,
                testData.user.id
            );

            // Verify in map data
            const mapData = await getHousingMapData();
            const updatedRecord = mapData.find(r => r.id === housingRecord.id);
            
            expect(updatedRecord).toBeDefined();
            expect(updatedRecord!.latitude).toBe(newLat);
            expect(updatedRecord!.longitude).toBe(newLng);
        });
    });

    describe('getHeatmapData', () => {
        it('should generate heatmap data from housing records', async () => {
            await createTestData();

            const result = await getHeatmapData();

            expect(result.length).toBeGreaterThan(0);
            result.forEach(point => {
                expect(typeof point.latitude).toBe('number');
                expect(typeof point.longitude).toBe('number');
                expect(typeof point.intensity).toBe('number');
                expect(point.intensity).toBeGreaterThan(0);
            });
        });

        it('should cluster nearby coordinates', async () => {
            const testData = await createTestData();

            // Add records with very similar coordinates (should cluster)
            await db.insert(housingRecordsTable)
                .values([
                    {
                        head_of_household: 'Test User 1',
                        nik: '1234567890123460',
                        housing_status: 'RTLH',
                        eligibility_category: 'POOR',
                        district_id: testData.districts[0].id,
                        village_id: testData.villages[0].id,
                        latitude: '-5.4083', // Same as first record
                        longitude: '105.2661',
                        address: 'Near 123 Main Street',
                        family_members: 2,
                        created_by: testData.user.id
                    },
                    {
                        head_of_household: 'Test User 2',
                        nik: '1234567890123461',
                        housing_status: 'RLH',
                        eligibility_category: 'VERY_POOR',
                        district_id: testData.districts[0].id,
                        village_id: testData.villages[0].id,
                        latitude: '-5.4084', // Very close coordinates
                        longitude: '105.2662',
                        address: 'Also near 123 Main Street',
                        family_members: 3,
                        created_by: testData.user.id
                    }
                ])
                .execute();

            const result = await getHeatmapData();

            // Should have fewer clusters than total records due to clustering
            expect(result.length).toBeLessThanOrEqual(5); // 5 total records created

            // At least one cluster should have intensity > 1
            const clusteredPoints = result.filter(point => point.intensity > 1);
            expect(clusteredPoints.length).toBeGreaterThan(0);
        });

        it('should return empty array when no coordinates exist', async () => {
            // Create housing record without coordinates
            const user = await db.insert(usersTable)
                .values({
                    username: 'testuser',
                    email: 'test@example.com',
                    password_hash: 'hashed_password',
                    role: 'DISTRICT_OPERATOR',
                    is_active: true
                })
                .returning()
                .execute();

            const district = await db.insert(districtsTable)
                .values({
                    name: 'Test District',
                    code: 'TD001'
                })
                .returning()
                .execute();

            const village = await db.insert(villagesTable)
                .values({
                    name: 'Test Village',
                    code: 'TV001',
                    district_id: district[0].id
                })
                .returning()
                .execute();

            await db.insert(housingRecordsTable)
                .values({
                    head_of_household: 'No Coords User',
                    nik: '1234567890123456',
                    housing_status: 'RTLH',
                    eligibility_category: 'POOR',
                    district_id: district[0].id,
                    village_id: village[0].id,
                    address: 'No GPS Address',
                    family_members: 1,
                    created_by: user[0].id
                })
                .execute();

            const result = await getHeatmapData();

            expect(result).toHaveLength(0);
        });
    });
});