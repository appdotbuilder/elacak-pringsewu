import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginInput, type CreateUserInput } from '../schema';
import { loginUser, createUser, getCurrentUser, verifyToken } from '../handlers/auth';
import { eq } from 'drizzle-orm';
import { pbkdf2Sync } from 'crypto';

// Test inputs
const testUserInput: CreateUserInput = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'password123',
  role: 'PUPR_ADMIN',
  district_id: null,
  village_id: null
};

const testLoginInput: LoginInput = {
  username: 'testuser',
  password: 'password123'
};

const testDistrictOperatorInput: CreateUserInput = {
  username: 'district_op',
  email: 'district@example.com',
  password: 'password123',
  role: 'DISTRICT_OPERATOR',
  district_id: 1,
  village_id: null
};

// Helper function to verify password hash
const verifyPasswordHash = (password: string, hashedPassword: string): boolean => {
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  return hash === verifyHash;
};

describe('Auth Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createUser', () => {
    it('should create a user with hashed password', async () => {
      const result = await createUser(testUserInput);

      // Basic field validation
      expect(result.username).toEqual('testuser');
      expect(result.email).toEqual('test@example.com');
      expect(result.role).toEqual('PUPR_ADMIN');
      expect(result.district_id).toBeNull();
      expect(result.village_id).toBeNull();
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);

      // Password should be hashed, not plain text
      expect(result.password_hash).not.toEqual('password123');
      expect(result.password_hash.length).toBeGreaterThan(20);
      expect(result.password_hash).toContain(':'); // Salt:hash format
    });

    it('should save user to database with hashed password', async () => {
      const result = await createUser(testUserInput);

      // Query database directly
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].username).toEqual('testuser');
      expect(users[0].email).toEqual('test@example.com');
      expect(users[0].role).toEqual('PUPR_ADMIN');
      expect(users[0].is_active).toBe(true);

      // Verify password is properly hashed
      const isValidHash = verifyPasswordHash('password123', users[0].password_hash);
      expect(isValidHash).toBe(true);
    });

    it('should create user with district and village ids', async () => {
      const result = await createUser(testDistrictOperatorInput);

      expect(result.username).toEqual('district_op');
      expect(result.role).toEqual('DISTRICT_OPERATOR');
      expect(result.district_id).toEqual(1);
      expect(result.village_id).toBeNull();
    });

    it('should handle duplicate username error', async () => {
      await createUser(testUserInput);

      // Try to create another user with same username
      await expect(createUser(testUserInput)).rejects.toThrow();
    });

    it('should handle duplicate email error', async () => {
      await createUser(testUserInput);

      const duplicateEmailInput = {
        ...testUserInput,
        username: 'different_username'
      };

      // Try to create another user with same email
      await expect(createUser(duplicateEmailInput)).rejects.toThrow();
    });
  });

  describe('loginUser', () => {
    beforeEach(async () => {
      // Create a test user for login tests
      await createUser(testUserInput);
    });

    it('should login user with valid credentials', async () => {
      const result = await loginUser(testLoginInput);

      // Verify user data
      expect(result.user.username).toEqual('testuser');
      expect(result.user.email).toEqual('test@example.com');
      expect(result.user.role).toEqual('PUPR_ADMIN');
      expect(result.user.is_active).toBe(true);

      // Verify token is provided
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(10);
      expect(result.token.split('.')).toHaveLength(3); // JWT format
    });

    it('should generate valid JWT token', async () => {
      const result = await loginUser(testLoginInput);

      // Verify token can be decoded
      const decoded = verifyToken(result.token);
      expect(decoded.userId).toEqual(result.user.id);
      expect(decoded.username).toEqual('testuser');
      expect(decoded.role).toEqual('PUPR_ADMIN');
      expect(decoded.district_id).toBeNull();
      expect(decoded.village_id).toBeNull();
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should reject invalid username', async () => {
      const invalidInput = {
        username: 'nonexistent',
        password: 'password123'
      };

      await expect(loginUser(invalidInput)).rejects.toThrow(/invalid username or password/i);
    });

    it('should reject invalid password', async () => {
      const invalidInput = {
        username: 'testuser',
        password: 'wrongpassword'
      };

      await expect(loginUser(invalidInput)).rejects.toThrow(/invalid username or password/i);
    });

    it('should reject inactive user', async () => {
      // Deactivate the user
      await db.update(usersTable)
        .set({ is_active: false })
        .where(eq(usersTable.username, 'testuser'))
        .execute();

      await expect(loginUser(testLoginInput)).rejects.toThrow(/user account is inactive/i);
    });

    it('should login district operator with proper token data', async () => {
      await createUser(testDistrictOperatorInput);

      const loginInput = {
        username: 'district_op',
        password: 'password123'
      };

      const result = await loginUser(loginInput);

      expect(result.user.role).toEqual('DISTRICT_OPERATOR');
      expect(result.user.district_id).toEqual(1);

      // Verify token contains district info
      const decoded = verifyToken(result.token);
      expect(decoded.role).toEqual('DISTRICT_OPERATOR');
      expect(decoded.district_id).toEqual(1);
    });
  });

  describe('getCurrentUser', () => {
    it('should return user by id', async () => {
      const createdUser = await createUser(testUserInput);
      const result = await getCurrentUser(createdUser.id);

      expect(result).toBeDefined();
      expect(result!.id).toEqual(createdUser.id);
      expect(result!.username).toEqual('testuser');
      expect(result!.email).toEqual('test@example.com');
      expect(result!.role).toEqual('PUPR_ADMIN');
      expect(result!.is_active).toBe(true);
    });

    it('should return null for non-existent user', async () => {
      const result = await getCurrentUser(999);
      expect(result).toBeNull();
    });

    it('should return inactive user', async () => {
      const createdUser = await createUser(testUserInput);
      
      // Deactivate user
      await db.update(usersTable)
        .set({ is_active: false })
        .where(eq(usersTable.id, createdUser.id))
        .execute();

      const result = await getCurrentUser(createdUser.id);
      expect(result).toBeDefined();
      expect(result!.is_active).toBe(false);
    });
  });

  describe('Password Security', () => {
    it('should use different salt for each password', async () => {
      const user1 = await createUser({
        ...testUserInput,
        username: 'user1',
        email: 'user1@example.com'
      });

      const user2 = await createUser({
        ...testUserInput,
        username: 'user2',
        email: 'user2@example.com'
      });

      // Even with same password, hashes should be different due to salt
      expect(user1.password_hash).not.toEqual(user2.password_hash);
    });

    it('should verify password correctly with PBKDF2', async () => {
      const user = await createUser(testUserInput);

      // Correct password should verify
      const isValid = verifyPasswordHash('password123', user.password_hash);
      expect(isValid).toBe(true);

      // Wrong password should not verify
      const isInvalid = verifyPasswordHash('wrongpassword', user.password_hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Token Security', () => {
    beforeEach(async () => {
      // Create a test user for token tests
      await createUser(testUserInput);
    });

    it('should reject tampered tokens', async () => {
      const loginResult = await loginUser(testLoginInput);
      
      // Tamper with token
      const tamperedToken = loginResult.token.slice(0, -5) + 'XXXXX';
      
      expect(() => verifyToken(tamperedToken)).toThrow(/invalid token/i);
    });

    it('should include expiration in token', async () => {
      const result = await loginUser(testLoginInput);
      const decoded = verifyToken(result.token);
      
      expect(decoded.exp).toBeDefined();
      expect(typeof decoded.exp).toBe('number');
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });
});