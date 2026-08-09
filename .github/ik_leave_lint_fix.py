from pathlib import Path

p = Path('APP/app/ky-erp-frontend/src/pages/modules/IkAdvancedMonthly.jsx')
s = p.read_text(encoding='utf-8')

start = s.find('  const runLeavePreview = async () => {')
if start >= 0:
    end = s.find('\n\n  useEffect(() => {', start)
    if end < 0:
        raise SystemExit('runLeavePreview end marker not found')
    s = s[:start] + s[end+2:]

old = '''  useEffect(() => {
    if (modal !== "yillik") return undefined;
    const employeeId = modalDraft.employeeId;
    const startDate = modalDraft.startDate;
    const returnDate = modalDraft.endDate;
    if (!employeeId || !startDate || !returnDate || returnDate <= startDate) {
      setLeavePreview(null);
      return undefined;
    }
    const seq = ++leaveAutoPreviewSeq.current;
    const timer = window.setTimeout(async () => {
      try {
        const result = await previewIkAdvancedLeave({ mainCompanyId: companyId, ...modalDraft, returnDate, recordType: modalDraft.leaveType });
        if (leaveAutoPreviewSeq.current !== seq) return;
        setLeavePreview(result);
        setNotice("");
      } catch (error) {
        if (leaveAutoPreviewSeq.current !== seq) return;
        setLeavePreview(null);
        setNotice(error?.message || "İzin günleri hesaplanamadı. Tarihleri kontrol edip tekrar deneyin.");
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [modal, modalDraft.employeeId, modalDraft.startDate, modalDraft.endDate, modalDraft.leaveType, companyId]);'''
new = '''  useEffect(() => {
    if (modal !== "yillik") return undefined;
    const leaveId = modalDraft.id || "";
    const employeeId = modalDraft.employeeId;
    const startDate = modalDraft.startDate;
    const returnDate = modalDraft.endDate;
    const recordType = modalDraft.leaveType || "Yillik izin";
    if (!employeeId || !startDate || !returnDate || returnDate <= startDate) {
      setLeavePreview(null);
      return undefined;
    }
    const seq = ++leaveAutoPreviewSeq.current;
    const timer = window.setTimeout(async () => {
      try {
        const result = await previewIkAdvancedLeave({
          mainCompanyId: companyId,
          id: leaveId,
          employeeId,
          startDate,
          endDate: returnDate,
          returnDate,
          recordType,
        });
        if (leaveAutoPreviewSeq.current !== seq) return;
        setLeavePreview(result);
        setNotice("");
      } catch (error) {
        if (leaveAutoPreviewSeq.current !== seq) return;
        setLeavePreview(null);
        setNotice(error?.message || "İzin günleri hesaplanamadı. Tarihleri kontrol edip tekrar deneyin.");
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [modal, modalDraft.id, modalDraft.employeeId, modalDraft.startDate, modalDraft.endDate, modalDraft.leaveType, companyId]);'''
if old not in s:
    raise SystemExit('auto preview block marker not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
print('IK leave lint-safe auto preview applied.')
