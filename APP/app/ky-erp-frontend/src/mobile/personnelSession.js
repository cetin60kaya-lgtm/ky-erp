// Staff portal uses a separate session, leaving an existing manager login intact.
export const STAFF_TOKEN_KEY = "kyerp_personnel_auth_token";
export const STAFF_USER_KEY = "kyerp_personnel_auth_user";
function readUser(key) {try {return JSON.parse(localStorage.getItem(key)||"{}");}catch{return {};}}
export function getStaffSession() {
  const ownUser=readUser(STAFF_USER_KEY),ownToken=localStorage.getItem(STAFF_TOKEN_KEY)||"";
  if(ownToken && String(ownUser.role||"").toUpperCase()==="PERSONNEL")return {token:ownToken,user:ownUser};
  // Existing legacy personnel sessions remain supported.
  const legacyUser=readUser("kyerp_auth_user"),legacyToken=localStorage.getItem("kyerp_auth_token")||"";
  if(legacyToken && String(legacyUser.role||"").toUpperCase()==="PERSONNEL")return {token:legacyToken,user:legacyUser,legacy:true};
  return null;
}
export function saveStaffSession(token,user) {
  if(!token||String(user?.role||"").toUpperCase()!=="PERSONNEL")throw Error("Personel oturumu dogrulanamadi.");
  localStorage.setItem(STAFF_TOKEN_KEY,token);
  localStorage.setItem(STAFF_USER_KEY,JSON.stringify(user));
}
export function clearStaffSession() {
  localStorage.removeItem(STAFF_TOKEN_KEY);
  localStorage.removeItem(STAFF_USER_KEY);
  // Only clean main-browser tokens when they belong to a legacy personnel login.
  if(String(readUser("kyerp_auth_user").role||"").toUpperCase()==="PERSONNEL"){
    localStorage.removeItem("kyerp_auth_token");
    localStorage.removeItem("kyerp_auth_user");
    localStorage.removeItem("kyerp_mobile_user");
  }
}
