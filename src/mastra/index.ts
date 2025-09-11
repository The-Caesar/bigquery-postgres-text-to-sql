import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import { sqlAgent } from "./agents/postgres-sql-agent";
import { databaseQueryWorkflow } from "./workflows/postgres/database-query-workflow";
import { bigQuerySqlAgent } from "./agents/bigquery-sql-agent";
import { openRouterGPTagent } from "./agents/openrouter";
import { bigqueryQueryWorkflow } from "./workflows/bigquery/bigquery-introspection-query-workflow";
import { bigquerysystemPrompQueryWorkflow } from "./workflows/bigquery/bigquery-generate-systemPrompt-part1";
import { bigqueryQueryWorkflowPart2 } from "./workflows/bigquery/bigquery-query-workflow-part2";
import {
  configureSslCertificates,
  setNodeExtraCaCerts,
} from "./config/ssl-config";

// Disable SSL verification as a fallback for corporate environments
// This is necessary for PostHog to work with Zscaler and similar corporate proxies
if (process.env.CERTIFICATION) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  console.log(
    "NODE_TLS_REJECT_UNAUTHORIZED set to 0 for corporate environment"
  );
}

// Configure SSL certificates before any network requests
// This fixes PostHog and other HTTPS requests in corporate environments
setNodeExtraCaCerts();
configureSslCertificates();

export const mastra = new Mastra({
  agents: {
    sqlAgent,
    bigQuerySqlAgent,
    openRouterGPTagent,
  },
  workflows: {
    databaseQueryWorkflow,
    bigqueryQueryWorkflow,
    bigquerysystemPrompQueryWorkflow,
    bigqueryQueryWorkflowPart2,
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
});
