import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Dental OS API",
      version: "1.0.0",
      description:
        "Multi-tenant SaaS dental clinic management API.\n\n" +
        "Two authentication realms exist:\n\n" +
        "1. **Clinic (staff) realm** - `/api/v1/*` routes. Authenticated via the " +
        "HTTP-only `access_token` cookie set by `/auth/login`. Authorization is " +
        "enforced per module with `checkPermission(module, action)`.\n\n" +
        "2. **Site (platform) realm** - `/api/v1/site/*` routes. Authenticated via the " +
        "`Authorization: Bearer <jwt>` header OR the HTTP-only `site_access` cookie. " +
        "Role-based access (`super_admin`, `admin`, `support`) and " +
        "2FA enforcement for sensitive operations apply.\n\n" +
        "All successful responses share the envelope `{ success: true, data }`, with " +
        "`meta`/`pagination` where applicable. Errors use `{ success: false, message, details }`.",
    },
    servers: [
      {
        url: "http://localhost:7000",
        description: "Development server",
      },
    ],
    tags: [
      { name: "Health", description: "System health checks" },
      { name: "Auth", description: "Clinic staff authentication" },
      { name: "Users", description: "Clinic staff management" },
      { name: "Roles", description: "Roles and permission matrix" },
      { name: "Branches", description: "Clinic branches" },
      { name: "Patients", description: "Patient records (PHI)" },
      { name: "Wallets", description: "Patient wallets" },
      { name: "Installment Plans", description: "Patient installment plans" },
      { name: "Appointments", description: "Appointments and scheduling" },
      { name: "Billing", description: "Invoices, payments and refunds" },
      { name: "Accounting", description: "Expenses, drawings and commissions" },
      { name: "Inventory", description: "Inventory items and stock" },
      { name: "Treatment Plans", description: "EMR treatment plans" },
      { name: "Prescriptions", description: "EMR prescriptions" },
      { name: "Dental Chart", description: "EMR dental charts" },
      { name: "Clinical Notes", description: "EMR clinical notes" },
      { name: "Attachments", description: "EMR medical file attachments" },
      { name: "Dashboard", description: "Dashboard statistics" },
      { name: "Search", description: "Global search" },
      { name: "Chat", description: "Staff chat" },
      { name: "WhatsApp", description: "WhatsApp messaging integration" },
      { name: "Site Auth", description: "Site admin authentication, recovery and 2FA" },
      { name: "Site Impersonation", description: "Support impersonation of clinic users" },
      { name: "Site Admins", description: "Site admin management" },
      { name: "Site Tenants", description: "Tenant (clinic) management" },
      { name: "Site Branches", description: "Tenant branch management" },
      { name: "Site Users", description: "Tenant user management" },
      { name: "Site Plans", description: "Subscription plans" },
      { name: "Site Platform", description: "Platform settings" },
      { name: "Site Subscriptions", description: "Tenant subscriptions and billing" },
      { name: "Site Feature Flags", description: "Per-tenant module toggles" },
      { name: "Site Quarantine", description: "Tenant quarantine" },
      { name: "Site Error Logs", description: "Error log inspection" },
      { name: "Site Analytics", description: "Platform analytics" },
      { name: "Site Audit Logs", description: "Admin audit trail" },
      { name: "Site Backups", description: "Database backups" },
      { name: "Site Perf", description: "Performance monitoring" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "JWT access token sent in the `Authorization` header. Used by site " +
            "(platform) admins via `Authorization: Bearer <token>`. Impersonation " +
            "tokens issued by `/site/impersonation/start` are also bearer JWTs.",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "access_token",
          description:
            "Clinic staff JWT access token, stored in the HTTP-only `access_token` " +
            "cookie set by `POST /auth/login`. Required for all clinic routes.",
        },
        siteCookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "site_access",
          description:
            "Site admin JWT access token, stored in the HTTP-only `site_access` " +
            "cookie set by `POST /site/auth/login`. Alternative to the Bearer header.",
        },
      },
      parameters: {
        TenantIdHeader: {
          name: "x-tenant-id",
          in: "header",
          required: false,
          description:
            "Tenant (clinic) ObjectId used to scope a request to a specific tenant. " +
            "Required for platform admins operating across multiple tenants.",
          schema: { type: "string" },
        },
        PaginationPage: {
          name: "page",
          in: "query",
          required: false,
          description: "Page number (1-based).",
          schema: { type: "integer", minimum: 1, default: 1 },
        },
        PaginationLimit: {
          name: "limit",
          in: "query",
          required: false,
          description: "Items per page.",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        },
      },
      responses: {
        Unauthorized: {
          description: "Not authenticated - missing or invalid credentials.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [false] },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        Forbidden: {
          description: "Authenticated but lacking the required permission/role.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [false] },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        NotFound: {
          description: "The requested resource does not exist.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [false] },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        ValidationError: {
          description:
            "Request validation failed. The `details` object maps each invalid field " +
            "to an array of error messages.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [false] },
                  message: { type: "string" },
                  details: {
                    type: "object",
                    additionalProperties: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        Conflict: {
          description: "The request conflicts with the current state of the resource.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [false] },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
      schemas: {
        /* ------------------------------------------------------------------ Envelope */
        ApiResponseEnvelope: {
          type: "object",
          description: "Standard success envelope. `data` shape varies per endpoint.",
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object", additionalProperties: true },
            meta: { type: "object", additionalProperties: true },
          },
        },
        ApiError: {
          type: "object",
          properties: {
            success: { type: "boolean", enum: [false] },
            message: { type: "string" },
            details: { type: "object", additionalProperties: true },
          },
        },
        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 50 },
            total: { type: "integer", example: 120 },
            pages: { type: "integer", example: 3 },
          },
        },
        ObjectId: {
          type: "string",
          pattern: "^[0-9a-fA-F]{24}$",
          example: "60f7b1c2d3e4f5a6b7c8d9e0",
        },
        DateTime: { type: "string", format: "date-time" },

        /* ------------------------------------------------------------------ Auth & users */
        User: {
          type: "object",
          description: "Clinic staff member.",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            name: { type: "string", maxLength: 100 },
            email: { type: "string", format: "email" },
            phone: { type: "string", maxLength: 30 },
            roleId: {
              oneOf: [
                { $ref: "#/components/schemas/ObjectId" },
                { $ref: "#/components/schemas/Role" },
              ],
            },
            branch: {
              oneOf: [
                { $ref: "#/components/schemas/ObjectId" },
                { $ref: "#/components/schemas/Branch" },
              ],
              nullable: true,
            },
            isDoctor: { type: "boolean", default: false },
            isActive: { type: "boolean", default: true },
            commissionRate: { type: "number", minimum: 0, maximum: 100, default: 0 },
            lastLogin: { type: "string", format: "date-time", nullable: true },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        PermissionEntry: {
          type: "object",
          properties: {
            module: {
              type: "string",
              enum: [
                "dashboard", "patients", "appointments", "billing", "accounting",
                "inventory", "emr", "prescriptions", "users", "branches",
                "settings", "roles", "chat",
              ],
            },
            actions: {
              type: "array",
              items: { type: "string", enum: ["create", "read", "update", "delete"] },
            },
          },
        },
        Role: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            name: { type: "string", maxLength: 60 },
            description: { type: "string", maxLength: 300 },
            key: { type: "string" },
            isSystemAdmin: { type: "boolean", default: false },
            isBuiltIn: { type: "boolean", default: false },
            isActive: { type: "boolean", default: true },
            permissions: { type: "array", items: { $ref: "#/components/schemas/PermissionEntry" } },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        Branch: {
          type: "object",
          description: "Clinic branch.",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            name: { type: "string", maxLength: 100 },
            address: { type: "string", maxLength: 500 },
            phone: { type: "string", maxLength: 30 },
            isActive: { type: "boolean", default: true },
            slotDuration: { type: "integer", minimum: 5, maximum: 120, default: 30 },
            bufferTime: { type: "integer", minimum: 0, maximum: 60, default: 0 },
            breakStart: { type: "string", example: "13:00", nullable: true },
            breakEnd: { type: "string", example: "14:00", nullable: true },
            workingHours: {
              type: "object",
              additionalProperties: {
                type: "object",
                properties: {
                  open: { type: "string", example: "09:00", nullable: true },
                  close: { type: "string", example: "17:00", nullable: true },
                  closed: { type: "boolean", default: false },
                },
              },
            },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },

        /* ------------------------------------------------------------------ Patients */
        Patient: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            patientId: { type: "string", example: "PT-00001" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            firstName: { type: "string", maxLength: 60 },
            lastName: { type: "string", maxLength: 60 },
            fullName: { type: "string" },
            phone: { type: "string", maxLength: 30 },
            email: { type: "string", format: "email" },
            dateOfBirth: { type: "string", format: "date-time", nullable: true },
            gender: { type: "string", enum: ["male", "female", "other", "unknown"] },
            address: { type: "string", maxLength: 500 },
            medicalHistory: { $ref: "#/components/schemas/MedicalHistory" },
            isActive: { type: "boolean", default: true },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        MedicalHistory: {
          type: "object",
          properties: {
            chronicConditions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", maxLength: 120 },
                  notes: { type: "string", maxLength: 500 },
                },
              },
            },
            allergies: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", maxLength: 120 },
                  notes: { type: "string", maxLength: 500 },
                },
              },
            },
            notes: { type: "string", maxLength: 2000 },
          },
        },
        Wallet: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            patient: { $ref: "#/components/schemas/ObjectId" },
            balance: { type: "number", minimum: 0 },
            transactions: {
              type: "array",
              items: { $ref: "#/components/schemas/WalletTransaction" },
            },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        WalletTransaction: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            type: { type: "string", enum: ["credit", "debit"] },
            amount: { type: "number", minimum: 0.01 },
            balanceBefore: { type: "number" },
            balanceAfter: { type: "number" },
            reference: { type: "string", maxLength: 100 },
            description: { type: "string", maxLength: 300 },
            invoice: { $ref: "#/components/schemas/ObjectId" },
            installment: { $ref: "#/components/schemas/ObjectId" },
            createdBy: { $ref: "#/components/schemas/ObjectId" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        InstallmentPlan: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            patient: { $ref: "#/components/schemas/ObjectId" },
            invoice: { $ref: "#/components/schemas/ObjectId" },
            title: { type: "string", maxLength: 200 },
            totalAmount: { type: "number", minimum: 0.01 },
            paidAmount: { type: "number", minimum: 0 },
            installments: { type: "array", items: { $ref: "#/components/schemas/Installment" } },
            frequency: {
              type: "string",
              enum: ["weekly", "biweekly", "monthly", "custom"],
              default: "monthly",
            },
            status: { type: "string", enum: ["active", "completed", "defaulted"] },
            notes: { type: "string", maxLength: 1000 },
            balance: { type: "number" },
            progress: { type: "number" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        Installment: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            number: { type: "integer" },
            dueDate: { $ref: "#/components/schemas/DateTime" },
            amount: { type: "number", minimum: 0.01 },
            paidAmount: { type: "number", minimum: 0 },
            paidDate: { type: "string", format: "date-time", nullable: true },
            status: { type: "string", enum: ["pending", "paid", "overdue"] },
            paymentMethod: { type: "string", nullable: true },
            paymentRef: { type: "string" },
            notes: { type: "string", maxLength: 300 },
          },
        },

        /* ------------------------------------------------------------------ Appointments */
        Appointment: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            patient: {
              oneOf: [
                { $ref: "#/components/schemas/ObjectId" },
                {
                  type: "object",
                  properties: {
                    _id: { $ref: "#/components/schemas/ObjectId" },
                    patientId: { type: "string" },
                    firstName: { type: "string" },
                    lastName: { type: "string" },
                    phone: { type: "string" },
                  },
                },
              ],
            },
            doctor: {
              oneOf: [
                { $ref: "#/components/schemas/ObjectId" },
                { $ref: "#/components/schemas/User" },
              ],
            },
            branch: {
              oneOf: [
                { $ref: "#/components/schemas/ObjectId" },
                { $ref: "#/components/schemas/Branch" },
              ],
            },
            chair: { type: "string", maxLength: 60 },
            start: { type: "string", format: "date-time", nullable: true },
            end: { type: "string", format: "date-time", nullable: true },
            status: {
              type: "string",
              enum: [
                "scheduled", "confirmed", "checked_in", "in_progress",
                "completed", "cancelled", "no_show",
              ],
            },
            reason: { type: "string", maxLength: 300 },
            notes: { type: "string", maxLength: 1000 },
            durationMin: { type: "integer" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },

        /* ------------------------------------------------------------------ Billing */
        Invoice: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            invoiceNo: { type: "string", example: "INV-00001" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            patient: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            appointment: { $ref: "#/components/schemas/ObjectId" },
            items: { type: "array", items: { $ref: "#/components/schemas/InvoiceItem" } },
            subtotal: { type: "number" },
            discountType: { type: "string", enum: ["fixed", "percentage"], default: "fixed" },
            discountRate: { type: "number", minimum: 0, maximum: 100 },
            discount: { type: "number" },
            taxRate: { type: "number", minimum: 0, maximum: 100 },
            tax: { type: "number" },
            total: { type: "number" },
            paidAmount: { type: "number" },
            balance: { type: "number" },
            status: { type: "string", enum: ["unpaid", "partial", "paid", "void"] },
            dueDate: { type: "string", format: "date-time", nullable: true },
            payments: { type: "array", items: { $ref: "#/components/schemas/InvoicePayment" } },
            notes: { type: "string", maxLength: 1000 },
            createdBy: { $ref: "#/components/schemas/ObjectId" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        InvoiceItem: {
          type: "object",
          properties: {
            description: { type: "string", maxLength: 200 },
            quantity: { type: "number", minimum: 1 },
            unitPrice: { type: "number", minimum: 0 },
            discount: { type: "number", minimum: 0 },
            tax: { type: "number", minimum: 0 },
            total: { type: "number" },
            paidAmount: { type: "number" },
          },
        },
        InvoicePayment: {
          type: "object",
          properties: {
            amount: { type: "number" },
            method: { type: "string", enum: ["cash", "card", "transfer", "wallet"] },
            reference: { type: "string", maxLength: 200 },
            idempotencyKey: { type: "string" },
            date: { type: "string", format: "date-time" },
            notes: { type: "string", maxLength: 300 },
            recordedBy: { $ref: "#/components/schemas/ObjectId" },
            isRefund: { type: "boolean", default: false },
          },
        },

        /* ------------------------------------------------------------------ Accounting */
        Expense: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            category: {
              type: "string",
              enum: ["salary", "rent", "utilities", "supplies", "maintenance", "marketing", "other"],
            },
            description: { type: "string", maxLength: 300 },
            amount: { type: "number", minimum: 0.01 },
            date: { $ref: "#/components/schemas/DateTime" },
            paymentMethod: { type: "string", enum: ["cash", "bank", "card"] },
            branch: { $ref: "#/components/schemas/ObjectId" },
            createdBy: { $ref: "#/components/schemas/ObjectId" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        OwnerDrawing: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            owner: { $ref: "#/components/schemas/ObjectId" },
            amount: { type: "number", minimum: 0.01 },
            paymentMethod: { type: "string", enum: ["cash", "bank", "card", "wallet"] },
            patient: { $ref: "#/components/schemas/ObjectId" },
            description: { type: "string", maxLength: 300 },
            date: { $ref: "#/components/schemas/DateTime" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        Commission: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            doctor: { $ref: "#/components/schemas/ObjectId" },
            invoice: { $ref: "#/components/schemas/ObjectId" },
            amount: { type: "number", minimum: 0.01 },
            status: { type: "string", enum: ["pending", "paid", "void"] },
            paidAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        AccountingSummary: {
          type: "object",
          description: "Aggregated accounting totals for a date range.",
          additionalProperties: true,
        },

        /* ------------------------------------------------------------------ Inventory */
        InventoryItem: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            name: { type: "string", maxLength: 120 },
            sku: { type: "string", maxLength: 60 },
            category: {
              type: "string",
              enum: ["anesthetic", "filling_material", "consumable", "instrument", "medication", "hygiene", "other"],
            },
            unit: {
              type: "string",
              enum: ["unit", "box", "pack", "bottle", "tube", "set", "ml", "g"],
            },
            quantity: { type: "number", minimum: 0 },
            reorderPoint: { type: "number", minimum: 0 },
            costPerUnit: { type: "number", minimum: 0 },
            expiryDate: { type: "string", format: "date-time", nullable: true },
            supplier: { type: "string", maxLength: 200 },
            notes: { type: "string", maxLength: 500 },
            isActive: { type: "boolean", default: true },
            needsReorder: { type: "boolean" },
            isExpired: { type: "boolean" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        StockTransaction: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            type: {
              type: "string",
              enum: ["stock_in", "stock_out", "adjustment", "expired", "initial"],
            },
            quantity: { type: "number" },
            reason: { type: "string", maxLength: 200 },
            reference: { type: "string", maxLength: 200 },
            date: { $ref: "#/components/schemas/DateTime" },
            recordedBy: { $ref: "#/components/schemas/ObjectId" },
          },
        },

        /* ------------------------------------------------------------------ EMR */
        TreatmentPlan: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            planNo: { type: "string", example: "TP-00001" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            patient: { $ref: "#/components/schemas/ObjectId" },
            title: { type: "string", maxLength: 120 },
            diagnosis: { type: "string", maxLength: 1000 },
            status: { type: "string", enum: ["active", "completed", "archived"] },
            items: { type: "array", items: { $ref: "#/components/schemas/TreatmentPlanItem" } },
            nextAppointment: { type: "string", format: "date-time", nullable: true },
            nextAppointmentNotes: { type: "string", maxLength: 500 },
            nextAppointmentCreated: { $ref: "#/components/schemas/ObjectId" },
            totalEstimated: { type: "number" },
            totalCompleted: { type: "number" },
            progress: { type: "number" },
            createdBy: { $ref: "#/components/schemas/ObjectId" },
            updatedBy: { $ref: "#/components/schemas/ObjectId" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        TreatmentPlanItem: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tooth: { type: "integer", minimum: 1, maximum: 32, nullable: true },
            surfaces: {
              type: "array",
              items: { type: "string", enum: ["mesial", "distal", "buccal", "lingual", "occlusal"] },
            },
            procedureCode: { type: "string", maxLength: 32 },
            procedureName: { type: "string", maxLength: 120 },
            description: { type: "string", maxLength: 500 },
            estimatedCost: { type: "number", minimum: 0 },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "cancelled"],
            },
            completedDate: { type: "string", format: "date-time", nullable: true },
            appointment: { $ref: "#/components/schemas/ObjectId" },
            invoice: { $ref: "#/components/schemas/ObjectId" },
            notes: { type: "string", maxLength: 500 },
          },
        },
        Prescription: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            rxNo: { type: "string", example: "RX-00001" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            patient: { $ref: "#/components/schemas/ObjectId" },
            doctor: { $ref: "#/components/schemas/ObjectId" },
            appointment: { $ref: "#/components/schemas/ObjectId" },
            diagnosis: { type: "string", maxLength: 500 },
            medications: { type: "array", items: { $ref: "#/components/schemas/Medication" } },
            notes: { type: "string", maxLength: 1000 },
            issuedAt: { $ref: "#/components/schemas/DateTime" },
            medicationCount: { type: "integer" },
            createdBy: { $ref: "#/components/schemas/ObjectId" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        Medication: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            name: { type: "string", maxLength: 120 },
            dosage: { type: "string", maxLength: 60 },
            frequency: { type: "string", maxLength: 60 },
            duration: { type: "string", maxLength: 60 },
            instructions: { type: "string", maxLength: 300 },
          },
        },
        DentalChart: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            patient: { $ref: "#/components/schemas/ObjectId" },
            dentitionType: { type: "string", enum: ["permanent", "primary", "mixed"] },
            teeth: { type: "array", items: { $ref: "#/components/schemas/Tooth" } },
            notes: { type: "string", maxLength: 2000 },
            updatedBy: { $ref: "#/components/schemas/ObjectId" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        Tooth: {
          type: "object",
          properties: {
            number: { type: "integer", minimum: 1, maximum: 32 },
            state: {
              type: "string",
              enum: [
                "sound", "caries", "filled", "crown", "root_canal", "implant",
                "missing", "bridge", "extraction_scheduled", "fractured",
              ],
            },
            surfaces: { $ref: "#/components/schemas/ToothSurfaces" },
            notes: { type: "string", maxLength: 500 },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
            updatedBy: { $ref: "#/components/schemas/ObjectId" },
          },
        },
        ToothSurfaces: {
          type: "object",
          properties: {
            mesial: { type: "string", enum: ["sound", "caries", "restored"] },
            distal: { type: "string", enum: ["sound", "caries", "restored"] },
            buccal: { type: "string", enum: ["sound", "caries", "restored"] },
            lingual: { type: "string", enum: ["sound", "caries", "restored"] },
            occlusal: { type: "string", enum: ["sound", "caries", "restored"] },
          },
        },
        ClinicalNote: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            noteNo: { type: "string", example: "CN-00001" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            patient: { $ref: "#/components/schemas/ObjectId" },
            doctor: { $ref: "#/components/schemas/ObjectId" },
            appointment: { $ref: "#/components/schemas/ObjectId" },
            visitDate: { $ref: "#/components/schemas/DateTime" },
            chiefComplaint: { type: "string", maxLength: 1000 },
            examination: { type: "string", maxLength: 2000 },
            diagnosis: { type: "string", maxLength: 1000 },
            plan: { type: "string", maxLength: 2000 },
            attachments: {
              type: "array",
              items: { $ref: "#/components/schemas/ClinicalNoteAttachment" },
            },
            nextAppointment: { type: "string", format: "date-time", nullable: true },
            nextAppointmentNotes: { type: "string", maxLength: 500 },
            nextAppointmentCreated: { $ref: "#/components/schemas/ObjectId" },
            attachmentCount: { type: "integer" },
            createdBy: { $ref: "#/components/schemas/ObjectId" },
            updatedBy: { $ref: "#/components/schemas/ObjectId" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        ClinicalNoteAttachment: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            type: { type: "string", enum: ["xray", "photo", "document"] },
            url: { type: "string", maxLength: 1024 },
            caption: { type: "string", maxLength: 200 },
            uploadedBy: { $ref: "#/components/schemas/ObjectId" },
            uploadedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        MedicalAttachment: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            patient: { $ref: "#/components/schemas/ObjectId" },
            type: { type: "string", enum: ["xray", "photo", "document"] },
            filename: { type: "string" },
            originalName: { type: "string", maxLength: 255 },
            mimeType: { type: "string", maxLength: 128 },
            size: { type: "number", minimum: 0 },
            caption: { type: "string", maxLength: 200 },
            url: { type: "string" },
            encryptedFilename: { type: "string" },
            uploadedBy: { $ref: "#/components/schemas/ObjectId" },
            uploadedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },

        /* ------------------------------------------------------------------ Dashboard, search, chat */
        DashboardStats: {
          type: "object",
          description: "Aggregated dashboard statistics.",
          additionalProperties: true,
        },
        GlobalSearchResult: {
          type: "object",
          properties: {
            patients: { type: "array", items: { $ref: "#/components/schemas/Patient" } },
            appointments: { type: "array", items: { $ref: "#/components/schemas/Appointment" } },
            invoices: { type: "array", items: { $ref: "#/components/schemas/Invoice" } },
            branches: { type: "array", items: { $ref: "#/components/schemas/Branch" } },
            users: { type: "array", items: { $ref: "#/components/schemas/User" } },
            roles: { type: "array", items: { $ref: "#/components/schemas/Role" } },
            inventory: { type: "array", items: { $ref: "#/components/schemas/InventoryItem" } },
            expenses: { type: "array", items: { $ref: "#/components/schemas/Expense" } },
            drawings: { type: "array", items: { $ref: "#/components/schemas/OwnerDrawing" } },
            treatmentPlans: { type: "array", items: { $ref: "#/components/schemas/TreatmentPlan" } },
            prescriptions: { type: "array", items: { $ref: "#/components/schemas/Prescription" } },
            clinicalNotes: { type: "array", items: { $ref: "#/components/schemas/ClinicalNote" } },
            wallets: { type: "array", items: { $ref: "#/components/schemas/Wallet" } },
            installments: { type: "array", items: { $ref: "#/components/schemas/InstallmentPlan" } },
          },
        },
        ChatMessage: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            sender: { $ref: "#/components/schemas/ObjectId" },
            recipient: { $ref: "#/components/schemas/ObjectId" },
            channel: { type: "string", enum: ["doctors", "accounting", "general"] },
            content: { type: "string", maxLength: 2000 },
            isRead: { type: "boolean", default: false },
            readAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        WhatsAppSettings: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            enabled: { type: "boolean", default: false },
            provider: {
              type: "string",
              enum: ["whatsapp_web", "cloud_api", "twilio"],
              default: "whatsapp_web",
            },
            config: {
              type: "object",
              properties: {
                phoneNumber: { type: "string" },
                phoneNumberId: { type: "string" },
              },
            },
            settings: {
              type: "object",
              properties: {
                appointmentReminder: { type: "boolean", default: false },
                appointmentConfirm: { type: "boolean", default: false },
                reminderHours: { type: "number", minimum: 1, maximum: 168, default: 2 },
              },
            },
            status: {
              type: "string",
              enum: ["disconnected", "connecting", "connected", "error"],
            },
            lastError: { type: "string" },
            qrCode: { type: "string" },
          },
        },

        /* ------------------------------------------------------------------ Site / platform */
        Site: {
          type: "object",
          description: "Tenant (clinic) record on the platform.",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            name: { type: "string", maxLength: 200 },
            slug: { type: "string", maxLength: 120 },
            email: { type: "string", format: "email" },
            phone: { type: "string", maxLength: 30 },
            plan: { type: "string", default: "starter" },
            planId: { $ref: "#/components/schemas/ObjectId" },
            planModules: { type: "array", items: { type: "string" } },
            status: {
              type: "string",
              enum: ["active", "trial", "suspended", "cancelled", "archived"],
            },
            quarantineReason: { type: "string", nullable: true },
            quarantinePreviousStatus: { type: "string", nullable: true },
            trialEndsAt: { type: "string", format: "date-time", nullable: true },
            subscriptionEndsAt: { type: "string", format: "date-time", nullable: true },
            address: { type: "string", maxLength: 500 },
            city: { type: "string", maxLength: 100 },
            country: { type: "string", maxLength: 100 },
            settings: {
              type: "object",
              properties: {
                maxBranches: { type: "number", default: 1 },
                maxDoctors: { type: "number", default: 3 },
                maxPatients: { type: "number", default: 500 },
                storageLimit: { type: "number", description: "In MB", default: 5120 },
              },
            },
            isActive: { type: "boolean", default: true },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        SiteAdmin: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
            role: {
              type: "string",
              enum: ["super_admin", "admin", "support"],
            },
            permissions: { type: "array", items: { type: "string" } },
            isActive: { type: "boolean", default: true },
            twoFactorEnabled: { type: "boolean", default: false },
            lastLogin: { type: "string", format: "date-time", nullable: true },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        SiteUser: {
          type: "object",
          description: "A clinic user viewed from the platform realm.",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
            roleId: { $ref: "#/components/schemas/ObjectId" },
            branch: { $ref: "#/components/schemas/ObjectId" },
            isActive: { type: "boolean" },
            isDoctor: { type: "boolean" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        Plan: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            name: { type: "string" },
            key: { type: "string" },
            price: { type: "number" },
            interval: { type: "string", enum: ["month", "year"] },
            modules: { type: "array", items: { type: "string" } },
            limits: {
              type: "object",
              properties: {
                maxBranches: { type: "number" },
                maxDoctors: { type: "number" },
                maxPatients: { type: "number" },
                storage: { type: "string", example: "5GB" },
              },
            },
            support: { type: "string" },
            features: { type: "array", items: { type: "string" } },
            isActive: { type: "boolean", default: true },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        PlatformSetting: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            siteName: { type: "string", maxLength: 100 },
            supportEmail: { type: "string", format: "email" },
            maintenanceMode: { type: "boolean", default: false },
            autoSuspendDays: { type: "number", default: 30 },
            emailNotifications: { type: "boolean", default: true },
            allowedDomains: { type: "array", items: { type: "string" } },
            maxTenants: { type: "number", default: 1000 },
            defaultPlan: { type: "string", enum: ["starter", "professional", "enterprise"] },
            trialDays: { type: "number", default: 14 },
            backupEnabled: { type: "boolean", default: true },
            backupRetentionDays: { type: "number", default: 30 },
            backupTime: { type: "string", example: "02:00" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        Subscription: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            plan: { type: "string" },
            status: { type: "string", enum: ["active", "pending", "past_due", "cancelled"] },
            billingCycle: { type: "string", enum: ["monthly", "yearly"] },
            amount: { type: "number" },
            currency: { type: "string", default: "USD" },
            currentPeriodStart: { type: "string", format: "date-time", nullable: true },
            currentPeriodEnd: { type: "string", format: "date-time", nullable: true },
            cancelAtPeriodEnd: { type: "boolean", default: false },
            lastPaymentAt: { type: "string", format: "date-time", nullable: true },
            nextPaymentAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { $ref: "#/components/schemas/DateTime" },
            updatedAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        AuditLog: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            admin: { $ref: "#/components/schemas/ObjectId" },
            adminEmail: { type: "string" },
            adminRole: { type: "string" },
            action: { type: "string" },
            target: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["tenant", "branch", "admin", "subscription", "plan", "platform"] },
                id: { $ref: "#/components/schemas/ObjectId" },
                name: { type: "string" },
              },
            },
            details: { type: "object", additionalProperties: true },
            requestId: { type: "string" },
            ip: { type: "string" },
            userAgent: { type: "string" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        ErrorLog: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            tenant: { $ref: "#/components/schemas/ObjectId" },
            method: { type: "string" },
            url: { type: "string" },
            statusCode: { type: "integer" },
            message: { type: "string" },
            stack: { type: "string" },
            requestId: { type: "string" },
            ip: { type: "string" },
            userAgent: { type: "string" },
            resolved: { type: "boolean", default: false },
            createdAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        Quarantine: {
          type: "object",
          properties: {
            tenantId: { $ref: "#/components/schemas/ObjectId" },
            reason: { type: "string" },
          },
        },
        BackupLog: {
          type: "object",
          properties: {
            _id: { $ref: "#/components/schemas/ObjectId" },
            filename: { type: "string" },
            sizeBytes: { type: "number" },
            status: { type: "string", enum: ["running", "completed", "failed"] },
            error: { type: "string" },
            type: { type: "string", enum: ["scheduled", "manual"] },
            triggeredBy: { $ref: "#/components/schemas/ObjectId" },
            encrypted: { type: "boolean", default: false },
            dbSizeBytes: { type: "number" },
            durationMs: { type: "number" },
            createdAt: { $ref: "#/components/schemas/DateTime" },
          },
        },
        GlobalStats: {
          type: "object",
          properties: {
            totalTenants: { type: "number" },
            activeTenants: { type: "number" },
            totalPatients: { type: "number" },
            totalAppointments: { type: "number" },
            newTenantsThisMonth: { type: "number" },
            totalRevenue: { type: "number" },
            monthlyRecurring: { type: "number" },
            arpa: { type: "number" },
            churnRate: { type: "number" },
          },
        },
        GrowthData: {
          type: "object",
          properties: {
            tenants: {
              type: "array",
              items: { type: "object", properties: { month: { type: "string" }, count: { type: "number" } } },
            },
            patients: {
              type: "array",
              items: { type: "object", properties: { month: { type: "string" }, count: { type: "number" } } },
            },
            revenue: {
              type: "array",
              items: { type: "object", properties: { month: { type: "string" }, count: { type: "number" } } },
            },
          },
        },
        TenantUsage: {
          type: "object",
          properties: {
            branches: {
              type: "object",
              properties: { used: { type: "number" }, limit: { type: "number" } },
            },
            users: {
              type: "object",
              properties: { used: { type: "number" }, limit: { type: "number" } },
            },
            doctors: {
              type: "object",
              properties: { used: { type: "number" }, limit: { type: "number" } },
            },
            patients: {
              type: "object",
              properties: { used: { type: "number" }, limit: { type: "number" } },
            },
            storage: {
              type: "object",
              properties: {
                used: { type: "number" },
                limit: { type: "number" },
                unit: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
  apis: ["./swagger.js", "./modules/**/*.js", "./routes/**/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app) {
  // Docs are public API surface — disabled in production unless explicitly
  // enabled with ENABLE_API_DOCS=true.
  const docsEnabled =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_API_DOCS === "true";
  if (!docsEnabled) return;

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "Dental OS API Docs",
    customCss: ".swagger-ui .topbar { display: none }",
  }));

  app.get("/api/docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}
