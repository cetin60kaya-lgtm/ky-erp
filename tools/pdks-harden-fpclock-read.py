from pathlib import Path

p = Path(r"APP/desktop/ky-pdks/src/KyPdks.DeviceBridge.x86/Program.cs")
text = p.read_text(encoding="utf-8-sig")

def rep(old, new, count=1):
    global text
    n = text.count(old)
    if n < count:
        raise SystemExit(f"pattern missing ({n}): {old[:140]!r}")
    text = text.replace(old, new, count)

rep('        private string _lastPunch = "";\n', '        private string _lastPunch = "";\n        private bool _lastReadOk;\n        private int _lastReadError;\n        private int _lastReadCount;\n        private string _lastReadAt = "";\n')
rep('            try { _type.InvokeMember("ReadMark", BindingFlags.SetProperty, null, _com, new object[] { false }, CultureInfo.InvariantCulture); } catch { }',
    '            try { _type.InvokeMember("ReadMark", BindingFlags.SetProperty, null, _com, new object[] { true }, CultureInfo.InvariantCulture); } catch { }')

old_poll = '''        private void Poll()\n        {\n            if (_polling || _com == null) return;\n            _polling = true;\n            try\n            {\n                int added = 0;\n                object read = Invoke("ReadGeneralLogData", new object[] { _o.DeviceNo });\n                if (AsBool(read))\n                {\n                    while (added < 1000 && TryReadPunch(out var punch))\n                    {\n                        string fingerprint = punch.cardNo + "|" + punch.eventAt;\n                        if (_seen.Add(fingerprint))\n                        {\n                            WritePunch(punch);\n                            _lastPunch = punch.cardNo + " · " + punch.eventAt;\n                            added++;\n                        }\n                    }\n                }\n                if ((DateTime.Now - _lastState).TotalSeconds >= 5)\n                    WriteState(true, "", ReadDeviceTime(), ReadCounters());\n            }\n            catch (Exception ex)\n            {\n                WriteState(false, Unwrap(ex).Message, null, null);\n                Console.Error.WriteLine("BRIDGE_POLL_ERROR " + Unwrap(ex).Message);\n                _timer.Stop();\n                Close();\n            }\n            finally { _polling = false; }\n        }'''
new_poll = '''        private void Poll()\n        {\n            if (_polling || _com == null) return;\n            _polling = true;\n            var restoreDevice = false;\n            try\n            {\n                // Vendor FP_CLOCK örneği log okurken cihazı çok kısa süreliğine busy yapıp\n                // işlem sonunda mutlaka tekrar etkinleştiriyor. Kayıt silme komutu gönderilmez.\n                try { restoreDevice = AsBool(Invoke("EnableDevice", new object[] { _o.DeviceNo, 0 })); } catch { }\n\n                int added = 0;\n                object read = Invoke("ReadGeneralLogData", new object[] { _o.DeviceNo });\n                _lastReadOk = AsBool(read);\n                _lastReadError = _lastReadOk ? 0 : ReadLastError();\n                _lastReadAt = DateTimeOffset.Now.ToString("O");\n                if (_lastReadOk)\n                {\n                    while (added < 1000 && TryReadPunch(out var punch))\n                    {\n                        string fingerprint = punch.cardNo + "|" + punch.eventAt;\n                        if (_seen.Add(fingerprint))\n                        {\n                            WritePunch(punch);\n                            _lastPunch = punch.cardNo + " · " + punch.eventAt;\n                            added++;\n                        }\n                    }\n                }\n                _lastReadCount = added;\n                if ((DateTime.Now - _lastState).TotalSeconds >= 5)\n                    WriteState(true, "", ReadDeviceTime(), ReadCounters());\n            }\n            catch (Exception ex)\n            {\n                _lastReadOk = false;\n                _lastReadError = ReadLastError();\n                _lastReadAt = DateTimeOffset.Now.ToString("O");\n                WriteState(false, Unwrap(ex).Message, null, null);\n                Console.Error.WriteLine("BRIDGE_POLL_ERROR " + Unwrap(ex).Message);\n                _timer.Stop();\n                Close();\n            }\n            finally\n            {\n                try { if (_com != null) Invoke("EnableDevice", new object[] { _o.DeviceNo, 1 }); } catch { }\n                _polling = false;\n            }\n        }'''
rep(old_poll, new_poll)

rep('                    direction = Direction(verify, inout),', '                    direction = Direction(verify, inout, evt),')
rep('                direction = Direction(verify, 0), verifyMode = verify, inout = 0, eventCode = 0,',
    '                direction = Direction(verify, 0, -1), verifyMode = verify, inout = 0, eventCode = 0,')

marker = '''        private string ReadDeviceTime()\n        {'''
insert = '''        private int ReadLastError()\n        {\n            try\n            {\n                object[] a = { 0 };\n                var pm = new ParameterModifier(1); pm[0] = true;\n                _type.InvokeMember("GetLastError", BindingFlags.InvokeMethod, null, _com, a, new[] { pm }, CultureInfo.InvariantCulture, null);\n                return I(a[0]);\n            }\n            catch { return -1; }\n        }\n\n        private string ReadDeviceTime()\n        {'''
rep(marker, insert)

rep('                lastPunch = _lastPunch,\n                error = error ?? "",',
    '                lastPunch = _lastPunch,\n                lastReadOk = _lastReadOk,\n                lastReadError = _lastReadError,\n                lastReadCount = _lastReadCount,\n                lastReadAt = _lastReadAt,\n                error = error ?? "",')

old_dir = '''        private static string Direction(int verify, int inout)\n        {\n            int low = verify & 0xFF;\n            if (low >= 51 && low <= 53) return "IN";\n            if (low >= 101 && low <= 103) return "OUT";\n            int status = (verify >> 8) & 0xFF;\n            if (status == 0 || status == 4) return "IN";\n            if (status == 1 || status == 5) return "OUT";\n            if (inout == 1) return "IN";\n            if (inout == 2 || inout == 3) return "OUT";\n            return "AUTO";\n        }'''
new_dir = '''        private static string Direction(int verify, int inout, int evt)\n        {\n            // FP_CLOCK log örneğinde dwEvent giriş/çıkış statüsüdür.\n            // 0/3/4 giriş sınıfı, 1/2/5 çıkış sınıfı olarak ele alınır.\n            if (evt == 0 || evt == 3 || evt == 4) return "IN";\n            if (evt == 1 || evt == 2 || evt == 5) return "OUT";\n            int low = verify & 0xFF;\n            if (low >= 51 && low <= 53) return "IN";\n            if (low >= 101 && low <= 103) return "OUT";\n            int status = (verify >> 8) & 0xFF;\n            if (status == 0 || status == 4) return "IN";\n            if (status == 1 || status == 5) return "OUT";\n            if (inout == 1) return "IN";\n            if (inout == 2 || inout == 3) return "OUT";\n            return "AUTO";\n        }'''
rep(old_dir, new_dir)

p.write_text(text, encoding="utf-8-sig")
print("FP_CLOCK log read hardened")
