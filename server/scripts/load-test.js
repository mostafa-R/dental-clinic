#!/usr/bin/env node

/**
 * Load testing script for Dental Clinic Server
 * Tests API performance under load without requiring external tools
 */

import http from 'http';
import https from 'https';
import { performance } from 'perf_hooks';

const BASE_URL = process.env.LOAD_TEST_URL || 'http://localhost:7000';
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS) || 10;
const REQUESTS_PER_USER = parseInt(process.env.REQUESTS_PER_USER) || 100;
const TEST_DURATION = parseInt(process.env.TEST_DURATION) || 30; // seconds

class LoadTest {
  constructor() {
    this.results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      statusCodes: {},
      errors: [],
      startTime: 0,
      endTime: 0
    };
    
    this.endpoints = [
      { path: '/api/health', method: 'GET', weight: 1 },
      { path: '/api/auth/login', method: 'POST', weight: 2, data: { email: 'test@example.com', password: 'password123' } },
      { path: '/api/patients', method: 'GET', weight: 1 },
      { path: '/api/appointments', method: 'GET', weight: 1 },
      { path: '/api/inventory', method: 'GET', weight: 1 }
    ];
    
    // Calculate total weight for random selection
    this.totalWeight = this.endpoints.reduce((sum, endpoint) => sum + endpoint.weight, 0);
  }

  /**
   * Select a random endpoint based on weight
   */
  selectRandomEndpoint() {
    let random = Math.random() * this.totalWeight;
    for (const endpoint of this.endpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        return endpoint;
      }
    }
    return this.endpoints[0];
  }

  /**
   * Make a single HTTP request
   */
  makeRequest(endpoint) {
    return new Promise((resolve) => {
      const url = new URL(endpoint.path, BASE_URL);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'LoadTest/1.0'
        }
      };

      const startTime = performance.now();
      const protocol = url.protocol === 'https:' ? https : http;
      
      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const endTime = performance.now();
          const responseTime = endTime - startTime;
          
          resolve({
            statusCode: res.statusCode,
            responseTime,
            success: res.statusCode >= 200 && res.statusCode < 300,
            endpoint: endpoint.path,
            method: endpoint.method
          });
        });
      });

      req.on('error', (error) => {
        const endTime = performance.now();
        const responseTime = endTime - startTime;
        
        resolve({
          statusCode: 0,
          responseTime,
          success: false,
          error: error.message,
          endpoint: endpoint.path,
          method: endpoint.method
        });
      });

      // Set timeout
      req.setTimeout(10000, () => {
        req.destroy();
        resolve({
          statusCode: 0,
          responseTime: 10000,
          success: false,
          error: 'Timeout',
          endpoint: endpoint.path,
          method: endpoint.method
        });
      });

      // Add request body for POST requests
      if (endpoint.method === 'POST' && endpoint.data) {
        req.write(JSON.stringify(endpoint.data));
      }

      req.end();
    });
  }

  /**
   * Simulate a single user making requests
   */
  async simulateUser(userId) {
    const userResults = {
      userId,
      requests: 0,
      successful: 0,
      failed: 0,
      totalResponseTime: 0
    };

    for (let i = 0; i < REQUESTS_PER_USER; i++) {
      const endpoint = this.selectRandomEndpoint();
      const result = await this.makeRequest(endpoint);
      
      userResults.requests++;
      userResults.totalResponseTime += result.responseTime;
      
      if (result.success) {
        userResults.successful++;
      } else {
        userResults.failed++;
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    }

    return userResults;
  }

  /**
   * Run the load test
   */
  async run() {
    console.log(`🚀 Starting load test...`);
    console.log(`📊 Configuration:`);
    console.log(`   Base URL: ${BASE_URL}`);
    console.log(`   Concurrent Users: ${CONCURRENT_USERS}`);
    console.log(`   Requests per User: ${REQUESTS_PER_USER}`);
    console.log(`   Expected Duration: ~${TEST_DURATION} seconds`);
    console.log(`   Total Requests: ${CONCURRENT_USERS * REQUESTS_PER_USER}`);
    console.log(``);

    this.results.startTime = performance.now();
    
    // Create user promises
    const userPromises = [];
    for (let i = 0; i < CONCURRENT_USERS; i++) {
      userPromises.push(this.simulateUser(i + 1));
    }

    // Wait for all users to complete
    const userResults = await Promise.all(userPromises);
    
    this.results.endTime = performance.now();
    const totalDuration = (this.results.endTime - this.results.startTime) / 1000;

    // Aggregate results
    for (const userResult of userResults) {
      this.results.totalRequests += userResult.requests;
      this.results.successfulRequests += userResult.successful;
      this.results.failedRequests += userResult.failed;
      this.results.totalResponseTime += userResult.totalResponseTime;
      
      // Update min/max response times
      if (userResult.totalResponseTime / userResult.requests < this.results.minResponseTime) {
        this.results.minResponseTime = userResult.totalResponseTime / userResult.requests;
      }
      if (userResult.totalResponseTime / userResult.requests > this.results.maxResponseTime) {
        this.results.maxResponseTime = userResult.totalResponseTime / userResult.requests;
      }
    }

    // Calculate averages
    const avgResponseTime = this.results.totalRequests > 0 
      ? this.results.totalResponseTime / this.results.totalRequests 
      : 0;
    
    const requestsPerSecond = this.results.totalRequests / totalDuration;
    const successRate = this.results.totalRequests > 0 
      ? (this.results.successfulRequests / this.results.totalRequests) * 100 
      : 0;

    // Print results
    console.log(`📈 Load Test Results:`);
    console.log(`⏱️  Duration: ${totalDuration.toFixed(2)} seconds`);
    console.log(`📊 Total Requests: ${this.results.totalRequests}`);
    console.log(`✅ Successful: ${this.results.successfulRequests}`);
    console.log(`❌ Failed: ${this.results.failedRequests}`);
    console.log(`🎯 Success Rate: ${successRate.toFixed(2)}%`);
    console.log(`🚀 Requests/Second: ${requestsPerSecond.toFixed(2)}`);
    console.log(`⏱️  Avg Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`🐢 Min Response Time: ${this.results.minResponseTime.toFixed(2)}ms`);
    console.log(`🚀 Max Response Time: ${this.results.maxResponseTime.toFixed(2)}ms`);
    console.log(``);

    // Performance analysis
    console.log(`📋 Performance Analysis:`);
    
    if (avgResponseTime < 100) {
      console.log(`   ✅ Excellent performance! Avg response time < 100ms`);
    } else if (avgResponseTime < 500) {
      console.log(`   👍 Good performance. Avg response time < 500ms`);
    } else if (avgResponseTime < 1000) {
      console.log(`   ⚠️  Acceptable performance. Avg response time < 1s`);
    } else {
      console.log(`   ❌ Poor performance. Avg response time > 1s`);
    }

    if (successRate > 95) {
      console.log(`   ✅ Excellent reliability! Success rate > 95%`);
    } else if (successRate > 90) {
      console.log(`   👍 Good reliability. Success rate > 90%`);
    } else if (successRate > 80) {
      console.log(`   ⚠️  Acceptable reliability. Success rate > 80%`);
    } else {
      console.log(`   ❌ Poor reliability. Success rate < 80%`);
    }

    if (requestsPerSecond > 100) {
      console.log(`   ✅ High throughput! > 100 req/sec`);
    } else if (requestsPerSecond > 50) {
      console.log(`   👍 Good throughput. > 50 req/sec`);
    } else if (requestsPerSecond > 20) {
      console.log(`   ⚠️  Moderate throughput. > 20 req/sec`);
    } else {
      console.log(`   ❌ Low throughput. < 20 req/sec`);
    }

    // Recommendations
    console.log(``);
    console.log(`💡 Recommendations:`);
    
    if (avgResponseTime > 500) {
      console.log(`   • Consider implementing caching for frequently accessed endpoints`);
      console.log(`   • Optimize database queries and add indexes`);
      console.log(`   • Review endpoint logic for performance bottlenecks`);
    }
    
    if (successRate < 90) {
      console.log(`   • Investigate failed requests to identify root causes`);
      console.log(`   • Check server error logs for patterns`);
      console.log(`   • Consider implementing retry logic for transient failures`);
    }
    
    if (this.results.maxResponseTime > 5000) {
      console.log(`   • Some requests are taking > 5s - investigate slow endpoints`);
      console.log(`   • Consider implementing request timeouts`);
      console.log(`   • Add performance monitoring for individual endpoints`);
    }

    return {
      summary: {
        duration: totalDuration,
        totalRequests: this.results.totalRequests,
        successfulRequests: this.results.successfulRequests,
        failedRequests: this.results.failedRequests,
        successRate,
        requestsPerSecond,
        avgResponseTime,
        minResponseTime: this.results.minResponseTime,
        maxResponseTime: this.results.maxResponseTime
      },
      timestamp: new Date().toISOString()
    };
  }
}

// Run the test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new LoadTest();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n🛑 Load test interrupted by user`);
    process.exit(0);
  });

  test.run().then(results => {
    console.log(`\n🎉 Load test completed!`);
    process.exit(0);
  }).catch(error => {
    console.error(`❌ Load test failed:`, error);
    process.exit(1);
  });
}

export default LoadTest;