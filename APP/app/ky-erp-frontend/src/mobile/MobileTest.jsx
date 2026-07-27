import React from "react";
import { getMobileToken } from "./mobileApi";
import { API_BASE } from "../utils/api";

export default function MobileTest() {
  const token = getMobileToken();
  return (
    <>
      <h2 className="ky-mobile-h2">🧪 Test Paneli</h2>
      <div className="ky-mobile-alert green ky-mobile-mb10">
        <b>BUNDLE MODU</b>
        <div className="ky-mobile-small ky-mobile-muted">Test paneli geliştirici aracı olarak kalacak ama normal kullanıcı ekranında görünmeyecek.</div>
      </div>
      <div className="ky-mobile-card ky-mobile-p14">
        <div className="ky-mobile-kv">
          <span>API_BASE</span><b>{API_BASE}</b>
          <span>Token</span><b>{token ? "Var" : "Yok"}</b>
          <span>Scroll</span><b>Serbest</b>
        </div>
      </div>
    </>
  );
}
