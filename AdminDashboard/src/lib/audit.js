export const actionVariant = (action) => {
  if (action?.includes("delete") || action?.includes("suspend"))
    return "danger";
  if (action?.includes("create") || action?.includes("activate"))
    return "success";
  if (action?.includes("update") || action?.includes("toggle"))
    return "warning";
  return "default";
};