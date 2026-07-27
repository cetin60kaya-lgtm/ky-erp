const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/pages/modules/IkPage.jsx');
let content = fs.readFileSync(file, 'utf8');

const startIdx = content.indexOf('  return (\r\n    <div className="ik-screen">\r\n      <div className="ik-stat-grid four">');
const endIdx = content.indexOf('\r\nfunction OvertimeLeaveScreen');

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found. startIdx:', startIdx, 'endIdx:', endIdx);
  // Try with LF only
  const startIdxLF = content.indexOf('  return (\n    <div className="ik-screen">\n      <div className="ik-stat-grid four">');
  const endIdxLF = content.indexOf('\nfunction OvertimeLeaveScreen');
  console.log('LF variant - start:', startIdxLF, 'end:', endIdxLF);
  process.exit(1);
}

console.log('Found markers: start=', startIdx, 'end=', endIdx);

const newReturn = `  return (
    <div className="ik-mesai-page">
      <div className="ik-mesai-summary-row">
        <IkStatCard icon={Clock} label="Toplam Mesai" value={totalOvertimeHours} sub="Saat" />
        <IkStatCard icon={AlertTriangle} label="Toplam Kesinti" value={totalDeductionHours} sub="Saat" tone="yellow" />
        <IkStatCard icon={WalletCards} label="Avans Toplami" value={formatTRY(totalAdvance)} sub="Aylik" tone="orange" />
        <IkStatCard icon={CircleDollarSign} label="Toplam Odeme" value={formatTRY(totalPayment)} sub="Aylik" tone="green" />
      </div>

      <div className="ik-mesai-main-grid">
        <section className="ik-mesai-form-card">
          <div className="ik-card-head">
            <h3>Calisma / Avans Kaydi</h3>
          </div>
          <div className="ik-mesai-form-grid">
            <Field label="Personel">
              <SelectInput value={activeAdvanceId} onChange={(e) => selectPerson(e.target.value)}>
                <option value="">Personel sec</option>
                {activeMonthly.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </SelectInput>
            </Field>
            <Field label="Tarih">
              <TextInput type="date" value={overtimeForm.tarih} onChange={(e) => setOvertimeForm({ ...overtimeForm, tarih: e.target.value })} />
            </Field>
            <Field label="Durum">
              <SelectInput value={overtimeForm.durum} onChange={(e) => setOvertimeForm({ ...overtimeForm, durum: e.target.value })}>
                <option value="GELDI">Geldi</option>
                <option value="GELMEDI">Gelmedi</option>
                <option value="IZINLI">Izinli</option>
                <option value="RAPORLU">Raporlu</option>
              </SelectInput>
            </Field>
            <Field label="Hafta Ici Mesai (%50)">
              <TextInput type="number" value={overtimeForm.haftaIciMesai} onChange={(e) => setOvertimeForm({ ...overtimeForm, haftaIciMesai: e.target.value })} />
            </Field>
            <Field label="Pazar / Tatil (%100)">
              <TextInput type="number" value={overtimeForm.haftaSonuMesai} onChange={(e) => setOvertimeForm({ ...overtimeForm, haftaSonuMesai: e.target.value })} />
            </Field>
            <Field label="Kesinti Saat">
              <TextInput type="number" value={overtimeForm.kesintiSaat} onChange={(e) => setOvertimeForm({ ...overtimeForm, kesintiSaat: e.target.value })} />
            </Field>
            <Field label="Avans Tutari">
              <TextInput type="number" value={num(activeAdvanceRow?.avans || 0)} onChange={(e) => updateAdvance(activeAdvanceRow?.personelId || activeAdvanceRow?.id, e.target.value)} readOnly={!activeAdvanceRow} />
            </Field>
            <Field label="Kalan Bakiye">
              <TextInput value={formatTRY(activeAdvanceRow?.kalanBakiye || 0).replace(',00','')} readOnly />
            </Field>
            <Field label="Toplam Odeme">
              <TextInput value={formatTRY(activeAdvanceRow?.toplam || 0).replace(',00','')} readOnly />
            </Field>
            <div className="ik-mesai-field-full">
              <Field label="Aciklama">
                <TextInput value={overtimeForm.aciklama} onChange={(e) => setOvertimeForm({ ...overtimeForm, aciklama: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="ik-mesai-actions">
            <IkButton icon={Save} variant="primary" onClick={() => { if (hasWorkEntry) onSaveOvertime(); }}>Kaydi Uygula</IkButton>
            <IkButton icon={Pencil} onClick={() => { if (hasWorkEntry) onSaveOvertime(); }}>Guncelle</IkButton>
            <IkButton icon={Trash2} variant="danger" onClick={() => {
              if (overtimeForm.id) setOvertimeRows((rows) => rows.filter((item) => item.id !== overtimeForm.id));
              if (activeAdvanceRow) updateAdvance(activeAdvanceRow.personelId || activeAdvanceRow.id, 0);
              setOvertimeForm({ ...EMPTY_OVERTIME, personelId: activeAdvanceId || "" });
            }}>Kaydi Temizle</IkButton>
          </div>
        </section>

        <aside className="ik-mesai-side-panel">
          <div className="ik-selected-person-card">
            <div className="ik-selcard-title">Secili Personel</div>
            <div className="ik-selcard-name">{activePerson?.fullName || "Personel secin"}</div>
            <div className="ik-selcard-grid">
              <span>Durum</span>
              <strong><Pill tone={activePerson?.status === "AKTIF" ? "green" : "slate"}>{activePerson?.status || "-"}</Pill></strong>
              <span>Maas</span><strong>{formatTRY(activePerson?.salary || 0).replace(',00','')}</strong>
              <span>Yol</span><strong>{formatTRY(activePerson?.roadAllowance || 0).replace(',00','')}</strong>
              <span>Banka</span><strong>{formatTRY(activeAdvanceRow?.banka || 0).replace(',00','')}</strong>
              <span>Elden</span><strong>{formatTRY(activeAdvanceRow?.elden || 0).replace(',00','')}</strong>
              <span>Toplam</span><strong>{formatTRY(activeAdvanceRow?.toplam || 0).replace(',00','')}</strong>
              <span>SGK</span><strong>{activePerson?.sgkStatus || "-"}</strong>
              <span>Bu Ay Avans</span><strong>{formatTRY(activeAdvanceRow?.avans || 0).replace(',00','')}</strong>
              <span>Kalan Bakiye</span><strong>{formatTRY(activeAdvanceRow?.kalanBakiye || 0).replace(',00','')}</strong>
            </div>
          </div>
          <div className="ik-selected-person-card">
            <div className="ik-selcard-title">Personel Hizli Secim</div>
            <div className="ik-mesai-search">
              <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Personel ara..." />
            </div>
            <div className="ik-quick-person-list">
              {filteredMonthly.map((person) => {
                const advanceData = advanceRows.find(r => String(r.personelId || r.id) === String(person.id));
                const isActive = String(person.id) === String(activeAdvanceId);
                return (
                  <button key={person.id} type="button"
                    className={"ik-quick-person-item" + (isActive ? " active" : "")}
                    onClick={() => selectPerson(person.id)}
                  >
                    <div className="ik-qpi-head">
                      <strong>{person.fullName}</strong>
                      <Pill tone={num(advanceData?.avans) > 0 ? "green" : "slate"}>
                        {num(advanceData?.avans) > 0 ? "Avansli" : "Bekliyor"}
                      </Pill>
                    </div>
                    <div className="ik-qpi-meta">
                      <span>Maas: {formatTRY(person.salary).replace(',00','')}</span>
                      <span>Kalan: {formatTRY(advanceData?.kalanBakiye || 0).replace(',00','')}</span>
                    </div>
                  </button>
                );
              })}
              {!filteredMonthly.length && <div className="ik-empty-line">Personel bulunamadi.</div>}
            </div>
          </div>
        </aside>
      </div>

      <div className="ik-mesai-log-card">
        <div className="ik-mesai-log-header">
          <h3>Mesai / Avans / Kesinti Logu</h3>
          <label className="ik-checkbox-inline">
            <input type="checkbox" checked={showAllLogs} onChange={(e) => setShowAllLogs(e.target.checked)} />
            Tum kayitlari goster
          </label>
        </div>
        <DataTable
          columns={[
            { key: "kayitTipi", label: "Kayit", render: (r) => <Pill tone={r.kayitTipi === "AVANS" ? "green" : "blue"}>{r.kayitTipi === "AVANS" ? "Avans" : "Mesai"}</Pill> },
            { key: "tarih", label: "Tarih", render: (r) => r.tarih ? formatDate(r.tarih) : "-" },
            { key: "personelAdSoyad", label: "Personel" },
            { key: "durum", label: "Durum" },
            { key: "haftaIciMesai", label: "%50" },
            { key: "haftaSonuMesai", label: "%100" },
            { key: "kesintiSaat", label: "Kesinti" },
            { key: "avans", label: "Avans", render: (r) => r.avans ? formatTRY(r.avans) : "-" },
            { key: "kalanBakiye", label: "Kalan", render: (r) => r.kalanBakiye ? formatTRY(r.kalanBakiye) : "-" },
            { key: "aciklama", label: "Aciklama", render: (r) => r.aciklama || "-" },
            {
              key: "islem", label: "Islem",
              render: (row) => (
                <IkButton icon={Trash2} onClick={(e) => {
                  e.stopPropagation();
                  if (row.kayitTipi === "AVANS") { updateAdvance(row.personelId || row.kaynakId, 0); return; }
                  setOvertimeRows((rows) => rows.filter((item) => item.id !== row.kaynakId));
                }}>Sil</IkButton>
              )
            }
          ]}
          rows={showAllLogs ? unifiedLogRows : unifiedLogRows.filter(r => String(r.personelId || r.kaynakId) === String(activeAdvanceId))}
          onRowClick={(row) => {
            selectPerson(row.personelId || row.kaynakId);
            if (row.kayitTipi === "MESAI") {
              const source = overtimeRows.find((item) => item.id === row.kaynakId);
              if (source) setOvertimeForm({ ...EMPTY_OVERTIME, ...source });
            }
          }}
        />
      </div>
    </div>
  );
}`;

const before = content.substring(0, startIdx);
const after = content.substring(endIdx);

const newContent = before + newReturn + after;
fs.writeFileSync(file, newContent, 'utf8');
console.log('SUCCESS: File patched. New length:', newContent.length);
