import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: false,

  preview: {
    buckets: {
      roleprowl: {}, // private by default
    },
  },

  branch: (branch) => {
    if (branch.isDefault) {
      return {};
    }

    if (!branch.exists) {
      return { ttl: "7d" };
    }

    return {};
  },
});
