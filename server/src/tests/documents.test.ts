import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { documentsTable, housingRecordsTable, usersTable, districtsTable, villagesTable } from '../db/schema';
import { type CreateDocumentInput } from '../schema';
import { 
  getDocumentsByHousingRecord, 
  getDocumentById, 
  createDocument, 
  deleteDocument,
  uploadFile 
} from '../handlers/documents';
import { eq } from 'drizzle-orm';

describe('documents handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: number;
  let testDistrictId: number;
  let testVillageId: number;
  let testHousingRecordId: number;

  beforeEach(async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashedpassword',
        role: 'VILLAGE_OPERATOR',
        is_active: true
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Create test district
    const districtResult = await db.insert(districtsTable)
      .values({
        name: 'Test District',
        code: 'TD001'
      })
      .returning()
      .execute();
    testDistrictId = districtResult[0].id;

    // Create test village
    const villageResult = await db.insert(villagesTable)
      .values({
        name: 'Test Village',
        code: 'TV001',
        district_id: testDistrictId
      })
      .returning()
      .execute();
    testVillageId = villageResult[0].id;

    // Create test housing record
    const housingResult = await db.insert(housingRecordsTable)
      .values({
        head_of_household: 'John Doe',
        nik: '1234567890123456',
        housing_status: 'RTLH',
        eligibility_category: 'POOR',
        district_id: testDistrictId,
        village_id: testVillageId,
        address: '123 Test Street',
        family_members: 4,
        created_by: testUserId
      })
      .returning()
      .execute();
    testHousingRecordId = housingResult[0].id;
  });

  describe('createDocument', () => {
    const testDocumentInput: CreateDocumentInput = {
      housing_record_id: 0, // Will be set in test
      document_type: 'HOUSE_PHOTO_BEFORE',
      filename: 'house_before.jpg',
      file_path: '/uploads/house_before.jpg',
      file_size: 1024000,
      mime_type: 'image/jpeg'
    };

    it('should create a document', async () => {
      const input = { ...testDocumentInput, housing_record_id: testHousingRecordId };
      const result = await createDocument(input, testUserId);

      expect(result.housing_record_id).toEqual(testHousingRecordId);
      expect(result.document_type).toEqual('HOUSE_PHOTO_BEFORE');
      expect(result.filename).toEqual('house_before.jpg');
      expect(result.file_path).toEqual('/uploads/house_before.jpg');
      expect(result.file_size).toEqual(1024000);
      expect(result.mime_type).toEqual('image/jpeg');
      expect(result.uploaded_by).toEqual(testUserId);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save document to database', async () => {
      const input = { ...testDocumentInput, housing_record_id: testHousingRecordId };
      const result = await createDocument(input, testUserId);

      const documents = await db.select()
        .from(documentsTable)
        .where(eq(documentsTable.id, result.id))
        .execute();

      expect(documents).toHaveLength(1);
      expect(documents[0].housing_record_id).toEqual(testHousingRecordId);
      expect(documents[0].document_type).toEqual('HOUSE_PHOTO_BEFORE');
      expect(documents[0].filename).toEqual('house_before.jpg');
      expect(documents[0].uploaded_by).toEqual(testUserId);
    });

    it('should throw error for non-existent housing record', async () => {
      const input = { ...testDocumentInput, housing_record_id: 99999 };

      await expect(createDocument(input, testUserId)).rejects.toThrow(/housing record not found/i);
    });
  });

  describe('getDocumentsByHousingRecord', () => {
    beforeEach(async () => {
      // Create test documents
      await db.insert(documentsTable)
        .values([
          {
            housing_record_id: testHousingRecordId,
            document_type: 'HOUSE_PHOTO_BEFORE',
            filename: 'before.jpg',
            file_path: '/uploads/before.jpg',
            file_size: 1024000,
            mime_type: 'image/jpeg',
            uploaded_by: testUserId
          },
          {
            housing_record_id: testHousingRecordId,
            document_type: 'HOUSE_PHOTO_AFTER',
            filename: 'after.jpg',
            file_path: '/uploads/after.jpg',
            file_size: 2048000,
            mime_type: 'image/jpeg',
            uploaded_by: testUserId
          }
        ])
        .execute();
    });

    it('should return documents for housing record', async () => {
      const documents = await getDocumentsByHousingRecord(testHousingRecordId);

      expect(documents).toHaveLength(2);
      expect(documents[0].housing_record_id).toEqual(testHousingRecordId);
      expect(documents[1].housing_record_id).toEqual(testHousingRecordId);
      
      const docTypes = documents.map(d => d.document_type).sort();
      expect(docTypes).toEqual(['HOUSE_PHOTO_AFTER', 'HOUSE_PHOTO_BEFORE']);
    });

    it('should return empty array for housing record with no documents', async () => {
      // Create another housing record without documents
      const anotherHousingResult = await db.insert(housingRecordsTable)
        .values({
          head_of_household: 'Jane Doe',
          nik: '9876543210123456',
          housing_status: 'RLH',
          eligibility_category: 'MODERATE',
          district_id: testDistrictId,
          village_id: testVillageId,
          address: '456 Another Street',
          family_members: 2,
          created_by: testUserId
        })
        .returning()
        .execute();

      const documents = await getDocumentsByHousingRecord(anotherHousingResult[0].id);
      expect(documents).toHaveLength(0);
    });
  });

  describe('getDocumentById', () => {
    let testDocumentId: number;

    beforeEach(async () => {
      const documentResult = await db.insert(documentsTable)
        .values({
          housing_record_id: testHousingRecordId,
          document_type: 'ID_CARD',
          filename: 'id_card.jpg',
          file_path: '/uploads/id_card.jpg',
          file_size: 512000,
          mime_type: 'image/jpeg',
          uploaded_by: testUserId
        })
        .returning()
        .execute();
      testDocumentId = documentResult[0].id;
    });

    it('should return document by ID', async () => {
      const document = await getDocumentById(testDocumentId);

      expect(document).not.toBeNull();
      expect(document!.id).toEqual(testDocumentId);
      expect(document!.housing_record_id).toEqual(testHousingRecordId);
      expect(document!.document_type).toEqual('ID_CARD');
      expect(document!.filename).toEqual('id_card.jpg');
      expect(document!.file_path).toEqual('/uploads/id_card.jpg');
      expect(document!.file_size).toEqual(512000);
      expect(document!.mime_type).toEqual('image/jpeg');
      expect(document!.uploaded_by).toEqual(testUserId);
      expect(document!.created_at).toBeInstanceOf(Date);
    });

    it('should return null for non-existent document', async () => {
      const document = await getDocumentById(99999);
      expect(document).toBeNull();
    });
  });

  describe('deleteDocument', () => {
    let testDocumentId: number;

    beforeEach(async () => {
      const documentResult = await db.insert(documentsTable)
        .values({
          housing_record_id: testHousingRecordId,
          document_type: 'FAMILY_CARD',
          filename: 'family_card.jpg',
          file_path: '/uploads/family_card.jpg',
          file_size: 256000,
          mime_type: 'image/jpeg',
          uploaded_by: testUserId
        })
        .returning()
        .execute();
      testDocumentId = documentResult[0].id;
    });

    it('should delete existing document', async () => {
      const result = await deleteDocument(testDocumentId, testUserId);
      expect(result).toBe(true);

      // Verify document is deleted
      const documents = await db.select()
        .from(documentsTable)
        .where(eq(documentsTable.id, testDocumentId))
        .execute();
      expect(documents).toHaveLength(0);
    });

    it('should return false for non-existent document', async () => {
      const result = await deleteDocument(99999, testUserId);
      expect(result).toBe(false);
    });

    it('should not affect other documents', async () => {
      // Create another document
      const anotherDocResult = await db.insert(documentsTable)
        .values({
          housing_record_id: testHousingRecordId,
          document_type: 'LAND_CERTIFICATE',
          filename: 'land_cert.pdf',
          file_path: '/uploads/land_cert.pdf',
          file_size: 1024000,
          mime_type: 'application/pdf',
          uploaded_by: testUserId
        })
        .returning()
        .execute();

      // Delete first document
      await deleteDocument(testDocumentId, testUserId);

      // Verify second document still exists
      const remainingDocs = await db.select()
        .from(documentsTable)
        .where(eq(documentsTable.id, anotherDocResult[0].id))
        .execute();
      expect(remainingDocs).toHaveLength(1);
    });
  });

  describe('uploadFile', () => {
    it('should generate unique filename and return metadata', async () => {
      // Create a mock file-like object with required properties
      const mockFile = {
        name: 'test.jpg',
        size: 1024,
        type: 'image/jpeg'
      } as File;
      
      const result = await uploadFile(mockFile, 'HOUSE_PHOTO_BEFORE');

      expect(result.filename).toMatch(/^HOUSE_PHOTO_BEFORE_\d+_[a-z0-9]+\.jpg$/);
      expect(result.filePath).toMatch(/^\/uploads\/HOUSE_PHOTO_BEFORE_\d+_[a-z0-9]+\.jpg$/);
      expect(result.fileSize).toEqual(mockFile.size);
    });

    it('should handle different file types', async () => {
      const pdfFile = {
        name: 'document.pdf',
        size: 2048,
        type: 'application/pdf'
      } as File;
      
      const result = await uploadFile(pdfFile, 'LAND_CERTIFICATE');

      expect(result.filename).toMatch(/^LAND_CERTIFICATE_\d+_[a-z0-9]+\.pdf$/);
      expect(result.filePath).toMatch(/^\/uploads\/LAND_CERTIFICATE_\d+_[a-z0-9]+\.pdf$/);
      expect(result.fileSize).toEqual(pdfFile.size);
    });

    it('should handle files without extension', async () => {
      const noExtFile = {
        name: 'document',
        size: 512,
        type: 'text/plain'
      } as File;
      
      const result = await uploadFile(noExtFile, 'ID_CARD');

      expect(result.filename).toMatch(/^ID_CARD_\d+_[a-z0-9]+$/);
      expect(result.filePath).toMatch(/^\/uploads\/ID_CARD_\d+_[a-z0-9]+$/);
      expect(result.fileSize).toEqual(noExtFile.size);
    });

    it('should generate different filenames for multiple uploads', async () => {
      const file1 = {
        name: 'test1.jpg',
        size: 1024,
        type: 'image/jpeg'
      } as File;
      const file2 = {
        name: 'test2.jpg',
        size: 2048,
        type: 'image/jpeg'
      } as File;
      
      const result1 = await uploadFile(file1, 'HOUSE_PHOTO_BEFORE');
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      const result2 = await uploadFile(file2, 'HOUSE_PHOTO_BEFORE');

      expect(result1.filename).not.toEqual(result2.filename);
      expect(result1.filePath).not.toEqual(result2.filePath);
    });
  });
});