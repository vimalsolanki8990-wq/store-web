export const AUTHORIZED_ADMIN_EMAILS = [
  "dhawalsolanki97@gmail.com",
  "secondadmin@gmail.com",
  "vimalsolanki8990@gmail.com",
  "dhavaljsolankii@gmail.com",
];

export const MASTER_PIN = "1997";

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  return AUTHORIZED_ADMIN_EMAILS.some((admin) => admin.toLowerCase().trim() === cleanEmail);
}
