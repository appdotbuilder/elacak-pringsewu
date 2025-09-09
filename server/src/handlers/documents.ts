import { db } from '../db';
import { documentsTable, housingRecordsTable } from '../db/schema';
import { type Document, type CreateDocumentInput } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function getDocumentsByHousingRecord(housingRecordId: number): Promise<Document[]> {
  try {
    const documents = await db.select()
      .from(documentsTable)
      .where(eq(documentsTable.housing_record_id, housingRecordId))
      .execute();

    return documents;
  } catch (error) {
    console.error('Failed to fetch documents by housing record:', error);
    throw error;
  }
}

export async function getDocumentById(id: number): Promise<Document | null> {
  try {
    const documents = await db.select()
      .from(documentsTable)
      .where(eq(documentsTable.id, id))
      .execute();

    return documents.length > 0 ? documents[0] : null;
  } catch (error) {
    console.error('Failed to fetch document by ID:', error);
    throw error;
  }
}

export async function createDocument(input: CreateDocumentInput, uploadedBy: number): Promise<Document> {
  try {
    // Verify housing record exists
    const housingRecords = await db.select()
      .from(housingRecordsTable)
      .where(eq(housingRecordsTable.id, input.housing_record_id))
      .execute();

    if (housingRecords.length === 0) {
      throw new Error('Housing record not found');
    }

    // Insert document record
    const result = await db.insert(documentsTable)
      .values({
        housing_record_id: input.housing_record_id,
        document_type: input.document_type,
        filename: input.filename,
        file_path: input.file_path,
        file_size: input.file_size,
        mime_type: input.mime_type,
        uploaded_by: uploadedBy
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Document creation failed:', error);
    throw error;
  }
}

export async function deleteDocument(id: number, deletedBy: number): Promise<boolean> {
  try {
    // Check if document exists
    const documents = await db.select()
      .from(documentsTable)
      .where(eq(documentsTable.id, id))
      .execute();

    if (documents.length === 0) {
      return false;
    }

    // Delete document record
    const result = await db.delete(documentsTable)
      .where(eq(documentsTable.id, id))
      .execute();

    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('Document deletion failed:', error);
    throw error;
  }
}

export async function uploadFile(file: File, documentType: string): Promise<{ filename: string; filePath: string; fileSize: number }> {
  try {
    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 15);
    const originalName = file.name;
    const parts = originalName.split('.');
    const extension = parts.length > 1 ? parts.pop() : '';
    const filename = extension 
      ? `${documentType}_${timestamp}_${randomSuffix}.${extension}`
      : `${documentType}_${timestamp}_${randomSuffix}`;
    const filePath = `/uploads/${filename}`;

    // In a real implementation, you would save the file to storage here
    // For now, we'll simulate the file upload process
    
    return {
      filename,
      filePath,
      fileSize: file.size
    };
  } catch (error) {
    console.error('File upload failed:', error);
    throw error;
  }
}