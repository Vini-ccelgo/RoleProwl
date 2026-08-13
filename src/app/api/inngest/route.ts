import { serve } from "inngest/next";
import { applicationWorkflowFunction } from "@/integrations/workflows/application-workflow-function";
import { inngest } from "@/integrations/workflows/inngest-client";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [applicationWorkflowFunction],
});
