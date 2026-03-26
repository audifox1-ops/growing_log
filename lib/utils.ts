/**
 * Calculates the age in months between two dates.
 * @param birthDateString - The birth date in YYYY-MM-DD format.
 * @param takenAtTimestamp - The timestamp when the photo was taken.
 * @returns The age in months.
 */
export function calculateAgeInMonths(birthDateString: string, takenAtTimestamp: number): number {
  const birthDate = new Date(birthDateString);
  const takenDate = new Date(takenAtTimestamp);

  let months = (takenDate.getFullYear() - birthDate.getFullYear()) * 12;
  months -= birthDate.getMonth();
  months += takenDate.getMonth();

  // Adjust for day of the month
  if (takenDate.getDate() < birthDate.getDate()) {
    months--;
  }

  return Math.max(0, months);
}

/**
 * Formats the age in months into a human-readable string.
 * @param months - The age in months.
 * @returns A string like "12개월 (1세)"
 */
export function formatAge(months: number): string {
  if (months < 1) return '신생아';
  if (months < 24) return `${months}개월`;
  
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  
  if (remainingMonths === 0) return `${years}세`;
  return `${years}세 ${remainingMonths}개월`;
}
