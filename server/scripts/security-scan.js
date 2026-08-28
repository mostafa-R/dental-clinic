#!/usr/bin/env node

/**
 * Security scanning script for Dental Clinic Server
 * Checks for common security issues and misconfigurations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

class SecurityScanner {
  constructor() {
    this.results = {
      passed: [],
      warnings: [],
      failures: [],
      score: 0,
      totalChecks: 0
    };
  }

  /**
   * Run all security checks
   */
  async run() {
    console.log('🔒 Starting security scan...\n');
    
    await this.checkEnvironmentVariables();
    await this.checkDependencies();
    await this.checkFilePermissions();
    await this.checkConfigurationFiles();
    await this.checkSecurityHeaders();
    await this.checkCodeSecurity();
    
    this.calculateScore();
    this.printReport();
    
    return this.results;
  }

  /**
   * Check environment variables for security issues
   */
  async checkEnvironmentVariables() {
    console.log('📋 Checking environment variables...');
    
    const checks = [
      {
        name: 'NODE_ENV set to production',
        check: () => process.env.NODE_ENV === 'production',
        severity: 'warning',
        message: 'Running in development mode - security features may be relaxed'
      },
      {
        name: 'JWT secrets are configured',
        check: () => {
          const requiredSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'JWT_2FA_SECRET'];
          return requiredSecrets.every(secret => process.env[secret] && process.env[secret] !== 'REPLACE_WITH');
        },
        severity: 'failure',
        message: 'JWT secrets must be properly configured'
      },
      {
        name: 'Database credentials not using defaults',
        check: () => {
          const mongoUri = process.env.MONGO_URI || '';
          return !mongoUri.includes('USERNAME:PASSWORD') && !mongoUri.includes('admin:password');
        },
        severity: 'failure',
        message: 'Database credentials should use proper authentication'
      },
      {
        name: 'CORS origins are restricted',
        check: () => {
          const clientUrl = process.env.CLIENT_URL || '';
          return clientUrl && !clientUrl.includes('*');
        },
        severity: 'warning',
        message: 'CORS origins should be explicitly defined'
      }
    ];
    
    this.runChecks(checks, 'Environment Variables');
  }

  /**
   * Check dependencies for security vulnerabilities
   */
  async checkDependencies() {
    console.log('📦 Checking dependencies...');
    
    try {
      // Check if npm audit is available
      const packageJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
      const hasDevDependencies = !!packageJson.devDependencies;
      
      const checks = [
        {
          name: 'Package lock file exists',
          check: () => fs.existsSync(path.join(PROJECT_ROOT, 'package-lock.json')),
          severity: 'warning',
          message: 'Package lock file ensures consistent dependencies'
        },
        {
          name: 'No known critical vulnerabilities',
          check: async () => {
            try {
              const output = execSync('npm audit --audit-level=critical --json', { cwd: PROJECT_ROOT, encoding: 'utf8' });
              const audit = JSON.parse(output);
              return audit.metadata.vulnerabilities.critical === 0;
            } catch {
              return false;
            }
          },
          severity: 'failure',
          message: 'Critical security vulnerabilities found in dependencies'
        }
      ];
      
      this.runChecks(checks, 'Dependencies');
    } catch (error) {
      this.results.warnings.push({
        category: 'Dependencies',
        check: 'Dependency check',
        message: `Failed to check dependencies: ${error.message}`
      });
    }
  }

  /**
   * Check file permissions
   */
  async checkFilePermissions() {
    console.log('🔐 Checking file permissions...');
    
    const sensitiveFiles = [
      '.env',
      '.env.example',
      'config/',
      'certificates/',
      'keys/'
    ];
    
    const checks = sensitiveFiles.map(filePath => ({
      name: `File permissions for ${filePath}`,
      check: () => {
        const fullPath = path.join(PROJECT_ROOT, filePath);
        if (!fs.existsSync(fullPath)) return true;
        
        try {
          const stats = fs.statSync(fullPath);
          // Check if file is readable by others
          const mode = stats.mode;
          const isWorldReadable = (mode & 0o004) !== 0;
          const isWorldWritable = (mode & 0o002) !== 0;
          
          return !isWorldReadable && !isWorldWritable;
        } catch {
          return true;
        }
      },
      severity: 'failure',
      message: `Sensitive file ${filePath} should have restricted permissions`
    }));
    
    this.runChecks(checks, 'File Permissions');
  }

  /**
   * Check configuration files
   */
  async checkConfigurationFiles() {
    console.log('⚙️  Checking configuration files...');
    
    const checks = [
      {
        name: '.env.example exists',
        check: () => fs.existsSync(path.join(PROJECT_ROOT, '.env.example')),
        severity: 'warning',
        message: '.env.example file should exist for configuration reference'
      },
      {
        name: '.env not committed',
        check: () => {
          try {
            const gitIgnore = fs.readFileSync(path.join(PROJECT_ROOT, '.gitignore'), 'utf8');
            return gitIgnore.includes('.env');
          } catch {
            return false;
          }
        },
        severity: 'failure',
        message: '.env file should be in .gitignore'
      },
      {
        name: 'Docker security configurations',
        check: () => {
          const dockerfile = path.join(PROJECT_ROOT, 'Dockerfile');
          if (!fs.existsSync(dockerfile)) return true;
          
          const content = fs.readFileSync(dockerfile, 'utf8');
          return content.includes('USER appuser') && content.includes('non-root');
        },
        severity: 'warning',
        message: 'Docker should run as non-root user'
      }
    ];
    
    this.runChecks(checks, 'Configuration Files');
  }

  /**
   * Check security headers
   */
  async checkSecurityHeaders() {
    console.log('🛡️  Checking security headers...');
    
    // Read app.js to check for security headers
    const appJsPath = path.join(PROJECT_ROOT, 'app.js');
    if (!fs.existsSync(appJsPath)) {
      this.results.warnings.push({
        category: 'Security Headers',
        check: 'App.js exists',
        message: 'Could not find app.js to check security headers'
      });
      return;
    }
    
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    
    const checks = [
      {
        name: 'Helmet.js is configured',
        check: () => appJsContent.includes('helmet'),
        severity: 'warning',
        message: 'Helmet.js should be configured for security headers'
      },
      {
        name: 'CORS is configured',
        check: () => appJsContent.includes('cors'),
        severity: 'warning',
        message: 'CORS should be properly configured'
      },
      {
        name: 'CSRF protection',
        check: () => appJsContent.includes('csrf'),
        severity: 'warning',
        message: 'CSRF protection should be implemented'
      },
      {
        name: 'Rate limiting',
        check: () => appJsContent.includes('rateLimit') || appJsContent.includes('express-rate-limit'),
        severity: 'warning',
        message: 'Rate limiting should be implemented'
      }
    ];
    
    this.runChecks(checks, 'Security Headers');
  }

  /**
   * Check code security patterns
   */
  async checkCodeSecurity() {
    console.log('💻 Checking code security...');
    
    const securityPatterns = [
      {
        pattern: /eval\(/g,
        filePattern: /\.js$/,
        severity: 'failure',
        message: 'eval() function detected - potential security risk'
      },
      {
        pattern: /child_process\.execSync\([^)]*\$\(/g,
        filePattern: /\.js$/,
        severity: 'failure',
        message: 'Potential command injection vulnerability'
      },
      {
        pattern: /mongoose\.connect\([^)]*\)[^;{]*\)/g,
        filePattern: /\.js$/,
        severity: 'warning',
        message: 'Database connection should have error handling'
      },
      {
        pattern: /console\.log\([^)]*password[^)]*\)/gi,
        filePattern: /\.js$/,
        severity: 'failure',
        message: 'Potential password logging detected'
      }
    ];
    
    // Scan JavaScript files
    const jsFiles = this.findFiles(PROJECT_ROOT, /\.js$/);
    
    for (const file of jsFiles.slice(0, 50)) { // Limit to first 50 files for performance
      const content = fs.readFileSync(file, 'utf8');
      
      for (const pattern of securityPatterns) {
        if (pattern.filePattern.test(file) && pattern.pattern.test(content)) {
          const relativePath = path.relative(PROJECT_ROOT, file);
          this.results[pattern.severity === 'failure' ? 'failures' : 'warnings'].push({
            category: 'Code Security',
            check: `Security pattern in ${relativePath}`,
            message: pattern.message
          });
        }
      }
    }
    
    if (jsFiles.length > 0) {
      this.results.passed.push({
        category: 'Code Security',
        check: 'Basic code scanning completed',
        message: `Scanned ${Math.min(jsFiles.length, 50)} JavaScript files`
      });
    }
  }

  /**
   * Find files recursively
   */
  findFiles(dir, pattern) {
    let results = [];
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and hidden directories
        if (!item.includes('node_modules') && !item.startsWith('.')) {
          results = results.concat(this.findFiles(fullPath, pattern));
        }
      } else if (pattern.test(item)) {
        results.push(fullPath);
      }
    }
    
    return results;
  }

  /**
   * Run a set of checks
   */
  async runChecks(checks, category) {
    for (const check of checks) {
      this.results.totalChecks++;
      
      try {
        const result = await (typeof check.check === 'function' ? check.check() : check.check);
        
        if (result) {
          this.results.passed.push({
            category,
            check: check.name,
            message: check.message || 'Passed'
          });
        } else {
          this.results[check.severity === 'failure' ? 'failures' : 'warnings'].push({
            category,
            check: check.name,
            message: check.message
          });
        }
      } catch (error) {
        this.results.warnings.push({
          category,
          check: check.name,
          message: `Check failed: ${error.message}`
        });
      }
    }
  }

  /**
   * Calculate security score
   */
  calculateScore() {
    const totalChecks = this.results.totalChecks;
    const failures = this.results.failures.length;
    const warnings = this.results.warnings.length;
    
    if (totalChecks === 0) {
      this.results.score = 0;
      return;
    }
    
    // Weight: failures count more than warnings
    const failurePenalty = (failures / totalChecks) * 70;
    const warningPenalty = (warnings / totalChecks) * 30;
    
    this.results.score = Math.max(0, 100 - failurePenalty - warningPenalty);
  }

  /**
   * Print security report
   */
  printReport() {
    console.log('\n📊 Security Scan Report');
    console.log('=' .repeat(50));
    
    console.log(`\n✅ Passed: ${this.results.passed.length}`);
    this.results.passed.slice(0, 5).forEach(item => {
      console.log(`   ✓ ${item.check}`);
    });
    if (this.results.passed.length > 5) {
      console.log(`   ... and ${this.results.passed.length - 5} more`);
    }
    
    console.log(`\n⚠️  Warnings: ${this.results.warnings.length}`);
    this.results.warnings.forEach(item => {
      console.log(`   ⚠ ${item.check}: ${item.message}`);
    });
    
    console.log(`\n❌ Failures: ${this.results.failures.length}`);
    this.results.failures.forEach(item => {
      console.log(`   ✗ ${item.check}: ${item.message}`);
    });
    
    console.log('\n' + '=' .repeat(50));
    console.log(`\n🏆 Security Score: ${this.results.score.toFixed(1)}/100`);
    
    if (this.results.score >= 80) {
      console.log('🎉 Excellent security posture!');
    } else if (this.results.score >= 60) {
      console.log('👍 Good security posture, but room for improvement.');
    } else if (this.results.score >= 40) {
      console.log('⚠️  Moderate security concerns. Review failures and warnings.');
    } else {
      console.log('🔴 Critical security issues detected. Immediate action required.');
    }
    
    console.log('\n💡 Recommendations:');
    if (this.results.failures.length > 0) {
      console.log('   1. Address all failure items first');
    }
    if (this.results.warnings.length > 0) {
      console.log('   2. Review and address warning items');
    }
    if (this.results.score < 80) {
      console.log('   3. Consider implementing additional security measures:');
      console.log('      - Regular dependency updates');
      console.log('      - Security headers review');
      console.log('      - Penetration testing');
    }
  }
}

// Run the scanner if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const scanner = new SecurityScanner();
  
  scanner.run().then(results => {
    if (results.failures.length > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }).catch(error => {
    console.error('❌ Security scan failed:', error);
    process.exit(1);
  });
}

export default SecurityScanner;