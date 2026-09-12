type Row = Record<string, any>;

const text=(v:unknown)=>v===undefined||v===null?'':String(v).trim();
const upper=(v:unknown)=>text(v).toUpperCase().replace(/İ/g,'I');
const intOrNull=(v:unknown)=>{if(v===undefined||v===null||v==='')return null;const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.round(n)):null};
const bool=(v:unknown,f=false)=>v===undefined||v===null||v===''?f:(v===true||v===1||['1','TRUE','EVET','YES','ON'].includes(upper(v)));
const nowIso=()=>new Date().toISOString();
const parseDays=(v:unknown)=>{try{const a=Array.isArray(v)?v:JSON.parse(text(v)||'[]');return Array.isArray(a)?[...new Set(a.map(Number).filter(n=>n>=0&&n<=6))]:[]}catch{return []}};
const nullableBool=(v:unknown)=>v===undefined||v===null||v===''?null:(bool(v)?1:0);
const enumValue=(v:unknown,allowed:string[],fallback:string)=>{const x=upper(v);return allowed.includes(x)?x:fallback};

export const PDKS_NORMAL_CREDIT_MODES=['UNCONFIGURED','MONTHLY_DIV_30','MONTHLY_WORKDAYS','FIXED_DAILY','ACTUAL'] as const;
export const PDKS_ATTENDANCE_MODES=['STRICT_CARD','CARD_CONTROL_ONLY','SUMMARY_ONLY','NO_CARD_REQUIRED'] as const;
export const PDKS_LATE_EARLY_EFFECTS=['IGNORE','TRACK_ONLY','DEDUCT_CREDIT'] as const;
export const PDKS_MISSING_PUNCH_POLICIES=['FLAG_ONLY','REQUIRE_MANUAL','ZERO_CREDIT','ASSUME_SCHEDULE'] as const;

export async function ensurePdksPolicySchema(c:any){
  await c.env.DB.batch([
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_company_policy(main_company_id TEXT PRIMARY KEY,profile_name TEXT NOT NULL DEFAULT '',configured INTEGER NOT NULL DEFAULT 0,normal_credit_mode TEXT NOT NULL DEFAULT 'UNCONFIGURED',payroll_monthly_minutes INTEGER,fixed_daily_minutes INTEGER,contract_weekly_minutes INTEGER,overtime_enabled INTEGER NOT NULL DEFAULT 0,night_shift_enabled INTEGER NOT NULL DEFAULT 0,default_attendance_mode TEXT NOT NULL DEFAULT 'STRICT_CARD',require_punch_default INTEGER NOT NULL DEFAULT 1,show_daily_punch_detail INTEGER NOT NULL DEFAULT 1,late_early_effect TEXT NOT NULL DEFAULT 'TRACK_ONLY',missing_punch_policy TEXT NOT NULL DEFAULT 'REQUIRE_MANUAL',effective_from TEXT,policy_version INTEGER NOT NULL DEFAULT 1,updated_by TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_personnel_groups(id TEXT PRIMARY KEY,main_company_id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,personnel_class TEXT NOT NULL DEFAULT 'CUSTOM',default_shift_id TEXT,attendance_mode TEXT NOT NULL DEFAULT 'INHERIT',require_punch INTEGER,show_daily_punch_detail INTEGER,late_early_effect TEXT NOT NULL DEFAULT 'INHERIT',missing_punch_policy TEXT NOT NULL DEFAULT 'INHERIT',overtime_mode TEXT NOT NULL DEFAULT 'INHERIT',night_shift_mode TEXT NOT NULL DEFAULT 'INHERIT',normal_credit_mode TEXT NOT NULL DEFAULT 'INHERIT',payroll_monthly_minutes INTEGER,fixed_daily_minutes INTEGER,contract_weekly_minutes INTEGER,work_days_json TEXT,weekly_rest_days_json TEXT,active INTEGER NOT NULL DEFAULT 1,updated_by TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(main_company_id,code))`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_employee_personnel_groups(main_company_id TEXT NOT NULL,employee_id TEXT NOT NULL,personnel_group_id TEXT NOT NULL,updated_by TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(main_company_id,employee_id))`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_employee_policy_overrides(main_company_id TEXT NOT NULL,employee_id TEXT NOT NULL,default_shift_id TEXT,attendance_mode TEXT,require_punch INTEGER,show_daily_punch_detail INTEGER,late_early_effect TEXT,missing_punch_policy TEXT,overtime_mode TEXT,night_shift_mode TEXT,normal_credit_mode TEXT,payroll_monthly_minutes INTEGER,fixed_daily_minutes INTEGER,contract_weekly_minutes INTEGER,work_days_json TEXT,weekly_rest_days_json TEXT,reason TEXT NOT NULL DEFAULT '',effective_from TEXT,effective_to TEXT,updated_by TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(main_company_id,employee_id))`),
  ]);
}

async function first(c:any,sql:string,values:unknown[]=[]){return c.env.DB.prepare(sql).bind(...values).first() as Promise<Row | null>;}

export async function readCompanyPdksPolicy(c:any,company:string){
  await ensurePdksPolicySchema(c);
  const [policy,rules]=await Promise.all([
    first(c,'SELECT * FROM ik_pdks_company_policy WHERE main_company_id=? LIMIT 1',[company]),
    first(c,'SELECT * FROM ik_pdks_rule_profiles WHERE main_company_id=? LIMIT 1',[company]).catch(()=>null),
  ]);
  const mode=enumValue(policy?.normal_credit_mode,[...PDKS_NORMAL_CREDIT_MODES],'UNCONFIGURED');
  const monthly=intOrNull(policy?.payroll_monthly_minutes);
  const fixedDaily=intOrNull(policy?.fixed_daily_minutes);
  const derivedDaily=mode==='MONTHLY_DIV_30'&&monthly?Math.round(monthly/30):fixedDaily;
  return {
    mainCompanyId:company,
    configured:Number(policy?.configured||0)!==0,
    profileName:text(policy?.profile_name),
    normalCreditMode:mode,
    payrollMonthlyMinutes:monthly,
    fixedDailyMinutes:fixedDaily,
    resolvedDailyCreditMinutes:derivedDaily,
    contractWeeklyMinutes:intOrNull(policy?.contract_weekly_minutes),
    overtimeEnabled:Number(policy?.overtime_enabled||0)!==0,
    nightShiftEnabled:Number(policy?.night_shift_enabled||0)!==0,
    defaultAttendanceMode:enumValue(policy?.default_attendance_mode,[...PDKS_ATTENDANCE_MODES],'STRICT_CARD'),
    requirePunchDefault:Number(policy?.require_punch_default??1)!==0,
    showDailyPunchDetail:Number(policy?.show_daily_punch_detail??1)!==0,
    lateEarlyEffect:enumValue(policy?.late_early_effect,[...PDKS_LATE_EARLY_EFFECTS],'TRACK_ONLY'),
    missingPunchPolicy:enumValue(policy?.missing_punch_policy,[...PDKS_MISSING_PUNCH_POLICIES],'REQUIRE_MANUAL'),
    effectiveFrom:text(policy?.effective_from)||null,
    policyVersion:Number(policy?.policy_version||0),
    workDays:parseDays(rules?.work_days_json),
    restDays:parseDays(rules?.weekly_rest_days_json),
    annualCountDays:parseDays(rules?.annual_leave_counted_weekdays_json),
    breakMinutes:intOrNull(rules?.break_minutes),
    overtimeMin:intOrNull(rules?.overtime_min_minutes),
    overtimeRound:intOrNull(rules?.overtime_round_minutes),
    duplicateWindow:intOrNull(rules?.duplicate_punch_window_seconds),
    halfDayMinutes:intOrNull(rules?.half_day_minutes),
    maxDailyMinutes:intOrNull(rules?.max_daily_minutes),
    maxWeeklyMinutes:intOrNull(rules?.max_weekly_minutes),
    updatedAt:text(policy?.updated_at||rules?.updated_at),
  };
}

export async function saveCompanyPdksPolicy(c:any,company:string,body:Row,actor:string){
  await ensurePdksPolicySchema(c);
  const current=await readCompanyPdksPolicy(c,company);
  const mode=enumValue(body.normalCreditMode,[...PDKS_NORMAL_CREDIT_MODES],current.normalCreditMode||'UNCONFIGURED');
  const monthly=intOrNull(body.payrollMonthlyMinutes);
  const fixedDaily=intOrNull(body.fixedDailyMinutes);
  const weekly=intOrNull(body.contractWeeklyMinutes);
  const configured=body.configured===undefined?true:bool(body.configured);
  if(configured&&mode==='UNCONFIGURED')throw new Error('Normal çalışma kredi yöntemi seçilmelidir.');
  if(configured&&['MONTHLY_DIV_30','MONTHLY_WORKDAYS'].includes(mode)&&(!monthly||monthly<60))throw new Error('Aylık puantaj/bordro hedef saati zorunludur.');
  if(configured&&mode==='FIXED_DAILY'&&(!fixedDaily||fixedDaily<30))throw new Error('Sabit günlük normal çalışma süresi zorunludur.');
  if(configured&&(!weekly||weekly<60))throw new Error('Haftalık sözleşme süresi zorunludur.');
  const ts=nowIso();
  await c.env.DB.prepare(`INSERT INTO ik_pdks_company_policy(main_company_id,profile_name,configured,normal_credit_mode,payroll_monthly_minutes,fixed_daily_minutes,contract_weekly_minutes,overtime_enabled,night_shift_enabled,default_attendance_mode,require_punch_default,show_daily_punch_detail,late_early_effect,missing_punch_policy,effective_from,policy_version,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(main_company_id) DO UPDATE SET profile_name=excluded.profile_name,configured=excluded.configured,normal_credit_mode=excluded.normal_credit_mode,payroll_monthly_minutes=excluded.payroll_monthly_minutes,fixed_daily_minutes=excluded.fixed_daily_minutes,contract_weekly_minutes=excluded.contract_weekly_minutes,overtime_enabled=excluded.overtime_enabled,night_shift_enabled=excluded.night_shift_enabled,default_attendance_mode=excluded.default_attendance_mode,require_punch_default=excluded.require_punch_default,show_daily_punch_detail=excluded.show_daily_punch_detail,late_early_effect=excluded.late_early_effect,missing_punch_policy=excluded.missing_punch_policy,effective_from=excluded.effective_from,policy_version=ik_pdks_company_policy.policy_version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(company,text(body.profileName)||current.profileName||'PDKS Firma Profili',configured?1:0,mode,monthly,fixedDaily,weekly,bool(body.overtimeEnabled,current.overtimeEnabled)?1:0,bool(body.nightShiftEnabled,current.nightShiftEnabled)?1:0,enumValue(body.defaultAttendanceMode,[...PDKS_ATTENDANCE_MODES],current.defaultAttendanceMode||'STRICT_CARD'),bool(body.requirePunchDefault,current.requirePunchDefault)?1:0,bool(body.showDailyPunchDetail,current.showDailyPunchDetail)?1:0,enumValue(body.lateEarlyEffect,[...PDKS_LATE_EARLY_EFFECTS],current.lateEarlyEffect||'TRACK_ONLY'),enumValue(body.missingPunchPolicy,[...PDKS_MISSING_PUNCH_POLICIES],current.missingPunchPolicy||'REQUIRE_MANUAL'),text(body.effectiveFrom)||null,1,actor,ts).run();

  // Calendar/shift calculation defaults are part of the same logical company profile.
  const workDays=parseDays(body.workDays),restDays=parseDays(body.restDays),annualDays=parseDays(body.annualCountDays);
  const existing=await first(c,'SELECT main_company_id FROM ik_pdks_rule_profiles WHERE main_company_id=? LIMIT 1',[company]).catch(()=>null);
  if(existing){
    await c.env.DB.prepare(`UPDATE ik_pdks_rule_profiles SET work_days_json=?,weekly_rest_days_json=?,annual_leave_counted_weekdays_json=?,break_minutes=?,overtime_min_minutes=?,overtime_round_minutes=?,duplicate_punch_window_seconds=?,half_day_minutes=?,max_daily_minutes=?,max_weekly_minutes=?,updated_by=?,updated_at=? WHERE main_company_id=?`)
      .bind(JSON.stringify(workDays),JSON.stringify(restDays),JSON.stringify(annualDays),intOrNull(body.breakMinutes)??0,intOrNull(body.overtimeMin)??0,intOrNull(body.overtimeRound)??1,intOrNull(body.duplicateWindow)??0,intOrNull(body.halfDayMinutes)??0,intOrNull(body.maxDailyMinutes)??0,intOrNull(body.maxWeeklyMinutes)??0,actor,ts,company).run();
  } else {
    await c.env.DB.prepare(`INSERT INTO ik_pdks_rule_profiles(main_company_id,work_days_json,weekly_rest_days_json,annual_leave_counted_weekdays_json,break_minutes,overtime_min_minutes,overtime_round_minutes,duplicate_punch_window_seconds,half_day_minutes,max_daily_minutes,max_weekly_minutes,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(company,JSON.stringify(workDays),JSON.stringify(restDays),JSON.stringify(annualDays),intOrNull(body.breakMinutes)??0,intOrNull(body.overtimeMin)??0,intOrNull(body.overtimeRound)??1,intOrNull(body.duplicateWindow)??0,intOrNull(body.halfDayMinutes)??0,intOrNull(body.maxDailyMinutes)??0,intOrNull(body.maxWeeklyMinutes)??0,actor,ts).run();
  }
  return readCompanyPdksPolicy(c,company);
}

export async function resolveEmployeePdksPolicy(c:any,company:string,employeeId:string){
  const base=await readCompanyPdksPolicy(c,company);
  const group=await first(c,`SELECT g.* FROM ik_pdks_employee_personnel_groups a JOIN ik_pdks_personnel_groups g ON g.id=a.personnel_group_id AND g.main_company_id=a.main_company_id WHERE a.main_company_id=? AND a.employee_id=? AND g.active=1 LIMIT 1`,[company,employeeId]).catch(()=>null);
  const override=await first(c,'SELECT * FROM ik_pdks_employee_policy_overrides WHERE main_company_id=? AND employee_id=? LIMIT 1',[company,employeeId]).catch(()=>null);
  const choose=(ov:any,gr:any,baseValue:any,inherit='INHERIT')=>text(ov)?upper(ov):(text(gr)&&upper(gr)!==inherit?upper(gr):baseValue);
  const b=(ov:any,gr:any,baseValue:boolean)=>ov!==null&&ov!==undefined?Number(ov)!==0:(gr!==null&&gr!==undefined?Number(gr)!==0:baseValue);
  const n=(ov:any,gr:any,baseValue:any)=>intOrNull(ov)??intOrNull(gr)??baseValue;
  const overrideWorkDays=parseDays(override?.work_days_json),groupWorkDays=parseDays(group?.work_days_json);
  const overrideRestDays=parseDays(override?.weekly_rest_days_json),groupRestDays=parseDays(group?.weekly_rest_days_json);
  const hasWorkDaysOverride=overrideWorkDays.length>0||groupWorkDays.length>0;
  const hasRestDaysOverride=overrideRestDays.length>0||groupRestDays.length>0;
  const workDays=overrideWorkDays.length?overrideWorkDays:(groupWorkDays.length?groupWorkDays:base.workDays);
  const restDays=overrideRestDays.length?overrideRestDays:(groupRestDays.length?groupRestDays:base.restDays);
  const normalCreditMode=choose(override?.normal_credit_mode,group?.normal_credit_mode,base.normalCreditMode);
  const monthly=n(override?.payroll_monthly_minutes,group?.payroll_monthly_minutes,base.payrollMonthlyMinutes);
  const fixedDaily=n(override?.fixed_daily_minutes,group?.fixed_daily_minutes,base.fixedDailyMinutes);
  const resolvedDaily=normalCreditMode==='MONTHLY_DIV_30'&&monthly?Math.round(monthly/30):fixedDaily;
  const overtimeMode=choose(override?.overtime_mode,group?.overtime_mode,base.overtimeEnabled?'AUTO':'DISABLED');
  const nightMode=choose(override?.night_shift_mode,group?.night_shift_mode,base.nightShiftEnabled?'ENABLED':'DISABLED');
  return {
    ...base,
    personnelGroup:group?{id:text(group.id),code:text(group.code),name:text(group.name),personnelClass:upper(group.personnel_class)||'CUSTOM'}:null,
    defaultShiftId:text(override?.default_shift_id||group?.default_shift_id)||null,
    attendanceMode:choose(override?.attendance_mode,group?.attendance_mode,base.defaultAttendanceMode),
    requirePunch:b(override?.require_punch,group?.require_punch,base.requirePunchDefault),
    showDailyPunchDetail:b(override?.show_daily_punch_detail,group?.show_daily_punch_detail,base.showDailyPunchDetail),
    lateEarlyEffect:choose(override?.late_early_effect,group?.late_early_effect,base.lateEarlyEffect),
    missingPunchPolicy:choose(override?.missing_punch_policy,group?.missing_punch_policy,base.missingPunchPolicy),
    normalCreditMode,payrollMonthlyMinutes:monthly,fixedDailyMinutes:fixedDaily,resolvedDailyCreditMinutes:resolvedDaily,
    contractWeeklyMinutes:n(override?.contract_weekly_minutes,group?.contract_weekly_minutes,base.contractWeeklyMinutes),
    overtimeMode,nightShiftMode:nightMode,workDays,restDays,hasWorkDaysOverride,hasRestDaysOverride,
    personOverride:Boolean(override),
  };
}


