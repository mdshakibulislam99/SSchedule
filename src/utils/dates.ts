export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseNaturalDate(text: string, baseDate: Date = new Date()): string {
  const lower = text.toLowerCase();
  if (lower.includes('day after tomorrow')) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 2);
    return getLocalDateKey(d);
  }
  if (lower.includes('tomorrow')) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 1);
    return getLocalDateKey(d);
  }
  if (lower.includes('today')) {
    return getLocalDateKey(baseDate);
  }

  // Days of week: monday, tuesday, etc.
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const d = new Date(baseDate);
      const currentDay = d.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7; // next occurrence
      d.setDate(d.getDate() + diff);
      return getLocalDateKey(d);
    }
  }

  // Explicit YYYY-MM-DD
  const isoMatch = text.match(/\b(20\d\d-\d{1,2}-\d{1,2})\b/);
  if (isoMatch) return isoMatch[1];

  // Month + day, e.g. "Oct 12", "October 12", "Oct 12th"
  const monthMatch = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (monthMatch) {
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mIdx = monthNames.findIndex((m) => monthMatch[1].toLowerCase().startsWith(m));
    const day = parseInt(monthMatch[2], 10);
    const d = new Date(baseDate.getFullYear(), mIdx, day);
    return getLocalDateKey(d);
  }

  return getLocalDateKey(baseDate);
}

export function parseNaturalTime(text: string): { startTime: string; endTime: string } {
  const lower = text.toLowerCase();

  // Pattern: "from 2pm to 4pm" or "2:00pm - 4:00pm" or "2 to 4pm"
  const rangeMatch = lower.match(/(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (rangeMatch) {
    let startH = parseInt(rangeMatch[1], 10);
    const startM = rangeMatch[2] ? rangeMatch[2] : '00';
    const startMeridiem = rangeMatch[3] || rangeMatch[6];
    let endH = parseInt(rangeMatch[4], 10);
    const endM = rangeMatch[5] ? rangeMatch[5] : '00';
    const endMeridiem = rangeMatch[6];

    if (startMeridiem?.toLowerCase() === 'pm' && startH < 12) startH += 12;
    if (startMeridiem?.toLowerCase() === 'am' && startH === 12) startH = 0;
    if (endMeridiem?.toLowerCase() === 'pm' && endH < 12) endH += 12;
    if (endMeridiem?.toLowerCase() === 'am' && endH === 12) endH = 0;

    const startTime = `${String(startH).padStart(2, '0')}:${startM}`;
    const endTime = `${String(endH).padStart(2, '0')}:${endM}`;
    return { startTime, endTime };
  }

  // Single time: "at 3pm", "at 14:00", "at 9:30 am", "3pm"
  const singleMatch = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (singleMatch) {
    let h = parseInt(singleMatch[1], 10);
    const m = singleMatch[2] ? singleMatch[2] : '00';
    const meridiem = singleMatch[3]?.toLowerCase();

    if (meridiem === 'pm' && h < 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;

    const startTime = `${String(h).padStart(2, '0')}:${m}`;
    const endH = (h + 1) % 24;
    const endTime = `${String(endH).padStart(2, '0')}:${m}`;
    return { startTime, endTime };
  }

  return { startTime: '15:00', endTime: '16:00' };
}