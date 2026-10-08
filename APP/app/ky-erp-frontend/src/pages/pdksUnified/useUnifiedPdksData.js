import { useEffect, useMemo, useState } from "react";
import { normalizePerson } from "./productData.js";

/**
 * Single read-only data coordinator for KY PDKS Unified.
 * Identity: company + period + person + source + refresh generation.
 * The source account must be validated before any read of privileged data.
 * In preview mode NO authenticated module is ever imported.
 */
const empty = (status = "idle") => ({key:"",status,payload:null,error:""});
const errorMessage = (e) => String(e?.message || "Sunucuya ulaşılamadı.");
const keyOf = (...fields) => JSON.stringify(fields);
const ADDITIONAL = new Set([
  "masters","holidays","leaves","month","month-adjustments",
  "monthly-attendance","payroll","audit","config","corrections",
]);

export function useUnifiedPdksData({
  company,year,month,personId,requirement,previewOnly=false,
  auditHint=false,reloadToken=0,needsPeople=false,allowHeavy=false,
}) {
  const [profileState,setProfileState] = useState(empty());
  const [peopleState,setPeopleState] = useState(empty());
  const [attendanceState,setAttendanceState] = useState(empty());
  const [resourceState,setResourceState] = useState(empty());

  const profileKey=keyOf(company,reloadToken);
  const profileReady=profileState.key===profileKey && profileState.status==="ready";
  const profile=profileReady ? profileState.payload : null;
  // The server's audit flag can only remove permission; never grant it.
  const audit=Boolean(auditHint || profile?.audit===true ||
    profile?.audit===1 || String(profile?.audit).toLowerCase()==="true");
  const peopleKey=keyOf(company,year,month,reloadToken);
  const peopleReady=peopleState.key===peopleKey && peopleState.status==="ready";
  const people=useMemo(()=>
    peopleReady && Array.isArray(peopleState.payload) ? peopleState.payload : [],
    [peopleReady,peopleState.payload]);
  const attendanceKey=keyOf(company,year,month,personId,reloadToken);
  const attendanceReady=attendanceState.key===attendanceKey && attendanceState.status==="ready";
  const days=useMemo(()=>
    attendanceReady && Array.isArray(attendanceState.payload) ? attendanceState.payload : [],
    [attendanceReady,attendanceState.payload]);
  const resourceKey=keyOf(company,year,month,requirement,
    requirement==="corrections"?personId:null,reloadToken,audit);
  const resourceReady=resourceState.key===resourceKey && resourceState.status==="ready";
  const resourceLoading=resourceState.key===resourceKey && resourceState.status==="loading";
  const resourceError=resourceState.key===resourceKey && resourceState.status==="error" ? resourceState.error : "";

  useEffect(()=>{
    if(previewOnly || !company)return undefined;
    let cancelled=false;
    setProfileState({key:profileKey,status:"loading",payload:null,error:""});
    import("./readService.js")
      .then((api)=>api.readProfile({mainCompanyId:company}))
      .then((payload)=>{if(!cancelled)setProfileState({key:profileKey,status:"ready",payload,error:""});})
      .catch((e)=>{if(!cancelled)setProfileState({key:profileKey,status:"error",payload:null,error:errorMessage(e)});});
    return ()=>{cancelled=true;};
  },[previewOnly,company,profileKey]);

  useEffect(()=>{
    if(previewOnly || !company || !needsPeople || !profileReady)return undefined;
    let cancelled=false;
    setPeopleState({key:peopleKey,status:"loading",payload:null,error:""});
    import("./readService.js")
      .then((api)=>api.readPeople({mainCompanyId:company,year,month}))
      .then((rows)=>{
        if(cancelled)return;
        if(!Array.isArray(rows))throw new Error("PDKS_PERSONEL_YANIT_BICIMI_GECERSIZ");
        setPeopleState({key:peopleKey,status:"ready",payload:rows.map(
          (person)=>normalizePerson(person,{year,month})),error:""});
      })
      .catch((e)=>{if(!cancelled)setPeopleState({key:peopleKey,status:"error",payload:null,error:errorMessage(e)});});
    return ()=>{cancelled=true;};
  },[previewOnly,company,year,month,needsPeople,profileReady,peopleKey]);

  useEffect(()=>{
    if(previewOnly || !company || requirement!=="attendance" || !personId || !peopleReady || !profileReady)
      return undefined;
    let cancelled=false;
    setAttendanceState({key:attendanceKey,status:"loading",payload:null,error:""});
    import("./readService.js")
      .then((api)=>api.readDays(personId,year,month,{mainCompanyId:company}))
      .then((response)=>{
        if(cancelled)return;
        if(!Array.isArray(response?.days))throw new Error("PDKS_DEVAM_YANIT_BICIMI_GECERSIZ");
        setAttendanceState({key:attendanceKey,status:"ready",payload:response.days,error:""});
      })
      .catch((e)=>{
        if(!cancelled)setAttendanceState({key:attendanceKey,status:"error",payload:null,error:errorMessage(e)});
      });
    return ()=>{cancelled=true;};
  },[previewOnly,company,requirement,personId,year,month,peopleReady,profileReady,attendanceKey]);

  useEffect(()=>{
    if(previewOnly || !company || !ADDITIONAL.has(requirement) || !profileReady ||
       (requirement==="payroll" && audit) ||
       (requirement==="monthly-attendance" && !allowHeavy) ||
       (requirement==="corrections" && (!personId || !peopleReady)))return undefined;
    let cancelled=false;
    setResourceState({key:resourceKey,status:"loading",payload:null,error:""});
    import("./readService.js")
      .then((api)=>api.readTabSource(requirement,
        {mainCompanyId:company,year,month,personId},
        {audit,isCancelled:()=>cancelled}))
      .then((payload)=>{
        if(!cancelled)setResourceState({key:resourceKey,status:"ready",payload,error:""});
      })
      .catch((e)=>{
        if(!cancelled)setResourceState({key:resourceKey,status:"error",payload:null,error:errorMessage(e)});
      });
    return ()=>{cancelled=true;};
  },[previewOnly,company,year,month,requirement,personId,peopleReady,
    profileReady,audit,resourceKey,allowHeavy]);

  const peopleStatus=previewOnly?"preview":!company?"not-configured":
    !profileReady ? (profileState.key===profileKey?profileState.status:"loading") :
    !needsPeople?"idle" :
    peopleState.key===peopleKey?peopleState.status:"loading";
  const error=profileState.key===profileKey && profileState.status==="error" ? profileState.error :
    peopleState.key===peopleKey && peopleState.status==="error" ? peopleState.error :
    attendanceState.key===attendanceKey && attendanceState.status==="error" ? attendanceState.error :
    resourceError;
  return {
    audit,profile,profileReady,people,days,peopleStatus,
    peopleLoading:peopleStatus==="loading",
    attendanceReady,attendanceLoading:attendanceState.key===attendanceKey &&
      attendanceState.status==="loading",
    resource:resourceReady?resourceState.payload:null,
    resourceReady,resourceLoading,resourceError,error,
    sourceReady: requirement==="people" ? peopleReady :
      requirement==="attendance" ? attendanceReady :
      ADDITIONAL.has(requirement) ? resourceReady : false,
  };
}
