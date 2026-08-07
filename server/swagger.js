import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Dental OS API",
      version: "1.0.0",
      description: "Multi-tenant SaaS dental clinic management API",
    },
    servers: [
      {
        url: "http://localhost:7000",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "token",
          description: "JWT token set via HTTP-only cookie",
        },
      },
    },
  },
  apis: ["./modules/**/*.js", "./routes/**/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app) {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "Dental OS API Docs",
    customCss: ".swagger-ui .topbar { display: none }",
  }));

  app.get("/api/docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}
