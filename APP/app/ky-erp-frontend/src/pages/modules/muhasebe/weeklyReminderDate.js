export function weeklyReminderDate(weekday, advanceDays, today = new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Istanbul"})) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !Number.isInteger(advanceDays) || advanceDays < 0 || advanceDays > 6) return null;
  const base = new Date(today+"T12:00:00Z");
  if (Number.isNaN(base.getTime()) || base.toISOString().slice(0,10)!==today) return null;
  const shift = (day,n)=>{const d=new Date(day+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
  let dueDate=shift(today,(weekday-base.getUTCDay()+7)%7);
  let remindOn=shift(dueDate,-advanceDays);
  if(remindOn<today){dueDate=shift(dueDate,7);remindOn=shift(dueDate,-advanceDays)}
  return {dueDate,remindOn};
}
