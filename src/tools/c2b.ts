import { z } from "zod";
import { SCOPES } from "../scopes.js";
import { applicationIdField, envField } from "./common.js";
import type { ToolDef } from "./types.js";

export const registerC2bInput = {
  applicationId: applicationIdField,
  env: envField,
} as const;

const schema = z.object(registerC2bInput);

export const registerC2bTool: ToolDef = {
  name: "register_c2b",
  title: "Register C2B URLs",
  scope: SCOPES.paymentsCollect,
  description:
    "Register the C2B validation/confirmation URLs for an application's shortcode with Safaricom (POST " +
    "/provider-ops/c2b-register). Returns { registered, shortcode, confirmationUrl, responseCode, " +
    "responseDescription }. paylod hosts the confirmation/validation receiver, so you write no C2B " +
    "callback code. Requires the payments.collect scope.",
  inputSchema: registerC2bInput,
  handler: async (client, args) => {
    const body = schema.parse(args);
    return client.request("POST", "/provider-ops/c2b-register", { body });
  },
};
