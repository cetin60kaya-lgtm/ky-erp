# KY ERP - HR MONTHLY MODULE IMPLEMENTATION

## Required reference files
Read these files first:
1. KY_ERP_IK_AYLIK_BASTAN_TAM_GORSEL_ONAY.html
2. MEVCUT_IK_DOSYALARI.txt

## Mandatory result
Implement the HTML reference as real React frontend + real backend API + SQLite persistence.
Do not only write a plan. Inspect existing code, change code, run build, fix errors, and test.
Do not delete working modules. Do not insert dummy data. Preserve existing real data.

## Main HR pages
Keep only these monthly HR pages:
1. HR Summary
2. Personnel Card and Contract
3. Fast Leave and Attendance
4. Overtime Advance Deduction
5. Payroll and Payment
6. SGK Documents Month End Control

## Personnel card rules
Personnel card table must NOT contain SGK or attendance columns.
Columns: Code, Employee, Start Date, Card Number, Salary, Transport, Bank, Cash, Total Plan, Remaining Leave, Status, Detail.
When an employee is selected, show a readable history/log area BELOW the table.
History tabs: All, Leave, Overtime, Advance/Deduction, Salary, Payment, Documents.
Each log row: date/time, operation type, description, amount or day/hour, source, user.

## Fast Leave and Attendance rules
Weekday normal attendance is automatically accepted as Present.
User must not click every normal day.
Only exceptional entries are saved: Annual Leave, Excuse, Report, Unpaid Leave, Unexcused, Early Exit, Late Entry, No Card Movement, Weekend Worked, Restore Normal.

## Modal rules - critical
Do not use a right drawer or left drawer.
All person detail windows must open in the CENTER of the screen.
Use React createPortal and render modals under document.body.
Primary person modal: width about 1180px, height about 770px.
Secondary operation modal: width 700-760px, centered.
Primary modal stays open while secondary modal appears above it.
Primary z-index 5000+. Secondary z-index 6000+.
Do not use transform:scale, zoom, max-width:500px, max-width:600px, small font hacks, drawer CSS, or side panel CSS.

## Primary person modal layout
Left: monthly calendar.
Right: quick operation buttons, dates, document info, notes, card times.
Bottom: employee operation logs.

## Secondary modal operation types
Overtime, Weekend Work, Advance, Bonus, Special Deduction, Bulk Advance, Manual Payroll Adjustment, Exit/Severance Draft, TNF Import, SGK Excel Precheck, Document Upload.

## Financial behavior
Overtime, advance, bonus and deduction must update payroll draft and employee log.
Bulk advance must create separate movement and separate log for each selected employee.
Manual payroll adjustment must require reason and log old value, new value, user and timestamp.

## Payroll rules
Payroll table must NOT contain SGK or attendance columns.
Columns: Employee, Salary Payment, Transport Payment, Overtime/Bonus, Advance, Deduction, Bank, Cash, Total, Status, Manual Edit.
User can perform final manual adjustment before output.

## Leave and transport rules
Annual leave does not reduce salary.
Transport payment is calculated using actual attended days / 30 when employee did not physically attend.
Report, unpaid leave, unexcused absence and exit must create explainable payment differences.

## Exit / severance
Use employment start date from personnel card.
Create severance and unused leave payment draft with approval and log.

## TNF and SGK
TNF must first go to precheck pool, never direct permanent attendance.
TNF format: KOD,dd.MM.yyyy,HH:MM.
SGK Excel matching order: TC, personnel code, normalized full name.
External persons must not be automatically added to main personnel list.

## Print
Keep payment slips as A4 portrait, two columns, maximum 8 slips per page.
No blank print pages and no horizontal overflow.
Use print CSS with @page A4 portrait, 8mm margins, and break-inside avoid.

## Modal CSS cleanup
Search and remove/fix conflicts involving: zoom, transform scale, .modal, .overlay, .drawer, .side-panel, .right-panel, .slide-over, max-width 500px, max-width 600px, global tiny font sizes.

## Acceptance tests
1. Frontend build passes.
2. Personnel card has no SGK or attendance columns.
3. Payroll has no SGK or attendance columns.
4. Primary modal is centered and large near 1180px.
5. Secondary modal is centered and at least 700px.
6. No side drawers.
7. Employee history logs appear under personnel list.
8. Overtime/advance/deduction update log and payroll draft.
9. Print preview has no blank page.
10. Provide changed file list and test summary.
