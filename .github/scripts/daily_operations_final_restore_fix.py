from pathlib import Path

page = Path(__file__).resolve().parents[2] / "APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx"
src = page.read_text(encoding="utf-8")

start = '{logTab !== "control" ? <div className="log-date-toolbar">'
start_fixed = '{logTab !== "control" ? <><div className="log-date-toolbar">'
end = '</select></label></div> : null}{logTab === "summary"'
end_fixed = '</select></label></div></> : null}{logTab === "summary"'
deps = '  }, [companyId, employees, range.end, range.start]);'
deps_fixed = '  }, [companyId, range.end, range.start]);'

if start not in src:
    raise SystemExit("log filter fragment start anchor missing")
if end not in src:
    raise SystemExit("log filter fragment end anchor missing")
if deps not in src:
    raise SystemExit("loadRangeData dependency anchor missing")

src = src.replace(start, start_fixed, 1).replace(end, end_fixed, 1).replace(deps, deps_fixed, 1)
page.write_text(src, encoding="utf-8")
print("log JSX fragment and hook dependencies repaired")
