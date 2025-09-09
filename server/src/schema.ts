import { z } from 'zod';

// Enums for various status types
export const housingStatusEnum = z.enum(['RTLH', 'RLH']); // RTLH: uninhabitable, RLH: livable
export const eligibilityCategoryEnum = z.enum(['POOR', 'VERY_POOR', 'MODERATE', 'NOT_ELIGIBLE']);
export const verificationStatusEnum = z.enum(['PENDING', 'VERIFIED', 'REJECTED']);
export const backlogTypeEnum = z.enum(['NO_HOUSE', 'UNINHABITABLE_HOUSE']);
export const userRoleEnum = z.enum(['PUPR_ADMIN', 'KOMINFO_ADMIN', 'DISTRICT_OPERATOR', 'VILLAGE_OPERATOR', 'PUBLIC']);
export const documentTypeEnum = z.enum(['LAND_CERTIFICATE', 'ID_CARD', 'FAMILY_CARD', 'HOUSE_PHOTO_BEFORE', 'HOUSE_PHOTO_AFTER']);
export const auditActionEnum = z.enum(['CREATE', 'UPDATE', 'DELETE', 'VERIFY', 'LOGIN', 'EXPORT']);

// User schema
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().email(),
  password_hash: z.string(),
  role: userRoleEnum,
  district_id: z.number().nullable(), // For district/village operators
  village_id: z.number().nullable(), // For village operators
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// District schema
export const districtSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type District = z.infer<typeof districtSchema>;

// Village schema
export const villageSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  district_id: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Village = z.infer<typeof villageSchema>;

// Housing record schema
export const housingRecordSchema = z.object({
  id: z.number(),
  head_of_household: z.string(),
  nik: z.string(), // National Identity Number
  housing_status: housingStatusEnum,
  eligibility_category: eligibilityCategoryEnum,
  verification_status: verificationStatusEnum,
  district_id: z.number(),
  village_id: z.number(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  address: z.string(),
  phone: z.string().nullable(),
  family_members: z.number().int(),
  monthly_income: z.number().nullable(),
  house_condition_score: z.number().nullable(),
  notes: z.string().nullable(),
  verified_by: z.number().nullable(), // User ID who verified
  verified_at: z.coerce.date().nullable(),
  created_by: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type HousingRecord = z.infer<typeof housingRecordSchema>;

// Document schema for file uploads
export const documentSchema = z.object({
  id: z.number(),
  housing_record_id: z.number(),
  document_type: documentTypeEnum,
  filename: z.string(),
  file_path: z.string(),
  file_size: z.number(),
  mime_type: z.string(),
  uploaded_by: z.number(),
  created_at: z.coerce.date()
});

export type Document = z.infer<typeof documentSchema>;

// Backlog tracking schema
export const backlogSchema = z.object({
  id: z.number(),
  district_id: z.number(),
  village_id: z.number(),
  backlog_type: backlogTypeEnum,
  family_count: z.number().int(),
  year: z.number().int(),
  month: z.number().int(),
  created_by: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Backlog = z.infer<typeof backlogSchema>;

// Audit trail schema
export const auditLogSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  action: auditActionEnum,
  resource_type: z.string(),
  resource_id: z.number().nullable(),
  details: z.string().nullable(),
  ip_address: z.string().nullable(),
  created_at: z.coerce.date()
});

export type AuditLog = z.infer<typeof auditLogSchema>;

// Input schemas for creating records

// Create user input
export const createUserInputSchema = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: userRoleEnum,
  district_id: z.number().nullable().optional(),
  village_id: z.number().nullable().optional()
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

// Create district input
export const createDistrictInputSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1)
});

export type CreateDistrictInput = z.infer<typeof createDistrictInputSchema>;

// Create village input
export const createVillageInputSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  district_id: z.number()
});

export type CreateVillageInput = z.infer<typeof createVillageInputSchema>;

// Create housing record input
export const createHousingRecordInputSchema = z.object({
  head_of_household: z.string().min(1),
  nik: z.string().regex(/^\d{16}$/, 'NIK must be 16 digits'),
  housing_status: housingStatusEnum,
  eligibility_category: eligibilityCategoryEnum,
  district_id: z.number(),
  village_id: z.number(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  address: z.string().min(1),
  phone: z.string().nullable().optional(),
  family_members: z.number().int().positive(),
  monthly_income: z.number().nullable().optional(),
  house_condition_score: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().nullable().optional()
});

export type CreateHousingRecordInput = z.infer<typeof createHousingRecordInputSchema>;

// Update housing record input
export const updateHousingRecordInputSchema = z.object({
  id: z.number(),
  head_of_household: z.string().min(1).optional(),
  housing_status: housingStatusEnum.optional(),
  eligibility_category: eligibilityCategoryEnum.optional(),
  district_id: z.number().optional(),
  village_id: z.number().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  address: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  family_members: z.number().int().positive().optional(),
  monthly_income: z.number().nullable().optional(),
  house_condition_score: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().nullable().optional()
});

export type UpdateHousingRecordInput = z.infer<typeof updateHousingRecordInputSchema>;

// Create document input
export const createDocumentInputSchema = z.object({
  housing_record_id: z.number(),
  document_type: documentTypeEnum,
  filename: z.string().min(1),
  file_path: z.string().min(1),
  file_size: z.number().positive(),
  mime_type: z.string().min(1)
});

export type CreateDocumentInput = z.infer<typeof createDocumentInputSchema>;

// Create backlog input
export const createBacklogInputSchema = z.object({
  district_id: z.number(),
  village_id: z.number(),
  backlog_type: backlogTypeEnum,
  family_count: z.number().int().nonnegative(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12)
});

export type CreateBacklogInput = z.infer<typeof createBacklogInputSchema>;

// Verify housing record input
export const verifyHousingRecordInputSchema = z.object({
  id: z.number(),
  verification_status: verificationStatusEnum,
  notes: z.string().nullable().optional()
});

export type VerifyHousingRecordInput = z.infer<typeof verifyHousingRecordInputSchema>;

// Login input
export const loginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// Dashboard statistics schema
export const dashboardStatsSchema = z.object({
  total_houses: z.number(),
  rtlh_count: z.number(),
  rlh_count: z.number(),
  pending_verification: z.number(),
  districts_count: z.number(),
  villages_count: z.number()
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

// Housing by district schema
export const housingByDistrictSchema = z.object({
  district_id: z.number(),
  district_name: z.string(),
  rtlh_count: z.number(),
  rlh_count: z.number(),
  total_count: z.number()
});

export type HousingByDistrict = z.infer<typeof housingByDistrictSchema>;

// Export report input
export const exportReportInputSchema = z.object({
  format: z.enum(['PDF', 'EXCEL', 'CSV']),
  district_id: z.number().nullable().optional(),
  village_id: z.number().nullable().optional(),
  housing_status: housingStatusEnum.nullable().optional(),
  date_from: z.coerce.date().nullable().optional(),
  date_to: z.coerce.date().nullable().optional()
});

export type ExportReportInput = z.infer<typeof exportReportInputSchema>;