/**
 * Load the authenticated API runtime only in live mode.
 * Importing this module is intentionally deferred so localhost design review
 * cannot install offline routines, create web sessions or request staff data.
 */
import {getPdksAttendance, getPdksPeople, getPdksProfile} from "../../services/pdksApi";

export const readPeople = (params) => getPdksPeople(params);
export const readProfile = (params) => getPdksProfile(params);
export const readDays = (personId,year,month,params) =>
  getPdksAttendance(personId,year,month,params);
