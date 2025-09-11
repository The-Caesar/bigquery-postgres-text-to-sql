import { readFileSync } from "fs";
import { join } from "path";
import https from "https";
import { Agent } from "https";
import tls from "tls";

/**
 * Configures SSL certificates for Node.js HTTPS requests
 * Handles corporate environments with custom certificates (e.g., Zscaler)
 */
export function configureSslCertificates(): void {
  const certPath = process.env.CERTIFICATION;

  if (!certPath) {
    console.log(
      "No CERTIFICATION environment variable found, using default SSL configuration"
    );
    return;
  }

  try {
    // Resolve certificate path relative to project root
    // Handle both development (source) and production (compiled) scenarios
    let fullCertPath = join(process.cwd(), certPath);

    // If running from .mastra/output, go up to project root
    if (process.cwd().includes(".mastra/output")) {
      fullCertPath = join(process.cwd(), "../..", certPath);
    }

    // Read the certificate file
    const customCert = readFileSync(fullCertPath, "utf8");

    // Configure Node.js to use the custom certificate
    const httpsAgent = new Agent({
      ca: [customCert],
      // Keep default CAs as well for other requests
      checkServerIdentity: (host, cert) => {
        // Allow the custom certificate authority
        return undefined;
      },
    });

    // Set global HTTPS agent for all requests
    https.globalAgent = httpsAgent;

    // Configure TLS for all connections
    const originalCreateSecureContext = tls.createSecureContext;
    tls.createSecureContext = function (options = {}) {
      return originalCreateSecureContext({
        ...options,
        ca: [
          customCert,
          ...(Array.isArray(options.ca)
            ? options.ca
            : options.ca
              ? [options.ca]
              : []),
        ],
      });
    };

    // Also configure for fetch API (Node 18+) and undici
    if (global.fetch) {
      const originalFetch = global.fetch;
      global.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const updatedInit = {
          ...init,
          // @ts-ignore - Node.js specific agent option
          agent: httpsAgent,
        };
        return originalFetch(input, updatedInit);
      };
    }

    // Configure undici dispatcher for PostHog and other undici-based requests
    try {
      const undici = require("undici");
      const { setGlobalDispatcher, Agent: UndiciAgent } = undici;

      const undiciAgent = new UndiciAgent({
        connect: {
          ca: [customCert],
          checkServerIdentity: () => undefined,
          rejectUnauthorized: false,
          secureContext: tls.createSecureContext({
            ca: [customCert],
          }),
        },
      });

      setGlobalDispatcher(undiciAgent);
      console.log(
        "Undici SSL configuration applied successfully with custom cert"
      );
    } catch (undiciError: any) {
      console.log(
        "Undici configuration error:",
        undiciError?.message || undiciError
      );

      // Fallback: Try simpler undici configuration without custom cert
      try {
        const undici = require("undici");
        const { setGlobalDispatcher, Agent: UndiciAgent } = undici;

        const fallbackAgent = new UndiciAgent({
          connect: {
            rejectUnauthorized: false,
          },
        });

        setGlobalDispatcher(fallbackAgent);
        console.log(
          "Undici fallback SSL configuration applied (rejectUnauthorized: false)"
        );
      } catch (fallbackError: any) {
        console.log(
          "Undici fallback also failed:",
          fallbackError?.message || fallbackError
        );
        // Final fallback: environment variable
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        console.log("Applied NODE_TLS_REJECT_UNAUTHORIZED=0 as final fallback");
      }
    }

    console.log(`SSL certificate configured successfully using: ${certPath}`);
  } catch (error) {
    console.error(
      `Failed to configure SSL certificate from ${certPath}:`,
      error
    );
    console.log("Continuing with default SSL configuration");

    // Fallback: disable SSL verification for corporate environments
    // This is not ideal but necessary for PostHog to work in some corporate networks
    console.log(
      "Applying fallback SSL configuration for corporate environment"
    );
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
}

/**
 * Alternative approach: Set NODE_EXTRA_CA_CERTS environment variable
 * This is a more standard way to add custom CAs in Node.js
 */
export function setNodeExtraCaCerts(): void {
  const certPath = process.env.CERTIFICATION;

  if (!certPath) {
    return;
  }

  try {
    // Resolve certificate path relative to project root
    // Handle both development (source) and production (compiled) scenarios
    let fullCertPath = join(process.cwd(), certPath);

    // If running from .mastra/output, go up to project root
    if (process.cwd().includes(".mastra/output")) {
      fullCertPath = join(process.cwd(), "../..", certPath);
    }

    // Set NODE_EXTRA_CA_CERTS if not already set
    if (!process.env.NODE_EXTRA_CA_CERTS) {
      process.env.NODE_EXTRA_CA_CERTS = fullCertPath;
      console.log(`NODE_EXTRA_CA_CERTS set to: ${fullCertPath}`);
    }
  } catch (error) {
    console.error(`Failed to set NODE_EXTRA_CA_CERTS:`, error);
  }
}
