import test from "node:test";
import assert from "node:assert/strict";
import {probeTerminalConnection} from "./terminal-network-probe.mjs";
const sample=()=>({terminalId:"term-001",companyId:"firm-1",vendor:"KY",
  model:"QR USB Kiosk",connectorId:"KY_QR_LOCAL",timezone:"Europe/Istanbul",
  inputMethods:["QR_SIGNED"],directionMode:"EXPLICIT_IN_OUT",approvalState:"DRAFT"});
test("KY localhost health must match exact terminal identity and stay uncertified",async()=>{
  const probe=await probeTerminalConnection(sample(),{
    qrPort:5200,fetchHealth:async(url)=>({
      ok:true,json:async()=>({ok:true,terminalId:"term-001",productionSourceCertified:false}),
    }),
  });
  assert.equal(probe.connectionReachable,true);
  assert.equal(probe.hardwareModelCertified,false);
  assert.equal(probe.canReadPunches,false);
  assert.equal(probe.status,"LOCAL_QR_HEALTH_RESPONDS_UNCERTIFIED");
  assert.ok(Object.isFrozen(probe));
});
test("wrong kiosk ID, claimed certification and network failures never become ready",async()=>{
  for(const health of [
    {ok:true,terminalId:"other-terminal",productionSourceCertified:false},
    {ok:true,terminalId:"term-001",productionSourceCertified:true},
  ]){
    const got=await probeTerminalConnection(sample(),{
      fetchHealth:async()=>({ok:true,json:async()=>health}),
    });
    assert.equal(got.connectionReachable,false);
  }
  const offline=await probeTerminalConnection(sample(),{
    fetchHealth:async()=>{throw Error("OFFLINE");},
  });
  assert.equal(offline.status,"LOCAL_QR_HEALTH_UNAVAILABLE");
  await assert.rejects(()=>probeTerminalConnection(sample(),{qrPort:6000}),/PORT_INVALID/);
});
test("private LAN port connectivity is a diagnostics status not SDK certification",async()=>{
  const profile={...sample(),connectorId:"ZK_PULL",host:"192.168.1.50",port:4370};
  const called=[];
  const reachable=await probeTerminalConnection(profile,{
    tcpDial:async(host,port,timeout)=>{called.push([host,port,timeout]);return true;},
  });
  assert.deepEqual(called,[["192.168.1.50",4370,1500]]);
  assert.equal(reachable.status,"LAN_TCP_RESPONDS_DRIVER_UNVERIFIED");
  assert.equal(reachable.connectionReachable,true);
  assert.equal(reachable.hardwareModelCertified,false);
  assert.equal(reachable.canWriteTerminal,false);
  const closed=await probeTerminalConnection(profile,{tcpDial:async()=>false});
  assert.equal(closed.connectionReachable,false);
});
test("reject public-device probes and never dial vendor cloud without license",async()=>{
  const profile={...sample(),connectorId:"ZK_PULL",host:"8.8.8.8",port:4370};
  await assert.rejects(()=>probeTerminalConnection(profile,{
    tcpDial:async()=>{throw Error("MUST_NOT_DIAL");},
  }),/PRIVATE_IP/);
  const remote={...sample(),connectorId:"BIOSTAR_2",
    baseUrl:"https://biostar.example.com/"};
  const status=await probeTerminalConnection(remote,{
    tcpDial:async()=>{throw Error("MUST_NOT_DIAL");},
  });
  assert.equal(status.status,"VENDOR_API_AUTH_OR_DRIVER_REQUIRED");
  assert.equal(status.connectionReachable,false);
});
