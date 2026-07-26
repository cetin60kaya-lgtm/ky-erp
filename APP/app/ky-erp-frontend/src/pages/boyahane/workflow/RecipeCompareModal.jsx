export default function RecipeCompareModal({ comparison, busy, onCancel, onNewVersion, onUpdate }) {
  if (!comparison) return null;
  return (
    <div className="bh-modal" role="dialog" aria-modal="true">
      <div className="bh-modal-card">
        <h2>Farklı reçete gramajı tespit edildi</h2>
        <p className="bh-notice orange">Güvenli seçenek yeni bir versiyon oluşturmaktır. Mevcut versiyon güncellenirse geçmiş üretim snapshotları değişmez.</p>
        <div className="bh-table-wrap">
          <table><thead><tr><th>Ürün</th><th>Mevcut GR</th><th>Yeni GR</th><th>Fark</th></tr></thead>
            <tbody>{(comparison.differences || []).map((row, index) => <tr key={`${row.productId}-${index}`}><td>{row.productName || row.productId}</td><td>{Number(row.oldGram || 0).toFixed(2)}</td><td>{Number(row.newGram || 0).toFixed(2)}</td><td>{Number(row.difference || 0).toFixed(2)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="bh-modal-actions">
          <button className="bh-btn" disabled={busy} onClick={onCancel}>İptal</button>
          <button className="bh-btn" disabled={busy || !comparison.recipe} onClick={onUpdate}>Mevcut Versiyonu Güncelle</button>
          <button className="bh-btn primary" disabled={busy} onClick={onNewVersion}>Yeni Versiyon Oluştur</button>
        </div>
      </div>
    </div>
  );
}
