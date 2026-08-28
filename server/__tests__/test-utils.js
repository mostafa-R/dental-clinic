/**
 * Test utilities for Dental Clinic Server tests
 * Provides common helper functions and test data
 */

import { vi } from 'vitest';
import mongoose from 'mongoose';

/**
 * Create a mock Express request object
 */
export function createMockRequest(overrides = {}) {
  return {
    method: 'GET',
    url: '/api/test',
    originalUrl: '/api/test',
    path: '/test',
    query: {},
    params: {},
    body: {},
    headers: {
      'content-type': 'application/json',
      'user-agent': 'TestAgent/1.0'
    },
    cookies: {},
    ip: '127.0.0.1',
    socket: {
      remoteAddress: '127.0.0.1'
    },
    get: function(header) {
      return this.headers[header.toLowerCase()];
    },
    ...overrides
  };
}

/**
 * Create a mock Express response object
 */
export function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    locals: {},
    
    status: vi.fn().mockImplementation(function(code) {
      this.statusCode = code;
      return this;
    }),
    
    json: vi.fn().mockImplementation(function(data) {
      this.body = data;
      return this;
    }),
    
    send: vi.fn().mockImplementation(function(data) {
      this.body = data;
      return this;
    }),
    
    end: vi.fn().mockImplementation(function() {
      return this;
    }),
    
    setHeader: vi.fn().mockImplementation(function(name, value) {
      this.headers[name] = value;
      return this;
    }),
    
    getHeader: vi.fn().mockImplementation(function(name) {
      return this.headers[name];
    })
  };
  
  return res;
}

/**
 * Create a mock Express next function
 */
export function createMockNext() {
  return vi.fn();
}

/**
 * Create mock user object for testing
 */
export function createMockUser(overrides = {}) {
  const userId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const branchId = new mongoose.Types.ObjectId();
  const roleId = new mongoose.Types.ObjectId();
  
  return {
    _id: userId,
    name: 'Test User',
    email: 'test@example.com',
    phone: '+1234567890',
    roleId: roleId,
    tenant: {
      _id: tenantId,
      name: 'Test Clinic',
      plan: 'professional',
      planModules: ['patients', 'appointments', 'billing'],
      planId: new mongoose.Types.ObjectId(),
      status: 'active',
      isActive: true,
      subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    },
    branch: {
      _id: branchId,
      name: 'Main Branch',
      address: '123 Test Street',
      phone: '+1234567890',
      isActive: true
    },
    isDoctor: false,
    isActive: true,
    commissionRate: 0,
    lastLogin: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    toObject: function() {
      return { ...this };
    },
    ...overrides
  };
}

/**
 * Create mock tenant object for testing
 */
export function createMockTenant(overrides = {}) {
  const tenantId = new mongoose.Types.ObjectId();
  
  return {
    _id: tenantId,
    name: 'Test Dental Clinic',
    slug: 'test-dental-clinic',
    email: 'clinic@example.com',
    phone: '+1234567890',
    plan: 'professional',
    planId: new mongoose.Types.ObjectId(),
    planModules: ['patients', 'appointments', 'billing', 'inventory'],
    status: 'active',
    trialEndsAt: null,
    subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    address: '123 Test Street',
    city: 'Test City',
    country: 'Test Country',
    settings: {
      maxBranches: 3,
      maxDoctors: 5,
      maxPatients: 1000,
      storageLimit: 5120
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

/**
 * Create mock patient object for testing
 */
export function createMockPatient(overrides = {}) {
  const patientId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const branchId = new mongoose.Types.ObjectId();
  
  return {
    _id: patientId,
    patientId: 'PT-00001',
    tenant: tenantId,
    branch: branchId,
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    phone: '+12345678901',
    email: 'john.doe@example.com',
    dateOfBirth: new Date('1980-01-01'),
    gender: 'male',
    address: '456 Patient Street',
    medicalHistory: {
      chronicConditions: [],
      allergies: [],
      notes: ''
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

/**
 * Create mock appointment object for testing
 */
export function createMockAppointment(overrides = {}) {
  const appointmentId = new mongoose.Types.ObjectId();
  const patientId = new mongoose.Types.ObjectId();
  const doctorId = new mongoose.Types.ObjectId();
  const branchId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  
  return {
    _id: appointmentId,
    tenant: tenantId,
    patient: patientId,
    doctor: doctorId,
    branch: branchId,
    chair: 'Chair 1',
    start: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    end: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000), // +30 minutes
    status: 'scheduled',
    reason: 'Regular checkup',
    notes: '',
    durationMin: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

/**
 * Reset all database collections for testing
 */
export async function resetDatabase() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database not connected');
  }
  
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    try {
      await collection.deleteMany({});
    } catch (error) {
      // Collection might not exist yet
      console.warn(`Could not reset collection ${key}:`, error.message);
    }
  }
}

/**
 * Seed test data into database
 */
export async function seedTestData() {
  // Create test tenant
  const Tenant = mongoose.models.Tenant || (await import('../modules/tenants/tenant.model.js')).default;
  const tenant = await Tenant.create(createMockTenant());
  
  // Create test branch
  const Branch = mongoose.models.Branch || (await import('../modules/branches/branch.model.js')).default;
  const branch = await Branch.create({
    ...createMockTenant().branch,
    tenant: tenant._id
  });
  
  // Create test user
  const User = mongoose.models.User || (await import('../modules/users/user.model.js')).default;
  const user = await User.create({
    ...createMockUser(),
    tenant: tenant._id,
    branch: branch._id
  });
  
  return { tenant, branch, user };
}

/**
 * Wait for a specific condition
 */
export function waitFor(condition, timeout = 5000, interval = 100) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkCondition = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Condition not met within ${timeout}ms`));
      } else {
        setTimeout(checkCondition, interval);
      }
    };
    
    checkCondition();
  });
}

/**
 * Generate test JWT token
 */
export function generateTestToken(payload = {}) {
  // In a real implementation, this would use the same JWT secret
  // For testing, we return a mock token
  const basePayload = {
    sub: new mongoose.Types.ObjectId().toString(),
    email: 'test@example.com',
    type: 'access',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payload
  };
  
  return `mock-jwt-token.${Buffer.from(JSON.stringify(basePayload)).toString('base64')}`;
}

/**
 * Mock environment variables for testing
 */
export function mockEnv(variables) {
  const originalEnv = { ...process.env };
  
  beforeAll(() => {
    Object.assign(process.env, variables);
  });
  
  afterAll(() => {
    process.env = originalEnv;
  });
}

export default {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createMockUser,
  createMockTenant,
  createMockPatient,
  createMockAppointment,
  resetDatabase,
  seedTestData,
  waitFor,
  generateTestToken,
  mockEnv
};