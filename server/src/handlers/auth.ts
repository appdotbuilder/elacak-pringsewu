import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginInput, type User, type CreateUserInput } from '../schema';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes, pbkdf2Sync } from 'crypto';

const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';
const SALT_ROUNDS = 10000;

// Simple JWT-like token generation using crypto
const generateToken = (payload: any): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHash('sha256')
    .update(`${header}.${body}.${JWT_SECRET}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
};

// Simple JWT-like token verification
export const verifyToken = (token: string): any => {
  const [header, payload, signature] = token.split('.');
  const expectedSignature = createHash('sha256')
    .update(`${header}.${payload}.${JWT_SECRET}`)
    .digest('base64url');
  
  if (signature !== expectedSignature) {
    throw new Error('Invalid token');
  }
  
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
};

// Hash password using PBKDF2
const hashPassword = (password: string): string => {
  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(password, salt, SALT_ROUNDS, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
};

// Verify password using PBKDF2
const verifyPassword = (password: string, hashedPassword: string): boolean => {
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = pbkdf2Sync(password, salt, SALT_ROUNDS, 64, 'sha256').toString('hex');
  return hash === verifyHash;
};

export const loginUser = async (input: LoginInput): Promise<{ user: User; token: string }> => {
  try {
    // Find user by username
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.username, input.username))
      .execute();

    if (users.length === 0) {
      throw new Error('Invalid username or password');
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      throw new Error('User account is inactive');
    }

    // Verify password
    const isPasswordValid = verifyPassword(input.password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid username or password');
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id, 
      username: user.username, 
      role: user.role,
      district_id: user.district_id,
      village_id: user.village_id,
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    });

    return {
      user: {
        ...user,
        // Convert numeric fields if any exist in the future
      },
      token
    };
  } catch (error) {
    console.error('User login failed:', error);
    throw error;
  }
};

export const createUser = async (input: CreateUserInput): Promise<User> => {
  try {
    // Hash password
    const password_hash = hashPassword(input.password);

    // Insert user record
    const result = await db.insert(usersTable)
      .values({
        username: input.username,
        email: input.email,
        password_hash,
        role: input.role,
        district_id: input.district_id || null,
        village_id: input.village_id || null,
        is_active: true
      })
      .returning()
      .execute();

    const user = result[0];
    return {
      ...user,
      // Convert numeric fields if any exist in the future
    };
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
};

export const getCurrentUser = async (userId: number): Promise<User | null> => {
  try {
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (users.length === 0) {
      return null;
    }

    const user = users[0];
    return {
      ...user,
      // Convert numeric fields if any exist in the future
    };
  } catch (error) {
    console.error('Get current user failed:', error);
    throw error;
  }
};