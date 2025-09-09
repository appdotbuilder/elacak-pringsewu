import { initTRPC, TRPCError } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  loginInputSchema,
  createUserInputSchema,
  createDistrictInputSchema,
  createVillageInputSchema,
  createHousingRecordInputSchema,
  updateHousingRecordInputSchema,
  verifyHousingRecordInputSchema,
  createDocumentInputSchema,
  createBacklogInputSchema,
  exportReportInputSchema
} from './schema';

// Import handlers
import { loginUser, createUser, getCurrentUser } from './handlers/auth';
import { getDistricts, getDistrictById, createDistrict } from './handlers/districts';
import { getVillages, getVillagesByDistrict, getVillageById, createVillage } from './handlers/villages';
import {
  getHousingRecords,
  getHousingRecordById,
  createHousingRecord,
  updateHousingRecord,
  verifyHousingRecord,
  deleteHousingRecord,
  getHousingRecordsByDistrict,
  getHousingRecordsByVillage
} from './handlers/housing_records';
import {
  getDocumentsByHousingRecord,
  getDocumentById,
  createDocument,
  deleteDocument,
  uploadFile
} from './handlers/documents';
import {
  getBacklogs,
  getBacklogById,
  createBacklog,
  updateBacklog,
  getBacklogsByDistrict,
  getBacklogsByDateRange
} from './handlers/backlogs';
import {
  getDashboardStats,
  getHousingByDistrict,
  getHousingByVillage,
  getVerificationStats,
  getEligibilityDistribution,
  getMonthlyTrends
} from './handlers/analytics';
import {
  generateReport,
  generateHousingReport,
  generateBacklogReport,
  generateComplianceReport,
  scheduleAutomatedReports
} from './handlers/reports';
import {
  logAuditAction,
  getAuditLogs,
  getAuditLogsByResource,
  getSecurityReport
} from './handlers/audit';
import {
  getHousingMapData,
  getDistrictBoundaries,
  getVillageBoundaries,
  updateHousingCoordinates,
  getHeatmapData
} from './handlers/gis';

// Initialize tRPC
const t = initTRPC.context<{
  userId?: number;
  userRole?: string;
  ipAddress?: string;
}>().create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

const router = t.router;

// Define the main application router
const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => loginUser(input)),
    
    getCurrentUser: protectedProcedure
      .query(({ ctx }) => getCurrentUser(ctx.userId!)),
    
    createUser: protectedProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => createUser(input)),
  }),

  // Districts routes
  districts: router({
    getAll: protectedProcedure
      .query(() => getDistricts()),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getDistrictById(input.id)),
    
    create: protectedProcedure
      .input(createDistrictInputSchema)
      .mutation(({ input }) => createDistrict(input)),
  }),

  // Villages routes
  villages: router({
    getAll: protectedProcedure
      .query(() => getVillages()),
    
    getByDistrict: protectedProcedure
      .input(z.object({ districtId: z.number() }))
      .query(({ input }) => getVillagesByDistrict(input.districtId)),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getVillageById(input.id)),
    
    create: protectedProcedure
      .input(createVillageInputSchema)
      .mutation(({ input }) => createVillage(input)),
  }),

  // Housing records routes
  housingRecords: router({
    getAll: protectedProcedure
      .query(() => getHousingRecords()),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getHousingRecordById(input.id)),
    
    getByDistrict: protectedProcedure
      .input(z.object({ districtId: z.number() }))
      .query(({ input }) => getHousingRecordsByDistrict(input.districtId)),
    
    getByVillage: protectedProcedure
      .input(z.object({ villageId: z.number() }))
      .query(({ input }) => getHousingRecordsByVillage(input.villageId)),
    
    create: protectedProcedure
      .input(createHousingRecordInputSchema)
      .mutation(({ input, ctx }) => createHousingRecord(input, ctx.userId!)),
    
    update: protectedProcedure
      .input(updateHousingRecordInputSchema)
      .mutation(({ input, ctx }) => updateHousingRecord(input, ctx.userId!)),
    
    verify: protectedProcedure
      .input(verifyHousingRecordInputSchema)
      .mutation(({ input, ctx }) => verifyHousingRecord(input, ctx.userId!)),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => deleteHousingRecord(input.id, ctx.userId!)),
  }),

  // Documents routes
  documents: router({
    getByHousingRecord: protectedProcedure
      .input(z.object({ housingRecordId: z.number() }))
      .query(({ input }) => getDocumentsByHousingRecord(input.housingRecordId)),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getDocumentById(input.id)),
    
    create: protectedProcedure
      .input(createDocumentInputSchema)
      .mutation(({ input, ctx }) => createDocument(input, ctx.userId!)),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => deleteDocument(input.id, ctx.userId!)),
  }),

  // Backlogs routes
  backlogs: router({
    getAll: protectedProcedure
      .query(() => getBacklogs()),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getBacklogById(input.id)),
    
    getByDistrict: protectedProcedure
      .input(z.object({ districtId: z.number() }))
      .query(({ input }) => getBacklogsByDistrict(input.districtId)),
    
    getByDateRange: protectedProcedure
      .input(z.object({ 
        startYear: z.number(), 
        startMonth: z.number(), 
        endYear: z.number(), 
        endMonth: z.number() 
      }))
      .query(({ input }) => getBacklogsByDateRange(input.startYear, input.startMonth, input.endYear, input.endMonth)),
    
    create: protectedProcedure
      .input(createBacklogInputSchema)
      .mutation(({ input, ctx }) => createBacklog(input, ctx.userId!)),
    
    update: protectedProcedure
      .input(z.object({ id: z.number(), familyCount: z.number() }))
      .mutation(({ input, ctx }) => updateBacklog(input.id, input.familyCount, ctx.userId!)),
  }),

  // Analytics routes
  analytics: router({
    getDashboardStats: protectedProcedure
      .query(() => getDashboardStats()),
    
    getHousingByDistrict: protectedProcedure
      .query(() => getHousingByDistrict()),
    
    getHousingByVillage: protectedProcedure
      .input(z.object({ districtId: z.number().optional() }))
      .query(({ input }) => getHousingByVillage(input.districtId)),
    
    getVerificationStats: protectedProcedure
      .query(() => getVerificationStats()),
    
    getEligibilityDistribution: protectedProcedure
      .query(() => getEligibilityDistribution()),
    
    getMonthlyTrends: protectedProcedure
      .input(z.object({ year: z.number() }))
      .query(({ input }) => getMonthlyTrends(input.year)),
  }),

  // Reports routes
  reports: router({
    generate: protectedProcedure
      .input(exportReportInputSchema)
      .mutation(({ input, ctx }) => generateReport(input, ctx.userId!)),
    
    generateHousing: protectedProcedure
      .input(z.object({ 
        districtId: z.number().optional(), 
        villageId: z.number().optional() 
      }))
      .mutation(({ input }) => generateHousingReport(input.districtId, input.villageId)),
    
    generateBacklog: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number().optional() }))
      .mutation(({ input }) => generateBacklogReport(input.year, input.month)),
    
    generateCompliance: protectedProcedure
      .mutation(() => generateComplianceReport()),
    
    scheduleAutomated: protectedProcedure
      .mutation(({ ctx }) => scheduleAutomatedReports(ctx.userId!)),
  }),

  // Audit routes
  audit: router({
    getLogs: protectedProcedure
      .input(z.object({ 
        userId: z.number().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional()
      }))
      .query(({ input }) => getAuditLogs(input.userId, input.dateFrom, input.dateTo)),
    
    getLogsByResource: protectedProcedure
      .input(z.object({ resourceType: z.string(), resourceId: z.number() }))
      .query(({ input }) => getAuditLogsByResource(input.resourceType, input.resourceId)),
    
    getSecurityReport: protectedProcedure
      .query(() => getSecurityReport()),
  }),

  // GIS routes
  gis: router({
    getHousingMapData: protectedProcedure
      .input(z.object({ 
        districtId: z.number().optional(),
        villageId: z.number().optional(),
        housingStatus: z.enum(['RTLH', 'RLH']).optional()
      }))
      .query(({ input }) => getHousingMapData(input.districtId, input.villageId, input.housingStatus)),
    
    getDistrictBoundaries: protectedProcedure
      .query(() => getDistrictBoundaries()),
    
    getVillageBoundaries: protectedProcedure
      .input(z.object({ districtId: z.number().optional() }))
      .query(({ input }) => getVillageBoundaries(input.districtId)),
    
    updateCoordinates: protectedProcedure
      .input(z.object({ 
        housingRecordId: z.number(), 
        latitude: z.number(), 
        longitude: z.number() 
      }))
      .mutation(({ input, ctx }) => updateHousingCoordinates(input.housingRecordId, input.latitude, input.longitude, ctx.userId!)),
    
    getHeatmapData: protectedProcedure
      .query(() => getHeatmapData()),
  }),
});

export type AppRouter = typeof appRouter;

// Create context from request
function createContext(req: any, res: any) {
  // In a real implementation, extract JWT token from Authorization header
  // and decode it to get userId, userRole, etc.
  const authHeader = req.headers.authorization;
  const ipAddress = req.ip || req.connection.remoteAddress;
  
  // Placeholder implementation - replace with actual JWT verification
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // TODO: Verify JWT token and extract user info
    return {
      userId: 1, // Extracted from JWT
      userRole: 'PUPR_ADMIN', // Extracted from JWT
      ipAddress: ipAddress
    };
  }
  
  return {
    ipAddress: ipAddress
  };
}

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors({
        origin: process.env['CLIENT_URL'] || 'http://localhost:3000',
        credentials: true
      })(req, res, next);
    },
    router: appRouter,
    createContext: ({ req, res }) => createContext(req, res),
  });
  
  server.listen(port);
  console.log(`e-LACAK Pringsewu TRPC server listening at port: ${port}`);
  console.log(`Environment: ${process.env['NODE_ENV'] || 'development'}`);
}

start().catch(console.error);