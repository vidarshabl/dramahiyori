export function isBlobStorageConfigured(request?:Pick<Request,"headers">) {
  const oidcToken=process.env.VERCEL_OIDC_TOKEN||request?.headers.get("x-vercel-oidc-token");
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN||(oidcToken&&process.env.BLOB_STORE_ID));
}
