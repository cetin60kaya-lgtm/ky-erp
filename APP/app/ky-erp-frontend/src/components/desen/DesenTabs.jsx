export default function DesenTabs({ activeTab, onChange }) {
  return (
    <div className="desen-tabs">
      {["Desen", "Yerleşim", "Kalıp Yerleşim"].map((tab) => (
        <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => onChange(tab)}>
          {tab}
        </button>
      ))}
    </div>
  );
}

