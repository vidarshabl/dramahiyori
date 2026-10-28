// Small neutral blur used for database-hosted images, which cannot be blurred at build time.
export const IMAGE_BLUR_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 60'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1'%3E%3Cstop stop-color='%231b1823'/%3E%3Cstop offset='1' stop-color='%23412a3c'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='40' height='60' fill='url(%23g)'/%3E%3C/svg%3E";
