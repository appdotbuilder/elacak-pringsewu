import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  numeric, 
  integer, 
  boolean,
  pgEnum,
  index,
  unique
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const housingStatusEnum = pgEnum('housing_status', ['RTLH', 'RLH']);
export const eligibilityCategoryEnum = pgEnum('eligibility_category', ['POOR', 'VERY_POOR', 'MODERATE', 'NOT_ELIGIBLE']);
export const verificationStatusEnum = pgEnum('verification_status', ['PENDING', 'VERIFIED', 'REJECTED']);
export const backlogTypeEnum = pgEnum('backlog_type', ['NO_HOUSE', 'UNINHABITABLE_HOUSE']);
export const userRoleEnum = pgEnum('user_role', ['PUPR_ADMIN', 'KOMINFO_ADMIN', 'DISTRICT_OPERATOR', 'VILLAGE_OPERATOR', 'PUBLIC']);
export const documentTypeEnum = pgEnum('document_type', ['LAND_CERTIFICATE', 'ID_CARD', 'FAMILY_CARD', 'HOUSE_PHOTO_BEFORE', 'HOUSE_PHOTO_AFTER']);
export const auditActionEnum = pgEnum('audit_action', ['CREATE', 'UPDATE', 'DELETE', 'VERIFY', 'LOGIN', 'EXPORT']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull(),
  district_id: integer('district_id'), // Nullable - references districts table
  village_id: integer('village_id'), // Nullable - references villages table
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  usernameIdx: index('users_username_idx').on(table.username),
  emailIdx: index('users_email_idx').on(table.email),
  roleIdx: index('users_role_idx').on(table.role)
}));

// Districts table
export const districtsTable = pgTable('districts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  codeIdx: index('districts_code_idx').on(table.code),
  nameIdx: index('districts_name_idx').on(table.name)
}));

// Villages table
export const villagesTable = pgTable('villages', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  district_id: integer('district_id').notNull(), // References districts table
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  districtIdIdx: index('villages_district_id_idx').on(table.district_id),
  codeIdx: index('villages_code_idx').on(table.code),
  nameIdx: index('villages_name_idx').on(table.name),
  uniqueCodePerDistrict: unique('villages_code_district_unique').on(table.code, table.district_id)
}));

// Housing records table
export const housingRecordsTable = pgTable('housing_records', {
  id: serial('id').primaryKey(),
  head_of_household: text('head_of_household').notNull(),
  nik: text('nik').notNull(), // National Identity Number - 16 digits
  housing_status: housingStatusEnum('housing_status').notNull(),
  eligibility_category: eligibilityCategoryEnum('eligibility_category').notNull(),
  verification_status: verificationStatusEnum('verification_status').default('PENDING').notNull(),
  district_id: integer('district_id').notNull(), // References districts table
  village_id: integer('village_id').notNull(), // References villages table
  latitude: numeric('latitude', { precision: 10, scale: 8 }), // Nullable - GPS coordinates
  longitude: numeric('longitude', { precision: 11, scale: 8 }), // Nullable - GPS coordinates
  address: text('address').notNull(),
  phone: text('phone'), // Nullable
  family_members: integer('family_members').notNull(),
  monthly_income: numeric('monthly_income', { precision: 12, scale: 2 }), // Nullable - monetary value
  house_condition_score: integer('house_condition_score'), // Nullable - 0-100 score
  notes: text('notes'), // Nullable
  verified_by: integer('verified_by'), // Nullable - references users table
  verified_at: timestamp('verified_at'), // Nullable
  created_by: integer('created_by').notNull(), // References users table
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  nikIdx: index('housing_records_nik_idx').on(table.nik),
  statusIdx: index('housing_records_status_idx').on(table.housing_status),
  verificationIdx: index('housing_records_verification_idx').on(table.verification_status),
  districtIdx: index('housing_records_district_idx').on(table.district_id),
  villageIdx: index('housing_records_village_idx').on(table.village_id),
  createdByIdx: index('housing_records_created_by_idx').on(table.created_by),
  verifiedByIdx: index('housing_records_verified_by_idx').on(table.verified_by),
  uniqueNik: unique('housing_records_nik_unique').on(table.nik)
}));

// Documents table for file uploads
export const documentsTable = pgTable('documents', {
  id: serial('id').primaryKey(),
  housing_record_id: integer('housing_record_id').notNull(), // References housing_records table
  document_type: documentTypeEnum('document_type').notNull(),
  filename: text('filename').notNull(),
  file_path: text('file_path').notNull(),
  file_size: integer('file_size').notNull(), // File size in bytes
  mime_type: text('mime_type').notNull(),
  uploaded_by: integer('uploaded_by').notNull(), // References users table
  created_at: timestamp('created_at').defaultNow().notNull()
}, (table) => ({
  housingRecordIdx: index('documents_housing_record_idx').on(table.housing_record_id),
  documentTypeIdx: index('documents_type_idx').on(table.document_type),
  uploadedByIdx: index('documents_uploaded_by_idx').on(table.uploaded_by)
}));

// Backlog tracking table
export const backlogsTable = pgTable('backlogs', {
  id: serial('id').primaryKey(),
  district_id: integer('district_id').notNull(), // References districts table
  village_id: integer('village_id').notNull(), // References villages table
  backlog_type: backlogTypeEnum('backlog_type').notNull(),
  family_count: integer('family_count').notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(), // 1-12
  created_by: integer('created_by').notNull(), // References users table
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  districtIdx: index('backlogs_district_idx').on(table.district_id),
  villageIdx: index('backlogs_village_idx').on(table.village_id),
  typeIdx: index('backlogs_type_idx').on(table.backlog_type),
  yearMonthIdx: index('backlogs_year_month_idx').on(table.year, table.month),
  uniqueEntry: unique('backlogs_unique_entry').on(table.district_id, table.village_id, table.backlog_type, table.year, table.month)
}));

// Audit log table
export const auditLogsTable = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull(), // References users table
  action: auditActionEnum('action').notNull(),
  resource_type: text('resource_type').notNull(), // e.g., 'housing_record', 'user', 'document'
  resource_id: integer('resource_id'), // Nullable - ID of the affected resource
  details: text('details'), // Nullable - JSON or text description of changes
  ip_address: text('ip_address'), // Nullable
  created_at: timestamp('created_at').defaultNow().notNull()
}, (table) => ({
  userIdx: index('audit_logs_user_idx').on(table.user_id),
  actionIdx: index('audit_logs_action_idx').on(table.action),
  resourceTypeIdx: index('audit_logs_resource_type_idx').on(table.resource_type),
  createdAtIdx: index('audit_logs_created_at_idx').on(table.created_at)
}));

// Relations
export const usersRelations = relations(usersTable, ({ one, many }) => ({
  district: one(districtsTable, {
    fields: [usersTable.district_id],
    references: [districtsTable.id]
  }),
  village: one(villagesTable, {
    fields: [usersTable.village_id],
    references: [villagesTable.id]
  }),
  createdHousingRecords: many(housingRecordsTable, {
    relationName: 'createdBy'
  }),
  verifiedHousingRecords: many(housingRecordsTable, {
    relationName: 'verifiedBy'
  }),
  uploadedDocuments: many(documentsTable),
  createdBacklogs: many(backlogsTable),
  auditLogs: many(auditLogsTable)
}));

export const districtsRelations = relations(districtsTable, ({ many }) => ({
  villages: many(villagesTable),
  housingRecords: many(housingRecordsTable),
  users: many(usersTable),
  backlogs: many(backlogsTable)
}));

export const villagesRelations = relations(villagesTable, ({ one, many }) => ({
  district: one(districtsTable, {
    fields: [villagesTable.district_id],
    references: [districtsTable.id]
  }),
  housingRecords: many(housingRecordsTable),
  users: many(usersTable),
  backlogs: many(backlogsTable)
}));

export const housingRecordsRelations = relations(housingRecordsTable, ({ one, many }) => ({
  district: one(districtsTable, {
    fields: [housingRecordsTable.district_id],
    references: [districtsTable.id]
  }),
  village: one(villagesTable, {
    fields: [housingRecordsTable.village_id],
    references: [villagesTable.id]
  }),
  createdBy: one(usersTable, {
    fields: [housingRecordsTable.created_by],
    references: [usersTable.id],
    relationName: 'createdBy'
  }),
  verifiedBy: one(usersTable, {
    fields: [housingRecordsTable.verified_by],
    references: [usersTable.id],
    relationName: 'verifiedBy'
  }),
  documents: many(documentsTable)
}));

export const documentsRelations = relations(documentsTable, ({ one }) => ({
  housingRecord: one(housingRecordsTable, {
    fields: [documentsTable.housing_record_id],
    references: [housingRecordsTable.id]
  }),
  uploadedBy: one(usersTable, {
    fields: [documentsTable.uploaded_by],
    references: [usersTable.id]
  })
}));

export const backlogsRelations = relations(backlogsTable, ({ one }) => ({
  district: one(districtsTable, {
    fields: [backlogsTable.district_id],
    references: [districtsTable.id]
  }),
  village: one(villagesTable, {
    fields: [backlogsTable.village_id],
    references: [villagesTable.id]
  }),
  createdBy: one(usersTable, {
    fields: [backlogsTable.created_by],
    references: [usersTable.id]
  })
}));

export const auditLogsRelations = relations(auditLogsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [auditLogsTable.user_id],
    references: [usersTable.id]
  })
}));

// TypeScript types for the tables
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type District = typeof districtsTable.$inferSelect;
export type NewDistrict = typeof districtsTable.$inferInsert;
export type Village = typeof villagesTable.$inferSelect;
export type NewVillage = typeof villagesTable.$inferInsert;
export type HousingRecord = typeof housingRecordsTable.$inferSelect;
export type NewHousingRecord = typeof housingRecordsTable.$inferInsert;
export type Document = typeof documentsTable.$inferSelect;
export type NewDocument = typeof documentsTable.$inferInsert;
export type Backlog = typeof backlogsTable.$inferSelect;
export type NewBacklog = typeof backlogsTable.$inferInsert;
export type AuditLog = typeof auditLogsTable.$inferSelect;
export type NewAuditLog = typeof auditLogsTable.$inferInsert;

// Export all tables for relation queries
export const tables = {
  users: usersTable,
  districts: districtsTable,
  villages: villagesTable,
  housingRecords: housingRecordsTable,
  documents: documentsTable,
  backlogs: backlogsTable,
  auditLogs: auditLogsTable
};