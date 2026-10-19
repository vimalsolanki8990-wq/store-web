export const AUTHORIZED_ADMIN_EMAILS = [
  "vimalsolanki8990@gmail.com",
  "dhavaljsolankii@gmail.com",
];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return AUTHORIZED_ADMIN_EMAILS.includes(email.toLowerCase().trim());
}